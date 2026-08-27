"""
数据库初始化脚本
- 将 data/raw/ 下的 4 个 CSV 文件导入到 data/processed/retail.db (SQLite)
- 同时导出 DDL schema 到 src/semantic_layer/schema.sql（供 LLM 基线 Text-to-SQL 使用）
"""
import os
import sqlite3
import csv
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW_DIR = os.path.join(BASE_DIR, "data", "raw")
PROCESSED_DIR = os.path.join(BASE_DIR, "data", "processed")
SEMANTIC_DIR = os.path.join(BASE_DIR, "src", "semantic_layer")
DB_PATH = os.path.join(PROCESSED_DIR, "retail.db")
SCHEMA_PATH = os.path.join(SEMANTIC_DIR, "schema.sql")

os.makedirs(PROCESSED_DIR, exist_ok=True)


DDL_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS customer (
        customer_id   INTEGER PRIMARY KEY,
        customer_name TEXT,
        gender        TEXT,
        age           INTEGER,
        region        TEXT,
        city          TEXT,
        member_level  TEXT,
        register_date TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS product (
        product_id   INTEGER PRIMARY KEY,
        product_name TEXT,
        category     TEXT,
        sub_category TEXT,
        brand        TEXT,
        cost_price   REAL,
        sale_price   REAL,
        status       TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS date_dim (
        date_id       INTEGER PRIMARY KEY,
        date          TEXT,
        year          INTEGER,
        month         INTEGER,
        quarter       INTEGER,
        season_name   TEXT,
        month_name    TEXT,
        week_of_year  INTEGER,
        weekday       INTEGER,
        is_weekend    INTEGER,
        is_month_end  INTEGER
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS order_item (
        order_id    INTEGER,
        date_id     INTEGER,
        order_date  TEXT,
        customer_id INTEGER,
        product_id  INTEGER,
        quantity    INTEGER,
        unit_price  REAL,
        discount    REAL,
        amount      REAL,
        channel     TEXT,
        pay_status  TEXT,
        FOREIGN KEY (customer_id) REFERENCES customer(customer_id),
        FOREIGN KEY (product_id)  REFERENCES product(product_id),
        FOREIGN KEY (date_id)     REFERENCES date_dim(date_id)
    )
    """,
]


def import_csv(conn, table_name, csv_path, replace_table=True):
    if replace_table:
        conn.execute(f"DROP TABLE IF EXISTS {table_name}")

    if table_name == "date_dim":
        ddl = DDL_STATEMENTS[2]
    elif table_name == "customer":
        ddl = DDL_STATEMENTS[0]
    elif table_name == "product":
        ddl = DDL_STATEMENTS[1]
    elif table_name == "order_item":
        ddl = DDL_STATEMENTS[3]
    else:
        raise ValueError(f"unknown table: {table_name}")
    conn.execute(ddl)

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        cols = reader.fieldnames
        placeholders = ", ".join(["?"] * len(cols))
        col_str = ", ".join(cols)
        rows = []
        for row in reader:
            rows.append([row[c] for c in cols])
        conn.executemany(
            f"INSERT INTO {table_name} ({col_str}) VALUES ({placeholders})", rows
        )
    conn.commit()
    return len(rows)


def main():
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
        print(f"已删除旧数据库: {DB_PATH}")

    conn = sqlite3.connect(DB_PATH)

    files_to_import = [
        ("customer",   os.path.join(RAW_DIR, "customer.csv")),
        ("product",    os.path.join(RAW_DIR, "product.csv")),
        ("date_dim",   os.path.join(RAW_DIR, "date.csv")),
        ("order_item", os.path.join(RAW_DIR, "order_item.csv")),
    ]
    for tbl, path in files_to_import:
        cnt = import_csv(conn, tbl, path)
        print(f"✅ 导入 {tbl}: {cnt} 行 <- {os.path.basename(path)}")

    # 创建一些常用索引，加速查询
    conn.execute("CREATE INDEX IF NOT EXISTS idx_oi_order_date ON order_item(order_date)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_oi_customer   ON order_item(customer_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_oi_product    ON order_item(product_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_oi_pay_status ON order_item(pay_status)")
    conn.commit()
    print("✅ 常用索引已创建")

    # 验证基本数据
    for tbl in ["customer", "product", "date_dim", "order_item"]:
        cnt = conn.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0]
        print(f"   {tbl}: {cnt} 行")

    # 导出 schema.sql
    schema_lines = []
    for ddl in DDL_STATEMENTS:
        schema_lines.append(ddl.strip() + ";")
    schema_sql = "\n\n".join(schema_lines)
    with open(SCHEMA_PATH, "w", encoding="utf-8") as f:
        f.write("-- 零售经营分析数据库 Schema (SQLite)\n")
        f.write("-- 表名: customer, product, date_dim, order_item\n")
        f.write("-- 数据时间范围: 2025-01-01 ~ 2026-06-30\n\n")
        f.write(schema_sql)
        f.write("\n")
    print(f"\n✅ DDL schema 已导出到 {SCHEMA_PATH}")

    # 为方便 LLM 理解，额外生成一个带中文字段注释的 schema 说明文本
    schema_commented = """-- ============================================
-- 经营分析数据库 · Schema 说明（供 LLM Text-to-SQL 使用）
-- ============================================
-- 数据库: SQLite
-- 数据范围: 2025-01-01 至 2026-06-30
-- 事实表: order_item（订单明细，一个商品一行）
-- 维度表: customer（客户）、product（商品）、date_dim（日期）
-- 关联关系:
--   order_item.customer_id -> customer.customer_id
--   order_item.product_id  -> product.product_id
--   order_item.date_id     -> date_dim.date_id
-- 注意: order_id 不是主键（同一订单多商品共享 order_id），
--       统计订单数时必须用 COUNT(DISTINCT order_id)
-- ============================================

CREATE TABLE customer (
    customer_id   INTEGER PRIMARY KEY,  -- 客户ID
    customer_name TEXT,                 -- 客户姓名
    gender        TEXT,                 -- 性别: '男' / '女'
    age           INTEGER,              -- 年龄
    region        TEXT,                 -- 区域: 华东/华北/华南/华中/西南/西北/东北
    city          TEXT,                 -- 城市
    member_level  TEXT,                 -- 会员等级: 普通/银卡/金卡/钻石
    register_date TEXT                  -- 注册日期 'YYYY-MM-DD'
);

CREATE TABLE product (
    product_id   INTEGER PRIMARY KEY,   -- 商品ID
    product_name TEXT,                  -- 商品名称
    category     TEXT,                  -- 一级品类: 电子产品/家居用品/服装配饰/食品饮料/美妆个护
    sub_category TEXT,                  -- 二级子品类
    brand        TEXT,                  -- 品牌
    cost_price   REAL,                  -- 成本价
    sale_price   REAL,                  -- 标准售价
    status       TEXT                   -- 商品状态: '在售' / '下架'
);

CREATE TABLE date_dim (
    date_id       INTEGER PRIMARY KEY,  -- 日期ID
    date          TEXT,                 -- 日期 'YYYY-MM-DD'
    year          INTEGER,              -- 年
    month         INTEGER,              -- 月 (1-12)
    quarter       INTEGER,              -- 季度 (1-4)
    season_name   TEXT,                 -- 季度名 如 '2025Q1'
    month_name    TEXT,                 -- 月份名 如 '2025-01'
    week_of_year  INTEGER,              -- 年内周序号
    weekday       INTEGER,              -- 周几 (1=周一,7=周日)
    is_weekend    INTEGER,              -- 是否周末 (1/0)
    is_month_end  INTEGER               -- 是否月末 (1/0)
);

CREATE TABLE order_item (
    order_id    INTEGER,                -- 订单号（多商品共享同一order_id）
    date_id     INTEGER,                -- 日期ID -> date_dim.date_id
    order_date  TEXT,                   -- 下单日期 'YYYY-MM-DD'（冗余字段）
    customer_id INTEGER,                -- 客户ID -> customer.customer_id
    product_id  INTEGER,                -- 商品ID -> product.product_id
    quantity    INTEGER,                -- 购买数量
    unit_price  REAL,                   -- 成交单价（折扣前）
    discount    REAL,                   -- 折扣率 (1.00=无折扣, 0.8=8折)
    amount      REAL,                   -- 行金额（折后实付）= unit_price*quantity*discount
    channel     TEXT,                   -- 销售渠道: 线上APP/线下门店/小程序/第三方平台
    pay_status  TEXT,                   -- 支付状态: '已支付'/'已退款'/'未支付'
    FOREIGN KEY (customer_id) REFERENCES customer(customer_id),
    FOREIGN KEY (product_id)  REFERENCES product(product_id),
    FOREIGN KEY (date_id)     REFERENCES date_dim(date_id)
);

-- === 字段值枚举提示 ===
-- region 取值: 华东, 华北, 华南, 华中, 西南, 西北, 东北
-- category 取值: 电子产品, 家居用品, 服装配饰, 食品饮料, 美妆个护
-- channel 取值: 线上APP, 线下门店, 小程序, 第三方平台
-- member_level 取值: 普通, 银卡, 金卡, 钻石
-- pay_status 取值: 已支付, 已退款, 未支付
"""
    commented_path = os.path.join(SEMANTIC_DIR, "schema_commented.sql")
    with open(commented_path, "w", encoding="utf-8") as f:
        f.write(schema_commented)
    print(f"✅ 带注释 schema 已导出到 {commented_path}")

    conn.close()
    print(f"\n🎉 数据库初始化完成: {DB_PATH}")


if __name__ == "__main__":
    main()
