# 🧪 基线 Text-to-SQL 评测报告

**评测时间**: 2026-08-20 15:38:32
**评测题目**: 25 题

## 一、核心指标汇总

| 指标 | 数值 | 说明 |
|------|------|------|
| SQL 语法执行成功率 | **25/25 = 100.0%** | LLM生成的SQL能在数据库上成功执行 |
| 结果语义一致率 | **11/25 = 44.0%** | 执行结果与参考答案数值一致 |
| 总耗时 | 109.6s | 平均每题 4.4s |

## 二、按难度正确率

| 难度 | 正确数/总数 | 正确率 |
|------|------------|--------|
| 简单 | 0/1 | 0.0% |
| 中等 | 9/18 | 50.0% |
| 困难 | 2/6 | 33.3% |

## 三、按问题类型正确率

| 问题类型 | 正确数/总数 | 正确率 |
|----------|------------|--------|
| 直接统计 | 3/5 | 60.0% |
| 趋势分析 | 0/5 | 0.0% |
| 对比分析 | 2/5 | 40.0% |
| 排名分析 | 4/5 | 80.0% |
| 占比分析 | 1/3 | 33.3% |
| 异常识别 | 1/2 | 50.0% |

## 四、错误类型分布（共14题错误）

| 错误类型 | 题数 | 涉及题号 |
|----------|------|----------|
| 🕐 时间语义错误 | 2 | Q01, Q02 |
| 📏 指标口径错误 | 3 | Q08, Q12, Q22 |
| 📋 结果结构/格式错误 | 6 | Q06, Q07, Q09, Q10, Q21, Q25 |
| 🏷 文本标签不一致 | 1 | Q14 |
| ❓ 其他错误 | 2 | Q13, Q18 |

## 五、每题结果概览

| # | 问题 | 难度 | 执行 | 匹配 | 错误类型 | 耗时 |
|---|------|------|------|------|----------|------|
| Q01 | 上月销售额多少？ | 简单 | ✅ | ❌ | 🕐 时间语义错误 | 2.7s |
| Q02 | 今年上半年华东区域的销售额是多少？ | 中等 | ✅ | ❌ | 🕐 时间语义错误 | 3.7s |
| Q03 | 2025年Q4电子产品的销售额是多少？ | 中等 | ✅ | ✅ |  | 2.2s |
| Q04 | 去年金卡会员的订单量是多少？ | 中等 | ✅ | ✅ |  | 2.3s |
| Q05 | 2025年全年的客单价是多少？ | 中等 | ✅ | ✅ |  | 1.4s |
| Q06 | 2025年每个月的销售额变化趋势是怎样的？ | 中等 | ✅ | ❌ | 📋 结果结构/格式错误 | 13.1s |
| Q07 | 近6个月的订单量变化趋势 | 中等 | ✅ | ❌ | 📋 结果结构/格式错误 | 2.4s |
| Q08 | 2025年各季度新客数的变化情况 | 困难 | ✅ | ❌ | 📏 指标口径错误 | 15.8s |
| Q09 | 2025年每个月的客单价，同时给出同比上月的环比变化 | 困难 | ✅ | ❌ | 📋 结果结构/格式错误 | 4.6s |
| Q10 | 各渠道按季度的销售额变化趋势 | 困难 | ✅ | ❌ | 📋 结果结构/格式错误 | 3.0s |
| Q11 | 华东和华北2025年全年的销售额对比 | 中等 | ✅ | ✅ |  | 3.4s |
| Q12 | 金卡会员和普通会员在2025年Q4的订单量对比 | 中等 | ✅ | ❌ | 📏 指标口径错误 | 2.6s |
| Q13 | 线上APP渠道和线下门店渠道，哪个客单价更高？ | 中等 | ✅ | ❌ | ❓ 其他错误 | 2.1s |
| Q14 | 2025年全年 vs 2026年上半年的销售额对比 | 中等 | ✅ | ❌ | 🏷 文本标签不一致 | 3.9s |
| Q15 | 五大一级品类2025年全年销售额对比 | 中等 | ✅ | ✅ |  | 2.4s |
| Q16 | 一级品类中，销售额最高的Top3是哪些？（2025全年） | 中等 | ✅ | ✅ |  | 2.9s |
| Q17 | 2026年上半年订单量最多的前5个城市是哪些？ | 中等 | ✅ | ✅ |  | 2.6s |
| Q18 | 按区域来看，客单价最高的3个区域是？ | 中等 | ✅ | ❌ | ❓ 其他错误 | 2.2s |
| Q19 | 2025年新增付费客户数最多的10个城市 | 困难 | ✅ | ✅ |  | 2.6s |
| Q20 | 2025年销售额最低的5个品牌 | 中等 | ✅ | ✅ |  | 2.2s |
| Q21 | 7大区域的销售额占比（上月） | 中等 | ✅ | ❌ | 📋 结果结构/格式错误 | 4.8s |
| Q22 | 2025年各渠道的订单量占比 | 中等 | ✅ | ❌ | 📏 指标口径错误 | 3.2s |
| Q23 | 电子产品一级品类下，5个二级子品类的销售额占比（2025全年） | 中等 | ✅ | ✅ |  | 5.1s |
| Q24 | 2025年哪个月的销售额环比上月跌幅最大？ | 困难 | ✅ | ✅ |  | 5.7s |
| Q25 | 2025年复购率最高和最低的月份分别是？ | 困难 | ✅ | ❌ | 📋 结果结构/格式错误 | 12.8s |

