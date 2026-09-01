import type { Metric, EvaluationResult } from '../types';

// 指标词典数据（来自真实metric_semantics.json）
export const metrics: Metric[] = [
  {
    id: 'M01',
    name: '销售额',
    definition: '已支付订单的商品金额总和，单位：元',
    sql_template: "SUM(amount) WHERE pay_status = '已支付'",
    aliases: ['销售额', 'GMV', '营收', '成交金额', '销售总额', '流水'],
    confusing_notes: [
      '必须过滤 pay_status = \'已支付\'，已退款/未支付订单不计入',
      '不要用 COUNT(*) 统计，必须用 SUM(amount)',
      '同一订单有多条商品明细时直接 SUM 即可（order_item 表每行是一个商品）',
    ]
  },
  {
    id: 'M02',
    name: '订单量',
    definition: '已支付订单的去重数量（按order_id去重）',
    sql_template: "COUNT(DISTINCT order_id) WHERE pay_status = '已支付'",
    aliases: ['订单量', '单量', '订单数', '成交单量'],
    confusing_notes: [
      '必须用 COUNT(DISTINCT order_id)，不能用 COUNT(*)',
      '同一订单多商品会有多行，去重是必要的',
      '同样需要过滤 pay_status = \'已支付\'',
    ]
  },
  {
    id: 'M03',
    name: '客单价',
    definition: '平均每笔已支付订单的金额 = 销售额 / 订单量',
    sql_template: "SUM(amount) * 1.0 / NULLIF(COUNT(DISTINCT order_id), 0) WHERE pay_status = '已支付'",
    aliases: ['客单价', 'AOV', '平均订单金额', '笔单价'],
    confusing_notes: [
      '必须用销售额/订单量，不能直接 AVG(amount)（那是平均商品单价）',
      '需要除以 DISTINCT order_id，不是除以 customer_id（那是客均消费）',
      '注意除零保护 NULLIF',
    ]
  },
  {
    id: 'M04',
    name: '新客数',
    definition: '在统计周期内首次完成支付的客户数量',
    sql_template: "COUNT(DISTINCT customer_id) WHERE MIN(order_date) GROUP BY customer_id 在周期内",
    aliases: ['新客数', '新增客户数', '新增付费用户', '拉新数'],
    confusing_notes: [
      '新客 = 首次支付时间在周期内，不是注册时间在周期内',
      '需要先找每个客户的 MIN(order_date) 作为首单时间，再过滤首单在周期内',
      '不要直接用 customer.register_date',
    ]
  },
  {
    id: 'M05',
    name: '复购率',
    definition: '当月下单≥2次的客户数 / 当月活跃客户数，单位：%',
    sql_template: "COUNT(CASE WHEN order_cnt >= 2 THEN 1 END) * 100.0 / COUNT(*) 按月分组",
    aliases: ['复购率', '回头客率', '重复购买率'],
    confusing_notes: [
      '是按月统计当月内复购，不是跨月追踪新客后续复购',
      '分子是当月内下单≥2次的客户数，分母是当月有下单的客户数',
      '输出百分比数值，保留2位小数',
    ]
  },
  {
    id: 'M06',
    name: '环比增长率',
    definition: '(本期值 - 上期值) / 上期值 * 100%',
    sql_template: "(current_val - prev_val) * 100.0 / NULLIF(prev_val, 0)",
    aliases: ['环比', '环比增长', '环比变化', '月环比'],
    confusing_notes: [
      '环比是和上一个周期比（上月/上季度），同比是和去年同期比',
      '正数是增长，负数是下降',
      '输出百分比，保留2位小数',
    ]
  },
  {
    id: 'M07',
    name: '同比增长率',
    definition: '(本期值 - 去年同期值) / 去年同期值 * 100%',
    sql_template: "(current_val - yoy_val) * 100.0 / NULLIF(yoy_val, 0)",
    aliases: ['同比', '同比增长', '年同比'],
    confusing_notes: [
      '同比是和去年同一时期比较，不是和上期比',
    ]
  },
  {
    id: 'M08',
    name: '占比',
    definition: '部分 / 整体 * 100%',
    sql_template: "part_val * 100.0 / NULLIF(total_val, 0)",
    aliases: ['占比', '份额', '比例', '贡献度'],
    confusing_notes: [
      '占比类问题必须同时返回绝对值和百分比两列',
      '输出百分比，保留2位小数',
      '各维度占比加起来应该等于100%',
    ]
  }
];

