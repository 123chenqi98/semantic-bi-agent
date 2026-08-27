"""
基线系统批量评测脚本
- 读取 data/samples/test_questions.json 中的 25 条测试问题
- 对每条问题调用 BaselineText2SQL 生成 SQL 并执行
- 将结果与参考 SQL 的执行结果做数值对比
- 输出 CSV 到 outputs/reports/baseline_results.csv
- 同时在屏幕打印进度和简要统计

用法:
  export LLM_API_KEY=xxx && export LLM_BASE_URL=xxx && export LLM_MODEL=xxx
  python3 -m src.evaluation.run_baseline_eval [--limit N] [--start Qid] [--output path]
"""
import os
import sys
import csv
import json
import time
import argparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.agent.baseline_text2sql import BaselineText2SQL
from src.utils.sql_executor import SQLExecutor


BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
QUESTIONS_PATH = os.path.join(BASE_DIR, "data", "samples", "test_questions.json")
DEFAULT_OUTPUT = os.path.join(BASE_DIR, "outputs", "reports", "baseline_results.csv")


def load_questions():
    with open(QUESTIONS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def run_reference_sql(executor, ref_sql):
    """运行参考 SQL，返回标准结果用于对比。"""
    return executor.execute(ref_sql, max_rows=500)


def results_match(generated_result, reference_result, tolerance=0.01):
    """对比生成 SQL 结果与参考 SQL 结果是否匹配。
    返回 (match_bool, reason_str)
    match 判定规则:
      1. 执行必须成功
      2. 列数量一致（允许不同别名）
      3. 行数一致
      4. 数值型列的总和相对误差 <= tolerance；非数值列通过字符串集合比较
    """
    if not generated_result.get("success"):
        return False, f"生成SQL执行失败: {generated_result.get('error')}"
    if not reference_result.get("success"):
        return False, f"参考SQL执行失败: {reference_result.get('error')}"

    g_rows = generated_result["rows"]
    r_rows = reference_result["rows"]
    g_cols = generated_result["columns"]
    r_cols = reference_result["columns"]

    if len(g_rows) != len(r_rows):
        return False, f"行数不一致 生成={len(g_rows)} vs 参考={len(r_rows)}"
    if len(g_cols) != len(r_cols):
        return False, f"列数不一致 生成={len(g_cols)} vs 参考={len(r_cols)}"

    if len(g_rows) == 0 and len(r_rows) == 0:
        return True, "空结果一致"

    # 尝试数值比较：把第一列当 key，其他当 value 做排序后对比
    try:
        def normalize_val(v):
            if v is None:
                return None
            if isinstance(v, (int, float)):
                return float(v)
            try:
                return float(str(v).replace(",", "").replace("%", ""))
            except Exception:
                return str(v).strip()

        def row_to_tuple(row):
            return tuple(normalize_val(v) for v in row)

        g_set = sorted(row_to_tuple(r) for r in g_rows)
        r_set = sorted(row_to_tuple(r) for r in r_rows)

        # 逐行对比
        mismatches = []
        for i, (gr, rr) in enumerate(zip(g_set, r_set)):
            if len(gr) != len(rr):
                mismatches.append(f"第{i}行列数不同")
                continue
            for j, (gv, rv) in enumerate(zip(gr, rr)):
                if gv is None and rv is None:
                    continue
                if isinstance(gv, float) and isinstance(rv, float):
                    denom = max(abs(rv), 1e-9)
                    if abs(gv - rv) / denom > tolerance:
                        mismatches.append(f"行{i}列{j} {gv} vs {rv}")
                        break
                else:
                    if gv != rv:
                        mismatches.append(f"行{i}列{j} '{gv}' vs '{rv}'")
                        break
            if len(mismatches) >= 3:
                break
        if mismatches:
            return False, "数值/文本不一致: " + "; ".join(mismatches[:3])
        return True, "一致"
    except Exception as e:
        return False, f"对比异常: {e}"


def save_results(results, output_path):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    fieldnames = [
        "question_id", "question", "metric_ids", "difficulty", "question_type",
        "generated_sql", "exec_success", "exec_error", "exec_row_count",
        "result_match_reference", "mismatch_reason", "ref_sql",
        "elapsed_ms_llm", "elapsed_ms_sql", "total_elapsed_ms", "timestamp",
    ]
    with open(output_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in results:
            writer.writerow(r)
    print(f"\n💾 结果已保存到: {output_path}")


def main():
    parser = argparse.ArgumentParser(description="批量跑基线 Text-to-SQL 评测")
    parser.add_argument("--limit", type=int, default=0, help="只跑前 N 题 (0=全部)")
    parser.add_argument("--start", type=str, default=None, help="从某个 question_id 开始（如 Q03）")
    parser.add_argument("--output", type=str, default=DEFAULT_OUTPUT, help="输出 CSV 路径")
    parser.add_argument("--temperature", type=float, default=0.0)
    parser.add_argument("--sleep", type=float, default=0.5, help="每题间休息秒数，避免限流")
    args = parser.parse_args()

    questions = load_questions()
    if args.start:
        idx = next((i for i, q in enumerate(questions) if q["id"] == args.start), 0)
        questions = questions[idx:]
    if args.limit and args.limit > 0:
        questions = questions[:args.limit]

    print("=" * 70)
    print(f"  🧪 基线 Text-to-SQL 批量评测")
    print(f"  题目数: {len(questions)}")
    print(f"  输出路径: {args.output}")
    print("=" * 70)

    system = BaselineText2SQL()
    executor = SQLExecutor()
    results = []

    stats = {"total": 0, "exec_success": 0, "result_match": 0}
    t_start_all = time.time()

    for i, q in enumerate(questions, 1):
        qid = q["id"]
        question_text = q["question"]
        ref_sql = q["reference_sql_sqlite"]
        metric_ids = ",".join(q["metric_ids"])

        print(f"\n[{i}/{len(questions)}] {qid} | {q['difficulty']} | {question_text}")

        t0 = time.time()
        try:
            result = system.run(question_text, execute=True, temperature=args.temperature)
            gen_sql = result["generated_sql"]
            exec_res = result["exec_result"]
        except Exception as e:
            gen_sql = f"[LLM 调用失败] {e}"
            exec_res = {"success": False, "error": str(e), "row_count": 0, "rows": [],
                        "columns": [], "elapsed_ms": 0}

        t_gen_end = time.time()
        llm_ms = round((t_gen_end - t0) * 1000 - exec_res.get("elapsed_ms", 0), 1)
        sql_ms = exec_res.get("elapsed_ms", 0)
        total_ms = round((time.time() - t0) * 1000, 1)

        # 运行参考 SQL 对比
        ref_res = run_reference_sql(executor, ref_sql)
        if exec_res["success"] and ref_res["success"]:
            match, reason = results_match(exec_res, ref_res)
        else:
            match = False
            if not exec_res["success"]:
                reason = f"生成SQL失败: {exec_res.get('error')}"
            else:
                reason = f"参考SQL失败: {ref_res.get('error')}"

        exec_success = 1 if exec_res["success"] else 0
        match_flag = 1 if match else 0

        stats["total"] += 1
        stats["exec_success"] += exec_success
        stats["result_match"] += match_flag

        # 输出进度条
        exec_icon = "✅" if exec_success else "❌"
        match_icon = "✅" if match else "❌"
        print(f"   SQL执行: {exec_icon}  结果匹配: {match_icon}  {reason}")
        if not exec_success:
            print(f"   错误: {exec_res.get('error')}")
        print(f"   SQL: {gen_sql[:150]}{'...' if len(gen_sql)>150 else ''}")

        results.append({
            "question_id": qid,
            "question": question_text,
            "metric_ids": metric_ids,
            "difficulty": q["difficulty"],
            "question_type": q["question_type"],
            "generated_sql": gen_sql,
            "exec_success": exec_success,
            "exec_error": exec_res.get("error", ""),
            "exec_row_count": exec_res.get("row_count", 0),
            "result_match_reference": match_flag,
            "mismatch_reason": reason if not match else "",
            "ref_sql": ref_sql,
            "elapsed_ms_llm": llm_ms,
            "elapsed_ms_sql": sql_ms,
            "total_elapsed_ms": total_ms,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        })

        # 每跑完 5 题保存一次（断点续跑容错）
        if i % 5 == 0:
            save_results(results, args.output)

        time.sleep(args.sleep)

    save_results(results, args.output)

    total_t = time.time() - t_start_all
    print("\n" + "=" * 70)
    print("  📊 基线系统评测统计")
    print("=" * 70)
    total = stats["total"]
    exec_rate = stats["exec_success"] / total * 100 if total else 0
    match_rate = stats["result_match"] / total * 100 if total else 0
    print(f"  总题数:           {total}")
    print(f"  SQL执行成功率:    {stats['exec_success']}/{total} = {exec_rate:.1f}%")
    print(f"  结果语义一致率:   {stats['result_match']}/{total} = {match_rate:.1f}%")
    print(f"  总耗时:           {total_t:.1f}s")
    print("=" * 70)

    # 自动生成易读版结果
    print("\n📝 正在生成易读版报告...")
    from src.evaluation.format_results import write_readable_csv, write_markdown_report
    output_dir = os.path.dirname(args.output)
    write_readable_csv(results, os.path.join(output_dir, "baseline_results_readable.csv"))
    write_markdown_report(results, os.path.join(output_dir, "baseline_report.md"))
    print("✅ 全部完成！")


if __name__ == "__main__":
    main()
