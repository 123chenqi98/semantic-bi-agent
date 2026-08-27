"""
快速通路测试：验证 SQL 执行器和结果匹配逻辑工作正常
（不调用 LLM，直接用测试 SQL 模拟）
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.utils.sql_executor import SQLExecutor, format_result_preview
from src.evaluation.run_baseline_eval import results_match


def test_sql_executor():
    ex = SQLExecutor()
    print("=" * 60)
    print("测试 1：上月销售额（正确口径 Q01）")
    print("=" * 60)
    r = ex.execute("""
        SELECT ROUND(SUM(amount), 2) AS sales_amount
        FROM order_item
        WHERE pay_status = '已支付'
          AND order_date BETWEEN '2026-06-01' AND '2026-06-30';
    """)
    print(format_result_preview(r))
    assert r["success"]
    assert r["row_count"] == 1
    print("✅ 正确 SQL 执行通过\n")

    print("=" * 60)
    print("测试 2：错误 SQL（不存在的表名）应报错")
    print("=" * 60)
    r2 = ex.execute("SELECT * FROM not_exist_table;")
    print(format_result_preview(r2))
    assert not r2["success"]
    print("✅ 错误 SQL 正确捕获\n")

    print("=" * 60)
    print("测试 3：Q08 新客数（子查询 + CASE WHEN）")
    print("=" * 60)
    r3 = ex.execute("""
        WITH first_pay AS (
          SELECT customer_id, MIN(order_date) AS first_date
          FROM order_item
          WHERE pay_status = '已支付'
          GROUP BY customer_id
        )
        SELECT CASE
                 WHEN first_date BETWEEN '2025-01-01' AND '2025-03-31' THEN '2025Q1'
                 WHEN first_date BETWEEN '2025-04-01' AND '2025-06-30' THEN '2025Q2'
                 WHEN first_date BETWEEN '2025-07-01' AND '2025-09-30' THEN '2025Q3'
                 WHEN first_date BETWEEN '2025-10-01' AND '2025-12-31' THEN '2025Q4'
               END AS quarter_name,
               COUNT(DISTINCT customer_id) AS new_customer_count
        FROM first_pay
        WHERE first_date BETWEEN '2025-01-01' AND '2025-12-31'
        GROUP BY quarter_name
        ORDER BY quarter_name;
    """)
    print(format_result_preview(r3))
    assert r3["success"]
    assert r3["row_count"] == 4
    print("✅ Q08 新客数 SQL 通过\n")


def test_result_match():
    ex = SQLExecutor()

    print("=" * 60)
    print("测试 4：正确 SQL vs 参考 SQL（应一致）")
    print("=" * 60)
    ref_sql = """
        SELECT ROUND(SUM(amount), 2) AS sales_amount
        FROM order_item
        WHERE pay_status = '已支付'
          AND order_date BETWEEN '2026-06-01' AND '2026-06-30';
    """
    # 正确 SQL（和参考一致，只是别名不同+空白不同）
    same_sql = """
        SELECT round(sum(amount), 2) AS total
        FROM order_item
        WHERE pay_status = '已支付' AND order_date >= '2026-06-01' AND order_date <= '2026-06-30';
    """
    r_ref = ex.execute(ref_sql)
    r_same = ex.execute(same_sql)
    m, reason = results_match(r_same, r_ref)
    print(f"  一致? {m}  原因: {reason}")
    print(f"  参考结果: {r_ref['rows']}")
    print(f"  测试结果: {r_same['rows']}")
    assert m, f"应该一致但不一致: {reason}"
    print("✅ 相同结果判定一致\n")

    print("=" * 60)
    print("测试 5：错误 SQL（忘记过滤 pay_status）vs 参考 SQL（应不一致）")
    print("=" * 60)
    wrong_sql = """
        SELECT ROUND(SUM(amount), 2) AS sales_amount
        FROM order_item
        WHERE order_date BETWEEN '2026-06-01' AND '2026-06-30';
    """
    r_wrong = ex.execute(wrong_sql)
    m2, reason2 = results_match(r_wrong, r_ref)
    print(f"  一致? {m2}  原因: {reason2}")
    print(f"  正确口径: {r_ref['rows'][0]}")
    print(f"  错误口径(含退款+未支付): {r_wrong['rows'][0]}")
    assert not m2, "口径错了应该不一致"
    print("✅ 错误口径被正确识别为不一致\n")

    print("=" * 60)
    print("测试 6：Prompt 构造检查（不调用 LLM）")
    print("=" * 60)
    from src.agent.baseline_text2sql import BaselineText2SQL, load_schema
    # 手动构造一个不调用LLM的实例：把llm设为None，只测试build_prompt
    schema = load_schema()
    print(f"  schema 长度: {len(schema)} 字符")
    b = BaselineText2SQL.__new__(BaselineText2SQL)
    b.schema_text = schema
    prompt = BaselineText2SQL.build_prompt(b, "上月销售额多少？")
    print(f"  user prompt 长度: {len(prompt)} 字符")
    assert "customer" in prompt and "order_item" in prompt
    assert "上月销售额多少？" in prompt
    print("✅ Prompt 构造正确\n")


def main():
    test_sql_executor()
    test_result_match()
    print("=" * 60)
    print("🎉 所有通路测试通过！")
    print("  - SQL 执行器：正常执行正确 SQL，捕获错误 SQL")
    print("  - 结果对比：正确识别一致/不一致（包括未过滤 pay_status 的典型错误）")
    print("  - Prompt 构造：包含完整 schema 和问题")
    print("=" * 60)


if __name__ == "__main__":
    main()