// 全局规则
export const globalRules = [
  "所有涉及金额/订单的指标必须加 pay_status = '已支付' 过滤，已退款/未支付不计入",
  "时间锚点：假设今天 = 2026-07-01，数据库数据范围为 2025-01-01 ~ 2026-06-30",
  "禁止使用 date('now')、CURRENT_DATE 等动态时间函数，必须硬编码具体日期",
  "统计订单数必须用 COUNT(DISTINCT order_id)，不能用 COUNT(*)",
  "比例/比率输出百分比，保留2位小数，注意除零保护",
  "优先使用 LEFT JOIN，避免 INNER JOIN 丢失记录",
  "季度标签用 '2025Q1' 格式，月份标签用 '2025-01' 格式",
];

// 时间语义映射
export const timeSemantics = [
  { name: '上月', range: '2026-06-01 ~ 2026-06-30', sql: "order_date BETWEEN '2026-06-01' AND '2026-06-30'" },
  { name: '近6个月', range: '2026-01-01 ~ 2026-06-30', sql: "order_date BETWEEN '2026-01-01' AND '2026-06-30'" },
  { name: '去年/2025全年', range: '2025-01-01 ~ 2025-12-31', sql: "order_date BETWEEN '2025-01-01' AND '2025-12-31'" },
  { name: '今年上半年', range: '2026-01-01 ~ 2026-06-30', sql: "order_date BETWEEN '2026-01-01' AND '2026-06-30'" },
  { name: '2025年Q1', range: '2025-01-01 ~ 2025-03-31', sql: "order_date BETWEEN '2025-01-01' AND '2025-03-31'" },
  { name: '2025年Q2', range: '2025-04-01 ~ 2025-06-30', sql: "order_date BETWEEN '2025-04-01' AND '2025-06-30'" },
  { name: '2025年Q3', range: '2025-07-01 ~ 2025-09-30', sql: "order_date BETWEEN '2025-07-01' AND '2025-09-30'" },
  { name: '2025年Q4', range: '2025-10-01 ~ 2025-12-31', sql: "order_date BETWEEN '2025-10-01' AND '2025-12-31'" },
];

