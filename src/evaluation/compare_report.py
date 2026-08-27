"""
基线 vs 实验组对比报告生成
读取 baseline_results.csv 和 experiment_results.csv，生成对比Markdown报告。
"""
import os
import csv
from collections import defaultdict


BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REPORTS_DIR = os.path.join(BASE_DIR, "outputs", "reports")
BASELINE_CSV = os.path.join(REPORTS_DIR, "baseline_results.csv")
EXPERIMENT_CSV = os.path.join(REPORTS_DIR, "experiment_results.csv")
COMPARISON_MD = os.path.join(REPORTS_DIR, "comparison_report.md")


def _is_true(val):
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        return val == 1
    if isinstance(val, str):
        return val.strip() in ("1", "true", "True")
    return False


def load_results(csv_path):
    results = {}
    with open(csv_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            results[row["question_id"]] = row
    return results


def generate_comparison(baseline_path=BASELINE_CSV, experiment_path=EXPERIMENT_CSV, output_path=COMPARISON_MD):
    baseline = load_results(baseline_path)
    experiment = load_results(experiment_path)

    all_qids = sorted(set(baseline.keys()) | set(experiment.keys()))
    total = len(all_qids)

    # 统计
    b_exec = sum(1 for qid in all_qids if _is_true(baseline.get(qid, {}).get("exec_success", 0)))
    e_exec = sum(1 for qid in all_qids if _is_true(experiment.get(qid, {}).get("exec_success", 0)))
    b_match = sum(1 for qid in all_qids if _is_true(baseline.get(qid, {}).get("result_match_reference", 0)))
    e_match = sum(1 for qid in all_qids if _is_true(experiment.get(qid, {}).get("result_match_reference", 0)))

    b_total_ms = sum(float(baseline.get(qid, {}).get("total_elapsed_ms", 0) or 0) for qid in all_qids)
    e_total_ms = sum(float(experiment.get(qid, {}).get("total_elapsed_ms", 0) or 0) for qid in all_qids)

    # 按难度统计
    def stats_by_group(key_name):
        groups = defaultdict(lambda: {"b_total": 0, "e_total": 0, "b_match": 0, "e_match": 0})
        for qid in all_qids:
            b = baseline.get(qid, {})
            e = experiment.get(qid, {})
            g = b.get(key_name) or e.get(key_name) or "未知"
            groups[g]["b_total"] += 1
            groups[g]["e_total"] += 1
            if _is_true(b.get("result_match_reference", 0)):
                groups[g]["b_match"] += 1
            if _is_true(e.get("result_match_reference", 0)):
                groups[g]["e_match"] += 1
        return groups

    by_difficulty = stats_by_group("difficulty")
    by_type = stats_by_group("question_type")

    # 逐题对比
    improvements = []  # 基线错→实验组对
    regressions = []   # 基线对→实验组错
    both_wrong = []
    both_correct = []

    for qid in all_qids:
        b_ok = _is_true(baseline.get(qid, {}).get("result_match_reference", 0))
        e_ok = _is_true(experiment.get(qid, {}).get("result_match_reference", 0))
        q_text = baseline.get(qid, {}).get("question") or experiment.get(qid, {}).get("question", "")
        diff = baseline.get(qid, {}).get("difficulty") or experiment.get(qid, {}).get("difficulty", "")
        entry = (qid, q_text, diff)
        if not b_ok and e_ok:
            improvements.append(entry)
        elif b_ok and not e_ok:
            regressions.append(entry)
        elif not b_ok and not e_ok:
            both_wrong.append(entry)
        else:
            both_correct.append(entry)

    lines = []
    lines.append("# 📊 基线 vs 实验组 对比评测报告")
    lines.append("")
    lines.append("## 实验设计")
    lines.append("")
    lines.append("| 维度 | 基线系统 (Baseline) | 实验组系统 (Experiment) |")
    lines.append("|------|---------------------|------------------------|")
    lines.append("| 提供信息 | 仅DDL Schema（纯表结构） | DDL Schema(含注释) + 全局口径规则 + 时间锚点 + 指标词典 + 常见陷阱 |")
    lines.append("| LLM调用次数 | 1次 | 1次（完全相同） |")
    lines.append("| LLM模型 | 相同 | 相同 |")
    lines.append("| Temperature | 0.0 | 0.0 |")
    lines.append("| 测试题目 | 25题（相同） | 25题（相同） |")
    lines.append("| 对比标准 | 与参考答案SQL执行结果数值对比 | 与参考答案SQL执行结果数值对比 |")
    lines.append("")

    lines.append("## 一、核心指标对比")
    lines.append("")
    lines.append("| 指标 | 基线 (Baseline) | 实验组 (Experiment) | 提升 |")
    lines.append("|------|----------------|--------------------|------|")
    lines.append(f"| SQL语法执行成功率 | {b_exec}/{total} = {b_exec/total*100:.1f}% | {e_exec}/{total} = {e_exec/total*100:.1f}% | {(e_exec-b_exec)/total*100:+.1f}pp |")
    lines.append(f"| **结果语义一致率** | **{b_match}/{total} = {b_match/total*100:.1f}%** | **{e_match}/{total} = {e_match/total*100:.1f}%** | **{(e_match-b_match)/total*100:+.1f}pp** |")
    lines.append(f"| 总耗时 | {b_total_ms/1000:.1f}s | {e_total_ms/1000:.1f}s | {(e_total_ms-b_total_ms)/1000:+.1f}s |")
    lines.append(f"| 平均每题耗时 | {b_total_ms/total/1000:.1f}s | {e_total_ms/total/1000:.1f}s | {(e_total_ms-b_total_ms)/total/1000:+.1f}s |")
    lines.append("")
    if e_match > b_match:
        lines.append(f"✅ 实验组在结果正确率上比基线提升了 **{(e_match-b_match)/total*100:.1f}个百分点**（从 {b_match/total*100:.0f}% → {e_match/total*100:.0f}%）")
    else:
        lines.append(f"⚠️ 实验组结果正确率为 {e_match/total*100:.1f}%，基线为 {b_match/total*100:.1f}%")
    lines.append("")

    lines.append("## 二、按难度正确率对比")
    lines.append("")
    lines.append("| 难度 | 基线正确率 | 实验组正确率 | 提升 |")
    lines.append("|------|-----------|-------------|------|")
    for d in ["简单", "中等", "困难"]:
        if d in by_difficulty:
            g = by_difficulty[d]
            br = g["b_match"]/g["b_total"]*100 if g["b_total"] else 0
            er = g["e_match"]/g["e_total"]*100 if g["e_total"] else 0
            lines.append(f"| {d} | {g['b_match']}/{g['b_total']} = {br:.0f}% | {g['e_match']}/{g['e_total']} = {er:.0f}% | {er-br:+.0f}pp |")
    lines.append("")

    lines.append("## 三、按问题类型正确率对比")
    lines.append("")
    lines.append("| 问题类型 | 基线正确率 | 实验组正确率 | 提升 |")
    lines.append("|----------|-----------|-------------|------|")
    for t in ["直接统计", "趋势分析", "对比分析", "排名分析", "占比分析", "异常识别"]:
        if t in by_type:
            g = by_type[t]
            br = g["b_match"]/g["b_total"]*100 if g["b_total"] else 0
            er = g["e_match"]/g["e_total"]*100 if g["e_total"] else 0
            lines.append(f"| {t} | {g['b_match']}/{g['b_total']} = {br:.0f}% | {g['e_match']}/{g['e_total']} = {er:.0f}% | {er-br:+.0f}pp |")
    lines.append("")

    lines.append("## 四、逐题结果对比")
    lines.append("")
    lines.append("| # | 问题 | 难度 | 基线 | 实验组 | 变化 |")
    lines.append("|---|------|------|------|--------|------|")
    for qid in all_qids:
        q_text = baseline.get(qid, {}).get("question") or experiment.get(qid, {}).get("question", "")
        diff = baseline.get(qid, {}).get("difficulty") or experiment.get(qid, {}).get("difficulty", "")
        b_ok = _is_true(baseline.get(qid, {}).get("result_match_reference", 0))
        e_ok = _is_true(experiment.get(qid, {}).get("result_match_reference", 0))
        b_icon = "✅" if b_ok else "❌"
        e_icon = "✅" if e_ok else "❌"
        if not b_ok and e_ok:
            change = "🟢 修复"
        elif b_ok and not e_ok:
            change = "🔴 回退"
        elif b_ok and e_ok:
            change = "✅ 保持正确"
        else:
            change = "❌ 仍然错误"
        lines.append(f"| {qid} | {q_text} | {diff} | {b_icon} | {e_icon} | {change} |")
    lines.append("")

    lines.append("## 五、改进题目详情（基线错误 → 实验组正确）")
    lines.append("")
    if improvements:
        for qid, q_text, diff in improvements:
            b_reason = baseline.get(qid, {}).get("mismatch_reason", "")
            lines.append(f"- **{qid}** [{diff}] {q_text}")
            lines.append(f"  - 基线错误原因: {b_reason}")
            lines.append("")
    else:
        lines.append("（无）")
        lines.append("")

    lines.append("## 六、回退题目详情（基线正确 → 实验组错误）")
    lines.append("")
    if regressions:
        for qid, q_text, diff in regressions:
            e_reason = experiment.get(qid, {}).get("mismatch_reason", "")
            lines.append(f"- **{qid}** [{diff}] {q_text}")
            lines.append(f"  - 实验组错误原因: {e_reason}")
            lines.append("")
    else:
        lines.append("（无）🎉")
        lines.append("")

    lines.append("## 七、仍然错误的题目")
    lines.append("")
    if both_wrong:
        for qid, q_text, diff in both_wrong:
            b_reason = baseline.get(qid, {}).get("mismatch_reason", "")
            e_reason = experiment.get(qid, {}).get("mismatch_reason", "")
            lines.append(f"- **{qid}** [{diff}] {q_text}")
            lines.append(f"  - 基线错误: {b_reason}")
            lines.append(f"  - 实验组错误: {e_reason}")
            lines.append("")
    else:
        lines.append("（无）🎉")
        lines.append("")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"✅ 对比报告已保存: {output_path}")
    return {
        "baseline_match_rate": b_match / total * 100,
        "experiment_match_rate": e_match / total * 100,
        "improvement_pp": (e_match - b_match) / total * 100,
        "improvements": len(improvements),
        "regressions": len(regressions),
    }


if __name__ == "__main__":
    result = generate_comparison()
    print(f"\n提升: {result['improvement_pp']:+.1f}pp | 修复{result['improvements']}题 | 回退{result['regressions']}题")
