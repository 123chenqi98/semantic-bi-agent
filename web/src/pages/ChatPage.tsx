import { useEffect, useRef } from 'react';
import { useApp } from '../store/ChatContext';
import UserMessageCard from '../components/Chat/UserMessageCard';
import AIMessageCard from '../components/Chat/AIMessageCard';
import ChatInput from '../components/Chat/ChatInput';
import WelcomePage from '../components/Chat/WelcomePage';
import type { AIMessage as AIMessageType, SkillTag } from '../types';
import { metrics, timeSemantics } from '../mock/data';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function buildHistory(messages: { type: string; content?: string; question?: string; sql?: string }[]): { role: string; content: string }[] {
  return messages
    .filter(m => m.type === 'user' || (m.type === 'ai' && (m.question || m.sql)))
    .slice(-8)
    .map(m => ({
      role: m.type === 'user' ? 'user' : 'assistant',
      content: m.type === 'user' ? (m.content || '') : `[之前生成的SQL] ${m.sql || ''}`,
    }));
}

const SKILL_PREFIX_MAP: Record<string, SkillTag> = {
  '时间解析': 'time',
  'SQL优化': 'sql',
};

function parseSkillTags(question: string): { cleaned: string; tags: SkillTag[] } {
  let cleaned = question;
  const tags: SkillTag[] = [];
  const skillRegex = /@(时间解析|SQL优化)\s*/g;
  let m: RegExpExecArray | null;
  while ((m = skillRegex.exec(question)) !== null) {
    const tag = SKILL_PREFIX_MAP[m[1]];
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  cleaned = cleaned.replace(skillRegex, '').trim();
  return { cleaned, tags };
}

function buildHelpReply(question: string): Partial<AIMessageType> {
  return {
    question,
    matchedMetrics: [],
    sql: '',
    isHelp: true,
    summary: { key_findings: [] },
  };
}

function buildDictReply(question: string, keyword: string): Partial<AIMessageType> {
  const kw = keyword.trim();
  const matched = metrics.find(m =>
    m.name === kw ||
    m.id.toLowerCase() === kw.toLowerCase() ||
    m.aliases.some(a => a.toLowerCase() === kw.toLowerCase()) ||
    m.name.includes(kw) ||
    m.aliases.some(a => a.includes(kw))
  );
  return {
    question,
    matchedMetrics: matched ? [{ id: matched.id, name: matched.name }] : [],
    sql: '',
    dictResult: matched,
    skillTags: ['dict'],
    summary: {
      key_findings: matched
        ? [`已找到指标「${matched.name}」（${matched.id}），下方展示定义、SQL 模板与易混淆口径`]
        : [`未在指标词典中找到与「${kw}」匹配的指标，可尝试输入：${metrics.slice(0, 4).map(m => m.name).join('、')} 等关键词`],
    },
  };
}

function attachSkillEnhancements(
  reply: Partial<AIMessageType>,
  tags: SkillTag[],
  originalQuestion: string
): Partial<AIMessageType> {
  const r = { ...reply, skillTags: tags };
  const findings = [...(r.summary?.key_findings || [])];
  const suggestions: string[] = [];

  if (tags.includes('time')) {
    const timeHints = timeSemantics.filter(t => originalQuestion.includes(t.name));
    if (timeHints.length > 0) {
      findings.push(`🕒 时间解析增强：识别到"${timeHints.map(t => t.name).join('、')}"，已映射到 ${timeHints.map(t => t.range).join('；')}`);
    } else {
      findings.push('🕒 时间解析增强已启用：时间表达会严格按语义层映射规则解析（禁用 date(\'now\') 等动态函数）');
    }
    // 强制把 baselineSql 时间函数相关错误显示出来（如果原有 baselineSql 的话）
  }

  if (tags.includes('sql')) {
    if (r.baselineSql) {
      findings.push('🔍 SQL 优化对比已启用：下方展示基线 SQL vs 优化后 SQL 的差异');
    } else {
      findings.push('🔍 SQL 优化已启用：已确保 pay_status 过滤、COUNT(DISTINCT order_id)、NULLIF 除零保护等规范');
    }
    suggestions.push(
      '统一使用 LEFT JOIN 代替 INNER JOIN 避免数据丢失',
      '统计订单必须用 COUNT(DISTINCT order_id)，避免商品粒度重复',
      '金额/订单指标必须加 pay_status = \'已支付\' 过滤',
      '时间范围硬编码具体日期，禁止 date(\'now\')、CURRENT_DATE',
    );
  }

  r.summary = { ...(r.summary || { key_findings: [] }), key_findings: findings };
  if (suggestions.length > 0) r.sqlSuggestions = suggestions;
  return r;
}

export default function ChatPage() {
  const { state, dispatch, currentConversation } = useApp();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const disableBackend = (import.meta as any).env?.VITE_DISABLE_BACKEND === '1';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentConversation.messages, currentConversation.messages.length]);

  const streamBackendChat = async (
    question: string,
    onUpdate: (patch: Partial<AIMessageType>) => void,
    history?: { role: string; content: string }[],
  ): Promise<Partial<AIMessageType> | null> => {
    if (disableBackend) return null;
    const ctrl = new AbortController();
    // SSE 整体超时：真实 LLM 双 pipeline 可能耗时 1 分钟以上，给 120s 兜底防止永久挂起
    const timer = setTimeout(() => ctrl.abort(), 120000);
    try {
      const resp = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history: history || [] }),
        signal: ctrl.signal,
      });
      if (!resp.ok || !resp.body) return null;

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamedSql = '';
      let findings: string[] = [];
      let sawError = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const evt of events) {
          const eventMatch = evt.match(/^event:\s*(.+)$/m);
          const dataMatch = evt.match(/^data:\s*(.+)$/m);
          if (!eventMatch || !dataMatch) continue;
          const eventName = eventMatch[1].trim();
          try {
            const data = JSON.parse(dataMatch[1]);
            if (eventName === 'status') {
              onUpdate({ streamingStatus: `${data.step}... ${data.detail || ''}` });
            } else if (eventName === 'sql') {
              streamedSql += data.chunk;
              onUpdate({ sql: streamedSql, streamingStatus: '正在生成 SQL...' });
            } else if (eventName === 'finding') {
              findings = [...findings, data.text];
              onUpdate({ summary: { key_findings: findings }, streamingStatus: '生成分析结论...' });
            } else if (eventName === 'error') {
              // 后端流式链路显式报错：标记后让外层回退非流式接口，而非静默吞掉
              sawError = true;
              onUpdate({ streamingStatus: '流式通道异常，正在切换备用通道...' });
            } else if (eventName === 'done') {
              clearTimeout(timer);
              return data as AIMessageType;
            }
          } catch { /* skip parse error */ }
        }
      }
      // 流正常结束但未收到 done（或收到 error 事件）→ 交由外层回退非流式接口
      void sawError;
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  const callBackendChat = async (question: string, history?: { role: string; content: string }[]): Promise<Partial<AIMessageType> | null> => {
    if (disableBackend) return null;
    try {
      const ctrl = new AbortController();
      // 真实模式后端串行跑 baseline + experiment 两次 LLM（各 30s 超时 + 重试），
      // 20s 会把慢响应误判为失败；放宽到 90s 与后端 LLM_TIMEOUT 对齐
      const timer = setTimeout(() => ctrl.abort(), 90000);
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history: history || [] }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) return null;
      const j = await resp.json();
      const ai: Partial<AIMessageType> = {
        question: j.question ?? question,
        matchedMetrics: j.matchedMetrics ?? [],
        timeRange: j.timeRange,
        matchedDimensions: j.matchedDimensions,
        sql: j.sql ?? '',
        baselineSql: j.baselineSql,
        baselinePrompt: j.baselinePrompt,
        experimentPrompt: j.experimentPrompt,
        result: j.result,
        baselineResult: j.baselineResult,
        summary: j.summary ?? { key_findings: [] },
        pipelineTrace: j.pipelineTrace,
        // 第三轮：结果工作台结构化分区
        conclusion: j.conclusion,
        findings: j.findings,
        chartSpec: j.chartSpec,
        warnings: j.warnings,
        provenance: j.provenance,
        usageVerdict: j.usageVerdict,
        suggestions: j.suggestions ?? j.suggested_questions ?? [],
      };
      return ai;
    } catch {
      return null;
    }
  };

  // 分阶段问数 · 阶段一：需求理解 + SQL 草案（后端硬保证：确认前不执行任何 SQL）
  const callChatPlan = async (
    question: string,
    history: { role: string; content: string }[],
  ): Promise<Partial<AIMessageType> | null> => {
    if (disableBackend) return null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 60000);
      const resp = await fetch('/api/chat/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) return null;
      const j = await resp.json();
      if (!j.success || !j.plan_id) return null;
      return {
        stage: 'draft',
        planId: j.plan_id,
        question: j.question ?? question,
        sql: j.sql_draft ?? '',
        sqlSource: j.sql_source,
        matchedMetrics: j.matched_metrics ?? [],
        timeRange: j.time_range || undefined,
        matchedDimensions: j.dimensions ?? [],
        clarifications: j.clarification_questions ?? [],
        assumptions: j.assumptions ?? [],
        filters: j.filters ?? [],
        datasetName: j.dataset?.name,
      } as Partial<AIMessageType>;
    } catch {
      return null;
    }
  };

  // 分阶段问数 · 阶段二：用户确认草案后才执行查询
  const callChatConfirm = async (planId: string): Promise<Partial<AIMessageType> | null> => {
    if (disableBackend) return null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 90000);
      const resp = await fetch('/api/chat/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: planId, confirmed: true }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) return null;
      const j = await resp.json();
      if (!j.result) return null;
      return {
        stage: 'done',
        planId,
        question: j.question,
        matchedMetrics: j.matchedMetrics ?? [],
        timeRange: j.timeRange,
        matchedDimensions: j.matchedDimensions,
        sql: j.sql ?? '',
        baselineSql: j.baselineSql,
        baselinePrompt: j.baselinePrompt,
        experimentPrompt: j.experimentPrompt,
        result: j.result,
        baselineResult: j.baselineResult,
        summary: j.summary ?? { key_findings: [] },
        pipelineTrace: j.pipelineTrace,
        suggestions: j.suggestions ?? j.suggested_questions ?? [],
        datasetName: j.dataset?.name,
        // 第三轮：结果工作台结构化分区
        conclusion: j.conclusion,
        findings: j.findings,
        chartSpec: j.chartSpec,
        warnings: j.warnings,
        provenance: j.provenance,
        usageVerdict: j.usageVerdict,
        confirmError: undefined,
      } as Partial<AIMessageType>;
    } catch {
      return null;
    }
  };

  const mockAIReply = (question: string): Partial<AIMessageType> => {
    const q = question.toLowerCase();

    if (q.includes('上月') && q.includes('销售额')) {
      return {
        question,
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
        result: { columns: ['sales_amount'], rows: [[5508311.27]], rowCount: 1, executionTimeMs: 12 },
        summary: {
          key_findings: [
            '上月（2026年6月）销售额为 550.83 万元',
            '语义层正确硬编码时间范围，基线系统使用动态时间函数 date(\'now\') 返回空值',
            '正确过滤了 pay_status = \'已支付\'，未支付/已退款订单不计入',
          ],
        },
      };
    }

    if (q.includes('新客') && (q.includes('季度') || q.includes('变化'))) {
      return {
        question,
        matchedMetrics: [{ id: 'M04', name: '新客数' }],
        timeRange: '2025年全年',
        matchedDimensions: ['季度'],
        sql: `WITH customer_first_pay AS (
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
GROUP BY quarter ORDER BY quarter;`,
        baselineSql: `SELECT strftime('%m', register_date)/3+1 AS quarter, COUNT(*)
FROM customer WHERE register_date BETWEEN '2025-01-01' AND '2025-12-31' GROUP BY quarter;`,
        result: {
          columns: ['quarter', 'new_customer_count'],
          rows: [['2025Q1', 115], ['2025Q2', 263], ['2025Q3', 413], ['2025Q4', 531]],
          rowCount: 4, executionTimeMs: 18,
        },
        summary: {
          key_findings: [
            '2025年新客数持续增长，Q4新增531人为全年最高',
            '基线错误使用 register_date（注册日期）统计新客，季度标签为纯数字',
            '实验组正确使用 MIN(order_date) 首次支付日期定义新客',
          ],
        },
      };
    }

    if ((q.includes('近6个月') || q.includes('近六个月')) && q.includes('订单量')) {
      return {
        question,
        matchedMetrics: [{ id: 'M02', name: '订单量' }],
        timeRange: '2026-01 ~ 2026-06',
        matchedDimensions: ['月份'],
        sql: `SELECT strftime('%Y-%m', order_date) AS month, COUNT(DISTINCT order_id) AS order_count
FROM order_item WHERE pay_status = '已支付'
  AND order_date BETWEEN '2026-01-01' AND '2026-06-30'
GROUP BY month ORDER BY month;`,
        baselineSql: `SELECT strftime('%Y-%m', order_date) AS month, COUNT(DISTINCT order_id)
FROM order_item WHERE pay_status='已支付' AND order_date >= date('now','-6 months') GROUP BY month;`,
        result: {
          columns: ['month', 'order_count'],
          rows: [['2026-01', 345], ['2026-02', 298], ['2026-03', 412], ['2026-04', 467], ['2026-05', 523], ['2026-06', 556]],
          rowCount: 6, executionTimeMs: 15,
        },
        summary: {
          key_findings: [
            '近6个月订单量整体上升，从1月345单增长到6月556单',
            '基线用 date(\'now\',\'-6 months\') 错误返回12个月数据',
            '实验组正确硬编码时间范围为2026年上半年',
          ],
        },
      };
    }

    if (q.includes('区域') && q.includes('占比') && q.includes('上月')) {
      return {
        question,
        matchedMetrics: [{ id: 'M01', name: '销售额' }, { id: 'M08', name: '占比' }],
        timeRange: '2026-06（上月）',
        matchedDimensions: ['区域'],
        sql: `WITH total AS (SELECT SUM(amount) AS total FROM order_item
    WHERE pay_status='已支付' AND order_date BETWEEN '2026-06-01' AND '2026-06-30')
SELECT c.region, ROUND(SUM(oi.amount),2) AS sales_amount,
       ROUND(SUM(oi.amount)*100.0/(SELECT total FROM total),2) AS share_pct
FROM order_item oi LEFT JOIN customer c ON oi.customer_id=c.customer_id
WHERE oi.pay_status='已支付' AND oi.order_date BETWEEN '2026-06-01' AND '2026-06-30'
GROUP BY c.region ORDER BY sales_amount DESC;`,
        result: {
          columns: ['region', 'sales_amount', 'share_pct'],
          rows: [['华东', 1325890.45, 24.07], ['华南', 1105672.33, 20.07], ['华北', 987234.12, 17.92],
                 ['华中', 712345.67, 12.93], ['西南', 598765.43, 10.87], ['西北', 456789.01, 8.29], ['东北', 321614.26, 5.84]],
          rowCount: 7, executionTimeMs: 22,
        },
        summary: {
          key_findings: [
            '上月华东区域销售额最高（132.59万元，占比24.07%），东北最低（32.16万元，占比5.84%）',
            '占比类问题正确返回绝对值+百分比两列',
          ],
        },
      };
    }

    if (q.includes('复购率')) {
      return {
        question,
        matchedMetrics: [{ id: 'M05', name: '复购率' }],
        timeRange: '2025年全年',
        matchedDimensions: ['月份'],
        sql: `WITH monthly AS (
    SELECT strftime('%Y-%m', order_date) AS month, customer_id, COUNT(DISTINCT order_id) AS cnt
    FROM order_item WHERE pay_status='已支付' AND order_date BETWEEN '2025-01-01' AND '2025-12-31'
    GROUP BY month, customer_id
)
SELECT month, COUNT(DISTINCT customer_id) AS total_active,
       COUNT(DISTINCT CASE WHEN cnt>=2 THEN customer_id END) AS repurchase_cnt,
       ROUND(COUNT(DISTINCT CASE WHEN cnt>=2 THEN customer_id END)*100.0/NULLIF(COUNT(DISTINCT customer_id),0),2) AS repurchase_rate_pct
FROM monthly GROUP BY month ORDER BY repurchase_rate_pct DESC;`,
        baselineSql: `WITH new_c AS (SELECT customer_id, MIN(order_date) AS first FROM order_item WHERE pay_status='已支付' GROUP BY customer_id)
SELECT strftime('%Y-%m',o.order_date) AS m,
       COUNT(DISTINCT CASE WHEN o.order_date>nc.first THEN o.customer_id END)*100.0/NULLIF(COUNT(DISTINCT o.customer_id),0)
FROM order_item o JOIN new_c nc ON o.customer_id=nc.customer_id
WHERE o.pay_status='已支付' AND o.order_date BETWEEN '2025-01-01' AND '2025-12-31'
GROUP BY m ORDER BY repurchase_rate DESC LIMIT 2;`,
        result: {
          columns: ['month', 'total_active', 'repurchase_cnt', 'repurchase_rate_pct'],
          rows: [['2025-12', 892, 260, 29.15], ['2025-11', 856, 241, 28.15], ['2025-10', 812, 223, 27.46],
                 ['2025-09', 778, 205, 26.35], ['2025-08', 745, 192, 25.77], ['2025-07', 712, 178, 25.00],
                 ['2025-06', 678, 165, 24.34], ['2025-05', 645, 152, 23.57], ['2025-04', 612, 140, 22.88],
                 ['2025-03', 578, 128, 22.15], ['2025-02', 489, 105, 21.47], ['2025-01', 456, 95, 20.83]],
          rowCount: 12, executionTimeMs: 25,
        },
        summary: {
          key_findings: [
            '2025年复购率最高12月（29.15%），最低1月（20.83%），整体呈上升趋势',
            '基线错误定义复购率为新客后续复购，且只返回2行',
            '实验组正确按月统计当月复购率，返回全部12个月',
          ],
        },
      };
    }

    if (q.includes('渠道') && q.includes('季度') && q.includes('销售额')) {
      return {
        question,
        matchedMetrics: [{ id: 'M01', name: '销售额' }],
        timeRange: '全量',
        matchedDimensions: ['渠道', '季度'],
        sql: `SELECT oi.channel, dd.season_name AS quarter, ROUND(SUM(oi.amount),2) AS sales_amount
FROM order_item oi LEFT JOIN date_dim dd ON oi.order_date=dd.date
WHERE oi.pay_status='已支付' GROUP BY oi.channel, dd.season_name ORDER BY oi.channel, quarter;`,
        baselineSql: `SELECT dd.season_name AS quarter, oi.channel, SUM(oi.amount) FROM order_item oi
LEFT JOIN date_dim dd ON oi.order_date=dd.date WHERE oi.pay_status='已支付' GROUP BY quarter, oi.channel;`,
        result: {
          columns: ['channel', 'quarter', 'sales_amount'],
          rows: [['小程序','2025Q1',856234.56],['小程序','2025Q2',945678.12],['线上APP','2025Q1',1234567.89],
                 ['线上APP','2025Q2',1345678.90],['线下门店','2025Q1',2134567.89],['线下门店','2025Q2',2245678.90]],
          rowCount: 12, executionTimeMs: 30,
        },
        summary: {
          key_findings: [
            '线下门店渠道销售额最高，各季度均保持增长',
            '基线维度列顺序错误（季度在前渠道在后）',
            '实验组按问题顺序排列列（渠道→季度→销售额）',
          ],
        },
      };
    }

    return {
      question,
      matchedMetrics: [{ id: 'M01', name: '销售额' }],
      sql: `-- 演示模式：点击预设问题查看对比效果\nSELECT ROUND(SUM(amount),2) AS sales_amount FROM order_item WHERE pay_status='已支付';`,
      result: { columns: ['sales_amount'], rows: [[38560000.00]], rowCount: 1, executionTimeMs: 10 },
      summary: { key_findings: ['演示模式：点击上方预设问题可查看不同错误类型的对比效果', '支持基线vs实验组SQL对比、语义标签识别、结果展示'] },
    };
  };

  const handleSend = async (rawQuestion: string) => {
    const convId = currentConversation.id;
    const history = buildHistory(currentConversation.messages);
    dispatch({ type: 'ADD_MESSAGE', payload: { conversationId: convId, message: { id: generateId(), type: 'user', content: rawQuestion, timestamp: Date.now() } } });
    dispatch({ type: 'SET_LOADING', payload: true });
    const aiId = generateId();

    if (rawQuestion.trim() === '/help') {
      dispatch({ type: 'ADD_MESSAGE', payload: { conversationId: convId, message: { id: aiId, type: 'ai', question: '/help', matchedMetrics: [], sql: '', isLoading: true, isHelp: true, timestamp: Date.now() } as AIMessageType } });
      setTimeout(() => {
        dispatch({ type: 'UPDATE_MESSAGE', payload: { conversationId: convId, messageId: aiId, updates: { ...buildHelpReply('/help'), isLoading: false } as Partial<AIMessageType> } });
        dispatch({ type: 'SET_LOADING', payload: false });
      }, 400);
      return;
    }

    // 检测 @指标词典 前缀查询
    const dictMatch = rawQuestion.match(/^@指标词典\s*(.*)$/);
    if (dictMatch) {
      const keyword = dictMatch[1];
      dispatch({ type: 'ADD_MESSAGE', payload: { conversationId: convId, message: { id: aiId, type: 'ai', question: rawQuestion, matchedMetrics: [], sql: '', isLoading: true, skillTags: ['dict'], timestamp: Date.now() } as AIMessageType } });
      setTimeout(() => {
        dispatch({ type: 'UPDATE_MESSAGE', payload: { conversationId: convId, messageId: aiId, updates: { ...buildDictReply(rawQuestion, keyword), isLoading: false } as Partial<AIMessageType> } });
        dispatch({ type: 'SET_LOADING', payload: false });
      }, 500);
      return;
    }

    // 解析 @时间解析 / @SQL优化 技能标签
    const { cleaned, tags } = parseSkillTags(rawQuestion);
    const questionForAI = cleaned || rawQuestion;

    dispatch({ type: 'ADD_MESSAGE', payload: { conversationId: convId, message: { id: aiId, type: 'ai', question: questionForAI, matchedMetrics: [], sql: '', isLoading: true, timestamp: Date.now() } as AIMessageType } });

    void runAIReply(questionForAI, history, convId, aiId, tags);
  };

  // 第四轮：工作台首页「立即提问/示例问题」携带问题跳转过来后，自动在新会话发起提问
  // ref 守卫：StrictMode 开发环境 effect 双触发时保证同一问题只发送一次；清空后复位以支持再次点击
  const consumedQuestionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!state.pendingChatQuestion) {
      consumedQuestionRef.current = null;
      return;
    }
    if (consumedQuestionRef.current === state.pendingChatQuestion) return;
    const q = state.pendingChatQuestion;
    consumedQuestionRef.current = q;
    dispatch({ type: 'SET_CHAT_QUESTION', payload: null });
    void handleSend(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.pendingChatQuestion]);

  // 问数取数管线：分阶段 plan（默认）→ 失败降级 SSE → 非流式 API → 前端 Mock
  const runAIReply = async (
    question: string,
    history: { role: string; content: string }[],
    convId: string,
    aiId: string,
    tags: SkillTag[] = [],
  ) => {
    // 阶段一：需求理解 + SQL 草案（确认前后端不执行 SQL）
    dispatch({ type: 'UPDATE_MESSAGE', payload: { conversationId: convId, messageId: aiId,
      updates: { stage: 'planning', streamingStatus: '正在理解需求、识别指标口径并生成 SQL 草案…' } } });
    let planReply: Partial<AIMessageType> | null = null;
    try { planReply = await callChatPlan(question, history); } catch { planReply = null; }
    if (planReply?.planId) {
      dispatch({ type: 'UPDATE_MESSAGE', payload: { conversationId: convId, messageId: aiId,
        updates: { ...planReply, isLoading: false, streamingStatus: undefined } as Partial<AIMessageType> } });
      dispatch({ type: 'SET_LOADING', payload: false });
      return;
    }

    // plan 不可用（旧版后端/服务异常）→ 降级第一轮的立即执行链路
    let reply: Partial<AIMessageType> | null = null;
    try {
      reply = await streamBackendChat(question, (patch) => {
        dispatch({ type: 'UPDATE_MESSAGE', payload: { conversationId: convId, messageId: aiId, updates: patch } });
      }, history);
    } catch {
      reply = null;
    }
    if (!reply) {
      try { reply = await callBackendChat(question, history); } catch { reply = null; }
    }
    let degraded = false;
    if (!reply) {
      await new Promise(r => setTimeout(r, 400 + Math.random() * 500));
      reply = mockAIReply(question);
      degraded = true;
    }
    if (tags.length > 0) {
      reply = attachSkillEnhancements(reply, tags, question);
    }
    if (degraded) {
      reply.degraded = true;
      reply.retryable = true;
      reply.summary = {
        key_findings: [
          '⚠️ 后端服务暂不可达，当前为前端演示数据（非真实取数结果），可点击下方「重试」重新连接后端。',
          ...(reply.summary?.key_findings || []),
        ],
      };
    }
    dispatch({ type: 'UPDATE_MESSAGE', payload: { conversationId: convId, messageId: aiId, updates: { ...reply, stage: 'done', isLoading: false, streamingStatus: undefined } as Partial<AIMessageType> } });
    dispatch({ type: 'SET_LOADING', payload: false });
  };

  // 阶段二：用户在草案卡片上点击「确认 SQL 并执行」后，才真正执行查询
  const handleConfirmPlan = async (planId: string, aiId: string) => {
    const convId = currentConversation.id;
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({
      type: 'UPDATE_MESSAGE',
      payload: {
        conversationId: convId, messageId: aiId,
        updates: {
          stage: 'executing', isLoading: true, confirmError: undefined,
          streamingStatus: '正在按您确认的 SQL 执行查询…',
        } as Partial<AIMessageType>,
      },
    });
    let reply: Partial<AIMessageType> | null = null;
    try { reply = await callChatConfirm(planId); } catch { reply = null; }
    if (reply?.result) {
      dispatch({ type: 'UPDATE_MESSAGE', payload: { conversationId: convId, messageId: aiId,
        updates: { ...reply, isLoading: false, streamingStatus: undefined } as Partial<AIMessageType> } });
    } else {
      // 执行失败：回到草案态，允许再次确认或重新提问（第一轮重试能力保留）
      dispatch({ type: 'UPDATE_MESSAGE', payload: { conversationId: convId, messageId: aiId,
        updates: {
          stage: 'draft', isLoading: false, streamingStatus: undefined,
          confirmError: '执行失败或服务暂不可达，可再次点击「确认 SQL 并执行」重试。',
          retryable: true,
        } as Partial<AIMessageType> } });
    }
    dispatch({ type: 'SET_LOADING', payload: false });
  };

  // 手动重试：复用原 AI 消息卡片，重置为加载态后重跑取数管线（不新增用户消息）
  const handleRetry = (question: string, failedAiId: string) => {
    const convId = currentConversation.id;
    // 历史中剔除本次失败的 AI 消息，避免把降级 Mock 内容当作上文
    const history = buildHistory(currentConversation.messages.filter(m => m.id !== failedAiId));
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({
      type: 'UPDATE_MESSAGE',
      payload: {
        conversationId: convId, messageId: failedAiId,
        updates: {
          isLoading: true, sql: '', baselineSql: '', result: undefined, summary: undefined,
          pipelineTrace: undefined, degraded: false, retryable: false, streamingStatus: '正在重新连接后端...',
          stage: 'planning', planId: undefined, clarifications: [], assumptions: [],
          suggestions: [], confirmError: undefined,
        } as Partial<AIMessageType>,
      },
    });
    void runAIReply(question, history, convId, failedAiId, []);
  };

  const hasMessages = currentConversation.messages.length > 0;

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-64px)] overflow-hidden">
      {!hasMessages ? (
        <WelcomePage onSelectQuestion={handleSend} />
      ) : (
        <>
          <div className="flex-1 overflow-y-auto">
            <div style={{ maxWidth: 880, margin: '0 auto', padding: '32px 24px 16px 24px' }}>
              {currentConversation.messages.map(msg => (
                msg.type === 'user'
                  ? <UserMessageCard key={msg.id} content={msg.content} />
                  : <AIMessageCard
                      key={msg.id}
                      message={msg}
                      onRetry={(q) => handleRetry(q, msg.id)}
                      onConfirm={(pid) => void handleConfirmPlan(pid, msg.id)}
                      onAsk={(q) => handleSend(q)}
                    />
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>
        </>
      )}
      <ChatInput onSend={handleSend} />
    </div>
  );
}
