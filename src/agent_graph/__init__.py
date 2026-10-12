"""
多 Agent Text-to-SQL 编排包（方向一：把单体 Prompt 流水线重构为多 Agent 协作图）。

拓扑：

    START
      │
      ▼
 ┌─────────┐   ┌─────────┐   ┌───────────┐   ┌────────┐
 │ intent  │──▶│ matcher │──▶│ generator │──▶│ critic │
 └─────────┘   └─────────┘   └───────────┘   └───┬────┘
    意图解析      指标检索        SQL 生成         审查  │
                                                  │ 通过
                                          不通过  │ 且未超限
                                   ┌──────────────┘
                                   ▼
                              generator（带审查意见重写）
                                   │  通过 / 超限
                                   ▼
                                  END

设计原则：
1. 节点是「纯函数」：接收共享状态 GraphState，返回要更新的部分字典（LangGraph 自动合并）。
2. 节点之间不直接调用，只通过 GraphState 通信 —— 低耦合，可单测、可替换。
3. 工具调用（执行 SQL）只发生在 critic 节点，生成阶段绝不碰数据库（与线上「先确认后执行」一致）。
4. LLM / 执行器 / 语义层全部复用既有实现，本包只做「编排」，不重复造轮子。

对外入口：
    from src.agent_graph import run_pipeline, build_graph
"""
import os
import sys

# 保证无论从哪个工作目录启动，都能 import 到项目根下的 src.* 包
_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from src.agent_graph.graph import build_graph  # noqa: E402
from src.agent_graph.runner import run_pipeline  # noqa: E402

__all__ = ["build_graph", "run_pipeline"]
