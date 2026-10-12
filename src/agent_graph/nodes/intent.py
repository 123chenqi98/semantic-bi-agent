"""
节点 1 · Intent Agent（意图解析）

职责：把用户自然语言问题解析为【结构化意图】——涉及指标、分组维度、时间表达、
问题类型、缺省假设。本节点【纯理解】，不检索指标定义、不碰数据库。

设计要点：
- 输出严格 JSON（结构化输出回合才注入格式约束，避免与后续 tool-calling 回合冲突）；
- LLM 不可用 / 返回无法解析时，降级为基于语义层关键词的确定性解析，保证图不中断，
  并在 trace 中如实标注 degraded（诚实降级，不假装是模型能力）。
"""
from __future__ import annotations

import json
from typing import Dict

from src.agent_graph.llm import parse_json_lenient
from src.agent_graph.nodes import trace_step

INTENT_SYSTEM = """你是「意图解析 Agent」，负责把中文经营分析问题解析为结构化意图。
只输出一个 JSON 对象，不要输出任何解释或 Markdown 代码块。JSON 字段如下：
{
  "metrics": ["问题涉及的指标中文名，如 销售额/订单量/客单价/新客数/复购率"],
  "dimensions": ["分组或下钻维度，如 渠道/区域/品类/会员等级"],
  "time_expr": "原文中的时间表达，如 上月/近6个月/2025年全年；没有则空字符串",
  "question_type": "直接统计|趋势分析|对比分析|排名分析|占比分析|异常识别",
  "assumptions": ["问题缺失信息时你采用的缺省假设；没有则空数组"]
}
注意：metrics/dimensions 只放问题【真正提到】的，不要臆造。"""


def _candidate_block(semantic) -> str:
    """从语义层给出可选指标/维度词表，帮助模型归一化命名。"""
    if semantic is None:
        return ""
    metric_names = [m.get("name", "") for m in semantic.metrics.values()]
    dim_lines = [f"- {key}: {', '.join(d.get('keywords', [])[:6])}"
                 for key, d in semantic.dimensions.items()]
    return (f"可选指标（尽量从中取名）：{', '.join(metric_names)}\n"
            f"可选维度：\n" + "\n".join(dim_lines))


def _fallback_intent(question: str, semantic) -> Dict:
    """LLM 不可用时的确定性兜底：直接用别名/关键词扫描。"""
    metrics, dims = [], []
    if semantic is not None:
        metrics = [m.get("name", "") for m in semantic.match_metrics(question)]
        for key, dim in semantic.dimensions.items():
            if any(k in question for k in dim.get("keywords", [])):
                dims.append(key)
    qtype = "分组统计" if dims else "直接统计"
    assumptions = [] if metrics else ["未识别到已知指标，按通用口径理解"]
    if not _time_in_question(question):
        assumptions.append("未显式指定时间，默认取最近一个完整自然月")
    return {"metrics": metrics, "dimensions": dims, "time_expr": "",
            "question_type": qtype, "assumptions": assumptions}


def _time_in_question(q: str) -> bool:
    for t in ["月", "季", "年", "周", "天", "日", "近", "上月", "去年", "今年"]:
        if t in q:
            return True
    return False


def _normalize(intent: Dict) -> Dict:
    return {
        "metrics": list(intent.get("metrics") or []),
        "dimensions": list(intent.get("dimensions") or []),
        "time_expr": str(intent.get("time_expr") or ""),
        "question_type": str(intent.get("question_type") or "直接统计"),
        "assumptions": list(intent.get("assumptions") or []),
    }


def make_intent_node(deps):
    def intent_node(state: Dict) -> Dict:
        question = state["question"]
        history = state.get("history") or []
        hist = ""
        if history:
            hist = "[对话历史（追问时结合上文理解指代）]\n" + "\n".join(
                f"[{h.get('role', 'user')}] {h.get('content', '')}" for h in history[-6:]) + "\n\n"

        user = (
            f"{hist}{_candidate_block(deps.semantic)}\n\n"
            f"[自然语言问题]\n{question}\n\n"
            "请输出结构化意图 JSON。"
        )
        messages = [{"role": "system", "content": INTENT_SYSTEM},
                    {"role": "user", "content": user}]

        intent, degraded, err = None, False, ""
        try:
            raw = deps.llm.chat(messages, temperature=0)
            intent = _normalize(parse_json_lenient(raw))
            if not intent["metrics"] and not intent["dimensions"]:
                # 解析成功但全空：大概率是没听懂，退化为关键词扫描更稳
                intent = _fallback_intent(question, deps.semantic)
                degraded = True
        except Exception as e:  # LLM 不可用 / JSON 不合法：确定性兜底
            intent, degraded, err = _fallback_intent(question, deps.semantic), True, f"{type(e).__name__}: {e}"

        detail = f"指标={intent['metrics']} 维度={intent['dimensions']} 时间={intent['time_expr'] or '未指定'}"
        step = trace_step("intent", "degraded" if degraded else "ok", detail,
                          question_type=intent["question_type"], error=err)
        return {"intent": intent, "trace": [step]}

    return intent_node
