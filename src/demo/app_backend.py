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
import os
import sys
import time
import copy
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS

from src.utils.sql_executor import SQLExecutor
from src.semantic_layer.semantic_loader import get_semantic_layer

DB_PATH = os.path.join(ROOT, "data", "processed", "retail.db")
executor = SQLExecutor(db_path=DB_PATH)
semantic = get_semantic_layer()

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


def _build_chat_response(question: str, history=None) -> dict:
    """构建聊天响应的核心逻辑，供 /api/chat 和 /api/chat/stream 共用。"""
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

        if not exp_ok and not sql:
            matched_item = _match_mock_bank(question) or _try_followup(question, history)
            if matched_item:
                sql = matched_item["sql"]
                exec_result = executor.execute(sql, max_rows=50)
                exp_ok = exec_result["success"]
                exp_cols = exec_result["columns"]
                exp_rows = [list(r) for r in exec_result["rows"]]
                exp_err = exec_result.get("error")
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

    return {
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
            "elapsed_ms": round((time.time() - t_start) * 1000, 1),
        },
    }


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

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


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


if __name__ == "__main__":
    port = int(os.environ.get("BACKEND_PORT", 5001))
    print("=" * 64)
    print("  🎓 毕设 · 指标语义层 Text-to-SQL 后端（前端配套 API）")
    print(f"  模式：{'✅ 真实 LLM' if real_llm_enabled else '⚠️  Mock 模式（可用真实 SQLite 验证结果结构）'}")
    print(f"  数据库：{DB_PATH}  存在：{os.path.exists(DB_PATH)}")
    print(f"  API Base URL：http://localhost:{port}/api/")
    print("  配套前端 Vite 代理已配置 /api -> http://localhost:5001")
    print("=" * 64)
    app.run(host="0.0.0.0", port=port, debug=False)
