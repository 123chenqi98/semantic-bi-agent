"""
GraphDeps：图的「依赖注入容器」。

节点本身保持纯函数式（只读写 GraphState），所有外部能力（LLM、语义层、SQL 工具、
静态审查规则、Prompt 构造器）都通过 deps 注入。这样：

- 本地零售库与风神数据集可以共用【同一张图拓扑】，只更换 deps（schema/规则/执行工具）；
- 单测时可以注入 MockLLM / 假执行器，结果确定性可复现；
- 节点不持有全局单例，便于替换与回放。
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional


@dataclass
class GraphDeps:
    # 模型：具备 .chat(messages, temperature=0) -> str（RealLLM / MockLLM 皆可）
    llm: Any = None

    # 语义层：SemanticLayer（指标词典 / 维度映射 / 时间锚点）。风神链路可为 None
    semantic: Any = None

    # 拼给 Generator 的规则块（全局口径 + 陷阱 + 输出规范 + 时间锚点 + DDL）
    system_suffix: str = ""

    # Critic 的确定性工具：静态审查 sql -> List[issue]；SQL 执行 sql -> exec_result
    guard: Optional[Callable[[str], List[Dict[str, str]]]] = None
    run_sql: Optional[Callable[[str], Dict[str, Any]]] = None

    # 是否在 Critic 节点真实执行 SQL。
    # 本地「确认后执行」链路为 True；plan（只生成不执行）/ 风神（QPM 限流）为 False
    execute_in_critic: bool = True

    # 执行成功但 0 行是否视为错误（时间锚点体系下通常意味着时间条件写错）
    empty_result_is_error: bool = True

    # 自定义 Generator 的 system prompt 构造器（风神版会覆盖）
    build_system_prompt: Optional[Callable[[Any, Dict[str, Any]], str]] = None

    # 自定义 Matcher 节点逻辑 fn(state, deps) -> 状态片段。
    # 默认 None 走本地语义层规则匹配；风神链路用 LLM 从真实 schema 中选择字段，在此覆盖。
    match: Optional[Callable[[Dict[str, Any], Any], Dict[str, Any]]] = None

    # Critic 打回后最多重写次数
    max_repairs: int = 2