// 实验评测真实结果
export const evaluationResults: EvaluationResult[] = [
  { questionId: 'Q01', question: '上月销售额多少？', difficulty: '简单', questionType: '直接统计', baselineCorrect: false, experimentCorrect: true, baselineErrorReason: '使用date(\'now\')动态时间函数，返回空值',
    baselineSql: `SELECT SUM(amount) AS last_month_sales_amount
FROM order_item
WHERE pay_status = '已支付'
  AND strftime('%Y-%m', order_date) = strftime('%Y-%m', date('now', '-1 month'));`,
    optimizedSql: `SELECT ROUND(SUM(amount), 2) AS sales_amount
FROM order_item
WHERE pay_status = '已支付'
  AND order_date BETWEEN '2026-06-01' AND '2026-06-30';` },
  { questionId: 'Q02', question: '今年上半年华东区域的销售额是多少？', difficulty: '中等', questionType: '直接统计', baselineCorrect: false, experimentCorrect: true, baselineErrorReason: '"今年"被错误理解为2025年，数值偏差大',
    baselineSql: `SELECT ROUND(SUM(oi.amount),2) AS sales_amount
FROM order_item oi JOIN customer c ON oi.customer_id=c.customer_id
WHERE c.region='华东'
  AND oi.order_date BETWEEN '2025-01-01' AND '2025-06-30';`,
    optimizedSql: `SELECT ROUND(SUM(oi.amount),2) AS sales_amount
FROM order_item oi LEFT JOIN customer c ON oi.customer_id=c.customer_id
WHERE oi.pay_status='已支付'
  AND c.region='华东'
  AND oi.order_date BETWEEN '2026-01-01' AND '2026-06-30';` },
  { questionId: 'Q03', question: '2025年Q4电子产品的销售额是多少？', difficulty: '中等', questionType: '直接统计', baselineCorrect: true, experimentCorrect: true },
  { questionId: 'Q04', question: '去年金卡会员的订单量是多少？', difficulty: '中等', questionType: '直接统计', baselineCorrect: true, experimentCorrect: true },
  { questionId: 'Q05', question: '2025年全年的客单价是多少？', difficulty: '中等', questionType: '直接统计', baselineCorrect: true, experimentCorrect: true },
  { questionId: 'Q06', question: '2025年每个月的销售额变化趋势是怎样的？', difficulty: '中等', questionType: '趋势分析', baselineCorrect: false, experimentCorrect: true, baselineErrorReason: '多返回订单量列，列数不一致',
    baselineSql: `SELECT strftime('%Y-%m', order_date) AS month,
       ROUND(SUM(amount),2) AS sales_amount,
       COUNT(DISTINCT order_id) AS order_count
FROM order_item
WHERE pay_status='已支付' AND order_date BETWEEN '2025-01-01' AND '2025-12-31'
GROUP BY month ORDER BY month;`,
    optimizedSql: `SELECT strftime('%Y-%m', order_date) AS month,
       ROUND(SUM(amount),2) AS sales_amount
FROM order_item
WHERE pay_status='已支付' AND order_date BETWEEN '2025-01-01' AND '2025-12-31'
GROUP BY month ORDER BY month;` },
  { questionId: 'Q07', question: '近6个月的订单量变化趋势', difficulty: '中等', questionType: '趋势分析', baselineCorrect: false, experimentCorrect: true, baselineErrorReason: '"近6个月"被错误算成12个月，行数翻倍',
    baselineSql: `SELECT strftime('%Y-%m', order_date) AS month, COUNT(DISTINCT order_id)
FROM order_item WHERE pay_status='已支付' AND order_date >= date('now','-6 months')
GROUP BY month;`,
    optimizedSql: `SELECT strftime('%Y-%m', order_date) AS month, COUNT(DISTINCT order_id) AS order_count
FROM order_item WHERE pay_status = '已支付'
  AND order_date BETWEEN '2026-01-01' AND '2026-06-30'
GROUP BY month ORDER BY month;` },
  { questionId: 'Q08', question: '2025年各季度新客数的变化情况', difficulty: '困难', questionType: '趋势分析', baselineCorrect: false, experimentCorrect: true, baselineErrorReason: '新客用register_date统计（错误定义），季度标签用纯数字',
    baselineSql: `SELECT strftime('%m', register_date)/3+1 AS quarter, COUNT(*)
FROM customer WHERE register_date BETWEEN '2025-01-01' AND '2025-12-31'
GROUP BY quarter;`,
    optimizedSql: `WITH customer_first_pay AS (
    SELECT customer_id, MIN(order_date) AS first_pay_date
    FROM order_item WHERE pay_status = '已支付' GROUP BY customer_id
)
SELECT
    CASE
        WHEN first_pay_date BETWEEN '2025-01-01' AND '2025-03-31' THEN '2025Q1'
        WHEN first_pay_date BETWEEN '2025-04-01' AND '2025-06-30' THEN '2025Q2'
        WHEN first_pay_date BETWEEN '2025-07-01' AND '2025-09-30' THEN '2025Q3'
        WHEN first_pay_date BETWEEN '2025-10-01' AND '2025-12-31' THEN '2025Q4'
    END AS quarter,
    COUNT(DISTINCT customer_id) AS new_customer_count
FROM customer_first_pay
WHERE first_pay_date BETWEEN '2025-01-01' AND '2025-12-31'
GROUP BY quarter
ORDER BY quarter;` },
  { questionId: 'Q09', question: '2025年每个月的客单价，同时给出同比上月的环比变化', difficulty: '困难', questionType: '趋势分析', baselineCorrect: false, experimentCorrect: true, baselineErrorReason: '缺少上期值列，列数不一致',
    baselineSql: `WITH monthly AS (
    SELECT strftime('%Y-%m', order_date) AS month,
           AVG(amount) AS aov
    FROM order_item WHERE order_date BETWEEN '2025-01-01' AND '2025-12-31'
    GROUP BY month
)
SELECT month, aov,
       ROUND((aov - LAG(aov) OVER (ORDER BY month)) * 100.0 / NULLIF(LAG(aov) OVER (ORDER BY month),0), 2) AS mom_change_pct
FROM monthly ORDER BY month;`,
    optimizedSql: `WITH monthly AS (
    SELECT strftime('%Y-%m', order_date) AS month,
           ROUND(SUM(amount)*1.0/NULLIF(COUNT(DISTINCT order_id),0),2) AS aov
    FROM order_item WHERE pay_status='已支付' AND order_date BETWEEN '2025-01-01' AND '2025-12-31'
    GROUP BY month
)
SELECT month, aov, LAG(aov) OVER (ORDER BY month) AS prev_aov,
       ROUND((aov - LAG(aov) OVER (ORDER BY month)) * 100.0 / NULLIF(LAG(aov) OVER (ORDER BY month),0), 2) AS mom_change_pct
FROM monthly ORDER BY month;` },
  { questionId: 'Q10', question: '各渠道按季度的销售额变化趋势', difficulty: '困难', questionType: '趋势分析', baselineCorrect: false, experimentCorrect: true, baselineErrorReason: '维度列顺序错误（季度在前渠道在后），数据错位',
    baselineSql: `SELECT dd.season_name AS quarter, oi.channel, SUM(oi.amount) AS sales_amount
FROM order_item oi LEFT JOIN date_dim dd ON oi.order_date=dd.date
WHERE oi.pay_status='已支付'
GROUP BY quarter, oi.channel ORDER BY quarter, oi.channel;`,
    optimizedSql: `SELECT oi.channel, dd.season_name AS quarter, ROUND(SUM(oi.amount),2) AS sales_amount
FROM order_item oi LEFT JOIN date_dim dd ON oi.order_date=dd.date
WHERE oi.pay_status='已支付' GROUP BY oi.channel, dd.season_name
ORDER BY oi.channel, quarter;` },
  { questionId: 'Q11', question: '华东和华北2025年全年的销售额对比', difficulty: '中等', questionType: '对比分析', baselineCorrect: true, experimentCorrect: true },
  { questionId: 'Q12', question: '金卡会员和普通会员在2025年Q4的订单量对比', difficulty: '中等', questionType: '对比分析', baselineCorrect: false, experimentCorrect: true, baselineErrorReason: 'JOIN date_dim导致时间过滤范围偏差，数值错误',
    baselineSql: `SELECT c.member_level, COUNT(DISTINCT oi.order_id) AS order_count
FROM order_item oi
JOIN customer c ON oi.customer_id=c.customer_id
JOIN date_dim dd ON oi.order_date=dd.date
WHERE dd.season_name='2025Q4'
GROUP BY c.member_level;`,
    optimizedSql: `SELECT c.member_level, COUNT(DISTINCT oi.order_id) AS order_count
FROM order_item oi LEFT JOIN customer c ON oi.customer_id=c.customer_id
WHERE oi.pay_status='已支付'
  AND oi.order_date BETWEEN '2025-10-01' AND '2025-12-31'
  AND c.member_level IN ('金卡会员','普通会员')
GROUP BY c.member_level ORDER BY order_count DESC;` },
  { questionId: 'Q13', question: '线上APP渠道和线下门店渠道，哪个客单价更高？', difficulty: '中等', questionType: '对比分析', baselineCorrect: false, experimentCorrect: true, baselineErrorReason: '默认时间范围取全量而非上月，数值偏差',
    baselineSql: `SELECT channel, AVG(amount) AS aov
FROM order_item GROUP BY channel ORDER BY aov DESC;`,
    optimizedSql: `SELECT channel,
       ROUND(SUM(amount)*1.0/NULLIF(COUNT(DISTINCT order_id),0),2) AS aov
FROM order_item WHERE pay_status='已支付' AND order_date BETWEEN '2026-06-01' AND '2026-06-30'
GROUP BY channel ORDER BY aov DESC;` },
  { questionId: 'Q14', question: '2025年全年 vs 2026年上半年的销售额对比', difficulty: '中等', questionType: '对比分析', baselineCorrect: false, experimentCorrect: true, baselineErrorReason: '时间段标签文字多了"年"字，不匹配',
    baselineSql: `SELECT
    CASE WHEN order_date BETWEEN '2025-01-01' AND '2025-12-31' THEN '2025年全年'
         WHEN order_date BETWEEN '2026-01-01' AND '2026-06-30' THEN '2026年上半年'
    END AS period_label,
    ROUND(SUM(amount),2) AS sales_amount
FROM order_item GROUP BY period_label;`,
    optimizedSql: `SELECT
    CASE WHEN order_date BETWEEN '2025-01-01' AND '2025-12-31' THEN '2025全年'
         WHEN order_date BETWEEN '2026-01-01' AND '2026-06-30' THEN '2026H1'
    END AS period,
    ROUND(SUM(amount),2) AS sales_amount
FROM order_item WHERE pay_status='已支付'
  AND order_date BETWEEN '2025-01-01' AND '2026-06-30'
GROUP BY period ORDER BY period;` },
  { questionId: 'Q15', question: '五大一级品类2025年全年销售额对比', difficulty: '中等', questionType: '对比分析', baselineCorrect: true, experimentCorrect: true },
  { questionId: 'Q16', question: '一级品类中，销售额最高的Top3是哪些？（2025全年）', difficulty: '中等', questionType: '排名分析', baselineCorrect: true, experimentCorrect: true },
  { questionId: 'Q17', question: '2026年上半年订单量最多的前5个城市是哪些？', difficulty: '中等', questionType: '排名分析', baselineCorrect: true, experimentCorrect: true },
  { questionId: 'Q18', question: '按区域来看，客单价最高的3个区域是？', difficulty: '中等', questionType: '排名分析', baselineCorrect: false, experimentCorrect: true, baselineErrorReason: '默认时间范围错误导致排名和数值均错',
    baselineSql: `SELECT c.region, AVG(oi.amount) AS aov
FROM order_item oi JOIN customer c ON oi.customer_id=c.customer_id
GROUP BY c.region ORDER BY aov DESC LIMIT 3;`,
    optimizedSql: `SELECT c.region,
       ROUND(SUM(oi.amount)*1.0/NULLIF(COUNT(DISTINCT oi.order_id),0),2) AS aov
FROM order_item oi LEFT JOIN customer c ON oi.customer_id=c.customer_id
WHERE oi.pay_status='已支付' AND oi.order_date BETWEEN '2026-06-01' AND '2026-06-30'
GROUP BY c.region ORDER BY aov DESC LIMIT 3;` },
  { questionId: 'Q19', question: '2025年新增付费客户数最多的10个城市', difficulty: '困难', questionType: '排名分析', baselineCorrect: true, experimentCorrect: true },
  { questionId: 'Q20', question: '2025年销售额最低的5个品牌', difficulty: '中等', questionType: '排名分析', baselineCorrect: true, experimentCorrect: true },
  { questionId: 'Q21', question: '7大区域的销售额占比（上月）', difficulty: '中等', questionType: '占比分析', baselineCorrect: false, experimentCorrect: true, baselineErrorReason: '时间函数错误返回0行，且占比缺少绝对值列',
    baselineSql: `SELECT c.region,
       ROUND(SUM(oi.amount)*100.0/(SELECT SUM(amount) FROM order_item),2) AS share_pct
FROM order_item oi INNER JOIN customer c ON oi.customer_id=c.customer_id
WHERE strftime('%Y-%m', oi.order_date)=strftime('%Y-%m',date('now','-1 month'))
GROUP BY c.region;`,
    optimizedSql: `WITH total AS (SELECT SUM(amount) AS total FROM order_item
    WHERE pay_status='已支付' AND order_date BETWEEN '2026-06-01' AND '2026-06-30')
SELECT c.region, ROUND(SUM(oi.amount),2) AS sales_amount,
       ROUND(SUM(oi.amount)*100.0/(SELECT total FROM total),2) AS share_pct
FROM order_item oi LEFT JOIN customer c ON oi.customer_id=c.customer_id
WHERE oi.pay_status='已支付' AND oi.order_date BETWEEN '2026-06-01' AND '2026-06-30'
GROUP BY c.region ORDER BY sales_amount DESC;` },
  { questionId: 'Q22', question: '2025年各渠道的订单量占比', difficulty: '中等', questionType: '占比分析', baselineCorrect: false, experimentCorrect: true, baselineErrorReason: '缺少绝对值列，占比计算错误',
    baselineSql: `SELECT channel,
       ROUND(COUNT(*)*100.0/(SELECT COUNT(*) FROM order_item),2) AS share_pct
FROM order_item WHERE order_date BETWEEN '2025-01-01' AND '2025-12-31'
GROUP BY channel;`,
    optimizedSql: `WITH total AS (SELECT COUNT(DISTINCT order_id) AS total FROM order_item
    WHERE pay_status='已支付' AND order_date BETWEEN '2025-01-01' AND '2025-12-31')
SELECT channel, COUNT(DISTINCT order_id) AS order_count,
       ROUND(COUNT(DISTINCT order_id)*100.0/(SELECT total FROM total),2) AS share_pct
FROM order_item WHERE pay_status='已支付' AND order_date BETWEEN '2025-01-01' AND '2025-12-31'
GROUP BY channel ORDER BY order_count DESC;` },
  { questionId: 'Q23', question: '电子产品一级品类下，5个二级子品类的销售额占比（2025全年）', difficulty: '中等', questionType: '占比分析', baselineCorrect: true, experimentCorrect: true },
  { questionId: 'Q24', question: '2025年哪个月的销售额环比上月跌幅最大？', difficulty: '困难', questionType: '异常识别', baselineCorrect: true, experimentCorrect: true },
  { questionId: 'Q25', question: '2025年复购率最高和最低的月份分别是？', difficulty: '困难', questionType: '异常识别', baselineCorrect: false, experimentCorrect: true, baselineErrorReason: '复购率定义错误（跨月追踪新客），且只返回2行',
    baselineSql: `WITH first_order AS (
    SELECT customer_id, MIN(strftime('%Y-%m', order_date)) AS first_month
    FROM order_item WHERE pay_status='已支付' GROUP BY customer_id
), repurchase AS (
    SELECT f.customer_id, f.first_month,
           COUNT(DISTINCT strftime('%Y-%m', o.order_date)) AS active_month_cnt
    FROM first_order f JOIN order_item o ON f.customer_id=o.customer_id
    WHERE o.pay_status='已支付' AND strftime('%Y-%m', o.order_date) > f.first_month
    GROUP BY f.customer_id, f.first_month
)
SELECT first_month,
       ROUND(COUNT(DISTINCT customer_id)*100.0
            / NULLIF((SELECT COUNT(DISTINCT customer_id) FROM first_order x WHERE x.first_month=repurchase.first_month),0),2) AS repurchase_rate_pct
FROM repurchase GROUP BY first_month ORDER BY repurchase_rate_pct DESC LIMIT 2;`,
    optimizedSql: `WITH monthly AS (
    SELECT strftime('%Y-%m', order_date) AS month, customer_id, COUNT(DISTINCT order_id) AS cnt
    FROM order_item WHERE pay_status='已支付' AND order_date BETWEEN '2025-01-01' AND '2025-12-31'
    GROUP BY month, customer_id
)
SELECT month,
       COUNT(DISTINCT customer_id) AS total_active_customers,
       COUNT(DISTINCT CASE WHEN cnt>=2 THEN customer_id END) AS repurchase_customers,
       ROUND(COUNT(DISTINCT CASE WHEN cnt>=2 THEN customer_id END)*100.0
            / NULLIF(COUNT(DISTINCT customer_id),0),2) AS repurchase_rate_pct
FROM monthly GROUP BY month ORDER BY month;` },
];

