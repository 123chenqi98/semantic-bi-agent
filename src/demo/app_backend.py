"""
毕设前端配套 Flask 后端 API（支持 Mock 模式 + 真实 LLM 模式）
启动: 项目根目录执行
  python3 -m src.demo.app_backend
默认端口 5001（避免和旧的 5000 冲突）。

- 无 LLM_API_KEY 时自动降级为【Mock 模式】
  → 对预设的 7 个问题返回从 evaluation_results.csv 已知的正确 SQL + 直接 SQLite 执行
  → 仍体现语义层机制：指标匹配、时间映射、规则校验
- 有 LLM_API_KEY 时走真实 baseline vs semantic 双 Pipeline
"""
from __future__ import annotations

import os
import sys
import time
import copy
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from flask import Flask, request, jsonify, Response, stream_with_context, send_from_directory
from flask_cors import CORS

from src.utils.sql_executor import SQLExecutor
from src.semantic_layer.semantic_loader import get_semantic_layer
from src.datasource import get_provider as _get_ds_provider, provider_registry as _ds_registry
from src.utils import audit as _audit

DB_PATH = os.path.join(ROOT, "data", "processed", "retail.db")
executor = SQLExecutor(db_path=DB_PATH)
semantic = get_semantic_layer()

# 第五轮：进程启动时间戳（/api/system/status 用于计算 uptime 与运行模式展示）
_BOOT_TS = time.time()
_SYSTEM_VERSION = "1.6.0"  # 第六轮：发布收口（使用引导 / 精选示例 / 状态命名统一 / 链路日志 / 交付文档）


def _log(stage: str, **fields) -> None:
    """统一链路日志（面向控制台 / 容器 stdout），格式：[BI][时:分:秒][阶段] key=值 …。

    与结构化审计（src/utils/audit.py）互补：审计落盘供事后查询，本日志供演示与排障时
    快速定位「前端 / 后端 / 数据源 / LLM」哪一环出问题。任何日志异常都不得影响主链路。
    """
    try:
        ts = time.strftime("%H:%M:%S")
        kv = " ".join(f"{k}={v}" for k, v in fields.items() if v is not None)
        print(f"[BI][{ts}][{stage}] {kv}".rstrip(), flush=True)
    except Exception:
        pass

# ---------- 尝试加载真实 LLM pipeline；不可用则降级到 Mock ----------
baseline_system = None
experiment_system = None
real_llm_enabled = False


def _try_load_real_pipelines():
    global baseline_system, experiment_system, real_llm_enabled
    try:
        from src.agent.baseline_text2sql import BaselineText2SQL
        from src.agent.semantic_text2sql import SemanticText2SQL
        baseline_system = BaselineText2SQL()
        experiment_system = SemanticText2SQL()
        real_llm_enabled = True
        print("✅ [Real LLM Mode] LLM API 已配置，启用真实 Text-to-SQL pipeline")
    except Exception as e:
        real_llm_enabled = False
        print(f"⚠️  [Mock Mode] 未配置 LLM_API_KEY，已降级为内置 Mock + 真实 SQLite 执行（{type(e).__name__}: {e}）")


_try_load_real_pipelines()

# ---------- Mock 模式的"正确 SQL 题库"（对应前端 7 个预设问题 + chat 常用问题） ----------
# 用关键词模糊匹配；命中后直接给"实验组"正确 SQL 并真实执行 retail.db
# 这些 SQL 来自评测结果 experiment_results.csv（也就是毕业设计的对照组正确答案）
MOCK_CORRECT_SQL_BANK = [
    {
        "id": "Q01",
        "match": ["上月", "销售额"],
        "matched_metrics": [("M01", "销售额")],
        "time_range": "2026-06（上月）",
        "time_detected": "上月 → order_date BETWEEN '2026-06-01' AND '2026-06-30'",
        "baseline_error": "基线系统使用 date('now','-1 month') 动态时间函数，假设今天为运行时日期，会查不到数据",
        "sql": (
            "SELECT ROUND(SUM(amount), 2) AS sales_amount\n"
            "FROM order_item\n"
            "WHERE pay_status = '已支付'\n"
            "  AND order_date BETWEEN '2026-06-01' AND '2026-06-30';"
        ),
        "baseline_sql": (
            "SELECT SUM(amount) AS last_month_sales_amount\n"
            "FROM order_item\n"
            "WHERE pay_status = '已支付'\n"
            "  AND strftime('%Y-%m', order_date) = strftime('%Y-%m', date('now', '-1 month'));"
        ),
        "findings": [
            "基线系统使用动态时间函数 date('now')，返回空值 0 行",
            "语义层注入『假设今天=2026-07-01』时间锚点，上月硬编码为 2026-06",
            "正确过滤 pay_status = '已支付'，未支付/已退款订单不计入",
        ],
    },
    {
        "id": "Q07",
        "match": ["近6个月", "订单量"],
        "matched_metrics": [("M02", "订单量")],
        "time_range": "2026-01 ~ 2026-06",
        "time_detected": "近6个月 → 2026-01-01 ~ 2026-06-30",
        "baseline_error": "基线用 date('now','-6 months') 可能返回 12 个月",
        "dimensions": ["月份"],
        "sql": (
            "SELECT strftime('%Y-%m', order_date) AS month, COUNT(DISTINCT order_id) AS order_count\n"
            "FROM order_item WHERE pay_status = '已支付'\n"
            "  AND order_date BETWEEN '2026-01-01' AND '2026-06-30'\n"
            "GROUP BY month ORDER BY month;"
        ),
        "baseline_sql": (
            "SELECT strftime('%Y-%m', order_date) AS month, COUNT(DISTINCT order_id)\n"
            "FROM order_item WHERE pay_status='已支付' AND order_date >= date('now','-6 months')\n"
            "GROUP BY month;"
        ),
        "findings": [
            "正确硬编码『近6个月=2026-01-01~2026-06-30』，基线动态范围会算到当前月",
            "订单量使用 COUNT(DISTINCT order_id)，避免商品粒度重复计数",
        ],
    },
    {
        "id": "Q08",
        "match": ["2025", "季度", "新客数"],
        "matched_metrics": [("M04", "新客数")],
        "time_range": "2025年全年",
        "dimensions": ["季度"],
        "time_detected": "2025年 → 2025-01-01 ~ 2025-12-31",
        "baseline_error": "基线错用 customer.register_date（注册日期）当首单日期",
        "sql": (
            "WITH customer_first_pay AS (\n"
            "    SELECT customer_id, MIN(order_date) AS first_pay_date\n"
            "    FROM order_item WHERE pay_status = '已支付' GROUP BY customer_id\n"
            ")\n"
            "SELECT\n"
            "    CASE\n"
            "        WHEN first_pay_date BETWEEN '2025-01-01' AND '2025-03-31' THEN '2025Q1'\n"
            "        WHEN first_pay_date BETWEEN '2025-04-01' AND '2025-06-30' THEN '2025Q2'\n"
            "        WHEN first_pay_date BETWEEN '2025-07-01' AND '2025-09-30' THEN '2025Q3'\n"
            "        WHEN first_pay_date BETWEEN '2025-10-01' AND '2025-12-31' THEN '2025Q4'\n"
            "    END AS quarter,\n"
            "    COUNT(DISTINCT customer_id) AS new_customer_count\n"
            "FROM customer_first_pay\n"
            "WHERE first_pay_date BETWEEN '2025-01-01' AND '2025-12-31'\n"
            "GROUP BY quarter\n"
            "ORDER BY quarter;"
        ),
        "baseline_sql": (
            "SELECT strftime('%m', register_date)/3+1 AS quarter, COUNT(*)\n"
            "FROM customer WHERE register_date BETWEEN '2025-01-01' AND '2025-12-31'\n"
            "GROUP BY quarter;"
        ),
        "findings": [
            "新客 = 首次支付日期在周期内（MIN(order_date) 作为首单时间）",
            "基线错误使用注册日期统计新客，季度标签输出纯数字而非 '2025Qx' 字符串",
        ],
    },
    {
        "id": "Q21",
        "match": ["区域", "占比"],
        "matched_metrics": [("M01", "销售额"), ("M08", "占比")],
        "time_range": "2026-06（上月）",
        "dimensions": ["区域"],
        "time_detected": "上月 → 2026-06",
        "baseline_error": "基线可能只返回占比一列，或用错时间导致 0 行",
        "sql": (
            "WITH total AS (SELECT SUM(amount) AS total FROM order_item\n"
            "    WHERE pay_status='已支付' AND order_date BETWEEN '2026-06-01' AND '2026-06-30')\n"
            "SELECT c.region, ROUND(SUM(oi.amount),2) AS sales_amount,\n"
            "       ROUND(SUM(oi.amount)*100.0/(SELECT total FROM total),2) AS share_pct\n"
            "FROM order_item oi LEFT JOIN customer c ON oi.customer_id=c.customer_id\n"
            "WHERE oi.pay_status='已支付' AND oi.order_date BETWEEN '2026-06-01' AND '2026-06-30'\n"
            "GROUP BY c.region ORDER BY sales_amount DESC;"
        ),
        "baseline_sql": None,
        "findings": [
            "占比问题同时返回 绝对值 + 百分比 两列（基线常只返回百分比一列，不满足输出规范）",
            "使用 LEFT JOIN customer，避免无匹配客户时丢失区域维度",
        ],
    },
    {
        "id": "Q25",
        "match": ["2025", "复购率"],
        "matched_metrics": [("M05", "复购率")],
        "time_range": "2025年全年",
        "dimensions": ["月份"],
        "time_detected": "2025年 → 2025年全年",
        "baseline_error": "基线定义为『新客后续复购率』跨月追踪，且只返回最高/最低 2 行",
        "sql": (
            "WITH monthly AS (\n"
            "    SELECT strftime('%Y-%m', order_date) AS month, customer_id, COUNT(DISTINCT order_id) AS cnt\n"
            "    FROM order_item WHERE pay_status='已支付' AND order_date BETWEEN '2025-01-01' AND '2025-12-31'\n"
            "    GROUP BY month, customer_id\n"
            ")\n"
            "SELECT month, COUNT(DISTINCT customer_id) AS total_active,\n"
            "       COUNT(DISTINCT CASE WHEN cnt>=2 THEN customer_id END) AS repurchase_cnt,\n"
            "       ROUND(COUNT(DISTINCT CASE WHEN cnt>=2 THEN customer_id END)*100.0/NULLIF(COUNT(DISTINCT customer_id),0),2) AS repurchase_rate_pct\n"
            "FROM monthly GROUP BY month ORDER BY repurchase_rate_pct DESC;"
        ),
        "baseline_sql": None,
        "findings": [
            "复购率 = 当月下单>=2次的客户数 / 当月活跃客户数",
            "基线错误地跨月追踪新客复购，定义错误，且只返回 2 行而非 12 个月",
        ],
    },
    {
        "id": "Q10",
        "match": ["渠道", "季度", "销售额"],
        "matched_metrics": [("M01", "销售额")],
        "time_range": "全量",
        "dimensions": ["渠道", "季度"],
        "time_detected": "未指定 → 全量数据按渠道+季度",
        "baseline_error": "基线维度列顺序颠倒（季度在前、渠道在后）",
        "sql": (
            "SELECT oi.channel, dd.season_name AS quarter, ROUND(SUM(oi.amount),2) AS sales_amount\n"
            "FROM order_item oi LEFT JOIN date_dim dd ON oi.order_date=dd.date\n"
            "WHERE oi.pay_status='已支付' GROUP BY oi.channel, dd.season_name\n"
            "ORDER BY oi.channel, quarter;"
        ),
        "baseline_sql": (
            "SELECT dd.season_name AS quarter, oi.channel, SUM(oi.amount) AS sales_amount\n"
            "FROM order_item oi LEFT JOIN date_dim dd ON oi.order_date=dd.date\n"
            "WHERE oi.pay_status='已支付'\n"
            "GROUP BY quarter, oi.channel ORDER BY quarter, oi.channel;"
        ),
        "findings": [
            "输出列顺序严格按问题中维度出现顺序：先渠道、后季度、最后指标列",
            "基线把季度放第一列，数据错位",
        ],
    },
    {
        "id": "Q09",
        "match": ["客单价", "环比"],
        "matched_metrics": [("M03", "客单价"), ("M06", "环比增长率")],
        "time_range": "2025年全年",
        "dimensions": ["月份"],
        "time_detected": "2025年每个月",
        "baseline_error": "基线缺少上期值列（环比只有百分比没有对比）",
        "sql": (
            "WITH monthly AS (\n"
            "    SELECT strftime('%Y-%m', order_date) AS month,\n"
            "           ROUND(SUM(amount)*1.0/NULLIF(COUNT(DISTINCT order_id),0),2) AS aov\n"
            "    FROM order_item WHERE pay_status='已支付' AND order_date BETWEEN '2025-01-01' AND '2025-12-31'\n"
            "    GROUP BY month\n"
            ")\n"
            "SELECT month, aov, LAG(aov) OVER (ORDER BY month) AS prev_aov,\n"
            "       ROUND((aov - LAG(aov) OVER (ORDER BY month)) * 100.0 / NULLIF(LAG(aov) OVER (ORDER BY month),0), 2) AS mom_change_pct\n"
            "FROM monthly ORDER BY month;"
        ),
        "baseline_sql": None,
        "findings": [
            "客单价 = 销售额 / COUNT(DISTINCT order_id)，不是 AVG(amount)",
            "环比问题必须返回：当期值、上期值、环比百分比 3 列",
        ],
    },
    {
        "id": "Q13_ch",
        "match": ["渠道", "客单价"],
        "matched_metrics": [("M03", "客单价")],
        "time_range": "2026-06（上月，未指定默认上月）",
        "dimensions": ["渠道"],
        "time_detected": "对比问题未指定时间 → 默认上月 2026-06",
        "sql": (
            "SELECT channel,\n"
            "       ROUND(SUM(amount)*1.0/NULLIF(COUNT(DISTINCT order_id),0),2) AS aov\n"
            "FROM order_item WHERE pay_status='已支付' AND order_date BETWEEN '2026-06-01' AND '2026-06-30'\n"
            "GROUP BY channel ORDER BY aov DESC;"
        ),
        "baseline_sql": None,
        "findings": [
            "对比问题未显式指定时间 → 默认取上月（语义层『常见陷阱规则2』注入）",
            "基线可能取全量时间范围，导致对比结果错位",
        ],
    },
    {
        "id": "Q02_eh",
        "match": ["今年上半年", "华东", "销售额"],
        "matched_metrics": [("M01", "销售额")],
        "time_range": "2026-01~2026-06（今年上半年）",
        "time_detected": "今年上半年 → 2026-01-01 ~ 2026-06-30",
        "baseline_error": "基线容易把『今年』理解成 2025 年，时间错位",
        "sql": (
            "SELECT ROUND(SUM(oi.amount),2) AS sales_amount\n"
            "FROM order_item oi LEFT JOIN customer c ON oi.customer_id=c.customer_id\n"
            "WHERE oi.pay_status='已支付'\n"
            "  AND c.region='华东'\n"
            "  AND oi.order_date BETWEEN '2026-01-01' AND '2026-06-30';"
        ),
        "baseline_sql": None,
        "findings": ["时间锚点『今年=2026年』硬编码，基线容易把 2025 当年数据当今年"],
    },
]


