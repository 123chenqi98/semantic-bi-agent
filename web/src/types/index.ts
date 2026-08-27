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
  success?: boolean;
  error?: string | null;
}

// 分析摘要
export interface AnalysisSummary {
  key_findings: string[];
  trends?: string;
  anomalies?: string[];
}

// Pipeline Trace：语义层处理轨迹（5 步）
export interface PipelineStep {
  step: number;
  name: string;
  status: 'ok' | 'warn' | 'error';
  detail: string;
}

export interface PipelineTrace {
  mode: string;
  baseline_snapshot: { sql: string; success: boolean; row_count: number; error?: string | null };
  sql_snapshot: string;
  rules_applied: string[];
  errors_corrected: string[];
  steps: PipelineStep[];
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
  pipelineTrace?: PipelineTrace;
  baselineResult?: QueryResult;
  baselinePrompt?: string;
  experimentPrompt?: string;
  streamingStatus?: string;
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
export type PageType = 'chat' | 'chartAssistant' | 'dictionary' | 'evaluation' | 'settings' | 'semanticEditor';

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
  baselineSql?: string;
  optimizedSql?: string;
}
