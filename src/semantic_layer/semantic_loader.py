"""
语义层加载器
负责加载 metric_semantics.json，构建指标/维度/时间语义的检索能力，并生成给 LLM 的知识片段。
"""
import os
import json


BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SEMANTICS_PATH = os.path.join(BASE_DIR, "src", "semantic_layer", "metric_semantics.json")
SCHEMA_COMMENTED_PATH = os.path.join(BASE_DIR, "src", "semantic_layer", "schema_commented.sql")

ASSUMED_TODAY = "2026-07-01"
DATA_START = "2025-01-01"
DATA_END = "2026-06-30"


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_text(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


class SemanticLayer:
    """指标语义层：加载并提供给 LLM 的结构化业务知识。"""

    def __init__(self, semantics_path=SEMANTICS_PATH, schema_path=SCHEMA_COMMENTED_PATH):
        self.data = load_json(semantics_path)
        self.schema_text = load_text(schema_path)
        self.metrics = {m["id"]: m for m in self.data["metrics"]}
        self.global_rules = self.data["global_rules"]
        self.time_semantics = self.data["time_semantics"]
        self.dimensions = self.data["dimension_semantics"]

        self._build_alias_index()

    def _build_alias_index(self):
        """构建别名→指标ID的倒排索引，用于快速匹配问题中的指标。"""
        self.alias_to_metric = {}
        for mid, m in self.metrics.items():
            for alias in m.get("aliases", []):
                self.alias_to_metric[alias] = mid

    def match_metrics(self, question):
        """从问题文本中匹配涉及的指标ID列表。"""
        matched = set()
        for alias, mid in self.alias_to_metric.items():
            if alias in question:
                matched.add(mid)
        return [self.metrics[mid] for mid in sorted(matched)]

    def format_time_anchor_table(self):
        """生成时间语义映射表（基于假设今天=2026-07-01）。"""
        rows = [
            ("上月", "2026-06-01 ~ 2026-06-30", "order_date BETWEEN '2026-06-01' AND '2026-06-30'"),
            ("本月", "2026-07-01 ~ 2026-07-01", "order_date BETWEEN '2026-07-01' AND '2026-07-01'（数据截止上月末，本月无数据）"),
            ("近6个月", "2026-01-01 ~ 2026-06-30", "order_date BETWEEN '2026-01-01' AND '2026-06-30'"),
            ("去年/2025年全年", "2025-01-01 ~ 2025-12-31", "order_date BETWEEN '2025-01-01' AND '2025-12-31'"),
            ("今年（截至当前）", "2026-01-01 ~ 2026-06-30", "order_date BETWEEN '2026-01-01' AND '2026-06-30'"),
            ("今年上半年", "2026-01-01 ~ 2026-06-30", "order_date BETWEEN '2026-01-01' AND '2026-06-30'"),
            ("2025年上半年", "2025-01-01 ~ 2025-06-30", "order_date BETWEEN '2025-01-01' AND '2025-06-30'"),
            ("2025年下半年", "2025-07-01 ~ 2025-12-31", "order_date BETWEEN '2025-07-01' AND '2025-12-31'"),
            ("2025年Q1", "2025-01-01 ~ 2025-03-31", "order_date BETWEEN '2025-01-01' AND '2025-03-31'"),
            ("2025年Q2", "2025-04-01 ~ 2025-06-30", "order_date BETWEEN '2025-04-01' AND '2025-06-30'"),
            ("2025年Q3", "2025-07-01 ~ 2025-09-30", "order_date BETWEEN '2025-07-01' AND '2025-09-30'"),
            ("2025年Q4", "2025-10-01 ~ 2025-12-31", "order_date BETWEEN '2025-10-01' AND '2025-12-31'"),
            ("2026年Q1", "2026-01-01 ~ 2026-03-31", "order_date BETWEEN '2026-01-01' AND '2026-03-31'"),
            ("2026年Q2", "2026-04-01 ~ 2026-06-30", "order_date BETWEEN '2026-04-01' AND '2026-06-30'"),
        ]
        lines = ["| 中文表达 | 实际日期范围 | SQL 时间过滤写法 |", "|----------|-------------|-----------------|"]
        for name, rng, sql in rows:
            lines.append(f"| {name} | {rng} | `{sql}` |")
        return "\n".join(lines)

    def format_metrics_knowledge(self, metrics=None):
        """格式化指标知识片段（全部指标，供Prompt注入）。"""
        if metrics is None:
            metrics = list(self.metrics.values())
        lines = []
        for m in metrics:
            lines.append(f"### {m['name']}（{m['id']}）")
            lines.append(f"- **定义**: {m['definition']}")
            lines.append(f"- **别名/同义词**: {', '.join(m.get('aliases', [])[:8])}")
            lines.append(f"- **SQL模板**: `{m['sql_template']}`")
            lines.append(f"- **JOIN关系**: {m.get('base_from', '')} " + " ".join(m.get("common_joins", [])))
            if m.get("confusing_notes"):
                lines.append(f"- **易混淆口径（⚠️ 务必注意）**:")
                for note in m["confusing_notes"]:
                    lines.append(f"  - {note}")
            lines.append("")
        return "\n".join(lines)

    def format_global_rules(self):
        """格式化全局规则。"""
        r = self.global_rules
        lines = [
            f"1. **支付状态默认过滤**: 所有涉及金额/订单的指标必须加 `{r['pay_status_filter_default']}`，已退款/未支付不计入。",
            f"2. **时间锚点**: 假设今天 = **{ASSUMED_TODAY}**，数据库数据范围为 **{DATA_START} ~ {DATA_END}**。",
            "   - 禁止使用 `date('now')`、`CURRENT_DATE` 等动态时间函数！必须根据上表硬编码具体日期。",
            f"3. **订单计数**: 统计订单数必须用 `COUNT(DISTINCT order_id)`，不能用 `COUNT(*)`（同一订单多商品会重复计数）。",
            f"4. **比例/比率**: 输出百分比，保留2位小数（如 ROUND(x*100.0/..., 2)），并注意除零保护（NULLIF）。",
            f"5. **JOIN规范**: 优先使用 `LEFT JOIN`，避免 INNER JOIN 丢失维度不匹配的记录。",
            f"6. **季度/月份分组**: 季度标签用 `'2025Q1'` 格式（字符串），不要用纯数字；月份标签用 `'2025-01'` 格式。",
            f"7. **空值处理**: 结果为 NULL 时用 COALESCE 转为 0。",
        ]
        return "\n".join(lines)

    def format_common_pitfalls(self):
        """从基线错误中提炼的常见陷阱。"""
        return """## ⚠️ 常见错误警示（来自基线系统测试，必须避免）

1. **❌ 时间函数错误**: 不要用 `date('now','-1 month')`——不同环境下"今天"不同，会导致查不到数据。必须用上面的硬编码日期。
2. **❌ 默认时间范围错误**: 如果问题没有明确说时间，但问的是"哪个渠道客单价更高"这类对比问题，默认取**上月**（2026-06）；如果问题涉及排名/趋势且无时间限定，默认取**2025年全年**（数据最完整的一年）。
3. **❌ 新客定义错误**: "新客"=首次**支付**时间在周期内的客户，不是注册时间在周期内。用 `MIN(order_date) GROUP BY customer_id` 找首单时间。
4. **❌ 复购率定义错误**: "复购率"=当月内下单≥2次的客户数/当月活跃客户数，不是跨月追踪新客复购。
5. **❌ 季度格式错误**: 季度分组的标签列必须输出 `'2025Q1'` 这种字符串格式，不要输出纯数字 1/2/3/4。
6. **❌ JOIN date_dim 不必要时**: order_item 表已有冗余字段 `order_date`（TEXT类型 'YYYY-MM-DD'），简单时间过滤直接用 `order_date BETWEEN ...`，不需要 JOIN date_dim 表。只有需要按季度分组且要用 season_name 时才 JOIN date_dim。
"""

    def format_output_spec(self):
        """针对不同问题类型的输出列格式规范（解决实验组暴露的结果结构问题）。"""
        return """## 📐 输出格式规范（非常重要，必须严格遵守）

### 通用列顺序规则
- **维度列在前，指标列在后**。
- 多个维度列时，按照问题中维度出现的顺序排列。例如"各渠道按季度的销售额"→ 先 `channel`，再 `quarter_name`，最后 `sales_amount`。
- 时间段标签文字必须精确：用 `'2025全年'` 而不是 `'2025年全年'`；用 `'2026上半年'` 而不是 `'2026年上半年'`。

### 返回行数规则
- **"哪个/什么时候最X"**（如"哪个月跌幅最大"、"哪天销售额最高"）：只返回答案那1行，用 `ORDER BY ... LIMIT 1`。
- **"Top N"**（如"前5个城市"、"最高的3个区域"）：返回N行，用 `LIMIT N`。
- **"A和B哪个更高"**（如"线上APP和线下门店哪个客单价更高"）：返回A和B两行数据供对比，不要只返回高的那行。
- **"最高和最低分别是"**（如"复购率最高和最低的月份"）：返回所有分组数据（如全部12个月）按指标降序排列，不要只返回2行。
- **趋势/占比/对比分析**：返回所有相关分组的数据。

### 各问题类型的标准输出列

| 问题类型 | 必须返回的列（按顺序） | 示例 |
|---------|---------------------|------|
| 直接统计（单值） | 1列：指标值 | `sales_amount` |
| 趋势分析（按月/季） | 2列：时间维度, 指标值 | `month, sales_amount` |
| 趋势+环比 | 4列：时间, 当期值, 上期值, 环比百分比 | `month, aov, prev_aov, mom_change_pct` |
| 对比分析 | 2列：对比维度, 指标值 | `region, sales_amount` |
| 对比分析(时间段) | 2列：时间段标签, 指标值 | `period_name, sales_amount` |
| 排名分析 | 2列：排名维度, 指标值（返回Top N全部行） | `category, sales_amount` |
| 占比分析 | **3列**：维度, 绝对值, 占比百分比 | `channel, order_count, share_pct` |
| 异常识别(跌幅最大等) | **4列**：时间, 当期值, 上期值, 环比百分比 | `month, sales_amount, prev_month_sales, mom_change_pct` |
| 复购率(按月) | **4列**：月份, 活跃客户数, 复购客户数, 复购率 | `month, total_active_customers, repurchase_customers, repurchase_rate_pct` |

### 关键细节
- **占比类问题**（Q21区域占比、Q22渠道占比、Q23子品类占比）：必须同时返回**绝对值和百分比**两列，不能只返回百分比。
- **环比问题**（Q09客单价环比、Q24跌幅最大）：必须包含上期值列(prev_aov/prev_month_sales)，不能只返回当期值和变化率。
"""

    def build_system_prompt(self):
        """构建实验组增强版 System Prompt。"""
        return f"""你是一位资深零售经营数据分析专家，精通SQL和业务指标体系。给定数据库Schema和业务语义知识，将中文自然语言问题转换为可直接执行的SQLite SQL语句。

## 📌 全局硬性规则（必须严格遵守）
{self.format_global_rules()}

{self.format_common_pitfalls()}

{self.format_output_spec()}

## 📅 时间语义映射表（假设今天 = {ASSUMED_TODAY}，数据截止 {DATA_END}）
{self.format_time_anchor_table()}

## 🗄️ 数据库Schema（带中文注释）
{self.schema_text}

## 📊 指标词典（指标定义 + SQL模板 + 口径警示）
{self.format_metrics_knowledge()}

## 🎯 输出要求
1. 输出**恰好一条**可执行SQL，放在 ```sql ... ``` 代码块中。
2. 不要输出解释、注释或其他文字。
3. 严格使用SQLite语法，日期字段是TEXT类型'YYYY-MM-DD'，用`strftime()`分组。
4. 聚合结果列使用有意义的英文别名（如sales_amount, order_count, aov, new_customer_count, repurchase_rate_pct）。
5. 比例类指标乘以100输出百分比数值，保留2位小数。
6. 数值结果统一用 `ROUND(..., 2)` 保留2位小数。
7. **务必对照上面的"输出格式规范"检查返回列数和列顺序是否正确。**
"""


_singleton = None


def get_semantic_layer():
    global _singleton
    if _singleton is None:
        _singleton = SemanticLayer()
    return _singleton