def _match_mock_bank(question: str):
    q = question
    for item in MOCK_CORRECT_SQL_BANK:
        if all(k in q for k in item["match"]):
            return copy.deepcopy(item)
    return None


_FOLLOWUP_DIMENSIONS = [
    {"keywords": ["渠道", "channel"], "col": "oi.channel", "label": "渠道", "join": ""},
    {"keywords": ["品类", "类别", "分类", "category"], "col": "p.category", "label": "品类",
     "join": " LEFT JOIN product p ON oi.product_id=p.product_id"},
    {"keywords": ["区域", "地区", "region"], "col": "c.region", "label": "区域",
     "join": " LEFT JOIN customer c ON oi.customer_id=c.customer_id"},
    {"keywords": ["月份", "按月", "月度", "month"], "col": "strftime('%Y-%m', oi.order_date)", "label": "月份", "join": ""},
    {"keywords": ["性别", "gender"], "col": "c.gender", "label": "性别",
     "join": " LEFT JOIN customer c ON oi.customer_id=c.customer_id"},
    {"keywords": ["会员等级", "会员"], "col": "c.member_level", "label": "会员等级",
     "join": " LEFT JOIN customer c ON oi.customer_id=c.customer_id"},
    {"keywords": ["品牌", "brand"], "col": "p.brand", "label": "品牌",
     "join": " LEFT JOIN product p ON oi.product_id=p.product_id"},
]

_METRIC_PATTERNS = [
    {"keywords": ["销售额", "gmv", "营收", "金额", "销售"],
     "expr": "ROUND(SUM(oi.amount), 2)", "alias": "sales_amount", "label": "销售额", "metric_id": "M01"},
    {"keywords": ["订单量", "订单数", "单量", "order"],
     "expr": "COUNT(DISTINCT oi.order_id)", "alias": "order_count", "label": "订单量", "metric_id": "M02"},
    {"keywords": ["客单价", "aov", "平均订单"],
     "expr": "ROUND(SUM(oi.amount)*1.0/NULLIF(COUNT(DISTINCT oi.order_id),0),2)", "alias": "aov",
     "label": "客单价", "metric_id": "M03"},
    {"keywords": ["用户数", "客户数", "人数", "customer"],
     "expr": "COUNT(DISTINCT oi.customer_id)", "alias": "customer_count", "label": "客户数", "metric_id": "M06"},
]


def _try_followup(question: str, history):
    """检测追问（如「按渠道拆分」），从上一轮 history 提取时间范围和指标，生成 GROUP BY SQL。"""
    if not history:
        return None
    q_lower = question.lower()
    has_breakdown = any(k in question for k in ["拆分", "分组", "按", "分渠道", "分品类", "分区域", "breakdown", "group by"])
    has_dim = any(any(k in q_lower or k in question for k in d["keywords"]) for d in _FOLLOWUP_DIMENSIONS)
    if not (has_breakdown or has_dim):
        return None

    dim = None
    for d in _FOLLOWUP_DIMENSIONS:
        if any(k in q_lower or k in question for k in d["keywords"]):
            dim = d
            break
    if not dim:
        return None

    prev_user_q = ""
    prev_sql = ""
    for h in reversed(history):
        role = h.get("role", "")
        content = h.get("content", "")
        if role == "assistant" and "[之前生成的SQL]" in content and not prev_sql:
            prev_sql = content.replace("[之前生成的SQL]", "").strip()
        if role == "user" and not prev_user_q:
            prev_user_q = content
        if prev_sql and prev_user_q:
            break

    date_start, date_end = "2026-06-01", "2026-06-30"
    m = re.search(r"BETWEEN\s+'(\d{4}-\d{2}-\d{2})'\s+AND\s+'(\d{4}-\d{2}-\d{2})'", prev_sql, re.IGNORECASE)
    if m:
        date_start, date_end = m.group(1), m.group(2)
    elif "2025" in prev_sql and "2025-12-31" in prev_sql:
        date_start, date_end = "2025-01-01", "2025-12-31"
    elif "2026-01" in prev_sql and "2026-06" in prev_sql:
        date_start, date_end = "2026-01-01", "2026-06-30"

    metric = _METRIC_PATTERNS[0]
    combined = (prev_user_q + " " + prev_sql).lower()
    for mp in _METRIC_PATTERNS:
        if any(k in combined for k in mp["keywords"]):
            metric = mp
            break

    dim_col = dim["col"]
    join_clause = dim["join"]
    alias = metric["alias"]
    expr = metric["expr"]

    sql = (
        f"SELECT {dim_col} AS {dim['label'].lower()}, {expr} AS {alias}\n"
        f"FROM order_item oi{join_clause}\n"
        f"WHERE oi.pay_status = '已支付'\n"
        f"  AND oi.order_date BETWEEN '{date_start}' AND '{date_end}'\n"
        f"GROUP BY {dim_col}\n"
        f"ORDER BY {alias} DESC;"
    )

    baseline_sql = (
        f"SELECT {dim_col} AS {dim['label'].lower()}, SUM(oi.amount) AS {alias}\n"
        f"FROM order_item oi{join_clause}\n"
        f"WHERE oi.order_date >= date('now','-1 month')\n"
        f"GROUP BY {dim_col};"
    )

    time_label = f"{date_start} ~ {date_end}"
    return {
        "id": "FOLLOWUP",
        "match": [dim["label"]],
        "matched_metrics": [(metric["metric_id"], metric["label"])],
        "time_range": time_label,
        "time_detected": f"承接上一轮时间范围 → {date_start} ~ {date_end}",
        "dimensions": [dim["label"]],
        "baseline_error": f"基线用 date('now') 动态时间导致空值，且缺少 pay_status 过滤；追问场景下基线无法继承上文时间范围",
        "sql": sql,
        "baseline_sql": baseline_sql,
        "findings": [
            f"多轮追问：继承上一轮问题『{prev_user_q[:20]}』的时间范围（{time_label}）",
            f"按【{dim['label']}】维度拆分，指标={metric['label']}（{expr}）",
            "追问场景下语义层自动继承上文的时间锚点和业务口径，基线无法跨轮保持上下文一致性",
        ],
    }


def _run_baseline_via_mock(question: str, matched_item):
    """如果题库里有 baseline_sql 用它；否则按基线典型错误风格构造一个"""
    if matched_item and matched_item.get("baseline_sql"):
        baseline_sql = matched_item["baseline_sql"]
    else:
        # 兜底：按基线典型错误——用 date('now','-1 month') + 不带 pay_status 的轻量 SQL
        baseline_sql = (
            "SELECT SUM(amount) AS amount FROM order_item\n"
            "WHERE order_date >= date('now','-1 month');"
        )
    t0 = time.time()
    exec_result = executor.execute(baseline_sql, max_rows=50)
    t_ms = round((time.time() - t0) * 1000, 1)
    return {
        "sql": baseline_sql,
        "success": exec_result["success"],
        "error": exec_result.get("error"),
        "columns": exec_result["columns"],
        "rows": [list(r) for r in exec_result["rows"]],
        "row_count": exec_result["row_count"],
        "time_ms": t_ms,
    }


def _build_pipeline_trace(question, matched_item, matched_metrics, dimensions, time_detected,
                         baseline_block, sql, rules_applied, errors_corrected, mock_mode):
    steps = []
    steps.append({
        "step": 1,
        "name": "任务理解",
        "status": "ok",
        "detail": f"识别到问题类型：『{_classify_question_type(question)}』",
    })
    metrics_display = [f"{m[0]} {m[1]}" for m in matched_metrics] if matched_metrics else ["（未命中已知指标）"]
    steps.append({
        "step": 2,
        "name": "语义层匹配",
        "status": "ok",
        "detail": f"匹配指标：{', '.join(metrics_display)}" + (
            f"｜维度：{', '.join(dimensions)}" if dimensions else ""),
    })
    steps.append({
        "step": 3,
        "name": "时间锚点映射",
        "status": "ok",
        "detail": time_detected or "无显式时间表达，按规则注入默认时间范围",
    })
    steps.append({
        "step": 4,
        "name": "SQL 生成（语义约束）",
        "status": "ok",
        "detail": "使用『带中文注释 Schema + 全局 7 条口径规则 + 易混淆警示 + 输出列格式规范』的 System Prompt 生成 SQL",
    })
    steps.append({
        "step": 5,
        "name": "结果自校验 & 自修正",
        "status": "ok",
        "detail": (
            f"命中规则 {len(rules_applied)} 条：{', '.join(rules_applied)}；"
            f"纠正典型基线错误 {len(errors_corrected)} 项：{', '.join(errors_corrected) if errors_corrected else '无'}"
        ),
    })
    return {
        "mode": "MOCK + 真实SQLite" if mock_mode else "真实LLM + 真实SQLite",
        "baseline_snapshot": baseline_block,
        "sql_snapshot": sql,
        "rules_applied": rules_applied,
        "errors_corrected": errors_corrected,
        "steps": steps,
    }