## 六、错题详情

### 1. Q01 | 上月销售额多少？

- **难度**: 简单 | **类型**: 直接统计
- **错误分类**: 🕐 时间语义错误
- **错误详情**: 数值/文本不一致: 行0列0 'None' vs '5508311.27'
- **LLM生成的SQL**:
```sql
SELECT SUM(amount) AS last_month_sales_amount
FROM order_item
WHERE pay_status = '已支付'
  AND strftime('%Y-%m', order_date) = strftime('%Y-%m', date('now', '-1 month'));
```
- **参考SQL**:
```sql
SELECT ROUND(SUM(amount), 2) AS sales_amount FROM order_item WHERE pay_status = '已支付' AND order_date BETWEEN '2026-06-01' AND '2026-06-30';
```

### 2. Q02 | 今年上半年华东区域的销售额是多少？

- **难度**: 中等 | **类型**: 直接统计
- **错误分类**: 🕐 时间语义错误
- **错误详情**: 数值/文本不一致: 行0列0 757782.45 vs 4441166.8
- **LLM生成的SQL**:
```sql
SELECT SUM(amount) AS east_china_h1_sales
FROM order_item
JOIN customer ON order_item.customer_id = customer.customer_id
WHERE customer.region = '华东'
  AND order_item.pay_status = '已支付'
  AND strftime('%Y', order_item.order_date) = '2025'
  AND strftime('%m', order_item.order_date) BETWEEN '01' AND '06';
```
- **参考SQL**:
```sql
SELECT ROUND(SUM(oi.amount), 2) AS sales_amount FROM order_item oi LEFT JOIN customer c ON oi.customer_id = c.customer_id WHERE oi.pay_status = '已支付' AND c.region = '华东' AND oi.order_date BETWEEN '2026-01-01' AND '2026-06-30';
```

### 3. Q06 | 2025年每个月的销售额变化趋势是怎样的？

- **难度**: 中等 | **类型**: 趋势分析
- **错误分类**: 📋 结果结构/格式错误
- **错误详情**: 列数不一致 生成=3 vs 参考=2
- **LLM生成的SQL**:
```sql
SELECT
    strftime('%Y-%m', order_date) AS month,
    SUM(amount) AS sales_amount,
    COUNT(DISTINCT order_id) AS order_count
FROM order_item
WHERE pay_status = '已支付'
  AND strftime('%Y', order_date) = '2025'
GROUP BY strftime('%Y-%m', order_date)
ORDER BY month;
```
- **参考SQL**:
```sql
SELECT strftime('%Y-%m', order_date) AS month, ROUND(SUM(amount), 2) AS sales_amount FROM order_item WHERE pay_status = '已支付' AND order_date BETWEEN '2025-01-01' AND '2025-12-31' GROUP BY month ORDER BY month;
```

### 4. Q07 | 近6个月的订单量变化趋势

