-- Retail Analytics Database Schema (SQLite)
-- Tables: customer, product, date_dim, order_item
-- Data range: 2025-01-01 ~ 2026-06-30
-- KEY NOTES:
--   order_item is a fact table (one row per product in an order)
--   order_id is NOT a primary key; use COUNT(DISTINCT order_id) for order counts
--   pay_status values: '已支付' (paid), '已退款' (refunded), '未支付' (unpaid)
--   region values: 华东, 华北, 华南, 华中, 西南, 西北, 东北
--   category values: 电子产品, 家居用品, 服装配饰, 食品饮料, 美妆个护
--   channel values: 线上APP, 线下门店, 小程序, 第三方平台
--   member_level values: 普通, 银卡, 金卡, 钻石
--   date format: 'YYYY-MM-DD' (TEXT)
--   amount = unit_price * quantity * discount (discounted actual payment)

CREATE TABLE IF NOT EXISTS customer (
        customer_id   INTEGER PRIMARY KEY,
        customer_name TEXT,
        gender        TEXT,
        age           INTEGER,
        region        TEXT,
        city          TEXT,
        member_level  TEXT,
        register_date TEXT
    );

CREATE TABLE IF NOT EXISTS product (
        product_id   INTEGER PRIMARY KEY,
        product_name TEXT,
        category     TEXT,
        sub_category TEXT,
        brand        TEXT,
        cost_price   REAL,
        sale_price   REAL,
        status       TEXT
    );

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
    );

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
    );