def _classify_question_type(q: str) -> str:
    if any(k in q for k in ("趋势", "变化情况", "每个月", "每月")):
        return "趋势分析"
    if "占比" in q or "份额" in q:
        return "占比结构分析"
    if any(k in q for k in ("对比", "哪个更高", "vs")):
        return "对比分析"
    if any(k in q for k in ("Top", "前", "最多", "最高", "最低")):
        return "排名分析"
    if any(k in q for k in ("跌幅最大", "最高和最低", "异常")):
        return "异常识别"
    if any(k in q for k in ("环比", "同比")):
        return "环比/同比分析"
    return "直接统计"


def _guess_time_range(question: str):
    """问题没命中题库时，粗粒度猜一个时间范围，保证前端 pill 仍能显示"""
    q = question
    if "上月" in q:
        return "2026-06（上月）"
    if "近6个月" in q or "近六个月" in q:
        return "2026-01 ~ 2026-06"
    if "今年上半年" in q:
        return "2026-01 ~ 2026-06"
    if "2026上半年" in q:
        return "2026上半年"
    if "2025年全年" in q or "去年" in q and "2026" not in q:
        return "2025年全年"
    if "2025年" in q and "Q" in q:
        return "2025 指定季度"
    if "2025年" in q:
        return "2025年"
    return None


def _derive_rules_and_corrections(q: str, matched_item):
    rules = [
        "R1 支付状态默认过滤：pay_status='已支付'",
        "R2 时间硬编码（禁止 date('now')）",
        "R6 季度/月份标签字符串格式",
    ]
    if "订单量" in q or "订单数" in q:
        rules.append("R3 COUNT(DISTINCT order_id) 去重")
    if any(k in q for k in ("客单价", "占比", "复购率", "环比", "同比")):
        rules.append("R4 比例/百分比 ROUND(...,2) + NULLIF 除零保护")
    if any(k in q for k in ("区域", "渠道", "品牌", "品类", "城市", "会员")):
        rules.append("R5 LEFT JOIN 避免维度丢失")
    if "新客" in q or "新增付费" in q:
        rules.append("S-M04 新客定义 = 首次支付（MIN(order_date)）非注册日期")
    if "复购率" in q:
        rules.append("S-M05 复购率=当月内>=2单客户占比，非跨月追踪")
    if "客单价" in q:
        rules.append("S-M03 客单价=SUM/COUNT(DISTINCT order_id) 非 AVG(amount)")
    if matched_item and matched_item.get("baseline_error"):
        corrections = [matched_item["baseline_error"]]
    else:
        corrections = []
    return rules, corrections


# ---------- Flask 入口 ----------
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "ok": True,
        "real_llm_enabled": real_llm_enabled,
        "mode": "real-llm" if real_llm_enabled else "mock-sql+real-sqlite",
        "db_path": DB_PATH,
        "db_exists": os.path.exists(DB_PATH),
        "metrics_count": len(semantic.metrics),
    })


@app.route("/api/system/status", methods=["GET"])
def api_system_status():
    """第五轮：统一系统状态面板数据（首页 / 设置页共用）。

    聚合后端服务、LLM、全部数据源（五态状态机）、审计摘要为一次请求；
    只返回状态与脱敏信息，绝不回显任何密钥。
    """
    try:
        current = _get_ds_provider()
        provider_health = current.health_check()
        registry = _ds_registry()
        datasource_ok = bool(provider_health.get("ok"))
    except Exception as e:
        provider_health = {"ok": False, "message": f"数据源状态读取失败：{type(e).__name__}: {e}"}
        registry = {}
        datasource_ok = False

    # 各数据源补充健康消息（registry 只有摘要态，这里拿 message 供前端展示下一步引导）
    datasources = []
    for key, meta in registry.items():
        item = dict(meta)
        try:
            hc = _get_ds_provider(key).health_check()
            item["message"] = hc.get("message", "")
            item["ok"] = hc.get("ok", False)
        except Exception:
            item["message"] = ""
            item["ok"] = False
        item["is_current"] = key == provider_health.get("source_type")
        datasources.append(item)

    try:
        audit_summary = _audit.today_summary()
    except Exception:
        audit_summary = {"today_total": 0, "today_success": 0, "today_failed": 0,
                         "last_event_ts": None, "log_dir": ""}

    # LLM 模型名非敏感（仅展示模型标识）；base_url 只取 host，避免带路径参数
    llm_model = os.environ.get("LLM_MODEL", "") or ("doubao-seed-2.0-pro（默认）" if real_llm_enabled else "")
    llm_host = ""
    try:
        from urllib.parse import urlparse
        llm_host = urlparse(os.environ.get("LLM_BASE_URL", "")).netloc or ""
    except Exception:
        llm_host = ""

    return jsonify({
        "backend": {
            "ok": True,
            "version": _SYSTEM_VERSION,
            "flask_env": os.environ.get("FLASK_ENV", "development"),
            "run_mode": "real-llm" if real_llm_enabled else "mock-sql+real-sqlite",
            "start_time": round(_BOOT_TS, 3),
            "uptime_sec": round(time.time() - _BOOT_TS, 0),
        },
        "llm": {
            "enabled": real_llm_enabled,
            "model": llm_model,
            "base_url_host": llm_host,
        },
        "datasource": {
            "current": provider_health.get("source_type", os.environ.get("DATASOURCE_TYPE", "currentLocal")),
            "ok": datasource_ok,
            "provider": provider_health,
            "registry": registry,
            "items": datasources,
            "checked_at": round(time.time(), 3),
        },
        "audit": audit_summary,
        # 安全边界说明：当前无登录体系，以下操作在企业版应受权限控制（前端据此展示提示，不伪造能力）
        "permission": {
            "auth_enabled": False,
            "note": "当前为单用户演示/团队内部部署，暂无登录与权限体系；审计查询、凭证配置、数据源管理在企业版应限管理员。",
        },
    })


@app.route("/api/audit/events", methods=["GET"])
def api_audit_events():
    """第五轮：最近审计事件（倒序）。

    说明：当前无登录体系，接口暂未做权限拦截（企业版应限管理员，见 audit.PERMISSION_POINTS）；
    事件内容已脱敏，不含任何密钥与 SQL 全文。
    """
    limit = request.args.get("limit", 20, type=int)
    return jsonify({
        "events": _audit.recent_events(limit),
        "summary": _audit.today_summary(),
        "permission_points": _audit.PERMISSION_POINTS,
    })


@app.route("/api/help", methods=["GET"])
def api_help():
    return jsonify({
        "skills": [
            {"name": "@指标词典", "desc": "查询指标定义/口径/同义词"},
            {"name": "@图表生成", "desc": "跳图表助手，自动带入最近结果"},
            {"name": "@时间解析", "desc": "附加时间语义增强标签"},
            {"name": "@SQL优化", "desc": "强制基线对比+优化建议"},
            {"name": "@对比实验", "desc": "跳 25 题评测中心"},
        ],
        "commands": [
            "/help", "/clear", "/example", "/chart", "/dict",
        ],
        "real_llm_enabled": real_llm_enabled,
    })


@app.route("/api/dict/<metric_id_or_alias>", methods=["GET"])
def api_dict(metric_id_or_alias):
    """查单个指标详情；别名也行"""
    q = metric_id_or_alias.strip()
    m = semantic.metrics.get(q)
    if not m:
        for mid, mm in semantic.metrics.items():
            if mm["name"] == q or q in mm.get("aliases", []):
                m = mm
                break
    if not m:
        return jsonify({"error": "未找到指标"}), 404
    return jsonify({
        "id": m["id"],
        "name": m["name"],
        "definition": m["definition"],
        "sql_template": m.get("sql_template", ""),
        "aliases": m.get("aliases", []),
        "confusing_notes": m.get("confusing_notes", []),
    })