- **难度**: 中等 | **类型**: 趋势分析
- **错误分类**: 📋 结果结构/格式错误
- **错误详情**: 行数不一致 生成=12 vs 参考=6
- **LLM生成的SQL**:
```sql
SELECT
    strftime('%Y-%m', order_date) AS month,
    COUNT(DISTINCT order_id) AS order_count
FROM order_item
WHERE pay_status = '已支付'
  AND order_date >= date('2026-01-01', '-6 months')
  AND order_date <= '2026-06-30'
GROUP BY strftime('%Y-%m', order_date)
ORDER BY month;
```
- **参考SQL**:
```sql
SELECT strftime('%Y-%m', order_date) AS month, COUNT(DISTINCT order_id) AS order_count FROM order_item WHERE pay_status = '已支付' AND order_date BETWEEN '2026-01-01' AND '2026-06-30' GROUP BY month ORDER BY month;
```

### 5. Q08 | 2025年各季度新客数的变化情况

- **难度**: 困难 | **类型**: 趋势分析
- **错误分类**: 📏 指标口径错误
- **错误详情**: 数值/文本不一致: 行0列0 '1.0' vs '2025Q1'; 行1列0 '2.0' vs '2025Q2'; 行2列0 '3.0' vs '2025Q3'
- **LLM生成的SQL**:
```sql
SELECT
    d.quarter AS quarter,
    COUNT(DISTINCT c.customer_id) AS new_customer_count
FROM customer c
INNER JOIN date_dim d
    ON strftime('%Y-%m-%d', c.register_date) = d.date
WHERE d.year = 2025
GROUP BY d.quarter
ORDER BY d.quarter;
```
- **参考SQL**:
```sql
WITH first_pay AS (SELECT customer_id, MIN(order_date) AS first_date FROM order_item WHERE pay_status = '已支付' GROUP BY customer_id) SELECT CASE WHEN first_date BETWEEN '2025-01-01' AND '2025-03-31' THEN '2025Q1' WHEN first_date BETWEEN '2025-04-01' AND '2025-06-30' THEN '2025Q2' WHEN first_date BETWEEN '2025-07-01' AND '2025-09-30' THEN '2025Q3' WHEN first_date BETWEEN '2025-10-01' AND '2025-12-31' THEN '2025Q4' END AS quarter_name, COUNT(DISTINCT customer_id) AS new_customer_count FROM first_pay WHERE first_date BETWEEN '2025-01-01' AND '2025-12-31' GROUP BY quarter_name ORDER BY quarter_name;
```

### 6. Q09 | 2025年每个月的客单价，同时给出同比上月的环比变化

- **难度**: 困难 | **类型**: 趋势分析
- **错误分类**: 📋 结果结构/格式错误
- **错误详情**: 列数不一致 生成=5 vs 参考=4
- **LLM生成的SQL**:
```sql
WITH monthly_metrics AS (
    SELECT
        strftime('%Y-%m', order_date) AS year_month,
        SUM(amount) AS total_sales,
        COUNT(DISTINCT order_id) AS order_count,
        SUM(amount) / COUNT(DISTINCT order_id) AS aov
    FROM order_item
    WHERE strftime('%Y', order_date) = '2025'
      AND pay_status = '已支付'
    GROUP BY strftime('%Y-%m', order_date)
)
SELECT
    year_month,
    total_sales,
    order_count,
    ROUND(aov, 2) AS aov,
    ROUND(
        (aov - LAG(aov) OVER (ORDER BY year_month)) / LAG(aov) OVER (ORDER BY year_month) * 100,
        2
    ) AS mom_change_pct
FROM monthly_metrics
ORDER BY year_month;
```
- **参考SQL**:
```sql
WITH monthly_aov AS (SELECT strftime('%Y-%m', order_date) AS month, ROUND(SUM(amount) * 1.0 / NULLIF(COUNT(DISTINCT order_id), 0), 2) AS aov FROM order_item WHERE pay_status = '已支付' AND order_date BETWEEN '2025-01-01' AND '2025-12-31' GROUP BY month) SELECT month, aov, LAG(aov) OVER (ORDER BY month) AS prev_aov, ROUND((aov - LAG(aov) OVER (ORDER BY month)) * 100.0 / NULLIF(LAG(aov) OVER (ORDER BY month), 0), 2) AS mom_change_pct FROM monthly_aov ORDER BY month;
```

### 7. Q10 | 各渠道按季度的销售额变化趋势

