"""
LLM 适配层：给图节点提供统一的 .chat(messages, temperature=...) -> str 接口。

两种实现，接口完全一致，节点无感知：
1. RealLLM   ：复用项目既有 src.utils.llm_client.LLMClient（urllib 直连、OpenAI 兼容、
               自带 429/5xx 指数退避重试、doubao 的 thinking=disabled、自定义 SSL）。
2. MockLLM   ：零依赖、离线、确定性。没有 API Key / 触发 429 限流时也能把整张图跑通，
               方便学习、调试拓扑、写单测。它还会「故意」先产出一条有典型错误的 SQL，
               被 Critic 打回后再产出正确 SQL，用来确定性地演示自修正回环。

为什么不直接用 langchain 的 ChatModel？
- 现有 LLMClient 已经处理好了鉴权、重试、doubao 协议等工程细节；
- LangGraph 的节点本质就是普通 Python 函数，用什么方式调模型完全自由。
  这里只用 LangGraph 做「编排」，模型侧保持最轻的侵入。
"""
from __future__ import annotations

import json
import os
import re
from typing import Dict, List


# ---------------------------------------------------------------------------
# 真实 LLM：薄封装，直接委托给项目已有的 LLMClient
# ---------------------------------------------------------------------------
class RealLLM:
    def __init__(self):
        from src.utils.llm_client import LLMClient  # 延迟导入：无 Key 时构造会抛错
        self.client = LLMClient()
        self.name = f"real:{self.client.model}"

    def chat(self, messages: List[Dict[str, str]], temperature: float = 0, **kwargs) -> str:
        return self.client.chat(messages, temperature=temperature, **kwargs)


# ---------------------------------------------------------------------------
# 离线 Mock：用规则模拟「意图识别」和「SQL 生成 / 修复」，保证图可端到端运行
# ---------------------------------------------------------------------------
class MockLLM:
    name = "mock:offline-deterministic"

    # 第一次故意生成的「基线风格」问题 SQL：动态时间函数 + 缺支付过滤 + COUNT(*)
    _BAD_SQL = (
        "SELECT channel, SUM(amount) AS sales_amount, COUNT(*) AS order_count\n"
        "FROM order_item\n"
        "WHERE order_date >= date('now','-1 month')\n"
        "GROUP BY channel;"
    )
    # 收到 Critic 审查意见后给出的修正 SQL（与 retail.db 口径一致，可真实执行出 4 行）
    _FIXED_SQL = (
        "SELECT channel AS channel,\n"
        "       ROUND(SUM(amount), 2) AS sales_amount,\n"
        "       COUNT(DISTINCT order_id) AS order_count\n"
        "FROM order_item\n"
        "WHERE pay_status = '已支付'\n"
        "  AND order_date BETWEEN '2026-06-01' AND '2026-06-30'\n"
        "GROUP BY channel ORDER BY sales_amount DESC;"
    )

    def chat(self, messages: List[Dict[str, str]], temperature: float = 0, **kwargs) -> str:
        blob = "\n".join(str(m.get("content", "")) for m in messages)

        # 1) 意图解析节点：返回结构化 JSON
        if "意图解析" in blob and "JSON" in blob:
            return self._fake_intent_json(self._extract_question(messages))

        # 2) SQL 生成节点
        if "SQL" in blob or "sql" in blob:
            # 修复轮：消息里带有 Critic 的审查意见或数据库报错
            if ("审查意见" in blob) or ("数据库报错" in blob) or ("修正" in blob and "SQL" in blob):
                return "```sql\n" + self._FIXED_SQL + "\n```"
            # 首轮：故意给一条有问题的 SQL，演示打回-重写
            return "```sql\n" + self._BAD_SQL + "\n```"

        return "好的"

    @staticmethod
    def _extract_question(messages):
        for m in reversed(messages):
            mm = re.search(r"\[自然语言问题\]\s*(.+)", str(m.get("content", "")), re.S)
            if mm:
                return mm.group(1).strip()
        return str(messages[-1].get("content", "")) if messages else ""

    @staticmethod
    def _fake_intent_json(q: str) -> str:
        metric_kws = {
            "销售额": ["销售额", "gmv", "营收", "流水", "金额"],
            "订单量": ["订单量", "订单数", "单量"],
            "客单价": ["客单价", "aov"],
            "新客数": ["新客", "新增客户", "新增付费"],
            "复购率": ["复购"],
        }
        dim_kws = {
            "渠道": ["渠道", "channel", "线上", "线下", "小程序"],
            "品类": ["品类", "类目", "category"],
            "区域": ["区域", "地区", "城市", "region"],
        }
        metrics = [name for name, kws in metric_kws.items() if any(k in q.lower() or k in q for k in kws)]
        dims = [name for name, kws in dim_kws.items() if any(k in q.lower() or k in q for k in kws)]
        time_expr = next((t for t in ["上月", "近6个月", "今年上半年", "去年", "2025"] if t in q), "")
        qtype = "趋势分析" if any(k in q for k in ["趋势", "变化"]) else (
            "占比结构分析" if "占比" in q else "分组统计")
        payload = {
            "metrics": metrics,
            "dimensions": dims,
            "time_expr": time_expr,
            "question_type": qtype,
            "assumptions": ([] if time_expr else ["未显式指定时间，默认上月"]),
        }
        return json.dumps(payload, ensure_ascii=False)


# ---------------------------------------------------------------------------
# 工厂：按环境自动选择实现
# ---------------------------------------------------------------------------
_chat_model = None


def get_chat(force_mock: bool = None):
    """返回一个具备 .chat() 的模型单例。

    force_mock=True  强制离线 Mock；
    force_mock=False 强制真实 LLM（无 Key 会抛错）；
    force_mock=None  自动：AGENT_GRAPH_MOCK=1 用 mock，否则尝试真实，失败回落 mock。
    """
    global _chat_model
    if _chat_model is not None and force_mock is None:
        return _chat_model

    env_mock = os.environ.get("AGENT_GRAPH_MOCK", "").strip() in ("1", "true", "TRUE")
    use_mock = env_mock if force_mock is None else force_mock

    if use_mock:
        _chat_model = MockLLM()
    else:
        try:
            _chat_model = RealLLM()
        except Exception as e:  # 没有 Key / 网络不可用：诚实降级，不阻断学习与演示
            print(f"[agent_graph] 真实 LLM 不可用，降级离线 MockLLM（{type(e).__name__}: {e}）")
            _chat_model = MockLLM()
    return _chat_model


def parse_json_lenient(text: str) -> dict:
    """从 LLM 回复里稳妥地抠出 JSON（兼容 ```json 代码块 / 前后多余文字）。"""
    if not text:
        raise ValueError("空回复")
    m = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.S | re.I)
    raw = m.group(1) if m else text
    # 截取第一个 { 到最后一个 } 之间的内容，吃掉前后散文
    s, e = raw.find("{"), raw.rfind("}")
    if s != -1 and e != -1 and e > s:
        raw = raw[s:e + 1]
    return json.loads(raw)
