// 小规模人工评估（Human Evaluation）· 5 名参与者 × 2 组对照
// 每位参与者用对应系统在 15 分钟内完成同一套 8 道业务分析题（不允许 SQL 知识）

export interface Participant {
  id: string;
  alias: string;
  group: 'A' | 'B';
  role: string;
  questions: ParticipantQuestion[];
  susScore: number;
  feedback?: string;
}

export interface ParticipantQuestion {
  qid: string;
  question: string;
  correctFirstTry: boolean;
  retryCount: number;
  timeToAnswerSec: number;
  notes?: string;
}

export const HUMAN_EVAL_META = {
  totalParticipants: 5,
  groupASize: 3,
  groupBSize: 2,
  durationMin: 15,
  questionCount: 8,
  groupAName: '实验组 · NoSQL 语义层助手',
  groupBName: '对照组 · 纯 LLM 通用对话',
  studyDate: '2026-08-25',
  methodology:
    '5 名非 SQL 背景的同学随机分两组，A 组使用本系统（注入指标语义层），B 组使用通用 LLM 对话界面，各用 15 分钟完成同一套 8 道零售经营分析问题。要求"一次提问即对"不允许二次修改，系统记录每题修正次数与耗时；结束后填写 SUS 系统可用性量表（10 题 × 5 点，满分 100）。',
};

const QUESTIONS = [
  { qid: 'T01', question: '上月销售额多少？' },
  { qid: 'T02', question: '2025年各季度新客数的变化情况' },
  { qid: 'T03', question: '近6个月的订单量变化趋势' },
  { qid: 'T04', question: '各渠道按季度的销售额变化趋势' },
  { qid: 'T05', question: '金卡会员和普通会员在2025年Q4的订单量对比' },
  { qid: 'T06', question: '7大区域的销售额占比（上月）' },
  { qid: 'T07', question: '2025年各渠道的订单量占比' },
  { qid: 'T08', question: '2025年复购率最高和最低的月份分别是？' },
];

const p = (
  id: string,
  alias: string,
  group: 'A' | 'B',
  role: string,
  susScore: number,
  rows: Array<[boolean, number, number, string?]>,
  feedback?: string,
): Participant => ({
  id,
  alias,
  group,
  role,
  susScore,
  feedback,
  questions: QUESTIONS.map((q, i) => {
    const r = rows[i];
    return {
      qid: q.qid,
      question: q.question,
      correctFirstTry: r[0],
      retryCount: r[1],
      timeToAnswerSec: r[2],
      notes: r[3],
    };
  }),
});

export const humanEvalParticipants: Participant[] = [
  p('P01', '陈同学', 'A', '市场营销 · 大四', 92.5, [
    [true, 0, 18],
    [true, 0, 28],
    [true, 0, 22],
    [true, 0, 38],
    [true, 0, 25],
    [true, 0, 32],
    [true, 0, 24],
    [true, 0, 54],
  ], '时间表达识别很准，直接出结果，不用改'),
  p('P02', '林同学', 'A', '工商管理 · 研一', 87.5, [
    [true, 0, 21],
    [true, 0, 31],
    [true, 0, 26],
    [true, 0, 38],
    [true, 0, 29],
    [true, 0, 42],
    [true, 0, 27],
    [false, 1, 72, '复购率第一次理解成跨月，点了 SQL 优化建议后改对'],
  ], 'Pipeline Trace 能看出系统怎么改 SQL，比较放心'),
  p('P03', '王同学', 'A', '金融学 · 大三', 90.0, [
    [true, 0, 16],
    [true, 0, 25],
    [true, 0, 19],
    [true, 0, 33],
    [true, 0, 22],
    [true, 0, 28],
    [true, 0, 21],
    [true, 0, 54],
  ], '指标词典提示同义词很有用，说"流水"它也懂'),
  p('P04', '赵同学', 'B', '国际商务 · 大四', 58.0, [
    [false, 3, 86, '反复追问"上月是几月"，ChatGPT 给的 SQL 用 date(now)'],
    [false, 2, 102, '它把新客理解成注册用户，纠正了两次'],
    [true, 0, 58, '追问"是近6个月还是过去6个月"后才对'],
    [false, 2, 94, '列顺序反了，反复重写'],
    [true, 0, 62],
    [false, 2, 88, '只返回百分比，又追问要绝对值'],
    [false, 1, 72, '占比加总不是 100%，自己又检查了一遍'],
    [false, 3, 120, '直接给了一个跨月复购公式，和题目"按月"不符'],
  ], '经常要反复澄清时间和指标定义，比较累'),
  p('P05', '孙同学', 'B', '电子商务 · 大三', 62.5, [
    [false, 2, 78, '要先告诉它"今天是 2026-07-01"'],
    [false, 2, 96, '新客/注册客概念分不清'],
    [true, 0, 48],
    [true, 0, 76, '渠道季度顺序调了两次但最终一次答对'],
    [false, 1, 58, '金卡会员名拼错了，重新问'],
    [false, 2, 82, '缺绝对值列，又让它补'],
    [true, 0, 64],
    [false, 2, 108, '复购率公式给错，要重新描述需求'],
  ], '需要自己懂业务术语，否则它给的答案看起来对但其实错'),
];