- **难度**: 困难 | **类型**: 趋势分析
- **错误分类**: 📋 结果结构/格式错误
- **错误详情**: 列数不一致 生成=4 vs 参考=3
- **LLM生成的SQL**:
```sql
SELECT
    d.year AS year,
    d.quarter AS quarter,
    o.channel AS channel,
    SUM(o.amount) AS sales_amount
FROM order_item o
JOIN date_dim d ON o.date_id = d.date_id
WHERE o.pay_status = '已支付'
GROUP BY d.year, d.quarter, o.channel
ORDER BY d.year, d.quarter, o.channel;
```
- **参考SQL**:
```sql
SELECT channel, CASE WHEN order_date BETWEEN '2025-01-01' AND '2025-03-31' THEN '2025Q1' WHEN order_date BETWEEN '2025-04-01' AND '2025-06-30' THEN '2025Q2' WHEN order_date BETWEEN '2025-07-01' AND '2025-09-30' THEN '2025Q3' WHEN order_date BETWEEN '2025-10-01' AND '2025-12-31' THEN '2025Q4' WHEN order_date BETWEEN '2026-01-01' AND '2026-03-31' THEN '2026Q1' WHEN order_date BETWEEN '2026-04-01' AND '2026-06-30' THEN '2026Q2' END AS quarter_name, ROUND(SUM(amount), 2) AS sales_amount FROM order_item WHERE pay_status = '已支付' AND order_date BETWEEN '2025-01-01' AND '2026-06-30' GROUP BY channel, quarter_name ORDER BY channel, quarter_name;
```

### 8. Q12 | 金卡会员和普通会员在2025年Q4的订单量对比

- **难度**: 中等 | **类型**: 对比分析
- **错误分类**: 📏 指标口径错误
- **错误详情**: 数值/文本不一致: 行0列1 1028.0 vs 955.0; 行1列1 291.0 vs 265.0
- **LLM生成的SQL**:
```sql
SELECT
    c.member_level,
    COUNT(DISTINCT o.order_id) AS order_count
FROM order_item o
JOIN customer c ON o.customer_id = c.customer_id
JOIN date_dim d ON o.date_id = d.date_id
WHERE c.member_level IN ('金卡', '普通')
  AND d.year = 2025
  AND d.quarter = 4
GROUP BY c.member_level;
```
- **参考SQL**:
```sql
SELECT c.member_level, COUNT(DISTINCT oi.order_id) AS order_count FROM order_item oi LEFT JOIN customer c ON oi.customer_id = c.customer_id WHERE oi.pay_status = '已支付' AND c.member_level IN ('金卡', '普通') AND oi.order_date BETWEEN '2025-10-01' AND '2025-12-31' GROUP BY c.member_level;
```

### 9. Q13 | 线上APP渠道和线下门店渠道，哪个客单价更高？

- **难度**: 中等 | **类型**: 对比分析
- **错误分类**: ❓ 其他错误
- **错误详情**: 数值/文本不一致: 行0列1 5754.12700220022 vs 5532.46; 行1列1 6158.4554234150855 vs 6227.12
- **LLM生成的SQL**:
```sql
SELECT
    channel,
    SUM(amount) / COUNT(DISTINCT order_id) AS aov
FROM order_item
WHERE channel IN ('线上APP', '线下门店')
  AND pay_status = '已支付'
GROUP BY channel
ORDER BY aov DESC;
```
- **参考SQL**:
```sql
SELECT channel, ROUND(SUM(amount) * 1.0 / NULLIF(COUNT(DISTINCT order_id), 0), 2) AS aov FROM order_item WHERE pay_status = '已支付' AND channel IN ('线上APP', '线下门店') AND order_date BETWEEN '2026-06-01' AND '2026-06-30' GROUP BY channel ORDER BY aov DESC;
```

### 10. Q14 | 2025年全年 vs 2026年上半年的销售额对比

