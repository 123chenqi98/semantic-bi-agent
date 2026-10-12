"""
节点 4 · Critic Agent（审查 / 工具调用 / 自修正触发）

职责：对 Generator 的 SQL 做客观裁决，决定【通过放行】还是【打回重写】。

审查顺序（确定性优先，尽量不靠模型主观打分）：
1. 工具调用 static_guard：只读安全、动态时间函数、支付口径、COUNT(DISTINCT) 等规则；
2. 工具调用 run_sql：在只读库上真实执行，拿到数据库报错 / 行数（这是关键的 Tool Calling）；
3. 两者任一出现 error（或成功但 0 行）即不通过，把结构化 issue 与报错交给路由打回。

只有 execute_in_critic=True 时才执行 SQL；plan 阶段（只生成不执行）与风神链路
（QPM 限流、执行保留在“确认”环节）只做静态审查，不碰数据库。
"""
from __future__ import annotations

from typing import Dict, List

from src.agent_graph.nodes import trace_step


def _has_error(issues: List[Dict]) -> bool:
    return any(i.get("severity") == "error" for i in (issues or []))


def make_critic_node(deps):
    def critic_node(state: Dict) -> Dict:
        sql = state.get("sql_draft", "")
        issues: List[Dict] = []

        # 1) 静态确定性审查（不调用 LLM、不访问数据库）
        if deps.guard is not None:
            try:
                issues = list(deps.guard(sql) or [])
            except Exception as e:
                issues = [{"code": "GUARD_ERROR", "severity": "warning",
                           "message": f"静态审查异常：{type(e).__name__}: {e}"}]

        # 2) 静态无 error 时才真实执行（避免对明显非法 SQL 白白消耗一次执行 / QPM）
        exec_result: Dict = {}
        db_error = None
        executed = False
        if not _has_error(issues) and deps.execute_in_critic and deps.run_sql is not None:
            executed = True
            try:
                exec_result = deps.run_sql(sql) or {}
            except Exception as e:
                exec_result = {"success": False, "error": f"{type(e).__name__}: {e}"}
            if not exec_result.get("success"):
                db_error = exec_result.get("error") or "SQL 执行失败"
                issues.append({"code": "DB_EXEC_ERROR", "severity": "error",
                               "message": f"SQL 在数据库执行报错：{db_error}"})
            elif deps.empty_result_is_error and exec_result.get("row_count") == 0:
                issues.append({"code": "EMPTY_RESULT", "severity": "error",
                               "message": "SQL 执行成功但返回 0 行，通常是时间条件或过滤口径写错"})

        passed = not _has_error(issues)
        repair_count = state.get("repair_count", 0) + (0 if passed else 1)
        critic = {
            "passed": passed,
            "issues": issues,
            "db_error": db_error,
            "row_count": exec_result.get("row_count") if executed else None,
            "executed": executed,
        }
        codes = ",".join(i.get("code", "?") for i in issues) or "通过"
        step = trace_step("critic", "pass" if passed else "reject",
                          codes, repair_count=repair_count,
                          row_count=critic["row_count"], executed=executed)
        return {
            "critic": critic,
            "exec_result": exec_result,
            "repair_count": repair_count,
            "trace": [step],
        }

    return critic_node