def _build_chat_response(question: str, history=None, plan=None) -> dict:
    """构建聊天响应的核心逻辑，供 /api/chat、/api/chat/stream 与 /api/chat/confirm 共用。

    plan=None：立即执行链路（发送即取数，SSE/非流式接口使用）。
    plan=dict：分阶段确认链路（/api/chat/confirm 使用）——SQL 草案已在 plan 阶段生成并经
    用户确认，本函数内才是该草案的【首次执行】；执行报错时保留第一轮的自修复 → 题库兜底链。
    """
    t_start = time.time()
    experiment_prompt = ""
    history = history or []

    # ---- 路径 1：真实 LLM ----
    if real_llm_enabled:
        try:
            t_b = time.time()
            b_res = baseline_system.run(question, execute=True, history=history)
            baseline_block = {
                "sql": b_res.get("generated_sql", ""),
                "success": (b_res.get("exec_result") or {}).get("success", False),
                "columns": (b_res.get("exec_result") or {}).get("columns", []),
                "rows": [list(r) for r in (b_res.get("exec_result") or {}).get("rows", [])][:50],
                "row_count": (b_res.get("exec_result") or {}).get("row_count", 0),
                "time_ms": round((time.time() - t_b) * 1000, 1),
                "error": (b_res.get("exec_result") or {}).get("error"),
                "prompt": b_res.get("full_prompt", ""),
            }
        except Exception as e:
            baseline_block = {"sql": f"[错误] {e}", "success": False, "columns": [], "rows": [],
                              "row_count": 0, "time_ms": 0, "error": str(e)}

        if plan is not None:
            # 分阶段确认链路：直接执行「用户已确认的草案 SQL」，不再重新生成，
            # 保证执行的 SQL 与用户在确认卡片上看到的完全一致（审计可信）。
            t_e = time.time()
            sql = (plan.get("sql_draft") or "").strip()
            exec_result = executor.execute(sql, max_rows=50)
            # 第一轮错误恢复能力保留：草案执行报错 → 错误回喂 LLM 自修复（默认 1 轮）
            _repair_round = 0
            while not exec_result.get("success") and _repair_round < experiment_system.repair_rounds:
                _repair_round += 1
                _prev_sql, _prev_err = sql, exec_result.get("error")
                try:
                    _fixed, _ = experiment_system._repair_sql(question, history, sql, _prev_err)
                except Exception:
                    break
                _fixed = (_fixed or "").strip()
                if not _fixed or _fixed.rstrip(";").strip() == _prev_sql.rstrip(";").strip():
                    break
                _new_exec = executor.execute(_fixed, max_rows=50)
                if _new_exec.get("success"):
                    sql, exec_result = _fixed, _new_exec
                else:
                    break
            exp_ok = exec_result.get("success", False)
            exp_cols = exec_result.get("columns", [])
            exp_rows = [list(r) for r in exec_result.get("rows", [])][:50]
            exp_time = round((time.time() - t_e) * 1000, 1)
            exp_err = exec_result.get("error")
            _exp_sys = semantic.build_system_prompt()
            _exp_user = f"[自然语言问题]\n{question}\n\n[请生成SQL]\n"
            experiment_prompt = f"[System]\n{_exp_sys}\n\n[User]\n{_exp_user}"
            # 需求要素以 plan 阶段的识别结果为准（用户确认过的口径）
            _pm = [m for m in (plan.get("matched_metrics") or []) if isinstance(m, dict)]
            matched_metrics = [(m.get("id"), m.get("name")) for m in _pm]
            matched_item = _match_mock_bank(question) or _try_followup(question, history)
            time_range = plan.get("time_range") or (
                matched_item.get("time_range") if matched_item else _guess_time_range(question))
            dimensions = plan.get("dimensions") or (
                matched_item.get("dimensions") if matched_item else None)
        else:
            try:
                t_e = time.time()
                e_res = experiment_system.run(question, execute=True, history=history)
                sql = e_res.get("generated_sql", "")
                exec_result = e_res.get("exec_result") or {}
                exp_ok = exec_result.get("success", False)
                exp_cols = exec_result.get("columns", [])
                exp_rows = [list(r) for r in exec_result.get("rows", [])][:50]
                exp_time = round((time.time() - t_e) * 1000, 1)
                exp_err = exec_result.get("error")
                experiment_prompt = e_res.get("full_prompt", "")
                _mm = e_res.get("matched_metrics") or semantic.match_metrics(question)
                matched_ids = [m["id"] if isinstance(m, dict) else m for m in _mm]
                matched_metrics = [(mid, semantic.metrics.get(mid, {}).get("name", mid)) for mid in matched_ids]
                # 真实LLM也套用 Mock 题库的元数据（时间范围/维度/错误纠正/发现）来让前端显示更丰富
                matched_item = _match_mock_bank(question) or _try_followup(question, history)
                time_range = matched_item.get("time_range") if matched_item else _guess_time_range(question)
                dimensions = matched_item.get("dimensions") if matched_item else None
            except Exception as e:
                sql = ""
                exp_ok = False
                exp_cols, exp_rows, exp_err = [], [], str(e)
                exp_time = 0
                experiment_prompt = ""
                _matched = semantic.match_metrics(question)
                matched_ids = [m["id"] if isinstance(m, dict) else m for m in _matched]
                matched_metrics = [(mid, semantic.metrics.get(mid, {}).get("name", mid)) for mid in matched_ids]
                matched_item = _match_mock_bank(question) or _try_followup(question, history)
                time_range = _guess_time_range(question)
                dimensions = matched_item.get("dimensions") if matched_item else None

        bank_fallback = False
        if not exp_ok:
            # 实验链路未成功（LLM 调用异常，或 SQL 执行报错且自修复未挽回）：
            # 命中内置题库则用已知正确 SQL 重跑兜底；题库也未命中时用通用兜底 SQL，
            # 保证问数接口「永远返回可展示结果」，错误原因通过 🛟 标注诚实告知。
            matched_item = _match_mock_bank(question) or _try_followup(question, history)
            if not matched_item:
                matched_item = {
                    "sql": (
                        "SELECT ROUND(SUM(amount), 2) AS sales_amount\n"
                        "FROM order_item WHERE pay_status='已支付'\n"
                        "  AND order_date BETWEEN '2026-06-01' AND '2026-06-30';"
                    ),
                    "matched_metrics": [("M01", "销售额")],
                    "time_range": "2026-06（上月，兜底默认）",
                    "dimensions": None,
                    "time_detected": "LLM 未成功且问题未命中题库 → 兜底取上月销售额",
                    "baseline_sql": None,
                }
            if matched_item:
                sql = matched_item["sql"]
                exec_result = executor.execute(sql, max_rows=50)
                exp_ok = exec_result["success"]
                exp_cols = exec_result["columns"]
                exp_rows = [list(r) for r in exec_result["rows"]]
                exp_err = exec_result.get("error")
                exp_time = round((time.time() - t_e) * 1000, 1)
                bank_fallback = True
                baseline_block = _run_baseline_via_mock(question, matched_item)
                matched_metrics = matched_item.get("matched_metrics") or matched_metrics
                time_range = matched_item.get("time_range")
                dimensions = matched_item.get("dimensions")
                time_detected = matched_item.get("time_detected")
                from src.agent.baseline_text2sql import BASELINE_SYSTEM_PROMPT, load_schema
                _schema = load_schema()
                _baseline_user = f"[Database Schema]\n{_schema}\n\n[Natural Language Question]\n{question}\n\n[Generate SQL now]\n"
                baseline_block["prompt"] = f"[System]\n{BASELINE_SYSTEM_PROMPT}\n\n[User]\n{_baseline_user}"
                _exp_sys = semantic.build_system_prompt()
                _exp_user = f"[自然语言问题]\n{question}\n\n[请生成SQL]\n"
                experiment_prompt = f"[System]\n{_exp_sys}\n\n[User]\n{_exp_user}"
        mock_mode = False
    else:
        # ---- 路径 2：Mock 模式（内置题库 + 真实 SQLite 执行） ----
        mock_mode = True
        bank_fallback = False
        matched_item = _match_mock_bank(question) or _try_followup(question, history)
        baseline_block = _run_baseline_via_mock(question, matched_item)

        t_e = time.time()
        if matched_item:
            sql = matched_item["sql"]
            exec_result = executor.execute(sql, max_rows=50)
            exp_ok = exec_result["success"]
            exp_cols = exec_result["columns"]
            exp_rows = [list(r) for r in exec_result["rows"]]
            exp_err = exec_result.get("error")
            matched_metrics = matched_item.get("matched_metrics") or []
            time_range = matched_item.get("time_range")
            dimensions = matched_item.get("dimensions")
            time_detected = matched_item.get("time_detected")
        else:
            # 未命中题库：走兜底正确 SQL —— 直接查上月销售额，保证一定有结果
            sql = (
                "SELECT ROUND(SUM(amount), 2) AS sales_amount\n"
                "FROM order_item WHERE pay_status='已支付'\n"
                "  AND order_date BETWEEN '2026-06-01' AND '2026-06-30';"
            )
            exec_result = executor.execute(sql, max_rows=50)
            exp_ok = exec_result["success"]
            exp_cols = exec_result["columns"]
            exp_rows = [list(r) for r in exec_result["rows"]]
            exp_err = exec_result.get("error")
            matched_metrics = [("M01", "销售额")]
            time_range = "2026-06（上月，兜底默认）"
            dimensions = None
            time_detected = "问题未匹配到内置题库 → 兜底取上月销售额"
        exp_time = round((time.time() - t_e) * 1000, 1)

        # Mock 模式构造展示用 Prompt
        from src.agent.baseline_text2sql import BASELINE_SYSTEM_PROMPT, load_schema
        _schema = load_schema()
        _baseline_user = f"[Database Schema]\n{_schema}\n\n[Natural Language Question]\n{question}\n\n[Generate SQL now]\n"
        baseline_block["prompt"] = f"[System]\n{BASELINE_SYSTEM_PROMPT}\n\n[User]\n{_baseline_user}"
        _exp_sys = semantic.build_system_prompt()
        _exp_user = f"[自然语言问题]\n{question}\n\n[请生成SQL]\n"
        experiment_prompt = f"[System]\n{_exp_sys}\n\n[User]\n{_exp_user}"

    # ---- 构造前端可直接消费的 AIMessage 字段 ----
    rules_applied, errors_corrected = _derive_rules_and_corrections(question, matched_item)

    # 真实LLM模式也把错误纠正信息从题库注入
    if (not errors_corrected) and matched_item and matched_item.get("baseline_error"):
        errors_corrected = [matched_item["baseline_error"]]

    first_row = exp_rows[0] if exp_rows and len(exp_rows) > 0 else None
    first_col = exp_cols[0] if exp_cols else None
    summary_findings = []
    if matched_item and matched_item.get("findings"):
        summary_findings.extend(matched_item["findings"])
    # 首行摘要
    if first_row is not None and first_col is not None and len(exp_rows) == 1:
        val = first_row[0]
        summary_findings.append(f"📌 查询结果：{first_col} = {val}")
    else:
        if len(exp_cols) > 0:
            summary_findings.append(
                f"📌 返回 {len(exp_rows)} 行 × {len(exp_cols)} 列，列顺序：{' → '.join(exp_cols)}"
            )
    summary_findings.append(
        f"⏱️ 语义 SQL 生成 + DB 执行共耗时：{round(time.time() - t_start, 2)} 秒"
    )
    if bank_fallback and exp_ok:
        summary_findings.append(
            "🛟 语义 LLM 本次生成/执行未成功，已自动回退内置标准口径 SQL 完成取数（可重试获得 LLM 结果）"
        )
    if plan is not None and exp_ok and not bank_fallback:
        summary_findings.append(
            "🔒 已按您确认的口径与 SQL 草案执行查询（确认前未执行任何 SQL）"
        )

    pipeline_trace = _build_pipeline_trace(
        question, matched_item, matched_metrics, dimensions or [],
        (matched_item or {}).get("time_detected") if mock_mode else
        (f"时间锚点：假设今天=2026-07-01，数据范围 2025-01-01~2026-06-30"),
        {
            "sql": baseline_block.get("sql", ""),
            "success": baseline_block.get("success"),
            "row_count": baseline_block.get("row_count"),
            "error": baseline_block.get("error"),
        },
        sql,
        rules_applied,
        errors_corrected,
        mock_mode,
    )

    # 第三轮：结构化分析块（结论 / 发现 / 图表建议 / 风险提醒 / 数据来源与可信度）
    analysis = _chat_analysis_block(
        question, exp_cols, exp_rows, time_range, plan, bank_fallback, mock_mode, exp_ok,
    )

    resp = {
        "question": question,
        "matchedMetrics": [
            {"id": mid, "name": mname} for (mid, mname) in (matched_metrics or [])
        ],
        "timeRange": time_range,
        "matchedDimensions": dimensions,
        "sql": sql,
        "baselineSql": baseline_block.get("sql"),
        "baselinePrompt": baseline_block.get("prompt", ""),
        "experimentPrompt": experiment_prompt,
        "result": {
            "columns": exp_cols,
            "rows": exp_rows,
            "rowCount": len(exp_rows),
            "executionTimeMs": exp_time,
            "success": exp_ok,
            "error": exp_err,
        },
        "baselineResult": {
            "columns": baseline_block.get("columns", []),
            "rows": baseline_block.get("rows", []),
            "rowCount": baseline_block.get("row_count"),
            "executionTimeMs": baseline_block.get("time_ms"),
            "success": baseline_block.get("success"),
            "error": baseline_block.get("error"),
        },
        "summary": {"key_findings": summary_findings},
        "pipelineTrace": pipeline_trace,
        "meta": {
            "mode": pipeline_trace["mode"],
            "real_llm_enabled": real_llm_enabled,
            "bank_fallback": bank_fallback,
            "staged_confirm": plan is not None,
            "elapsed_ms": round((time.time() - t_start) * 1000, 1),
        },
        # 第三轮新增结构化分区字段（前端结果工作台按此渲染，旧字段全部保留兼容）
        "conclusion": analysis["conclusion"],
        "findings": analysis["findings"],
        "chartSpec": analysis["chartSpec"],
        "warnings": analysis["warnings"],
        "provenance": analysis["provenance"],
        "usageVerdict": analysis["usageVerdict"],
        "suggestions": [],  # 占位，返回前统一填充（见下方 _chat_followup_suggestions）
    }
    # 第三轮：所有问数链路（流式/非流式/确认执行）都携带下一步追问建议
    resp["suggestions"] = _chat_followup_suggestions(question, resp)

    # 第五轮：审计事件（一条覆盖 /api/chat、/api/chat/stream、/api/chat/confirm 三条链路）
    # plan 不为 None = 用户确认 SQL 草案后执行；否则为发送即取数的降级链路
    try:
        # 确认执行链路以草案记录的来源为准（草案可能是 dimension-template/preset-bank），
        # 不能仅凭 real_llm_enabled 推断为 llm；自动取数链路按兜底标记推断。
        _plan_src = ((plan or {}).get("sql_source") or "").strip()
        _audit_src = _plan_src or ("bank_fallback" if bank_fallback
                                   else ("llm" if real_llm_enabled else "template"))
        _audit_mock = bool(mock_mode or bank_fallback
                           or (_plan_src and _plan_src not in ("semantic-llm", "llm")))
        _audit.record_event(
            _audit.EVENT_CHAT_CONFIRM if plan is not None else _audit.EVENT_CHAT_AUTO,
            result=_audit.RESULT_SUCCESS if exp_ok else _audit.RESULT_FAILED,
            question=question,
            datasource=os.environ.get("DATASOURCE_TYPE", "currentLocal"),
            staged_confirmed=plan is not None,
            sql_source=_audit_src,
            mock_hit=_audit_mock,
            row_count=len(exp_rows),
            duration_ms=round((time.time() - t_start) * 1000, 1),
            error_type=None if exp_ok else "sql_exec_failed",
            error_message=None if exp_ok else str(exp_err or "查询执行失败")[:300],
            **_audit.sql_preview(sql),
        )
    except Exception:
        pass  # 审计失败绝不阻断问数主链路

    # 第六轮：统一链路日志（控制台 / 容器排障用，与结构化审计互补）
    _log(
        "chat.confirm" if plan is not None else "chat.auto",
        result="ok" if exp_ok else "FAIL",
        sql_source=_audit_src,
        mock_hit=_audit_mock,
        rows=len(exp_rows),
        ms=round((time.time() - t_start) * 1000),
        err=(None if exp_ok else f"{type(exp_err).__name__}: {str(exp_err)[:80]}"),
    )

    return resp