- **难度**: 中等 | **类型**: 对比分析
- **错误分类**: 🏷 文本标签不一致
- **错误详情**: 数值/文本不一致: 行0列0 '2025年全年' vs '2025全年'; 行1列0 '2026年上半年' vs '2026上半年'
- **LLM生成的SQL**:
```sql
SELECT
    CASE
        WHEN strftime('%Y', order_date) = '2025' THEN '2025年全年'
        WHEN strftime('%Y', order_date) = '2026' AND strftime('%m', order_date) BETWEEN '01' AND '06' THEN '2026年上半年'
    END AS period,
    SUM(amount) AS sales_amount
FROM order_item
WHERE pay_status = '已支付'
  AND (
      (strftime('%Y', order_date) = '2025')
      OR
      (strftime('%Y', order_date) = '2026' AND strftime('%m', order_date) BETWEEN '01' AND '06')
  )
GROUP BY period
ORDER BY period;
```
- **参考SQL**:
```sql
SELECT CASE WHEN order_date BETWEEN '2025-01-01' AND '2025-12-31' THEN '2025全年' WHEN order_date BETWEEN '2026-01-01' AND '2026-06-30' THEN '2026上半年' END AS period_name, ROUND(SUM(amount), 2) AS sales_amount FROM order_item WHERE pay_status = '已支付' AND (order_date BETWEEN '2025-01-01' AND '2025-12-31' OR order_date BETWEEN '2026-01-01' AND '2026-06-30') GROUP BY period_name;
```

### 11. Q18 | 按区域来看，客单价最高的3个区域是？

- **难度**: 中等 | **类型**: 排名分析
- **错误分类**: ❓ 其他错误
- **错误详情**: 数值/文本不一致: 行0列1 6155.386891105569 vs 7194.69; 行1列0 '华中' vs '西北'; 行2列1 6231.523650503202 vs 6342.8
- **LLM生成的SQL**:
```sql
SELECT c.region,
       SUM(oi.amount) / COUNT(DISTINCT oi.order_id) AS aov
FROM order_item oi
JOIN customer c ON oi.customer_id = c.customer_id
WHERE oi.pay_status = '已支付'
GROUP BY c.region
ORDER BY aov DESC
LIMIT 3;
```
- **参考SQL**:
```sql
SELECT c.region, ROUND(SUM(oi.amount) * 1.0 / NULLIF(COUNT(DISTINCT oi.order_id), 0), 2) AS aov FROM order_item oi LEFT JOIN customer c ON oi.customer_id = c.customer_id WHERE oi.pay_status = '已支付' AND oi.order_date BETWEEN '2026-06-01' AND '2026-06-30' GROUP BY c.region ORDER BY aov DESC LIMIT 3;
```

### 12. Q21 | 7大区域的销售额占比（上月）

- **难度**: 中等 | **类型**: 占比分析
- **错误分类**: 📋 结果结构/格式错误
- **错误详情**: 行数不一致 生成=0 vs 参考=7
- **LLM生成的SQL**:
```sql
WITH last_month_sales AS (
    SELECT 
        c.region,
        SUM(oi.amount) AS region_sales
    FROM order_item oi
    JOIN customer c ON oi.customer_id = c.customer_id
    WHERE oi.pay_status = '已支付'
      AND strftime('%Y-%m', oi.order_date) = strftime('%Y-%m', date('now', '-1 month'))
    GROUP BY c.region
),
total_sales AS (
    SELECT SUM(region_sales) AS total FROM last_month_sales
)
SELECT 
    lms.region,
    lms.region_sales,
    ROUND(lms.region_sales / ts.total * 100, 2) AS sales_percentage
FROM last_month_sales lms, total_sales ts
ORDER BY sales_percentage DESC;
```
- **参考SQL**:
```sql
WITH sales_by_region AS (SELECT c.region, SUM(oi.amount) AS total_amount FROM order_item oi LEFT JOIN customer c ON oi.customer_id = c.customer_id WHERE oi.pay_status = '已支付' AND oi.order_date BETWEEN '2026-06-01' AND '2026-06-30' GROUP BY c.region), total AS (SELECT SUM(total_amount) AS all_amount FROM sales_by_region) SELECT s.region, ROUND(s.total_amount, 2) AS sales_amount, ROUND(s.total_amount * 100.0 / t.all_amount, 2) AS share_pct FROM sales_by_region s, total t ORDER BY share_pct DESC;
```

### 13. Q22 | 2025年各渠道的订单量占比

