"""
GraphState：整张 Agent 图的共享状态（黑板 / Blackboard 模式）。

每个节点都从 state 读取自己关心的字段，返回一个「部分更新字典」，
LangGraph 会把它合并回总状态。节点之间因此不需要互相持有引用。

关键学习点 —— Annotated reducer：
- 普通字段（如 sql_draft）：后写覆盖先写（默认 reducer）。
- trace 字段用 `Annotated[list, merge_trace]`：每次节点返回 {"trace": [一条]}，
  LangGraph 会调用 merge_trace 把新记录【追加】而不是覆盖，从而自然沉淀全链路轨迹。
"""
from __future__ import annotations

import operator
from typing import Annotated, Any, Dict, List, TypedDict


def merge_trace(left: List[Dict[str, Any]], right: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """trace 通道的自定义 reducer：追加而非覆盖。

    LangGraph 合并时，left 是已有列表，right 是本节点新产出的列表。
    也可以直接用标准库的 operator.add，这里显式写出是为了讲清楚 reducer 契约。
    """
    return (left or []) + (right or [])


# 同理：把每一轮的 SQL 草案都保留下来，方便观察「生成 → 打回 → 重写」的演进
SQL_HISTORY = Annotated[List[str], operator.add]


class GraphState(TypedDict, total=False):
    # ---------- 输入 ----------
    question: str                       # 用户自然语言问题
    history: List[Dict[str, str]]       # 多轮对话历史（追问时解析指代）
    max_repairs: int                    # Critic 打回后最多重写次数

    # ---------- Intent Agent（意图解析）产物 ----------
    intent: Dict[str, Any]
    # 形如：
    # {
    #   "metrics": ["销售额", "订单量"],   # 问题涉及的指标（自然语言说法）
    #   "dimensions": ["渠道"],           # 分组/下钻维度
    #   "time_expr": "上月",              # 时间表达（原文）
    #   "question_type": "排名分析",       # 问题类型
    #   "assumptions": ["时间默认上月"],   # 缺省假设/潜在澄清点
    # }

    # ---------- Matcher Agent（指标检索）产物 ----------
    matched_metrics: List[Dict[str, Any]]   # 命中的完整指标对象（id/name/template/notes...）
    metric_context: str                     # 仅含命中指标的精简知识片段（选择性注入）
    resolved_dimensions: List[Dict[str, Any]]  # 命中维度的字段映射 [{key, field, mention}]

    # ---------- Generator Agent（SQL 生成）产物 ----------
    sql_draft: str
    sql_history: SQL_HISTORY                 # 每一轮草案，便于复盘
    generator_meta: Dict[str, Any]           # 例如本轮是否为 repair、用了哪个模型

    # ---------- 工具执行 + Critic Agent（审查）产物 ----------
    exec_result: Dict[str, Any]              # SQLExecutor 的原始返回（工具调用结果）
    critic: Dict[str, Any]
    # 形如：
    # {
    #   "passed": bool,
    #   "issues": [{"code": "DYNAMIC_TIME", "severity": "error", "message": "..."}],
    #   "db_error": "..." | None,
    # }
    repair_count: int

    # ---------- 最终输出 ----------
    final_sql: str
    final_answer: Dict[str, Any]
    error: str

    # ---------- 可观测性 ----------
    trace: Annotated[List[Dict[str, Any]], merge_trace]


def new_state(question: str, history=None, max_repairs: int = 2) -> Dict[str, Any]:
    """构造初始状态（给所有字段一个稳定默认值，避免节点里到处写 .get 判空）。"""
    return {
        "question": question,
        "history": history or [],
        "max_repairs": max_repairs,
        "intent": {},
        "matched_metrics": [],
        "metric_context": "",
        "resolved_dimensions": [],
        "sql_draft": "",
        "sql_history": [],
        "generator_meta": {},
        "exec_result": {},
        "critic": {},
        "repair_count": 0,
        "final_sql": "",
        "final_answer": {},
        "error": "",
        "trace": [],
    }