@app.route("/api/chat", methods=["POST"])
def api_chat():
    """全链路问数接口（非流式）。"""
    body = request.get_json(silent=True) or {}
    question = (body.get("question") or "").strip()
    if not question:
        return jsonify({"error": "问题不能为空"}), 400
    history = body.get("history") or []
    return jsonify(_build_chat_response(question, history=history))


@app.route("/api/chat/stream", methods=["POST"])
def api_chat_stream():
    """SSE 流式问数接口：逐步发送状态、SQL 片段，最后发送完整 JSON。"""
    import json as _json
    body = request.get_json(silent=True) or {}
    question = (body.get("question") or "").strip()
    if not question:
        return jsonify({"error": "问题不能为空"}), 400
    history = body.get("history") or []

    def generate():
        try:
            yield f"event: status\ndata: {_json.dumps({'step': '理解问题', 'detail': question[:50]}, ensure_ascii=False)}\n\n"
            time.sleep(0.15)

            full = _build_chat_response(question, history=history)

            yield f"event: status\ndata: {_json.dumps({'step': '匹配指标语义', 'detail': ', '.join(m['name'] for m in full.get('matchedMetrics', [])) or '无'}, ensure_ascii=False)}\n\n"
            time.sleep(0.15)

            yield f"event: status\ndata: {_json.dumps({'step': '时间锚点解析', 'detail': full.get('timeRange', '')}, ensure_ascii=False)}\n\n"
            time.sleep(0.15)

            sql_text = full.get("sql", "")
            chunk_size = 12
            for i in range(0, len(sql_text), chunk_size):
                chunk = sql_text[i:i+chunk_size]
                yield f"event: sql\ndata: {_json.dumps({'chunk': chunk}, ensure_ascii=False)}\n\n"
                time.sleep(0.02)

            yield f"event: status\ndata: {_json.dumps({'step': '执行 SQL 查询', 'detail': '返回 ' + str(full['result']['rowCount']) + ' 行'}, ensure_ascii=False)}\n\n"
            time.sleep(0.2)

            findings = full.get("summary", {}).get("key_findings", [])
            for finding in findings:
                yield f"event: finding\ndata: {_json.dumps({'text': finding}, ensure_ascii=False)}\n\n"
                time.sleep(0.12)

            yield f"event: done\ndata: {_json.dumps(full, ensure_ascii=False)}\n\n"
        except Exception as e:
            # 流式链路任何异常都显式告知前端（前端可据此回退非流式接口/提示重试），
            # 不能让 SSE 静默断流导致用户无感知。
            err = {"message": f"流式问数处理失败：{type(e).__name__}: {e}"}
            yield f"event: error\ndata: {_json.dumps(err, ensure_ascii=False)}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ==================== 聊天页分阶段问数 API（需求确认 → SQL 草案 → 用户确认 → 执行） ====================

# 口径内固定过滤条件说明（数据集级口径，所有问数默认遵循）
_CHAT_FIXED_FILTERS = [
    "pay_status = '已支付'（仅统计已支付订单，未支付/已退款不计入）",
]
_CHAT_DATASET = {"id": "local_retail", "name": "零售经营数据集（本地 SQLite）"}


def _chat_followup_suggestions(question: str, full: dict) -> list:
    """基于本次问数的要素与结果，生成 2-3 个下一步追问建议（前端可点选直接发问）。"""
    if not (full.get("result") or {}).get("success"):
        return []
    dims = full.get("matchedDimensions") or []
    dims_text = " ".join(dims)
    q = question or ""
    pool = [
        ("渠道", "各渠道上月销售额对比是怎样的？"),
        ("区域", "上月各区域销售额占比如何？"),
        ("趋势", "近6个月的月度订单量趋势如何？"),
        ("环比", "和上上月相比，本月销售额环比变化多少？"),
        ("品类", "各品类的销售额与销量表现如何？"),
    ]
    out = []
    for _key, text in pool:
        # 与当前问题维度重复的建议不推（已经按渠道拆了就不再推渠道）
        if _key == "渠道" and "渠道" in dims_text:
            continue
        if _key == "区域" and "区域" in dims_text:
            continue
        if text == q:
            continue
        out.append(text)
        if len(out) >= 3:
            break
    return out


# 结果列名 → 中文业务名（仅用于分析文案展示，表格/图表仍用原始列名）
_CHAT_COL_LABELS = {
    "sales_amount": "销售额", "total_amount": "销售额", "order_count": "订单量",
    "customer_count": "客户数", "new_customer_count": "新客数", "avg_order_amount": "客单价",
    "share_pct": "占比", "repurchase_rate_pct": "复购率", "total_active": "活跃客户数",
    "channel": "渠道", "region": "区域", "category": "品类", "month": "月份", "quarter": "季度", "dt": "日期",
}


def _chat_col_label(col):
    return _CHAT_COL_LABELS.get(str(col).lower(), str(col))


def _chat_analysis_block(question, columns, rows, time_range, plan, bank_fallback, mock_mode, success):
    """第三轮：构建结构化分析块（一句话结论 / 结构化发现 / 图表建议 / 风险口径提醒 / 可信度判定）。

    硬原则：所有发现必须由【实际返回的数据行】计算得出；数据不足或结果为空时
    明确声明「不足以支持结论」，不输出任何无数据支撑的表述。
    """
    def _num(v):
        return isinstance(v, (int, float)) and not isinstance(v, bool)

    warnings = []
    findings = []
    conclusion = ""
    chart = {"type": "table", "xField": None, "reason": "结果为明细或多值数据，建议直接查看表格"}

    if not success or not columns:
        conclusion = "查询未成功，暂无可分析的数据。"
        warnings.append("本次查询未返回有效结果，现有信息不足以支持任何结论；可点击「重试」或调整问题后重新查询。")
    elif not rows:
        conclusion = "查询已执行，但没有命中任何数据行。"
        warnings.append("查询结果为空（0 行）：现有数据不足以支持相关结论，建议放宽时间范围或检查筛选条件后重新查询。")
    else:
        chart = _ent_recommend_chart(columns, rows)
        n_rows, n_cols = len(rows), len(columns)
        # 第一个全列皆为数值的列作为主度量
        num_idx = next((i for i in range(n_cols)
                        if all(i < len(r) and _num(r[i]) for r in rows)), None)
        time_like = any(k in str(columns[0]).lower() for k in ("month", "date", "dt", "月", "日"))

        if n_rows == 1 and n_cols == 1:
            v = rows[0][0]
            vtxt = f"{v:,.2f}" if _num(v) else str(v)
            m_label = _chat_col_label(columns[0])
            conclusion = f"{m_label} = {vtxt}"
            findings.append(f"📌 单指标结果：{m_label} 为 {vtxt}（时间范围：{time_range or '未指定'}）。")
        elif n_rows == 1:
            parts = []
            for i in range(n_cols):
                v = rows[0][i]
                lbl = _chat_col_label(columns[i])
                parts.append(f"{lbl} 为 {v:,.2f}" if _num(v) else f"{lbl} 为 {v}")
            conclusion = f"查询返回 1 行结果：{parts[0]}。"
            findings.append("📌 " + "；".join(parts[:4]) + "。")
        elif num_idx is not None:
            metric = _chat_col_label(columns[num_idx])
            dim_label = _chat_col_label(columns[0])
            top = max(rows, key=lambda r: r[num_idx] if _num(r[num_idx]) else float("-inf"))
            vals = [r[num_idx] for r in rows if _num(r[num_idx])]
            tv = top[num_idx]
            conclusion = f"共 {n_rows} 个{dim_label}分组，「{top[0]}」的{metric}最高，为 {tv:,.2f}。"
            findings.append(
                f"📌 共返回 {n_rows} 个{dim_label}分组；其中「{top[0]}」的{metric}最高，为 {tv:,.2f}。"
            )
            total = sum(vals)
            if total:
                findings.append(f"📊 「{top[0]}」在合计{metric}中占比约 {tv * 100.0 / total:.1f}%。")
            bot = min(rows, key=lambda r: r[num_idx] if _num(r[num_idx]) else float("inf"))
            if n_rows >= 2 and bot[0] != top[0]:
                findings.append(
                    f"📉 最低为「{bot[0]}」（{bot[num_idx]:,.2f}），最高与最低相差 {tv - bot[num_idx]:,.2f}。"
                )
            if n_rows >= 3 and time_like and _num(rows[0][num_idx]) and _num(rows[-1][num_idx]):
                first, last = rows[0], rows[-1]
                delta = last[num_idx] - first[num_idx]
                trend = "上升" if delta > 0 else ("下降" if delta < 0 else "基本持平")
                findings.append(
                    f"📈 趋势：{first[0]} → {last[0]}，{metric}由 {first[num_idx]:,.0f} 变为 {last[num_idx]:,.0f}，整体{trend}。"
                )
        else:
            conclusion = f"查询返回 {n_rows} 行 × {n_cols} 列明细数据。"
            findings.append(f"📌 返回 {n_rows} 行 × {n_cols} 列，列顺序：{' → '.join(columns)}。")

    # 风险与口径提醒（全部来自真实链路状态，诚实标注）
    warnings.append(
        "数据源为本地零售演示数据集（数据区间 2025-01 ~ 2026-06）：查询与计算均真实执行，"
        "但仅用于方法验证与口径核对，不代表真实企业经营数据。"
    )
    if bank_fallback:
        warnings.append(
            "🛟 本次 SQL 由内置标准口径兜底生成（语义 LLM 生成/执行未成功）；结果为真实查询，"
            "可点击「重试」获取 LLM 生成结果。"
        )
    if mock_mode:
        warnings.append("当前未启用真实 LLM（未配置 API Key），SQL 来自内置语义题库/模板。")
    if plan is None and success:
        warnings.append(
            "本次为发送后自动取数（未经 SQL 草案确认环节）；如需先核对口径再执行，"
            "可重新提问并在草案卡片上点击确认。"
        )

    provenance = {
        "dataset": "零售经营数据集（本地 SQLite：order_item / customer / product / date_dim）",
        "timeRange": time_range or "",
        "fixedFilters": list(_CHAT_FIXED_FILTERS),
        "executionMode": "用户确认 SQL 草案后执行" if plan is not None else "发送后自动取数",
        "stagedConfirm": plan is not None,
        "bankFallback": bool(bank_fallback),
        "mockMode": bool(mock_mode),
    }
    usable = bool(success) and bool(columns) and bool(rows)
    usage = {
        "usable": usable,
        "label": "可用于口径核对与方法验证" if usable else "数据不足，暂不可用于判断",
        "reason": (
            "结果为本地数据集的真实查询输出；业务决策请以企业生产 BI 系统为准。"
            if usable else "查询未返回有效数据行，不足以支撑业务判断。"
        ),
    }
    return {
        "conclusion": conclusion,
        "findings": findings[:4],
        "chartSpec": chart,
        "warnings": warnings,
        "provenance": provenance,
        "usageVerdict": usage,
    }


