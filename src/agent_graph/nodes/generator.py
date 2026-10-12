"""
节点 3 · Generator Agent（SQL 生成）

职责：综合 结构化意图 + Matcher 命中的指标口径 + 维度字段 + 时间锚点 + DDL，
生成【恰好一条】可执行的只读 SQL。生成阶段绝不访问数据库（副作用只允许出现在
Critic 的工具调用里，与产品「先生成草案、确认后再执行」的约束一致）。

自修正：当 state.critic 存在且未通过时，本节点进入 repair 轮，把上一版 SQL、
静态审查意见与数据库报错一起回喂模型重写（由图的条件边回到本节点）。
"""
from __future__ import annotations

import json
from typing import Dict

from src.utils.llm_client import extract_sql_from_response
from src.agent_graph.nodes import trace_step


def default_build_system_prompt(deps, state: Dict) -> str:
    """本地零售库的 Generator system prompt（风神版在 deps 中覆盖此函数）。"""
    metric_ctx = state.get("metric_context") or "（问题未命中特定指标，按通用 Schema 与全局规则生成）"
    return (
        "你是「SQL 生成 Agent」，一位资深 SQLite 检索工程师。请只输出一条可直接执行的只读 SQL。\n\n"
        f"{deps.system_suffix}\n\n"
        "## 🎯 命中指标口径（Matcher 选择性注入，只有这些指标需严格套用模板与警示）\n"
        f"{metric_ctx}\n\n"
        "输出要求：仅输出一条放在 ```sql ... ``` 代码块中的 SQLite 查询；"
        "不要解释、不要注释、不要多条语句；维度列在前、指标列在后。"
    )


def _history_block(history) -> str:
    if not history:
        return ""
    lines = [f"[{h.get('role', 'user')}] {h.get('content', '')}" for h in history[-6:]]
    return "[对话历史（追问时结合上文理解省略的指代）]\n" + "\n".join(lines) + "\n\n"


def _dimension_block(resolved) -> str:
    if not resolved:
        return "[可用分组维度] 无显式维度（按问题判断是否需要分组）"
    rows = [f"- {d['key']}（原文“{d['mention']}”）→ 字段 {d['field']}" for d in resolved]
    return "[可用分组维度（Matcher 已映射到真实字段）]\n" + "\n".join(rows)


def make_generator_node(deps):
    def generator_node(state: Dict) -> Dict:
        critic = state.get("critic") or {}
        is_repair = bool(critic) and not critic.get("passed", True)
        round_no = len(state.get("sql_history") or []) + 1

        builder = deps.build_system_prompt or default_build_system_prompt
        system = builder(deps, state)
        intent = state.get("intent") or {}
        user = (
            f"{_history_block(state.get('history'))}"
            f"[结构化意图（Intent Agent 产物，供参考）]\n"
            f"{json.dumps(intent, ensure_ascii=False)}\n"
            f"{_dimension_block(state.get('resolved_dimensions'))}\n\n"
            f"[自然语言问题]\n{state['question']}\n\n"
            "[请生成SQL]"
        )
        messages = [{"role": "system", "content": system},
                    {"role": "user", "content": user}]

        if is_repair:
            issues = critic.get("issues") or []
            issue_text = "\n".join(f"- [{i.get('code')}] {i.get('message')}" for i in issues) or "- （未通过审查）"
            db_error = critic.get("db_error")
            messages.append({"role": "assistant", "content": state.get("sql_draft", "")})
            messages.append({"role": "user", "content": (
                f"[Critic 审查意见]（第 {state.get('repair_count', 0)} 轮被打回，请重写）\n"
                f"{issue_text}\n"
                f"数据库报错：{db_error or '无（可能是静态规则/空结果问题）'}\n\n"
                "请对照以上问题修正，只输出一条修正后可直接执行的 SQL，不要解释或 Markdown 之外的内容。"
            )})

        raw = deps.llm.chat(messages, temperature=0)
        sql = (extract_sql_from_response(raw) or "").strip()

        # 解析不出 SQL：repair 轮保留上一版（交给 Critic/路由收口），首轮抛出由上层回退
        if not sql:
            if is_repair and state.get("sql_draft"):
                sql = state["sql_draft"]
            else:
                raise RuntimeError("Generator 未返回可解析的 SQL")

        step = trace_step(
            "generator", "repair" if is_repair else "ok",
            f"第 {round_no} 版 SQL（{'修复轮' if is_repair else '首轮'}，{len(sql)} 字符）",
            round=round_no, is_repair=is_repair)
        return {
            "sql_draft": sql,
            "sql_history": [sql],
            "generator_meta": {"round": round_no, "is_repair": is_repair,
                               "model": getattr(deps.llm, "name", "")},
            "trace": [step],
        }

    return generator_node
