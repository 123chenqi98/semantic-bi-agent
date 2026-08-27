// 指标定义
export interface Metric {
  id: string;
  name: string;
  definition: string;
  sql_template: string;
  aliases: string[];
  confusing_notes: string[];
}

// 消息中的指标识别结果
export interface MatchedMetric {
  id: string;
  name: string;
}

// 表格结果
export interface QueryResult {
  columns: string[];
  rows: (string | number | null)[][];
  rowCount: number;
  executionTimeMs?: number;
}

// 分析摘要
export interface AnalysisSummary {
  key_findings: string[];
  trends?: string;
  anomalies?: string[];
}

// AI回复消息
export type SkillTag = 'time' | 'sql' | 'dict';

export interface ChartPendingPayload {
  fileName: string;
  background: string;
  goal: string;
  csvData: string;
  autoGenerate?: boolean;
}

export interface AIMessage {
  id: string;
  type: 'ai';
  question: string;
  matchedMetrics: MatchedMetric[];
  matchedDimensions?: string[];
  timeRange?: string;
  sql: string;
  baselineSql?: string;
  result?: QueryResult;
  chartData?: any;
  chartType?: 'line' | 'bar' | 'pie' | 'table';
  summary?: AnalysisSummary;
  isLoading?: boolean;
  timestamp: number;
  skillTags?: SkillTag[];
  dictResult?: Metric;
  sqlSuggestions?: string[];
  isHelp?: boolean;
}

// 用户消息
export interface UserMessage {
  id: string;
  type: 'user';
  content: string;
  timestamp: number;
}

export type Message = UserMessage | AIMessage;

// 会话
export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

// 导航页面类型
export type PageType = 'chat' | 'chartAssistant' | 'dictionary' | 'evaluation' | 'settings';

// 实验评测结果
export interface EvaluationResult {
  questionId: string;
  question: string;
  difficulty: '简单' | '中等' | '困难';
  questionType: string;
  baselineCorrect: boolean;
  experimentCorrect: boolean;
  baselineErrorReason?: string;
  experimentErrorReason?: string;
}