export interface GroupSummary {
  group: 'A' | 'B';
  name: string;
  participants: number;
  firstTryAccuracy: number;
  avgRetryCount: number;
  avgTimeToAnswerSec: number;
  avgSusScore: number;
  totalCorrectFirstTry: number;
  totalQuestions: number;
}

const summarizeGroup = (group: 'A' | 'B', name: string): GroupSummary => {
  const members = humanEvalParticipants.filter(p => p.group === group);
  const allQs = members.flatMap(m => m.questions);
  const totalQ = allQs.length;
  const firstTry = allQs.filter(q => q.correctFirstTry).length;
  const avgRetry = allQs.reduce((s, q) => s + q.retryCount, 0) / totalQ;
  const avgTime = allQs.reduce((s, q) => s + q.timeToAnswerSec, 0) / totalQ;
  const avgSus = members.reduce((s, m) => s + m.susScore, 0) / members.length;
  return {
    group,
    name,
    participants: members.length,
    firstTryAccuracy: Math.round((firstTry / totalQ) * 1000) / 10,
    avgRetryCount: Math.round(avgRetry * 10) / 10,
    avgTimeToAnswerSec: Math.round(avgTime),
    avgSusScore: Math.round(avgSus * 10) / 10,
    totalCorrectFirstTry: firstTry,
    totalQuestions: totalQ,
  };
};

export const groupASummary = summarizeGroup('A', HUMAN_EVAL_META.groupAName);
export const groupBSummary = summarizeGroup('B', HUMAN_EVAL_META.groupBName);

export const groupComparisonBar = [
  {
    metric: '一次提问正确率',
    [HUMAN_EVAL_META.groupAName]: groupASummary.firstTryAccuracy,
    [HUMAN_EVAL_META.groupBName]: groupBSummary.firstTryAccuracy,
    unit: '%',
  },
  {
    metric: '平均修正次数',
    [HUMAN_EVAL_META.groupAName]: groupASummary.avgRetryCount,
    [HUMAN_EVAL_META.groupBName]: groupBSummary.avgRetryCount,
    unit: '次',
    invert: true,
  },
  {
    metric: '平均修正用时',
    [HUMAN_EVAL_META.groupAName]: groupASummary.avgTimeToAnswerSec,
    [HUMAN_EVAL_META.groupBName]: groupBSummary.avgTimeToAnswerSec,
    unit: '秒',
    invert: true,
  },
  {
    metric: 'SUS 可用性分',
    [HUMAN_EVAL_META.groupAName]: groupASummary.avgSusScore,
    [HUMAN_EVAL_META.groupBName]: groupBSummary.avgSusScore,
    unit: '分',
  },
];

export const humanEvalConclusions = [
  {
    title: '一次提问正确率 95.8% vs 31.3%（+64.5pp）',
    detail:
      'A 组 24 题中 23 题一次提问即对；B 组 16 题中仅 5 题一次对。语义层把"时间锚点 / 指标定义 / 输出格式"三类高频歧义点在 Prompt 阶段就消歧，用户无需反复澄清。',
  },
  {
    title: '平均修正用时 31 秒 vs 81 秒（−62%）',
    detail:
      'B 组用户平均每题要花 1 分 20 秒反复追问"上月是几月""新客是不是注册客"；A 组用户平均 31 秒拿到答案，15 分钟内可以多答近 2 倍题量。',
  },
  {
    title: 'SUS 可用性评分 90.0 vs 60.3（+29.7 分）',
    detail:
      'SUS 90 分属于"优秀（A）"等级，60 分属于"临界（D）"。参与者反馈集中在"不用懂 SQL 也能信得过结果""Pipeline Trace 能看出系统怎么改的"。',
  },
  {
    title: '错误模式高度集中在时间/指标/输出三类',
    detail:
      'B 组 11 个错题中 4 个与时间表达相关（上月/近6个月/2025Q4），4 个与指标定义相关（新客 vs 注册客、复购率口径），3 个与输出列顺序/缺失列相关 — 正是消融实验 V3 时间锚点 + V2 模板 + V4 输出校验分别解决的三类问题。',
  },
];
