-- ============================================
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
