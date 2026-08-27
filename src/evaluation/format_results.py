"""
评测结果格式化脚本
- 读取原始 baseline_results.csv
- 自动分类错误类型
- 生成:
  1. baseline_results_readable.csv - 精简易读版（中文标记、关键列前置、长SQL截断）
  2. baseline_report.md - Markdown 详细报告（汇总统计+每题概览+错题详情）

用法:
  python3 -m src.evaluation.format_results [--input 输入csv路径] [--output-dir 输出目录]
"""
import os
import sys
import csv
import json
import argparse
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_INPUT = os.path.join(BASE_DIR, "outputs", "reports", "baseline_results.csv")
DEFAULT_OUTPUT_DIR = os.path.join(BASE_DIR, "outputs", "reports")


def classify_error(mismatch_reason, generated_sql="", question=""):
    """根据错误原因、SQL内容、问题文本自动分类错误类型。"""
    reason = mismatch_reason or ""
    sql_lower = generated_sql.lower() if generated_sql else ""
    q_text = question or ""

    # ── 0. 先看错误原因里的明确信号 ──
    if "行数不一致" in reason or "列数不一致" in reason:
        return "📋 结果结构/格式错误"

    # ── 1. 时间语义错误 ──
    time_keywords_sql = ["date('now'", "-1 month", "-6 month", "-3 month"]
    time_indicators_question = ["上月", "今年", "近", "本月", "上周", "最近"]
    has_time_kw_sql = any(kw in sql_lower or kw in generated_sql for kw in time_keywords_sql)

    if has_time_kw_sql:
        return "🕐 时间语义错误"
    # "今年" 被错误理解为 2025 年
    if "今年" in q_text and "= '2025'" in generated_sql and "2026" not in generated_sql:
        return "🕐 时间语义错误"
    # 问题无明确时间但业务默认是上月，SQL没加时间过滤 → 时间语义错误
    no_explicit_time = not any(kw in q_text for kw in ["2025", "2026", "Q1", "Q2", "Q3", "Q4", "上半年", "下半年", "全年", "年", "月"])
    if no_explicit_time and "order_date between" not in sql_lower and "order_date >=" not in sql_lower \
       and not has_time_kw_sql and "GROUP BY" in sql_lower:
        return "🕐 时间语义错误"

    # ── 2. SQL执行失败 ──
    if "执行失败" in reason or "SQL失败" in reason or "syntax" in reason.lower():
        return "💥 SQL执行失败"

    # ── 3. 指标口径错误（新客/复购/pay_status过滤等） ──
    if "新客" in q_text and ("register_date" in sql_lower):
        return "📏 指标口径错误"
    if "复购" in q_text and "first_purchase" in sql_lower and "monthly_customer_orders" not in sql_lower:
        return "📏 指标口径错误"
    if "pay_status" not in sql_lower or "'已支付'" not in generated_sql:
        return "📏 指标口径错误"

    # ── 4. 结果结构/格式错误（季度格式/标签等） ──
    if "Q1" in reason or "Q2" in reason or "quarter" in reason.lower():
        return "📋 结果结构/格式错误"
    if "复购" in q_text and "行数不一致" in reason:
        return "📋 结果结构/格式错误"

    # ── 5. JOIN逻辑错误 ──
    # （只有在前面都没匹配到，且明确有join问题时才归此类）

    # ── 6. 文本标签不一致（仅标签文字差异，数值正确） ──
    if "行0列0" in reason and "行0列1" not in reason and "行1列1" not in reason:
        return "🏷 文本标签不一致"

    if not reason:
        return "✅ 完全正确"

    return "❓ 其他错误"


def truncate_sql(sql, max_len=80):
    """截断SQL用于摘要显示。"""
    if not sql:
        return ""
    sql_one_line = " ".join(sql.strip().split())
    if len(sql_one_line) <= max_len:
        return sql_one_line
    return sql_one_line[:max_len] + "..."


def format_elapsed(ms):
    """格式化耗时为易读字符串。"""
    if ms is None:
        return "-"
    s = ms / 1000
    if s < 1:
        return f"{ms:.0f}ms"
    if s < 60:
        return f"{s:.1f}s"
    return f"{int(s//60)}m{s%60:.0f}s"