// 快捷问题（欢迎页轻量列表使用，与下方 exampleGroups 同源精选）
export const quickQuestions = [
  '上个月各渠道的销售额和订单量是多少？',
  '近6个月的订单量变化趋势如何？',
  '2025年各季度的新客数分别是多少？',
  '上个月各品类的销售额是多少？',
  '上月各区域销售额占比',
  '2025年复购率最高和最低的月份分别是？',
];

// ==================== 精选示例（第六轮收口：3 类典型任务，少而精） ====================
// 说明：以下问题均针对本地零售数据集（retail.db，2025-01 ~ 2026-06）设计，
// 后端题库 / 维度模板 / 语义 LLM 均可覆盖，点击即可真实跑出结果，适合答辩与试用演示。
export interface ExampleQuestion {
  q: string;       // 点击后直接发起的问题
  metric: string;  // 涉及指标
  period: string;  // 时间范围
  goal: string;    // 分析目标 / 出结果后可继续的动作
}
export interface ExampleGroup {
  key: 'business' | 'trend' | 'followup';
  title: string;
  desc: string;
  items: ExampleQuestion[];
}

export const exampleGroups: ExampleGroup[] = [
  {
    key: 'business',
    title: '业务问数',
    desc: '自然语言问指标，系统先对齐口径、确认 SQL 后才执行',
    items: [
      {
        q: '上个月各渠道的销售额和订单量是多少？',
        metric: '销售额、订单量',
        period: '上月（2026-06）',
        goal: '按渠道下钻，一次返回各渠道销售与单量，验证维度拆分能力',
      },
      {
        q: '2025年各季度的新客数分别是多少？',
        metric: '新客数',
        period: '2025 全年',
        goal: '新客=首次支付客户，考察时间语义与复杂口径（CTE）正确性',
      },
    ],
  },
  {
    key: 'trend',
    title: '趋势分析',
    desc: '按时间序列看走势，结果工作台自动配图并给出环比/波动发现',
    items: [
      {
        q: '近6个月的订单量变化趋势如何？',
        metric: '订单量',
        period: '近 6 个月（2026-01~06）',
        goal: '月度订单量折线，观察趋势与峰值，验证时间锚点修正',
      },
      {
        q: '2025年复购率最高和最低的月份分别是？',
        metric: '复购率',
        period: '2025 全年',
        goal: '按月复购率排序，考察口径定义与排序类问题',
      },
    ],
  },
  {
    key: 'followup',
    title: '结果追问与图表',
    desc: '先出结构化结果，再一键追问拆分、生成图表或导出',
    items: [
      {
        q: '上个月各品类的销售额是多少？',
        metric: '销售额',
        period: '上月（2026-06）',
        goal: '出结果后可点「按渠道拆分」继续追问，或「基于结果生成图表」',
      },
      {
        q: '上月各区域销售额占比',
        metric: '销售额、占比',
        period: '上月（2026-06）',
        goal: '同时返回绝对值与占比，适合一键生成饼图并导出 CSV',
      },
    ],
  },
];

// 示例AI回复（Mock）
export const mockAIResponse = {
  matchedMetrics: [{ id: 'M01', name: '销售额' }],
  timeRange: '2026-06（上月）',
  sql: `SELECT ROUND(SUM(amount), 2) AS sales_amount
FROM order_item
WHERE pay_status = '已支付'
  AND order_date BETWEEN '2026-06-01' AND '2026-06-30';`,
  baselineSql: `SELECT SUM(amount) AS last_month_sales_amount
FROM order_item
WHERE pay_status = '已支付'
  AND strftime('%Y-%m', order_date) = strftime('%Y-%m', date('now', '-1 month'));`,
  result: {
    columns: ['sales_amount'],
    rows: [[5508311.27]],
    rowCount: 1,
    executionTimeMs: 12,
  },
  summary: {
    key_findings: [
      '上月（2026年6月）销售额为 550.83 万元',
      '基线系统因使用动态时间函数返回空值，语义层正确硬编码了时间范围',
    ],
  }
};
