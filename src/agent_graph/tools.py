"""
工具层（Tools）：Agent 能调用的「外部能力」。

在多 Agent 架构里，LLM 节点只负责思考与生成，真正产生副作用/外部事实的动作
（这里是「在只读数据库上执行 SQL」）应封装成工具。Critic 节点通过调用工具拿到
客观执行结果，而不是凭 LLM 的主观判断 —— 这就是 Tool Calling 的核心思想。

提供：
- run_sql(sql)          ：执行只读 SQL（复用既有 SQLExecutor，?mode=ro 打开）
- static_guard(sql)     ：对 SQL 做确定性的静态审查（不调用 LLM），返回问题清单
- GuardIssue 等数据结构
"""
from __future__ import annotations

import os
import re
from typing import Any, Dict, List

from src.utils.sql_executor import SQLExecutor

_BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_PATH = os.path.join(_BASE_DIR, "data", "processed", "retail.db")

_executor: SQLExecutor | None = None


def get_executor() -> SQLExecutor:
    """执行器单例：避免每次调用都新建连接。"""
    global _executor
    if _executor is None:
        _executor = SQLExecutor(db_path=DB_PATH)
    return _executor


def run_sql(sql: str, max_rows: int = 50) -> Dict[str, Any]:
    """工具：在 retail.db 上以只读方式执行 SQL。

    这是 Critic 节点调用的工具。返回结构与 SQLExecutor.execute 完全一致：
      {success, columns, rows, row_count, error, elapsed_ms, ...}
    """
    return get_executor().execute(sql, max_rows=max_rows)


# 严重级别：error 必须打回重写；warning 只记录不阻断
ERROR = "error"
WARNING = "warning"

_WRITE_RE = re.compile(r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|ATTACH|PRAGMA)\b", re.I)
_DYNAMIC_TIME_RE = re.compile(r"(date\s*\(\s*['\"]now|datetime\s*\(\s*['\"]now|CURRENT_DATE|CURRENT_TIMESTAMP)", re.I)
_COUNT_STAR_RE = re.compile(r"COUNT\s*\(\s*(\*|1)\s*\)", re.I)


def static_guard(sql: str) -> List[Dict[str, str]]:
    """对 SQL 做确定性静态审查（不调用 LLM，结果稳定可复现）。

    这些规则来自你消融实验里基线高频错误（见 docs/指标语义规则.md）：
    - 动态时间函数 date('now') 与「假设今天」不一致 → 空结果（V3 时间锚点解决的问题）
    - 金额/订单口径必须过滤 pay_status='已支付'
    - 订单计数必须 COUNT(DISTINCT order_id)，COUNT(*) 会因一单多商品而重复
    - 只读安全：禁止任何写操作 / 多语句
    """
    issues: List[Dict[str, str]] = []
    s = (sql or "").strip()

    if not s:
        issues.append({"code": "EMPTY_SQL", "severity": ERROR, "message": "SQL 为空"})
        return issues

    # 1) 只读安全：拒写操作
    if _WRITE_RE.search(s):
        issues.append({"code": "NOT_READ_ONLY", "severity": ERROR,
                       "message": "仅允许只读 SELECT/WITH，检测到写操作或危险关键字"})

    # 2) 多语句注入（去掉末尾分号后仍出现分号）
    body = s[:-1] if s.endswith(";") else s
    if ";" in body:
        issues.append({"code": "MULTI_STATEMENT", "severity": ERROR,
                       "message": "只允许单条查询，检测到多条语句"})

    # 3) 必须是 SELECT / WITH 开头
    if not re.match(r"^(SELECT|WITH)\b", body.lstrip(), re.I):
        issues.append({"code": "NOT_QUERY", "severity": ERROR,
                       "message": "SQL 必须以 SELECT 或 WITH 开头"})

    # 4) 动态时间函数（基线最高频错误来源）
    if _DYNAMIC_TIME_RE.search(s):
        issues.append({"code": "DYNAMIC_TIME", "severity": ERROR,
                       "message": "禁止使用 date('now')/CURRENT_DATE 等动态时间函数，"
                                  "必须按时间锚点硬编码具体日期"})

    # 5) 支付状态口径：涉及 order_item 的金额/订单，必须带 pay_status 过滤
    touches_money = re.search(r"\b(order_item|amount|order_id)\b", s, re.I)
    if touches_money and not re.search(r"pay_status\s*=\s*['\"]已支付['\"]", s, re.I):
        issues.append({"code": "MISSING_PAY_STATUS", "severity": ERROR,
                       "message": "涉及金额/订单口径但缺少 pay_status='已支付' 过滤（未支付/退款不应计入）"})

    # 6) COUNT(*) 订单计数（warning：某些场景 COUNT(*) 合法，但订单口径要求 DISTINCT）
    if _COUNT_STAR_RE.search(s) and re.search(r"order_id|order_item", s, re.I):
        issues.append({"code": "COUNT_STAR_ORDER", "severity": WARNING,
                       "message": "统计订单建议使用 COUNT(DISTINCT order_id)，COUNT(*) 会因一单多明细重复计数"})

    return issues


def has_error(issues: List[Dict[str, str]]) -> bool:
    return any(i.get("severity") == ERROR for i in issues)
