"""
验证测试问题集参考 SQL 是否能在真实数据上跑通
"""
import os
import sqlite3
import csv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW_DIR = os.path.join(BASE_DIR, "data", "raw")


def load_csv(conn, table_name, csv_path):
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        cols = reader.fieldnames
        placeholders = ", ".join(["?"] * len(cols))
        col_str = ", ".join(cols)
        conn.execute(f"CREATE TABLE {table_name} ({col_str})")
        for row in reader:
            conn.execute(
                f"INSERT INTO {table_name} VALUES ({placeholders})",
                [row[c] for c in cols]
            )
    conn.commit()


def main():
    conn = sqlite3.connect(":memory:")
    load_csv(conn, "customer", os.path.join(RAW_DIR, "customer.csv"))
    load_csv(conn, "product", os.path.join(RAW_DIR, "product.csv"))
    load_csv(conn, "date", os.path.join(RAW_DIR, "date.csv"))
    load_csv(conn, "order_item", os.path.join(RAW_DIR, "order_item.csv"))
    print("✅ 4 张表载入内存 SQLite 成功")

    tests = {
        "Q01  上月销售额（直接统计）": """
            SELECT ROUND(SUM(amount), 2) AS sales_amount
            FROM order_item
            WHERE pay_status = '已支付'
              AND order_date BETWEEN '2026-06-01' AND '2026-06-30';
        """,
        "Q07  近6个月订单量趋势（月份分组）": """
            SELECT strftime('%Y-%m', order_date) AS month,
                   COUNT(DISTINCT order_id)      AS order_count
            FROM order_item
            WHERE pay_status = '已支付'
              AND order_date BETWEEN '2026-01-01' AND '2026-06-30'
            GROUP BY month
            ORDER BY month;
        """,
        "Q21  7大区域上月销售占比（100%合计校验）": """
            WITH sales_by_region AS (
              SELECT c.region, SUM(oi.amount) AS total_amount
              FROM order_item oi
              LEFT JOIN customer c ON oi.customer_id = c.customer_id
              WHERE oi.pay_status = '已支付'
                AND oi.order_date BETWEEN '2026-06-01' AND '2026-06-30'
              GROUP BY c.region
            ),
            total AS (SELECT SUM(total_amount) AS all_amount FROM sales_by_region)
            SELECT s.region,
                   ROUND(s.total_amount, 2)                       AS sales_amount,
                   ROUND(s.total_amount * 100.0 / t.all_amount, 2) AS share_pct
            FROM sales_by_region s, total t
            ORDER BY share_pct DESC;
        """,
        "Q04  去年金卡订单量（DISTINCT 风险）": """
            SELECT COUNT(DISTINCT oi.order_id) AS order_count
            FROM order_item oi
            LEFT JOIN customer c ON oi.customer_id = c.customer_id
            WHERE oi.pay_status = '已支付'
              AND c.member_level = '金卡'
              AND oi.order_date BETWEEN '2025-01-01' AND '2025-12-31';
        """,
        "Q05  2025年客单价（分母风险）": """
            SELECT ROUND(SUM(amount) * 1.0 / NULLIF(COUNT(DISTINCT order_id), 0), 2) AS aov
            FROM order_item
            WHERE pay_status = '已支付'
              AND order_date BETWEEN '2025-01-01' AND '2025-12-31';
        """,
        "Q08  2025年各季度新客数（首单口径风险）": """
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
        """,
        "Q25  2025年月度复购率（客户维度风险）": """
            WITH monthly_customer_orders AS (
              SELECT strftime('%Y-%m', order_date) AS month,
                     customer_id,
                     COUNT(DISTINCT order_id)      AS order_cnt
              FROM order_item
              WHERE pay_status = '已支付'
                AND order_date BETWEEN '2025-01-01' AND '2025-12-31'
              GROUP BY month, customer_id
            ),
            monthly_repurchase AS (
              SELECT month,
                     COUNT(*)                                         AS total_active_customers,
                     SUM(CASE WHEN order_cnt >= 2 THEN 1 ELSE 0 END) AS repurchase_customers
              FROM monthly_customer_orders
              GROUP BY month
            )
            SELECT month,
                   total_active_customers,
                   repurchase_customers,
                   ROUND(repurchase_customers * 100.0 / NULLIF(total_active_customers, 0), 2) AS repurchase_rate_pct
            FROM monthly_repurchase
            ORDER BY repurchase_rate_pct DESC;
        """,
    }

    for name, sql in tests.items():
        try:
            cur = conn.execute(sql)
            rows = cur.fetchall()
            cols = [d[0] for d in cur.description]
            print(f"\n✅ {name}")
            print("  列名:", cols)
            if len(rows) <= 5:
                for r in rows:
                    print("  行:", r)
            else:
                for r in rows[:3]:
                    print("  行:", r)
                print(f"  ... 共 {len(rows)} 行 (显示前3行)")
        except Exception as e:
            print(f"\n❌ {name}")
            print("  错误:", type(e).__name__, str(e))

    print("\n" + "=" * 60)
    print("验证完成")
    conn.close()


if __name__ == "__main__":
    main()