def load_results(csv_path):
    """读取原始CSV结果。"""
    results = []
    with open(csv_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            results.append(row)
    return results


def _is_true(val):
    """兼容 int/bool/str 类型的真值判断。"""
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        return val == 1
    if isinstance(val, str):
        return val.strip() in ("1", "true", "True", "yes", "✅")
    return False


def write_readable_csv(results, output_path):
    """写出精简易读版CSV。"""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    fieldnames = [
        "题号", "问题", "难度", "问题类型",
        "SQL执行", "结果匹配", "错误分类", "错误原因",
        "返回行数", "LLM耗时", "SQL耗时", "总耗时",
        "生成SQL摘要",
    ]

    with open(output_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in results:
            exec_ok = _is_true(r.get("exec_success", 0))
            match_ok = _is_true(r.get("result_match_reference", 0))
            error_type = classify_error(r.get("mismatch_reason", ""), r.get("generated_sql", ""), r.get("question", ""))
            mismatch = r.get("mismatch_reason", "") if not match_ok else ""

            writer.writerow({
                "题号": r.get("question_id", ""),
                "问题": r.get("question", ""),
                "难度": r.get("difficulty", ""),
                "问题类型": r.get("question_type", ""),
                "SQL执行": "✅ 成功" if exec_ok else "❌ 失败",
                "结果匹配": "✅ 正确" if match_ok else "❌ 错误",
                "错误分类": error_type if not match_ok else "",
                "错误原因": mismatch,
                "返回行数": r.get("exec_row_count", "0"),
                "LLM耗时": format_elapsed(float(r.get("elapsed_ms_llm", 0))),
                "SQL耗时": format_elapsed(float(r.get("elapsed_ms_sql", 0))),
                "总耗时": format_elapsed(float(r.get("total_elapsed_ms", 0))),
                "生成SQL摘要": truncate_sql(r.get("generated_sql", ""), 100),
            })
    print(f"✅ 易读版CSV已保存: {output_path}")


def write_markdown_report(results, output_path):
    """生成Markdown详细报告。"""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    total = len(results)
    exec_ok_cnt = sum(1 for r in results if _is_true(r.get("exec_success", 0)))
    match_cnt = sum(1 for r in results if _is_true(r.get("result_match_reference", 0)))
    total_ms = sum(float(r.get("total_elapsed_ms", 0) or 0) for r in results)

    # 按错误类型统计
    error_stats = defaultdict(list)
    for r in results:
        if not _is_true(r.get("result_match_reference", 0)):
            etype = classify_error(r.get("mismatch_reason", ""), r.get("generated_sql", ""), r.get("question", ""))
            error_stats[etype].append(r)

    # 按难度统计
    diff_stats = defaultdict(lambda: {"total": 0, "match": 0})
    for r in results:
        d = r.get("difficulty", "未知")
        diff_stats[d]["total"] += 1
        if _is_true(r.get("result_match_reference", 0)):
            diff_stats[d]["match"] += 1

    # 按问题类型统计
    type_stats = defaultdict(lambda: {"total": 0, "match": 0})
    for r in results:
        t = r.get("question_type", "未知")
        type_stats[t]["total"] += 1
        if _is_true(r.get("result_match_reference", 0)):
            type_stats[t]["match"] += 1

    lines = []
    lines.append("# 🧪 基线 Text-to-SQL 评测报告")
    lines.append("")
    lines.append(f"**评测时间**: {results[0].get('timestamp', '-') if results else '-'}")
    lines.append(f"**评测题目**: {total} 题")
    lines.append("")

    # ── 一、核心指标汇总 ──
    lines.append("## 一、核心指标汇总")
    lines.append("")
    lines.append("| 指标 | 数值 | 说明 |")
    lines.append("|------|------|------|")
    lines.append(f"| SQL 语法执行成功率 | **{exec_ok_cnt}/{total} = {exec_ok_cnt/total*100:.1f}%** | LLM生成的SQL能在数据库上成功执行 |")
    lines.append(f"| 结果语义一致率 | **{match_cnt}/{total} = {match_cnt/total*100:.1f}%** | 执行结果与参考答案数值一致 |")
    lines.append(f"| 总耗时 | {total_ms/1000:.1f}s | 平均每题 {total_ms/total/1000:.1f}s |")
    lines.append("")

    # ── 二、按难度正确率 ──
    lines.append("## 二、按难度正确率")
    lines.append("")
    lines.append("| 难度 | 正确数/总数 | 正确率 |")
    lines.append("|------|------------|--------|")
    for d in ["简单", "中等", "困难"]:
        if d in diff_stats:
            s = diff_stats[d]
            rate = s["match"] / s["total"] * 100 if s["total"] else 0
            lines.append(f"| {d} | {s['match']}/{s['total']} | {rate:.1f}% |")
    lines.append("")

    # ── 三、按问题类型正确率 ──
    lines.append("## 三、按问题类型正确率")
    lines.append("")
    lines.append("| 问题类型 | 正确数/总数 | 正确率 |")
    lines.append("|----------|------------|--------|")
    for t in ["直接统计", "趋势分析", "对比分析", "排名分析", "占比分析", "异常识别"]:
        if t in type_stats:
            s = type_stats[t]
            rate = s["match"] / s["total"] * 100 if s["total"] else 0
            lines.append(f"| {t} | {s['match']}/{s['total']} | {rate:.1f}% |")
    lines.append("")

    # ── 四、错误类型分布 ──
    lines.append("## 四、错误类型分布（共{}题错误）".format(total - match_cnt))
    lines.append("")
    lines.append("| 错误类型 | 题数 | 涉及题号 |")
    lines.append("|----------|------|----------|")
    error_order = [
        "🕐 时间语义错误", "📏 指标口径错误", "📋 结果结构/格式错误",
        "🔗 JOIN逻辑错误", "🏷 文本标签不一致", "💥 SQL执行失败", "❓ 其他错误",
    ]
    for etype in error_order:
        if etype in error_stats:
            qids = ", ".join(r["question_id"] for r in error_stats[etype])
            lines.append(f"| {etype} | {len(error_stats[etype])} | {qids} |")
    lines.append("")

    # ── 五、每题概览 ──
    lines.append("## 五、每题结果概览")
    lines.append("")
    lines.append("| # | 问题 | 难度 | 执行 | 匹配 | 错误类型 | 耗时 |")
    lines.append("|---|------|------|------|------|----------|------|")
    for r in results:
        qid = r.get("question_id", "")
        q = r.get("question", "")
        diff = r.get("difficulty", "")
        exec_ok = _is_true(r.get("exec_success", 0))
        match_ok = _is_true(r.get("result_match_reference", 0))
        exec_icon = "✅" if exec_ok else "❌"
        match_icon = "✅" if match_ok else "❌"
        etype = "" if match_ok else classify_error(r.get("mismatch_reason", ""), r.get("generated_sql", ""), r.get("question", ""))
        elapsed = format_elapsed(float(r.get("total_elapsed_ms", 0) or 0))
        lines.append(f"| {qid} | {q} | {diff} | {exec_icon} | {match_icon} | {etype} | {elapsed} |")
    lines.append("")

    # ── 六、错题详情 ──
    wrong_results = [r for r in results if not _is_true(r.get("result_match_reference", 0))]
    if wrong_results:
        lines.append("## 六、错题详情")
        lines.append("")
        for idx, r in enumerate(wrong_results, 1):
            qid = r.get("question_id", "")
            q = r.get("question", "")
            diff = r.get("difficulty", "")
            qtype = r.get("question_type", "")
            etype = classify_error(r.get("mismatch_reason", ""), r.get("generated_sql", ""), r.get("question", ""))
            reason = r.get("mismatch_reason", "")

            lines.append(f"### {idx}. {qid} | {q}")
            lines.append("")
            lines.append(f"- **难度**: {diff} | **类型**: {qtype}")
            lines.append(f"- **错误分类**: {etype}")
            lines.append(f"- **错误详情**: {reason}")
            lines.append(f"- **LLM生成的SQL**:")
            lines.append("```sql")
            lines.append(r.get("generated_sql", "").strip())
            lines.append("```")
            lines.append(f"- **参考SQL**:")
            lines.append("```sql")
            lines.append(r.get("ref_sql", "").strip())
            lines.append("```")
            lines.append("")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"✅ Markdown报告已保存: {output_path}")


def main():
    parser = argparse.ArgumentParser(description="格式化基线评测结果")
    parser.add_argument("--input", default=DEFAULT_INPUT, help="原始CSV路径")
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR, help="输出目录")
    args = parser.parse_args()

    input_path = args.input
    if not os.path.exists(input_path):
        print(f"❌ 找不到结果文件: {input_path}")
        print("请先运行: python3 -m src.evaluation.run_baseline_eval")
        sys.exit(1)

    results = load_results(input_path)
    print(f"📖 读取到 {len(results)} 条结果")

    readable_csv = os.path.join(args.output_dir, "baseline_results_readable.csv")
    report_md = os.path.join(args.output_dir, "baseline_report.md")

    write_readable_csv(results, readable_csv)
    write_markdown_report(results, report_md)

    print("\n🎉 格式化完成！")


if __name__ == "__main__":
    main()
