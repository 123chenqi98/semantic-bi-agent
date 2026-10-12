"""
多 Agent 流水线统一入口。

- build_local_deps(...)：装配「本地零售库」链路所需的全部依赖（模型 / 语义层 /
  规则块 / 静态审查 / 只读执行器）。
- run_pipeline(...)：跑完整张图并把最终 GraphState 整形成与既有 SemanticText2SQL.run
  风格相近的结果字典，便于在 app_backend 中替换 / 回退。

execute 参数：
- execute=True ：Critic 会真实执行 SQL 并可触发“执行报错→重写”的自修正（用于确认后）；
- execute=False：只生成 + 静态审查（不碰数据库），静态问题仍可触发纯生成式重写（用于 plan）。
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from src.agent_graph.state import new_state
from src.agent_graph.graph import build_graph, has_langgraph
from src.agent_graph.llm import get_chat
from src.agent_graph.tools import run_sql, static_guard
from src.agent_graph.deps import GraphDeps


def build_local_deps(execute: bool = True, max_repairs: int = 2,
                     force_mock: Optional[bool] = None) -> GraphDeps:
    """装配本地零售库（retail.db）链路依赖。"""
    from src.semantic_layer.semantic_loader import get_semantic_layer, ASSUMED_TODAY, DATA_END

    llm = get_chat(force_mock=force_mock)
    sem = get_semantic_layer()

    # 规则块：全局口径 + 陷阱 + 输出规范 + 时间锚点 + DDL。
    # 注意：命中指标的【指标词典】不在这里全量注入，而由 Matcher 裁剪后选择性注入。
    system_suffix = "\n\n".join([
        "## 全局硬性规则\n" + sem.format_global_rules(),
        sem.format_common_pitfalls(),
        sem.format_output_spec(),
        f"## 时间语义映射表（假设今天 = {ASSUMED_TODAY}，数据截止 {DATA_END}）\n"
        + sem.format_time_anchor_table(),
        "## 数据库 Schema（带中文注释）\n" + sem.schema_text,
    ])

    return GraphDeps(
        llm=llm,
        semantic=sem,
        system_suffix=system_suffix,
        guard=static_guard,
        run_sql=run_sql,
        execute_in_critic=execute,
        empty_result_is_error=True,
        build_system_prompt=None,  # 使用 Generator 默认的本地零售 prompt
        max_repairs=max_repairs,
    )


def run_pipeline(question: str,
                 history: Optional[List[Dict[str, str]]] = None,
                 execute: bool = True,
                 max_repairs: int = 2,
                 force_mock: Optional[bool] = None,
                 deps: Optional[GraphDeps] = None,
                 force_langgraph: Optional[bool] = None) -> Dict[str, Any]:
    """运行多 Agent Text-to-SQL 图，返回结构化结果。

    异常不在内部吞掉：Generator 首轮拿不到 SQL 等致命错误直接抛出，由上层（app_backend）
    捕获并回退到单体链路，保证线上可用性。
    """
    if deps is None:
        deps = build_local_deps(execute=execute, max_repairs=max_repairs, force_mock=force_mock)
    else:
        # 即使外部注入 deps，也尊重本次 execute / max_repairs
        deps.execute_in_critic = execute
        deps.max_repairs = max_repairs

    return invoke_graph(question, history, deps,
                        max_repairs=max_repairs, force_langgraph=force_langgraph)


def invoke_graph(question: str,
                 history: Optional[List[Dict[str, str]]],
                 deps: GraphDeps,
                 max_repairs: int = 2,
                 force_langgraph: Optional[bool] = None) -> Dict[str, Any]:
    """用给定 deps 编译并运行图，再整形成统一结果。本地零售 / 风神链路共用。"""
    graph = build_graph(deps, force_langgraph=force_langgraph)
    state = new_state(question, history=history, max_repairs=max_repairs)
    out = graph.invoke(state)

    critic = out.get("critic") or {}
    final_answer = out.get("final_answer") or {}
    is_mock = str(getattr(deps.llm, "name", "")).startswith("mock")
    exec_result = out.get("exec_result") or None

    return {
        "question": question,
        "generated_sql": out.get("final_sql") or out.get("sql_draft") or "",
        "exec_result": exec_result if (exec_result and exec_result.get("success")) else None,
        "matched_metrics": [m.get("id") for m in out.get("matched_metrics") or []],
        "matched_metric_objects": out.get("matched_metrics") or [],
        "resolved_dimensions": out.get("resolved_dimensions") or [],
        "intent": out.get("intent") or {},
        "critic": critic,
        "agent_passed": bool(final_answer.get("passed")),
        "repair_count": out.get("repair_count", 0),
        "repaired": out.get("repair_count", 0) > 0 and bool(final_answer.get("passed")),
        "sql_history": out.get("sql_history") or [],
        "trace": out.get("trace") or [],
        "sql_source": "agent-graph-mock" if is_mock else "agent-graph-llm",
        "graph_backend": getattr(graph, "backend", "langgraph" if has_langgraph() else "shim"),
    }