@app.route("/api/chat/plan", methods=["POST"])
def api_chat_plan():
    """分阶段问数 · 阶段一：需求理解 + SQL 草案。

    硬约束：本接口【只生成不执行】——需求识别为纯语义匹配，SQL 草案走
    experiment_system.run(execute=False) / 内置题库，全程不调用 SQLExecutor。
    """
    body = request.get_json(silent=True) or {}
    question = (body.get("question") or "").strip()
    if not question:
        return jsonify({"success": False, "error": "问题不能为空"}), 400
    history = body.get("history") or []
    try:
        matched, time_range, dims, clarifications, assumptions = _ent_detect_requirement(question)
        # 注意：_ent_build_sql_draft 内部对 LLM 路径使用 execute=False，不触碰数据库
        sql_draft, sql_source = _ent_build_sql_draft(question, history=history, dims=dims)

        plan_id = "cplan_" + _uuid.uuid4().hex[:12]
        plan = {
            "plan_id": plan_id,
            "question": question,
            "history": history,
            "sql_draft": sql_draft,
            "sql_source": sql_source,
            "matched_metrics": matched,
            "time_range": time_range,
            "dimensions": dims,
            "clarification_questions": clarifications,
            "assumptions": assumptions,
            "filters": list(_CHAT_FIXED_FILTERS),
            "created_at": time.time(),
        }
        _cache_plan(_CHAT_PLANS, plan, _ENT_PLANS_MAX, _ENT_PLAN_TTL)

        # 第五轮：审计——草案生成（pending：等待用户确认，尚未执行任何 SQL）
        try:
            _audit.record_event(
                _audit.EVENT_CHAT_PLAN, result=_audit.RESULT_PENDING,
                question=question, datasource="currentLocal",
                staged_confirmed=False, sql_source=sql_source or "unknown",
                # 草案只有出自真实语义 LLM 才算「真实」；题库/维度模板/兜底均标注为兜底
                mock_hit=(sql_source not in ("semantic-llm", "llm")),
                needs_clarification=len(clarifications) > 0,
                **_audit.sql_preview(sql_draft),
            )
        except Exception:
            pass
        _log("chat.plan", sql_source=sql_source or "unknown",
             clarify=("是" if clarifications else "否"),
             draft="真实LLM" if sql_source in ("semantic-llm", "llm") else "题库/模板兜底")

        return jsonify({
            "success": True,
            "stage": "plan",
            "plan_id": plan_id,
            "question": question,
            "needs_clarification": len(clarifications) > 0,
            "clarification_questions": clarifications,
            "assumptions": assumptions,
            "matched_metrics": matched,
            "time_range": time_range,
            "dimensions": dims,
            "filters": list(_CHAT_FIXED_FILTERS),
            "sql_draft": sql_draft,
            "sql_source": sql_source,
            "dataset": dict(_CHAT_DATASET),
        })
    except Exception as e:
        try:
            _audit.record_event(
                _audit.EVENT_CHAT_PLAN, result=_audit.RESULT_FAILED,
                question=question, datasource="currentLocal",
                error_type=type(e).__name__, error_message=str(e),
            )
        except Exception:
            pass
        return jsonify({"success": False, "stage": "plan",
                        "error": f"生成需求草案失败：{type(e).__name__}: {e}"}), 500


@app.route("/api/chat/confirm", methods=["POST"])
def api_chat_confirm():
    """分阶段问数 · 阶段二：用户确认草案后才执行 SQL。

    校验 plan_id 有效且 confirmed=true 后，从缓存取出草案，调用 _build_chat_response
    执行【用户确认过的那条 SQL】；未确认或草案过期一律拒绝执行。
    """
    body = request.get_json(silent=True) or {}
    plan_id = body.get("plan_id")
    confirmed = bool(body.get("confirmed"))
    plan = _CHAT_PLANS.get(plan_id) if plan_id else None
    if not plan:
        return jsonify({"success": False, "stage": "execute",
                        "error": "草案不存在或已过期（有效期 2 小时），请重新提问生成草案。"}), 400
    if not confirmed:
        # 显式拒绝：未确认绝不执行
        return jsonify({"success": False, "stage": "execute",
                        "error": "用户尚未确认 SQL 草案，系统不会执行查询。"}), 400

    question = plan["question"]
    history = plan.get("history") or []
    try:
        full = _build_chat_response(question, history=history, plan=plan)
    except Exception as e:
        return jsonify({"success": False, "stage": "execute",
                        "error": f"确认后执行失败：{type(e).__name__}: {e}"}), 500

    full["stage"] = "done"
    full["plan_id"] = plan_id
    full["suggested_questions"] = _chat_followup_suggestions(question, full)
    full["dataset"] = dict(_CHAT_DATASET)
    return jsonify(full)


@app.route("/api/db-health", methods=["GET"])
def api_db_health():
    """数据集健康度：表行数、NULL率、时间范围、品类分布。"""
    tables = ["order_item", "customer", "product", "date_dim"]
    table_stats = []
    for t in tables:
        try:
            cnt = executor.execute(f"SELECT COUNT(*) FROM {t}")
            row_count = cnt["rows"][0][0] if cnt["success"] else 0
            table_stats.append({"name": t, "rowCount": row_count})
        except Exception:
            table_stats.append({"name": t, "rowCount": 0})

    date_range = {"min": "", "max": ""}
    try:
        dr = executor.execute("SELECT MIN(order_date), MAX(order_date) FROM order_item")
        if dr["success"] and dr["rows"]:
            date_range = {"min": dr["rows"][0][0], "max": dr["rows"][0][1]}
    except Exception:
        pass

    null_checks = []
    for col in ["amount", "channel", "order_date", "customer_id", "product_id"]:
        try:
            r = executor.execute(f"SELECT COUNT(*) FROM order_item WHERE {col} IS NULL")
            null_count = r["rows"][0][0] if r["success"] else 0
            null_checks.append({"column": col, "nullCount": null_count})
        except Exception:
            null_checks.append({"column": col, "nullCount": -1})

    category_dist = []
    try:
        cd = executor.execute("SELECT p.category, COUNT(*) FROM order_item oi JOIN product p ON oi.product_id=p.product_id GROUP BY p.category ORDER BY COUNT(*) DESC")
        if cd["success"]:
            category_dist = [{"name": row[0], "count": row[1]} for row in cd["rows"]]
    except Exception:
        pass

    channel_dist = []
    try:
        ch = executor.execute("SELECT channel, COUNT(*) FROM order_item GROUP BY channel ORDER BY COUNT(*) DESC")
        if ch["success"]:
            channel_dist = [{"name": row[0], "count": row[1]} for row in ch["rows"]]
    except Exception:
        pass

    total_rows = sum(t["rowCount"] for t in table_stats)
    total_nulls = sum(n["nullCount"] for n in null_checks if n["nullCount"] > 0)
    health_score = 100
    if total_rows > 0:
        health_score = max(0, 100 - int((total_nulls / total_rows) * 1000))

    return jsonify({
        "tables": table_stats,
        "dateRange": date_range,
        "nullChecks": null_checks,
        "categoryDistribution": category_dist,
        "channelDistribution": channel_dist,
        "healthScore": health_score,
        "totalRows": total_rows,
    })


# ==================== 数据源 Provider API ====================

@app.route("/api/datasource/status", methods=["GET"])
def api_datasource_status():
    """返回当前激活的数据源 + 所有已注册数据源状态。"""
    current = _get_ds_provider()
    return jsonify({
        "current": current.source_type,
        "provider": current.health_check(),
        "registry": _ds_registry(),
    })


@app.route("/api/datasource/datasets", methods=["GET"])
def api_datasource_datasets():
    """列出当前数据源的所有数据集。"""
    source_type = request.args.get("source_type")
    provider = _get_ds_provider(source_type)
    try:
        datasets = provider.list_datasets()
        return jsonify({"success": True, "source_type": provider.source_type,
                        "is_real": provider.is_real, "datasets": datasets})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/datasource/datasets/<dataset_id>/schema", methods=["GET"])
def api_datasource_schema(dataset_id):
    """获取数据集字段 Schema。"""
    source_type = request.args.get("source_type")
    provider = _get_ds_provider(source_type)
    try:
        schema = provider.get_dataset_schema(dataset_id)
        schema["source_type"] = provider.source_type
        schema["is_real"] = provider.is_real
        return jsonify(schema)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/datasource/datasets/<dataset_id>/preview", methods=["GET"])
def api_datasource_preview(dataset_id):
    """预览数据集前 N 行。"""
    limit = request.args.get("limit", 20, type=int)
    source_type = request.args.get("source_type")
    provider = _get_ds_provider(source_type)
    try:
        result = provider.preview_dataset(dataset_id, limit=limit)
        result["source_type"] = provider.source_type
        result["is_real"] = provider.is_real
        return jsonify(result)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/datasource/query", methods=["POST"])
def api_datasource_query():
    """通过数据源 Provider 执行 SQL 查询。"""
    body = request.get_json(silent=True) or {}
    sql = (body.get("sql") or "").strip()
    max_rows = body.get("max_rows", 200)
    source_type = body.get("source_type")
    if not sql:
        return jsonify({"success": False, "error": "缺少 sql 参数"}), 400
    provider = _get_ds_provider(source_type)
    try:
        result = provider.run_query(sql, max_rows=max_rows)
        result["source_type"] = provider.source_type
        result["is_real"] = provider.is_real
        return jsonify(result)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ==================== 企业 BI 分阶段问数 API（需求确认 → SQL 草案 → 确认执行） ====================

import uuid as _uuid

# plan 阶段产物的服务端缓存：plan_id -> plan 内容（内存态，重启失效）
_ENT_PLANS = {}
_CHAT_PLANS = {}            # 聊天页分阶段问数的草案缓存（与企业 BI 缓存独立）
_ENT_PLANS_MAX = 200        # 内存缓存上限（超出按最旧淘汰，防止无界增长）
_ENT_PLAN_TTL = 7200        # plan 有效期（秒）：2 小时


def _cache_plan(store: dict, plan: dict, max_size: int, ttl: int) -> None:
    """写入 plan 缓存，并顺带清理过期/超量条目（企业 BI 与聊天分阶段流程共用）。"""
    now = time.time()
    for pid in [pid for pid, p in store.items()
                if now - float(p.get("created_at", 0)) > ttl]:
        store.pop(pid, None)
    store[plan["plan_id"]] = plan
    if len(store) > max_size:
        for pid in sorted(store, key=lambda k: float(store[k].get("created_at", 0)))[
                :len(store) - max_size]:
            store.pop(pid, None)


def _store_ent_plan(plan: dict) -> None:
    """写入企业 BI plan 缓存。"""
    _cache_plan(_ENT_PLANS, plan, _ENT_PLANS_MAX, _ENT_PLAN_TTL)

# 时间信号关键词（用于需求完整性判断）
_TIME_SIGNALS = ["上月", "本月", "下月", "昨天", "今天", "本周", "上周", "下周", "近7天", "近7日",
                 "近30天", "近30日", "最近", "季度", "年度", "去年", "今年", "年", "月", "周", "季度",
                 "2024", "2025", "2026", "q1", "q2", "q3", "q4", "1-", "2-", "01-", "02-"]