- **难度**: 中等 | **类型**: 占比分析
- **错误分类**: 📏 指标口径错误
- **错误详情**: 数值/文本不一致: 行0列1 820.0 vs 767.0; 行1列1 619.0 vs 579.0; 行2列1 1636.0 vs 1505.0
- **LLM生成的SQL**:
```sql
WITH channel_orders AS (
    SELECT
        channel,
        COUNT(DISTINCT order_id) AS order_count
    FROM order_item
    WHERE strftime('%Y', order_date) = '2025'
    GROUP BY channel
),
total_orders AS (
    SELECT SUM(order_count) AS total_count
    FROM channel_orders
)
SELECT
    co.channel,
    co.order_count,
    ROUND(co.order_count * 100.0 / to2.total_count, 2) AS order_percentage
FROM channel_orders co
CROSS JOIN total_orders to2
ORDER BY order_percentage DESC;
```
- **参考SQL**:
```sql
WITH orders_by_channel AS (SELECT channel, COUNT(DISTINCT order_id) AS order_cnt FROM order_item WHERE pay_status = '已支付' AND order_date BETWEEN '2025-01-01' AND '2025-12-31' GROUP BY channel), total AS (SELECT SUM(order_cnt) AS all_cnt FROM orders_by_channel) SELECT o.channel, o.order_cnt AS order_count, ROUND(o.order_cnt * 100.0 / t.all_cnt, 2) AS share_pct FROM orders_by_channel o, total t ORDER BY share_pct DESC;
```

### 14. Q25 | 2025年复购率最高和最低的月份分别是？

- **难度**: 困难 | **类型**: 异常识别
- **错误分类**: 📋 结果结构/格式错误
- **错误详情**: 行数不一致 生成=2 vs 参考=12
- **LLM生成的SQL**:
```sql
WITH monthly_first_purchase AS (
    SELECT 
        customer_id,
        MIN(strftime('%Y-%m', order_date)) AS first_purchase_month
    FROM order_item
    WHERE pay_status = '已支付'
      AND strftime('%Y', order_date) = '2025'
    GROUP BY customer_id
),
monthly_new_customers AS (
    SELECT 
        first_purchase_month AS month,
        COUNT(DISTINCT customer_id) AS new_customer_count
    FROM monthly_first_purchase
    GROUP BY first_purchase_month
),
monthly_repurchase AS (
    SELECT 
        strftime('%Y-%m', o.order_date) AS month,
        COUNT(DISTINCT o.customer_id) AS repurchase_customer_count
    FROM order_item o
    JOIN monthly_first_purchase mfp
        ON o.customer_id = mfp.customer_id
       AND strftime('%Y-%m', o.order_date) > mfp.first_purchase_month
    WHERE o.pay_status = '已支付'
      AND strftime('%Y', o.order_date) = '2025'
    GROUP BY strftime('%Y-%m', o.order_date)
),
monthly_repurchase_rate AS (
    SELECT 
        mn.month,
        COALESCE(mr.repurchase_customer_count, 0) * 1.0 / mn.new_customer_count AS repurchase_rate
    FROM monthly_new_customers mn
    LEFT JOIN monthly_repurchase mr ON mn.month = mr.month
)
SELECT 
    month,
    repurchase_rate,
    CASE 
        WHEN repurchase_rate = (SELECT MAX(repurchase_rate) FROM monthly_repurchase_rate) THEN '最高复购率月份'
        WHEN repurchase_rate = (SELECT MIN(repurchase_rate) FROM monthly_repurchase_rate) THEN '最低复购率月份'
    END AS rate_type
FROM monthly_repurchase_rate
WHERE repurchase_rate IN (
    SELECT MAX(repurchase_rate) FROM monthly_repurchase_rate
    UNION
    SELECT MIN(repurchase_rate) FROM monthly_repurchase_rate
)
ORDER BY repurchase_rate DESC;
```
- **参考SQL**:
```sql
WITH monthly_customer_orders AS (SELECT strftime('%Y-%m', order_date) AS month, customer_id, COUNT(DISTINCT order_id) AS order_cnt FROM order_item WHERE pay_status = '已支付' AND order_date BETWEEN '2025-01-01' AND '2025-12-31' GROUP BY month, customer_id), monthly_repurchase AS (SELECT month, COUNT(*) AS total_active_customers, SUM(CASE WHEN order_cnt >= 2 THEN 1 ELSE 0 END) AS repurchase_customers FROM monthly_customer_orders GROUP BY month) SELECT month, total_active_customers, repurchase_customers, ROUND(repurchase_customers * 100.0 / NULLIF(total_active_customers, 0), 2) AS repurchase_rate_pct FROM monthly_repurchase ORDER BY repurchase_rate_pct DESC;
```
