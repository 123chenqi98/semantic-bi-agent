"""
图装配：把 4 个专职 Agent 节点 + 1 个收尾节点连成 StateGraph。

拓扑（实线为普通边，虚线为条件边）：

    START
      ▼
  ┌────────┐   ┌─────────┐   ┌───────────┐   ┌────────┐
  │ intent │──▶│ matcher │──▶│ generator │──▶│ critic │
  └────────┘   └─────────┘   └───────────┘   └───┬────┘
                                       ▲          │
                                       │   不通过且未超修复上限
                                       └──────────┤
                                                  │ 通过 / 超上限
                                                  ▼
                                              ┌──────────┐   ┌─────┐
                                              │ finalize │──▶│ END │
                                              └──────────┘   └─────┘

两种执行后端，对外都是 graph.invoke(state) -> final_state：
1. 安装了 langgraph（.venv-agent / 线上 requirements-agent）：走真实 StateGraph，
   条件边、Annotated reducer 都由框架处理。
2. 未安装 langgraph（线上精简 requirements）：用内置 _ShimGraph 以等价语义顺序执行，
   节点与拓扑完全复用，仅把“图调度”退化为纯 Python 循环 —— 产品链路因此零新增依赖、
   零部署风险，装上 langgraph 即自动切换回真图。
"""
from __future__ import annotations

from typing import Any, Callable, Dict

from src.agent_graph.state import GraphState, merge_trace
from src.agent_graph.nodes import trace_step
from src.agent_graph.nodes.intent import make_intent_node
from src.agent_graph.nodes.matcher import make_matcher_node
from src.agent_graph.nodes.generator import make_generator_node
from src.agent_graph.nodes.critic import make_critic_node

try:
    from langgraph.graph import StateGraph, START, END
    _HAS_LANGGRAPH = True
except Exception:  # 线上精简环境没有 langgraph 也能跑（走 _ShimGraph）
    StateGraph = START = END = None
    _HAS_LANGGRAPH = False


def has_langgraph() -> bool:
    return _HAS_LANGGRAPH


# 图节点 id 与路由分支常量。
# 注意：LangGraph 不允许节点 id 与 State 字段同名（state 里已有 intent/critic 等键），
# 因此图节点统一加 agent_ 前缀；trace 中展示的业务短名仍为 intent/matcher/...。
N_INTENT, N_MATCHER, N_GENERATOR, N_CRITIC, N_FINALIZE = (
    "agent_intent", "agent_matcher", "agent_generator", "agent_critic", "agent_finalize")
ROUTE_GEN, ROUTE_FIN = "generator", "finalize"


# ---------------------------------------------------------------------------
# 条件路由与收尾节点
# ---------------------------------------------------------------------------
def route_after_critic(state: Dict[str, Any]) -> str:
    """Critic 之后的条件边：通过或修复次数耗尽 → 收尾；否则回到 Generator 重写。"""
    critic = state.get("critic") or {}
    if critic.get("passed"):
        return ROUTE_FIN
    if state.get("repair_count", 0) >= state.get("max_repairs", 2):
        return ROUTE_FIN
    return ROUTE_GEN


def finalize_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """收尾：沉淀最终 SQL 与裁决结论（不做新的模型调用）。"""
    critic = state.get("critic") or {}
    sql = state.get("sql_draft", "")
    passed = bool(critic.get("passed"))
    final_answer = {
        "passed": passed,
        "repair_count": state.get("repair_count", 0),
        "issues": critic.get("issues", []),
        "db_error": critic.get("db_error"),
        "row_count": critic.get("row_count"),
        "executed": critic.get("executed", False),
    }
    detail = "审查通过" if passed else f"未通过（已收尾，残留 {len(critic.get('issues', []))} 个问题）"
    return {
        "final_sql": sql,
        "final_answer": final_answer,
        "trace": [trace_step("finalize", "ok" if passed else "failed", detail)],
    }


# ---------------------------------------------------------------------------
# 真实 LangGraph 装配
# ---------------------------------------------------------------------------
def _build_langgraph(deps):
    workflow = StateGraph(GraphState)
    workflow.add_node(N_INTENT, make_intent_node(deps))
    workflow.add_node(N_MATCHER, make_matcher_node(deps))
    workflow.add_node(N_GENERATOR, make_generator_node(deps))
    workflow.add_node(N_CRITIC, make_critic_node(deps))
    workflow.add_node(N_FINALIZE, finalize_node)

    workflow.add_edge(START, N_INTENT)
    workflow.add_edge(N_INTENT, N_MATCHER)
    workflow.add_edge(N_MATCHER, N_GENERATOR)
    workflow.add_edge(N_GENERATOR, N_CRITIC)
    workflow.add_conditional_edges(
        N_CRITIC, route_after_critic,
        {ROUTE_GEN: N_GENERATOR, ROUTE_FIN: N_FINALIZE})
    workflow.add_edge(N_FINALIZE, END)
    return workflow.compile()


# ---------------------------------------------------------------------------
# 无 langgraph 时的等价轻量调度器（节点 / 路由 / reducer 语义一致）
# ---------------------------------------------------------------------------
_ACCUMULATE = {"trace": merge_trace, "sql_history": lambda a, b: (a or []) + (b or [])}


class _ShimGraph:
    """仅实现本图需要的 invoke 语义：普通字段后写覆盖，trace/sql_history 追加。"""

    def __init__(self, nodes: Dict[str, Callable[[Dict], Dict]]):
        self.nodes = nodes
        self.backend = "shim"

    @staticmethod
    def _merge(state: Dict, update: Dict) -> Dict:
        for k, v in (update or {}).items():
            if k in _ACCUMULATE:
                state[k] = _ACCUMULATE[k](state.get(k), v)
            else:
                state[k] = v
        return state

    def invoke(self, state: Dict) -> Dict:
        state = dict(state)
        for name in (N_INTENT, N_MATCHER, N_GENERATOR):
            self._merge(state, self.nodes[name](state))
        while True:
            self._merge(state, self.nodes[N_CRITIC](state))
            nxt = route_after_critic(state)
            if nxt == ROUTE_FIN:
                break
            self._merge(state, self.nodes[N_GENERATOR](state))
        self._merge(state, self.nodes[N_FINALIZE](state))
        return state


def _build_shim(deps) -> _ShimGraph:
    return _ShimGraph({
        N_INTENT: make_intent_node(deps),
        N_MATCHER: make_matcher_node(deps),
        N_GENERATOR: make_generator_node(deps),
        N_CRITIC: make_critic_node(deps),
        N_FINALIZE: finalize_node,
    })


def build_graph(deps, force_langgraph: bool = None):
    """编译/构造图。

    force_langgraph=True  强制真实 langgraph（未安装会抛错）；
    force_langgraph=False 强制 shim；
    force_langgraph=None  自动：装了 langgraph 用真图，否则 shim。
    """
    use_lg = _HAS_LANGGRAPH if force_langgraph is None else force_langgraph
    if use_lg:
        if not _HAS_LANGGRAPH:
            raise RuntimeError("当前环境未安装 langgraph，无法强制使用 StateGraph")
        graph = _build_langgraph(deps)
        graph.backend = "langgraph"
        return graph
    return _build_shim(deps)