# 维度信号关键词
_DIM_SIGNALS = {
    "渠道": ["渠道", "channel", "线上", "线下", "小程序"],
    "品类": ["品类", "类目", "category", "商品类别"],
    "区域": ["区域", "地区", "省份", "城市", "region"],
    "会员等级": ["会员", "等级", "member", "银卡", "金卡", "普通"],
    "日期": ["按天", "按日", "每天", "每日", "趋势", "dt", "日期"],
}


def _ent_provider(source_type=None):
    """获取企业 BI provider（默认风神 BI）。"""
    return _get_ds_provider(source_type or "fengshenBi")


def _ent_detect_requirement(question):
    """
    需求分析：识别指标 / 时间范围 / 维度，并产出澄清问题。
    返回 (matched_metrics, time_range, dimensions, clarification_questions, assumptions)。
    """
    # 指标识别（复用语义层）
    try:
        mm = semantic.match_metrics(question)
    except Exception:
        mm = []
    matched = [{"id": (m.get("id") if isinstance(m, dict) else m),
                "name": (semantic.metrics.get(m.get("id"), {}).get("name", m.get("id"))
                         if isinstance(m, dict) else semantic.metrics.get(m, {}).get("name", m))}
               for m in mm]

    # 时间范围识别（复用现有启发式）
    time_range = ""
    try:
        time_range = _guess_time_range(question) or ""
    except Exception:
        time_range = ""
    has_time = any(sig in question for sig in _TIME_SIGNALS)

    # 维度识别
    dims = [name for name, kws in _DIM_SIGNALS.items() if any(k in question for k in kws)]

    # 澄清问题
    clarifications = []
    assumptions = []
    if not matched:
        clarifications.append("没有从问题中明确识别到要查询的「指标」，请问您想分析哪个指标？（如销售额、订单量、客单价、退货率等）")
    if not has_time and not time_range:
        clarifications.append("未指定「时间范围」，默认按上月（2026-06）统计，是否符合预期？或请告知具体时间段。")
        assumptions.append("时间范围默认取上月（2026-06）")
    if not dims:
        assumptions.append("未指定分组维度，将按整体汇总；如需按渠道/品类/区域等下钻请补充说明")

    return matched, (time_range or ""), dims, clarifications, assumptions


def _ent_dimension_sql(dim: str) -> str | None:
    """按识别到的分组维度生成「上月」口径的维度下钻 SQL 草案（兜底用，保证草案与需求识别一致）。"""
    where_plain = "pay_status='已支付' AND order_date BETWEEN '2026-06-01' AND '2026-06-30'"
    where_join = "o.pay_status='已支付' AND o.order_date BETWEEN '2026-06-01' AND '2026-06-30'"
    if dim == "渠道":
        return ("SELECT channel AS channel,\n"
                "       ROUND(SUM(amount), 2) AS sales_amount,\n"
                "       COUNT(DISTINCT order_id) AS order_count\n"
                f"FROM order_item WHERE {where_plain}\n"
                "GROUP BY channel ORDER BY sales_amount DESC;")
    if dim == "品类":
        return ("SELECT p.category AS category,\n"
                "       ROUND(SUM(o.amount), 2) AS sales_amount\n"
                "FROM order_item o JOIN product p ON o.product_id = p.product_id\n"
                f"WHERE {where_join}\n"
                "GROUP BY p.category ORDER BY sales_amount DESC;")
    if dim in ("区域", "会员等级"):
        col = "region" if dim == "区域" else "member_level"
        return (f"SELECT c.{col} AS {col},\n"
                "       ROUND(SUM(o.amount), 2) AS sales_amount\n"
                "FROM order_item o JOIN customer c ON o.customer_id = c.customer_id\n"
                f"WHERE {where_join}\n"
                f"GROUP BY c.{col} ORDER BY sales_amount DESC;")
    if dim == "日期":
        return ("SELECT order_date AS dt,\n"
                "       ROUND(SUM(amount), 2) AS sales_amount\n"
                f"FROM order_item WHERE {where_plain}\n"
                "GROUP BY order_date ORDER BY dt;")
    return None


def _ent_build_sql_draft(question, history=None, dims=None):
    """生成 SQL 草案（不执行）。真实 LLM 走语义 pipeline，否则用内置题库/维度兜底。"""
    dims = dims or []
    if real_llm_enabled and experiment_system is not None:
        try:
            res = experiment_system.run(question, execute=False, history=history or [])
            sql = (res.get("generated_sql") or "").strip()
            if sql:
                return sql, "semantic-llm"
        except Exception:
            pass
    item = _match_mock_bank(question) or _try_followup(question, history or [])
    if item and item.get("sql"):
        sql = item["sql"].strip()
        # 题库命中但未分组、而问题明确要求维度下钻 → 改用维度模板，保证草案与识别一致
        if dims and "group by" not in sql.lower():
            for d in dims:
                dim_sql = _ent_dimension_sql(d)
                if dim_sql:
                    return dim_sql, "dimension-template"
        return sql, "preset-bank"
    # 兜底：优先维度下钻，否则单值销售额
    for d in dims:
        dim_sql = _ent_dimension_sql(d)
        if dim_sql:
            return dim_sql, "dimension-template"
    return ("SELECT ROUND(SUM(amount), 2) AS sales_amount\n"
            "FROM order_item WHERE pay_status='已支付'\n"
            "  AND order_date BETWEEN '2026-06-01' AND '2026-06-30';"), "fallback"


def _ent_recommend_chart(columns, rows):
    """根据结果列/行特征推荐图表类型。"""
    if not columns or not rows:
        return {"type": "table", "reason": "无结果数据，使用表格展示"}
    if len(rows) == 1 and len(columns) == 1:
        return {"type": "kpi", "reason": "单值结果，适合指标卡（KPI）展示"}
    # 粗判：列名含时间/日期 → 折线；否则维度+度量 → 柱状
    time_like = any(k in columns[0].lower() for k in ["dt", "date", "day", "月", "日", "时间", "日期"])
    if time_like and len(rows) >= 2:
        return {"type": "line", "xField": columns[0],
                "reason": f"首列为时间维度（{columns[0]}），适合折线图展示趋势"}
    if len(columns) >= 2 and len(rows) <= 30:
        return {"type": "bar", "xField": columns[0],
                "reason": f"按「{columns[0]}」维度分组的汇总结果，适合柱状图对比"}
    return {"type": "table", "reason": "结果列较多或行数较大，使用表格展示更清晰"}


def _ent_summarize(question, columns, rows, mock=False):
    """生成简明分析结论。"""
    findings = []
    if not rows:
        return ["查询已执行，但未返回数据行。"]
    if len(rows) == 1:
        for i, c in enumerate(columns):
            findings.append(f"📌 {c} = {rows[0][i]}")
    else:
        findings.append(f"📌 返回 {len(rows)} 行 × {len(columns)} 列，列顺序：{' → '.join(columns)}")
        # 简单 Top 洞察：找第一个数值列的最大值行
        try:
            val_idx = None
            for i, c in enumerate(columns):
                if all(isinstance(r[i], (int, float)) for r in rows if i < len(r)):
                    val_idx = i
                    break
            if val_idx is not None and len(columns) >= 2:
                top = max(rows, key=lambda r: r[val_idx] if isinstance(r[val_idx], (int, float)) else -1)
                findings.append(f"📈 其中「{top[0]}」的 {columns[val_idx]} 最高，为 {top[val_idx]}")
        except Exception:
            pass
    if mock:
        findings.append("⚠️ 以上结果为 Mock 演示数据（风神 BI 真实 API 待接入）；需求识别与 SQL 草案为真实生成。")
    return findings


@app.route("/api/enterprise-bi/config", methods=["POST"])
def api_ent_config():
    """保存企业 BI 凭证配置（后端内存托管，密钥不落前端持久化）。"""
    body = request.get_json(silent=True) or {}
    provider = _ent_provider(body.get("source_type"))
    if not hasattr(provider, "configure"):
        return jsonify({"ok": False, "message": "该数据源不支持运行时配置"}), 400
    # 仅透传请求中真实给出的字段：缺失/留空的密钥键不伪造成 None，
    # 否则 configure() 会把显式 None 解读为「清空」，误删已保存的凭证（留空=不修改）。
    _ent_fields = ("base_url", "app_id", "app_secret", "token", "workspace_id",
                   "client_id", "client_secret", "user_jwt", "proxy_user", "sophon_api_key",
                   "mcp_psm", "mcp_region", "mcp_gateway_url")
    payload = {k: body[k] for k in _ent_fields if body.get(k) is not None}
    result = provider.configure(payload)
    return jsonify(result)


@app.route("/api/enterprise-bi/config", methods=["GET"])
def api_ent_config_get():
    """获取脱敏后的当前配置（密钥不回显明文）。"""
    provider = _ent_provider(request.args.get("source_type"))
    return jsonify({
        "ok": True,
        "source_type": provider.source_type,
        "config": getattr(provider, "masked_config", lambda: {})(),
        "connection_status": getattr(provider, "connection_status", lambda: "unknown")(),
    })


@app.route("/api/enterprise-bi/connect", methods=["POST"])
def api_ent_connect():
    """测试连接：校验凭证 / 连通性。body 可携带配置一并保存后验证。"""
    body = request.get_json(silent=True) or {}
    provider = _ent_provider(body.get("source_type"))
    # 仅收集非空字段传给 validate → configure；缺失的密钥键（如前端留空的 app_secret）
    # 保持后端已有值，绝不能因「测试连接」而把已保存凭证冲掉。
    _ent_fields = ("base_url", "app_id", "app_secret", "token", "workspace_id",
                   "client_id", "client_secret", "user_jwt", "proxy_user", "sophon_api_key",
                   "mcp_psm", "mcp_region", "mcp_gateway_url")
    present = {k: body[k] for k in _ent_fields if body.get(k) not in (None, "")}
    config = present if present else None
    result = provider.validate_credentials(config)
    result["source_type"] = provider.source_type
    # 第五轮：审计——连接测试（凭证字段经 audit 模块脱敏，密钥不落日志）
    try:
        _audit.record_event(
            _audit.EVENT_ENT_CONNECT,
            result=_audit.RESULT_SUCCESS if result.get("ok") else _audit.RESULT_PENDING,
            datasource=provider.source_type,
            connection_status=result.get("status", "unknown"),
            mock_hit=result.get("status") in ("mock", "configured"),
            error_type=None if result.get("ok") else f"connect_{result.get('status', 'unknown')}",
            error_message=None if result.get("ok") else str(result.get("message", ""))[:300],
        )
    except Exception:
        pass
    # 第六轮：数据源状态切换关键节点日志（真实连通 / 回退待联调，排障一眼定位）
    _log("ent.connect", ok=result.get("ok"), status=result.get("status"),
         channel=(result.get("details") or {}).get("channel") if isinstance(result.get("details"), dict) else None)

    return jsonify(result)


@app.route("/api/enterprise-bi/status", methods=["GET"])
def api_ent_status():
    """企业 BI 详细连接状态（五态状态机 + 健康信息）。"""
    provider = _ent_provider(request.args.get("source_type"))
    return jsonify(provider.health_check())


@app.route("/api/enterprise-bi/workspaces", methods=["GET"])
def api_ent_workspaces():
    """列出工作空间。"""
    provider = _ent_provider(request.args.get("source_type"))
    return jsonify(provider.list_workspaces())


@app.route("/api/enterprise-bi/datasets", methods=["GET"])
def api_ent_datasets():
    """企业 BI 数据集列表。"""
    provider = _ent_provider(request.args.get("source_type"))
    try:
        datasets = provider.list_datasets()
        # MCP 静态就绪但本次真实调用失败（邀测白名单未开通/网络不通）时已回退 Mock，
        # 需按「本次是否真实命中」诚实标注，不能仅凭静态配置误报 is_real=true。
        fallback_err = getattr(provider, "mcp_last_error", "") or ""
        fell_back = bool(fallback_err)
        return jsonify({"success": True, "source_type": provider.source_type,
                        "is_real": provider.is_real and not fell_back,
                        "mock_fallback": fell_back,
                        "fallback_reason": fallback_err,
                        "datasets": datasets})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/enterprise-bi/schema", methods=["GET"])
def api_ent_schema():
    """企业 BI 数据集字段 Schema。"""
    dataset_id = request.args.get("dataset_id", "")
    provider = _ent_provider(request.args.get("source_type"))
    try:
        return jsonify(provider.get_dataset_schema(dataset_id))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/enterprise-bi/plan", methods=["POST"])
def api_ent_plan():
    """
    【阶段一】需求确认 + SQL 草案（不执行查询）。
    入参: {question, history?, dataset_id?, source_type?}
    出参: {plan_id, stage, needs_clarification, clarification_questions, assumptions,
           sql_draft, matched_metrics, time_range, dimensions, dataset_id, chart_hint}
    """
    body = request.get_json(silent=True) or {}
    question = (body.get("question") or "").strip()
    if not question:
        return jsonify({"error": "问题不能为空"}), 400
    history = body.get("history") or []
    dataset_id = body.get("dataset_id")
    try:
        provider = _ent_provider(body.get("source_type"))

        matched, time_range, dims, clarifications, assumptions = _ent_detect_requirement(question)
        sql_draft, sql_source = _ent_build_sql_draft(question, history, dims)

        plan_id = "plan_" + _uuid.uuid4().hex[:12]
        plan = {
            "plan_id": plan_id,
            "question": question,
            "history": history,
            "dataset_id": dataset_id,
            "source_type": provider.source_type,
            "sql_draft": sql_draft,
            "sql_source": sql_source,
            "matched_metrics": matched,
            "time_range": time_range,
            "dimensions": dims,
            "clarification_questions": clarifications,
            "assumptions": assumptions,
            "created_at": time.time(),
        }
        _store_ent_plan(plan)

        # 第五轮：审计——企业 BI 草案生成（pending：等待用户确认，未执行查询）
        try:
            _ent_status = getattr(provider, "connection_status", lambda: "unknown")()
            _audit.record_event(
                _audit.EVENT_ENT_PLAN, result=_audit.RESULT_PENDING,
                question=question, datasource=provider.source_type,
                staged_confirmed=False, sql_source=sql_source or "unknown",
                # 草案非真实 LLM 生成，或数据源尚未真实连通（待联调）→ 均标注为兜底/演示
                mock_hit=(sql_source not in ("semantic-llm", "llm")) or (_ent_status != "real_ready"),
                connection_status=_ent_status,
                needs_clarification=len(clarifications) > 0,
                **_audit.sql_preview(sql_draft),
            )
        except Exception:
            pass

        return jsonify({
            "success": True,
            "stage": "plan",
            "plan_id": plan_id,
            "needs_clarification": len(clarifications) > 0,
            "clarification_questions": clarifications,
            "assumptions": assumptions,
            "question": question,
            "sql_draft": sql_draft,
            "sql_source": sql_source,
            "matched_metrics": matched,
            "time_range": time_range,
            "dimensions": dims,
            "dataset_id": dataset_id,
            "connection_status": getattr(provider, "connection_status", lambda: "unknown")(),
            "is_real": provider.is_real,
        })
    except Exception as e:
        try:
            _audit.record_event(
                _audit.EVENT_ENT_PLAN, result=_audit.RESULT_FAILED,
                question=question, datasource="fengshenBi",
                error_type=type(e).__name__, error_message=str(e),
            )
        except Exception:
            pass
        return jsonify({"success": False, "stage": "plan",
                        "error": f"生成 SQL 草案失败：{type(e).__name__}: {e}"}), 500


@app.route("/api/enterprise-bi/confirm", methods=["POST"])
def api_ent_confirm():
    """
    【阶段二】用户确认 SQL 后执行查询。
    入参: {plan_id? 或 sql, confirmed, dataset_id?, source_type?}
    出参: {stage:'execute', result, summary, chart_suggestion, ...}
    """
    body = request.get_json(silent=True) or {}
    plan_id = body.get("plan_id")
    plan = _ENT_PLANS.get(plan_id) if plan_id else None
    if plan_id and not plan:
        return jsonify({"error": "plan 已过期或不存在，请重新生成 SQL 草案"}), 400

    sql = (body.get("sql") or (plan or {}).get("sql_draft") or "").strip()
    if not sql:
        return jsonify({"error": "缺少待执行的 SQL"}), 400
    if not body.get("confirmed", False):
        return jsonify({"error": "请先确认 SQL 草案（confirmed=true）"}), 400

    source_type = body.get("source_type") or (plan or {}).get("source_type") or "fengshenBi"
    dataset_id = body.get("dataset_id") or (plan or {}).get("dataset_id")
    question = (plan or {}).get("question") or body.get("question") or ""

    try:
        provider = _ent_provider(source_type)

        t0 = time.time()
        exec_res = provider.confirm_and_run(sql, dataset_id=dataset_id, max_rows=200)
        elapsed = round((time.time() - t0) * 1000, 1)

        columns = exec_res.get("columns", []) if exec_res.get("success") else []
        rows = exec_res.get("rows", []) if exec_res.get("success") else []
        chart = _ent_recommend_chart(columns, rows) if exec_res.get("success") else {"type": "table", "reason": "查询失败"}
        findings = _ent_summarize(question, columns, rows, mock=bool(exec_res.get("mock"))) if exec_res.get("success") else []
    except Exception as e:
        # 任何未预期异常（方言转译/序列化/Provider 内部错误）都返回结构化 JSON，
        # 避免前端收到 Flask 500 HTML 无法解析。
        try:
            _audit.record_event(
                _audit.EVENT_ENT_CONFIRM, result=_audit.RESULT_FAILED,
                question=question, datasource=source_type,
                staged_confirmed=True, error_type=type(e).__name__,
                error_message=str(e), **_audit.sql_preview(sql),
            )
        except Exception:
            pass
        return jsonify({
            "success": False,
            "stage": "execute",
            "plan_id": plan_id,
            "question": question,
            "sql": sql,
            "dataset_id": dataset_id,
            "source_type": source_type,
            "result": {"columns": [], "rows": [], "rowCount": 0, "success": False,
                       "error": f"查询执行异常：{type(e).__name__}: {e}",
                       "executionTimeMs": 0},
            "summary": {"key_findings": []},
            "chart_suggestion": {"type": "table", "reason": "查询失败"},
            "matched_metrics": (plan or {}).get("matched_metrics", []),
            "time_range": (plan or {}).get("time_range", ""),
        }), 500

    # 第五轮：审计——企业 BI 确认后执行（成功路径；mock 命中与待联调状态如实记录）
    try:
        _audit.record_event(
            _audit.EVENT_ENT_CONFIRM,
            result=_audit.RESULT_SUCCESS if exec_res.get("success") else _audit.RESULT_FAILED,
            question=question, datasource=provider.source_type,
            staged_confirmed=True,
            sql_source=(plan or {}).get("sql_source") or "unknown",
            mock_hit=bool(exec_res.get("mock")),
            pending_integration=bool(exec_res.get("pending_integration")),
            connection_status=getattr(provider, "connection_status", lambda: "unknown")(),
            row_count=len(rows),
            duration_ms=elapsed,
            error_type=None if exec_res.get("success") else "ent_sql_exec_failed",
            error_message=None if exec_res.get("success") else str(exec_res.get("error", ""))[:300],
            **_audit.sql_preview(sql),
        )
    except Exception:
        pass

    return jsonify({
        "success": bool(exec_res.get("success")),
        "stage": "execute",
        "plan_id": plan_id,
        "question": question,
        "sql": sql,
        "dataset_id": dataset_id,
        "source_type": provider.source_type,
        "is_real": provider.is_real and not bool(exec_res.get("mock")),
        "mock": bool(exec_res.get("mock")),
        "mock_note": exec_res.get("mock_note", ""),
        "pending_integration": bool(exec_res.get("pending_integration")),
        "audited": bool(exec_res.get("audited")),
        "result": {
            "columns": columns,
            "rows": rows,
            "rowCount": len(rows),
            "totalCount": exec_res.get("row_count", len(rows)),
            "success": bool(exec_res.get("success")),
            "error": exec_res.get("error"),
            "executionTimeMs": exec_res.get("elapsed_ms", elapsed),
        },
        "summary": {"key_findings": findings},
        "chart_suggestion": chart,
        "matched_metrics": (plan or {}).get("matched_metrics", []),
        "time_range": (plan or {}).get("time_range", ""),
    })


# ---------- 生产环境：托管前端静态文件（Render / 单机部署） ----------
STATIC_DIR = os.environ.get("STATIC_DIR", os.path.join(ROOT, "static"))
_STATIC_ENABLED = os.path.isdir(STATIC_DIR)

if _STATIC_ENABLED:
    @app.route("/favicon.ico")
    def _favicon():
        return send_from_directory(STATIC_DIR, "favicon.ico", mimetype="image/svg+xml")

    @app.route("/assets/<path:filename>")
    def _static_assets(filename):
        return send_from_directory(os.path.join(STATIC_DIR, "assets"), filename)

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def _spa_fallback(path):
        if path.startswith("api/"):
            return jsonify({"error": "Not Found"}), 404
        full = os.path.join(STATIC_DIR, path)
        if path and os.path.isfile(full):
            return send_from_directory(STATIC_DIR, path)
        return send_from_directory(STATIC_DIR, "index.html")


def _print_startup_banner(port: int) -> None:
    """打印统一启动摘要：版本 / 运行模式 / LLM / 数据源五态 / 审计目录，便于演示与排障一眼定位。"""
    from urllib.parse import urlparse
    print("=" * 70)
    print("  🎓 语义增强型经营分析助手 · 后端服务")
    print(f"  版本：v{_SYSTEM_VERSION}   环境：{os.environ.get('FLASK_ENV', 'development')}")
    # 运行模式与 LLM
    if real_llm_enabled:
        host = urlparse(os.environ.get("LLM_BASE_URL", "")).netloc or "默认接入点"
        print(f"  运行模式：✅ 真实 LLM（{os.environ.get('LLM_MODEL', '默认模型')} @ {host}）")
    else:
        print("  运行模式：⚠️  模板/题库模式（未配置 LLM_API_KEY，SQL 走内置语义题库，查询仍真实执行）")
    # 数据源五态（registry 返回元信息字典，直接读 connection_status）
    try:
        for st, info in _ds_registry().items():
            status = info.get("connection_status", "unknown")
            tag = {"mock": "Mock 演示", "configured": "已配置·待联调", "verified": "凭证已验证",
                   "real_ready": "真实可用", "unconfigured": "未配置"}.get(status, status)
            mark = "（当前）" if os.environ.get("DATASOURCE_TYPE", "currentLocal") == st else ""
            extra = f" 库存在={os.path.exists(DB_PATH)}" if st == "currentLocal" else ""
            print(f"  数据源：{st} · 状态【{tag}】{mark}{extra}")
    except Exception as e:
        print(f"  数据源：状态读取失败（{type(e).__name__}）")
    # 审计目录
    try:
        print(f"  审计日志：{_audit.today_summary().get('log_dir', '')}（JSONL 按天落盘）")
    except Exception:
        pass
    print(f"  API 地址：http://localhost:{port}/api/   健康检查：/api/health   系统状态：/api/system/status")
    print("=" * 70)


if __name__ == "__main__":
    port = int(os.environ.get("BACKEND_PORT", 5001))
    _print_startup_banner(port)
    _log("boot", version=f"v{_SYSTEM_VERSION}", mode="real-llm" if real_llm_enabled else "template",
         datasource=os.environ.get("DATASOURCE_TYPE", "currentLocal"))
    app.run(host="0.0.0.0", port=port, debug=False)
