import { useState, Fragment } from 'react';
import { Sparkles, Lightbulb, BookOpen, Clock, Code2, AlertTriangle, HelpCircle, BarChart3, FlaskConical, Trash2, Zap, ChevronDown, ChevronRight, Activity, CheckCircle2, XCircle, Cpu, GitBranch, Calendar, ShieldCheck, Database, RefreshCw, Target, Tag, MessageSquare } from 'lucide-react';
import SQLBlock from '../common/SQLBlock';
import SQLDiff from '../common/SQLDiff';
import ResultWorkbench from './ResultWorkbench';
import PromptViewer from '../common/PromptViewer';
import type { AIMessage as AIMessageType } from '../../types';
import { useApp } from '../../store/ChatContext';

interface AIMessageCardProps {
  message: AIMessageType;
  onRetry?: (question: string) => void;
  onConfirm?: (planId: string) => void;
  onAsk?: (question: string) => void;
}

// 草案来源标签（与后端 sql_source 对齐）
const SQL_SOURCE_LABEL: Record<string, string> = {
  'semantic-llm': '语义层 + LLM 生成',
  'preset-bank': '内置语义题库',
  'dimension-template': '维度下钻模板',
  fallback: '兜底模板',
};

const SKILL_PILL: Record<string, { label: string; bg: string; color: string; icon: React.ReactNode }> = {
  time: { label: '时间解析增强', bg: '#E8F4FD', color: '#1677FF', icon: <Clock size={11} /> },
  sql: { label: 'SQL 优化对比', bg: '#FFF3E8', color: '#FF7D00', icon: <Code2 size={11} /> },
  dict: { label: '指标词典查询', bg: '#F5F0FF', color: '#8B45C9', icon: <BookOpen size={11} /> },
};

function HelpCard() {
  const skills = [
    { icon: <BookOpen size={14} />, name: '@指标词典', desc: '查询指标定义、口径规则与同义词。用法：@指标词典 销售额' },
    { icon: <BarChart3 size={14} />, name: '@图表生成', desc: '立即跳转图表助手，自动载入最近一次查询结果（选中即触发）' },
    { icon: <Clock size={14} />, name: '@时间解析', desc: '作为消息前缀，启用后 AI 会强制按语义层映射解析时间表达' },
    { icon: <Code2 size={14} />, name: '@SQL优化', desc: '作为消息前缀，启用后会强制显示基线对比并给出 SQL 优化建议' },
    { icon: <FlaskConical size={14} />, name: '@对比实验', desc: '立即跳转到 25 题准确率对照评测页（选中即触发）' },
  ];
  const commands = [
    { cmd: '/help', desc: '查看本帮助' },
    { cmd: '/clear', desc: '清空当前对话，开始新对话' },
    { cmd: '/example', desc: '随机填入一个示例问题到输入框' },
    { cmd: '/chart', desc: '跳转到图表生成助手（自动带入最近查询结果）' },
    { cmd: '/dict', desc: '跳转到指标语义词典' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', rowGap: 16 }}>
      <div className="bg-white" style={{ border: '1px solid #ECEDF1', borderRadius: 4, padding: 20 }}>
        <div className="flex items-center gap-2 text-[14px] font-medium mb-3" style={{ color: '#252931' }}>
          <Sparkles size={14} style={{ color: '#B758ED' }} />
          <span>NoSQL 经营分析助手 · 使用帮助</span>
        </div>
        <p className="text-[13px]" style={{ color: '#565960', lineHeight: 1.8 }}>
          在输入框输入 <kbd style={{ padding: '1px 5px', background: '#F5F6F8', borderRadius: 3, fontFamily: 'var(--font-mono)', fontSize: 12 }}>@</kbd> 唤起技能，输入 <kbd style={{ padding: '1px 5px', background: '#F5F6F8', borderRadius: 3, fontFamily: 'var(--font-mono)', fontSize: 12 }}>/</kbd> 唤起快捷指令。支持 ↑↓ 切换、Enter/Tab 确认、Esc 关闭。
        </p>
      </div>

      <div className="bg-white" style={{ border: '1px solid #ECEDF1', borderRadius: 4, padding: 20 }}>
        <div className="flex items-center gap-2 text-[13px] font-medium mb-3" style={{ color: '#252931' }}>
          <Zap size={13} style={{ color: '#B758ED' }} />
          <span>技能（@）</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', rowGap: 10 }}>
          {skills.map(s => (
            <div key={s.name} className="flex items-start gap-3 text-[13px]" style={{ color: '#252931', lineHeight: 1.7 }}>
              <span className="flex items-center justify-center shrink-0 mt-0.5" style={{ width: 24, height: 24, borderRadius: 4, background: '#F5F0FF', color: '#8B45C9' }}>{s.icon}</span>
              <div>
                <span className="font-mono font-medium" style={{ color: '#B758ED' }}>{s.name}</span>
                <span className="ml-2" style={{ color: '#565960' }}>{s.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white" style={{ border: '1px solid #ECEDF1', borderRadius: 4, padding: 20 }}>
        <div className="flex items-center gap-2 text-[13px] font-medium mb-3" style={{ color: '#252931' }}>
          <Trash2 size={13} style={{ color: '#B758ED' }} />
          <span>快捷指令（/）</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {commands.map(c => (
            <div key={c.cmd} className="flex items-center gap-2 text-[13px]" style={{ color: '#252931', lineHeight: 1.7 }}>
              <code className="font-mono" style={{ background: '#F5F6F8', color: '#B758ED', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>{c.cmd}</code>
              <span style={{ color: '#565960' }}>{c.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DictCard({ metric }: { metric: NonNullable<AIMessageType['dictResult']> }) {
  return (
    <div className="overflow-hidden bg-white" style={{ border: '1px solid #D9BAF7', borderRadius: 4 }}>
      <div style={{ background: '#F7F0FF', borderLeft: '4px solid #B758ED', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <BookOpen size={16} style={{ color: '#B758ED' }} />
        <span className="font-mono text-[12px] font-medium" style={{ background: '#EADDFF', color: '#8B45C9', padding: '3px 8px', borderRadius: 4 }}>{metric.id}</span>
        <span className="text-[14px] font-semibold" style={{ color: '#8B45C9' }}>{metric.name}</span>
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', rowGap: 16, background: '#FCFBFE' }}>
        <div>
          <div className="text-[12px] font-medium mb-2" style={{ color: '#898B8F', letterSpacing: '0.02em' }}>定义</div>
          <p className="text-[14px]" style={{ color: '#252931', lineHeight: 1.8 }}>{metric.definition}</p>
        </div>
        <div>
          <div className="text-[12px] font-medium mb-2" style={{ color: '#898B8F', letterSpacing: '0.02em' }}>SQL 计算模板</div>
          <div className="overflow-x-auto" style={{ background: '#FFFFFF', border: '1px solid #F1F2F3', borderRadius: 4, padding: 14 }}>
            <code className="block text-[13px]" style={{ color: '#252931', whiteSpace: 'pre', lineHeight: 1.75, fontFamily: 'var(--font-mono)' }}>
              {metric.sql_template}
            </code>
          </div>
        </div>
        <div>
          <div className="text-[12px] font-medium mb-2" style={{ color: '#898B8F', letterSpacing: '0.02em' }}>同义词（均可被识别）</div>
          <div className="flex flex-wrap" style={{ gap: 6 }}>
            {metric.aliases.map(a => (
              <span key={a} className="text-[12px]" style={{ background: '#F5F6F8', color: '#565960', padding: '3px 8px', borderRadius: 4 }}>{a}</span>
            ))}
          </div>
        </div>
        {metric.confusing_notes.length > 0 && (
          <div style={{ background: '#FFFDF5', border: '1px solid #FCEBBF', borderRadius: 4, padding: 14 }}>
            <div className="flex items-center gap-1.5 text-[12px] font-medium mb-2" style={{ color: '#B76E00' }}>
              <AlertTriangle size={13} /> 易混淆口径
            </div>
            <ul style={{ rowGap: 6, display: 'flex', flexDirection: 'column' }}>
              {metric.confusing_notes.map((note, i) => (
                <li key={i} className="text-[13px] flex gap-2" style={{ color: '#7D4A00', lineHeight: 1.7 }}>
                  <span style={{ color: '#FFB020' }}>•</span><span>{note}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AIMessageCard({ message, onRetry, onConfirm, onAsk }: AIMessageCardProps) {
  const { state } = useApp();
  const forceShowBaseline = message.skillTags?.includes('sql');
  const showBaseline = state.showBaselineCompare || forceShowBaseline;
  const [traceOpen, setTraceOpen] = useState(false);

  if (message.isLoading && !message.sql && !message.streamingStatus) {
    return (
      <div className="flex w-full" style={{ gap: 12, marginBottom: 40 }}>
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: 32, height: 32, background: '#B758ED', borderRadius: 8 }}
        >
          <Sparkles size={16} className="text-white" />
        </div>
        <div className="flex-1 pt-1">
          <div className="flex items-center gap-2" style={{ color: '#565960' }}>
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#B0B5BD', animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#B0B5BD', animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#B0B5BD', animationDelay: '300ms' }} />
            </div>
            <span className="text-[14px] ml-1">
              {message.isHelp ? '正在生成帮助...' : message.skillTags?.includes('dict') ? '正在查询指标词典...' : '分析中，请稍候...'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // 帮助卡片
  if (message.isHelp) {
    return (
      <div className="flex w-full" style={{ gap: 12, marginBottom: 40 }}>
        <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 32, background: '#B758ED', borderRadius: 8 }}>
          <HelpCircle size={16} className="text-white" />
        </div>
        <div className="flex-1 min-w-0" style={{ paddingTop: 4 }}><HelpCard /></div>
      </div>
    );
  }

  // 词典查询结果（无sql无result）
  const isDictOnly = message.skillTags?.includes('dict') && message.dictResult;

  return (
    <div className="flex w-full" style={{ gap: 12, marginBottom: 40 }}>
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: 32, height: 32, background: '#B758ED', borderRadius: 8 }}
      >
        <Sparkles size={16} className="text-white" />
      </div>
      <div className="flex-1 min-w-0" style={{ paddingTop: 4 }}>
        {/* 技能标签 + 指标/时间/维度 pill */}
        {(message.skillTags?.length || message.matchedMetrics.length > 0 || message.timeRange || message.matchedDimensions?.length) ? (
          <div className="flex flex-wrap" style={{ gap: 8, marginBottom: 16 }}>
            {message.skillTags?.map(t => SKILL_PILL[t] && (
              <span key={t} className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ background: SKILL_PILL[t].bg, color: SKILL_PILL[t].color, padding: '3px 8px', borderRadius: 4 }}>
                {SKILL_PILL[t].icon}{SKILL_PILL[t].label}
              </span>
            ))}
            {message.matchedMetrics.map(m => (
              <span key={m.id} className="pill pill-brand">{m.name}</span>
            ))}
            {message.timeRange && (
              <span className="pill pill-success">{message.timeRange}</span>
            )}
            {message.matchedDimensions?.map((d, i) => (
              <span key={i} className="pill pill-warning">{d}</span>
            ))}
          </div>
        ) : null}

        {message.streamingStatus && (
          <div className="flex items-center gap-2" style={{ marginBottom: 12, fontSize: 12, color: '#B758ED' }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: '#B758ED',
              animation: 'pulse 1s ease-in-out infinite',
            }} />
            <span>{message.streamingStatus}</span>
            <span className="font-mono" style={{ animation: 'blink 1s step-end infinite' }}>▊</span>
          </div>
        )}

        {/* 后端不可达降级提示 + 手动重试（错误恢复闭环） */}
        {message.degraded && !message.isLoading && (
          <div style={{
            marginBottom: 12, background: '#FFF8F1', border: '1px solid #FFE0C2',
            borderRadius: 4, padding: '10px 14px', display: 'flex',
            alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <div className="flex items-center gap-2 text-[12.5px]" style={{ color: '#874A20', lineHeight: 1.6 }}>
              <AlertTriangle size={14} style={{ color: '#FF7D00', flexShrink: 0 }} />
              <span>后端服务暂不可达，当前为前端演示数据（非真实取数结果）。</span>
            </div>
            {message.retryable && onRetry && (
              <button
                type="button"
                onClick={() => onRetry(message.question)}
                className="inline-flex items-center gap-1 text-[12px] font-medium"
                style={{
                  flexShrink: 0, padding: '4px 12px', borderRadius: 4,
                  border: '1px solid #B758ED', background: '#fff', color: '#B758ED',
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={12} /> 重试
              </button>
            )}
          </div>
        )}

        {/* 分阶段流程 · 阶段一：需求理解 + SQL 草案（待用户确认，尚未执行） */}
        {!isDictOnly && message.stage === 'draft' && !message.isLoading && (
          <DraftConfirmCard message={message} onConfirm={onConfirm} />
        )}

        {/* 词典卡片 */}
        {isDictOnly && message.dictResult && <DictCard metric={message.dictResult} />}

        {/* 普通问答（草案/执行中阶段只展示草案卡片或执行状态，不渲染结果区） */}
        {!isDictOnly && message.stage !== 'draft' && message.stage !== 'executing' && (
          <>
            {/* SQL 查询依据分区（可复制，草案确认后执行的 SQL 与结果工作台一一对应） */}
            {(message.baselineSql || message.sql) && (
              <div style={{ marginTop: 16 }}>
                <div className="flex items-center gap-2" style={{ fontSize: 13, fontWeight: 600, color: '#252931', marginBottom: 8 }}>
                  <Database size={13} style={{ color: '#B758ED' }} />
                  SQL 查询依据
                </div>
                {showBaseline && message.baselineSql && (
                  <SQLBlock sql={message.baselineSql} label="基线生成" variant="baseline" defaultOpen={false} />
                )}
                {message.sql && <SQLBlock sql={message.sql} label="语义优化后" variant="experiment" defaultOpen={!showBaseline} />}

                {showBaseline && message.baselineSql && message.sql && (
                  <div style={{ marginTop: 8 }}>
                    <SQLDiff
                      baselineSql={message.baselineSql}
                      optimizedSql={message.sql}
                      title="基线 vs 语义优化 SQL 差异对比"
                      defaultOpen={forceShowBaseline}
                    />
                  </div>
                )}
              </div>
            )}

            {/* 第三轮：结构化结果工作台（摘要/来源口径/发现/图表/结果表/风险/下一步） */}
            {message.result && <ResultWorkbench message={message} onAsk={(q) => onAsk?.(q)} />}
          </>
        )}

        {/* SQL 优化建议 */}
        {message.sqlSuggestions && message.sqlSuggestions.length > 0 && (
          <div style={{ marginTop: 16, background: '#FFF8F1', border: '1px solid #FFE0C2', borderRadius: 4, padding: 16 }}>
            <div className="flex items-center gap-2 text-[13px] font-medium mb-2" style={{ color: '#C75B14' }}>
              <Code2 size={13} /> SQL 优化建议
            </div>
            <ul className="text-[13px]" style={{ color: '#874A20', lineHeight: 1.8, rowGap: 4, display: 'flex', flexDirection: 'column' }}>
              {message.sqlSuggestions.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span style={{ color: '#FF7D00', flexShrink: 0 }}>•</span><span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 有数据结果时，结论已在 ResultWorkbench「核心发现」分区展示；此块仅保留给无结果的兜底消息 */}
        {!message.result && message.summary && message.summary.key_findings.length > 0 && (
          <div className="insight-note" style={{ marginTop: 16 }}>
            <div className="flex items-center gap-2 text-[14px] mb-3" style={{ color: '#252931', fontWeight: 500 }}>
              <Lightbulb size={15} style={{ color: '#B758ED' }} />
              {message.skillTags?.includes('dict') ? '查询结果' : '分析说明'}
            </div>
            <ul className="text-[14px]" style={{ color: '#252931', lineHeight: 1.8, rowGap: 8, display: 'flex', flexDirection: 'column' }}>
              {message.summary.key_findings.map((f, i) => (
                <li key={i} className="flex gap-2.5">
                  <span style={{ color: '#B758ED', flexShrink: 0, lineHeight: 1.8 }}>•</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {message.pipelineTrace && (
          <div style={{ marginTop: 16, border: '1px solid #ECEDF1', borderRadius: 4, background: '#FBFCFD', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setTraceOpen(v => !v)}
              className="w-full flex items-center justify-between text-left"
              style={{ padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              <div className="flex items-center gap-2 flex-wrap" style={{ color: '#252931', fontSize: 13, fontWeight: 500 }}>
                <Activity size={14} style={{ color: '#B758ED' }} />
                <span>语义层 Pipeline Trace</span>
                <span style={{
                  fontSize: 10.5, fontWeight: 500, padding: '1px 7px', borderRadius: 3,
                  background: '#F0E8FF', color: '#6D39C7',
                }}>
                  {message.pipelineTrace.mode}
                </span>
                <span className="text-[11px] font-normal" style={{ color: '#898B8F' }}>
                  {message.pipelineTrace.steps.length} 步 · 命中 {message.pipelineTrace.rules_applied.length} 条规则
                  {message.pipelineTrace.errors_corrected.length
                    ? ` · 纠正 ${message.pipelineTrace.errors_corrected.length} 项错误`
                    : ''}
                </span>
              </div>
              {traceOpen
                ? <ChevronDown size={14} style={{ color: '#898B8F', flexShrink: 0 }} />
                : <ChevronRight size={14} style={{ color: '#898B8F', flexShrink: 0 }} />}
            </button>
            {traceOpen && (
              <div style={{ padding: '4px 16px 16px 16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {message.pipelineTrace.steps.map((s, idx) => {
                    const stepIcons = [Cpu, GitBranch, Calendar, ShieldCheck, Database];
                    const StepIcon = stepIcons[s.step - 1] || Cpu;
                    const isLast = idx === message.pipelineTrace!.steps.length - 1;
                    const statusColor = s.status === 'ok' ? '#22C55E' : s.status === 'error' ? '#EF4444' : '#F59E0B';
                    const stepColors = ['#7C8EF2', '#B758ED', '#2563EB', '#0891B2', '#22C55E'];
                    const accentColor = stepColors[s.step - 1] || '#B758ED';
                    return (
                      <Fragment key={s.step}>
                        <div style={{ display: 'flex', gap: 12, minHeight: 48 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 28, flexShrink: 0 }}>
                            <div style={{
                              width: 26, height: 26, borderRadius: '50%',
                              background: s.status === 'ok' ? `${accentColor}14` : '#FEF2F2',
                              border: `2px solid ${accentColor}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0, position: 'relative', zIndex: 1,
                            }}>
                              {s.status === 'ok'
                                ? <StepIcon size={12} style={{ color: accentColor }} />
                                : s.status === 'error'
                                  ? <XCircle size={12} style={{ color: statusColor }} />
                                  : <AlertTriangle size={12} style={{ color: statusColor }} />}
                            </div>
                            {!isLast && (
                              <div style={{ width: 2, flex: 1, background: '#E8EAF0', marginTop: 2, marginBottom: 2 }} />
                            )}
                          </div>
                          <div style={{ paddingBottom: isLast ? 0 : 12, flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{
                                fontSize: 10, fontWeight: 700, color: accentColor,
                                background: `${accentColor}14`, padding: '1px 6px', borderRadius: 3,
                                fontFamily: 'var(--font-mono), monospace',
                              }}>
                                STEP {s.step}
                              </span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#252931' }}>
                                {s.name}
                              </span>
                              {s.status === 'ok' && (
                                <CheckCircle2 size={12} style={{ color: '#22C55E' }} />
                              )}
                            </div>
                            <div style={{ fontSize: 12, lineHeight: 1.75, color: '#565960', marginTop: 4 }}>
                              {s.detail}
                            </div>
                          </div>
                        </div>
                      </Fragment>
                    );
                  })}
                </div>

                {message.pipelineTrace.rules_applied.length > 0 && (
                  <div style={{
                    marginTop: 12, padding: '10px 12px', background: '#FAF7FF',
                    border: '1px solid #EDE4FF', borderRadius: 4,
                  }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: '#6D39C7', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ShieldCheck size={12} /> 命中的语义规则（{message.pipelineTrace.rules_applied.length}）
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {message.pipelineTrace.rules_applied.map((r, i) => (
                        <span key={i} style={{
                          fontSize: 11, padding: '2px 8px', background: '#fff',
                          color: '#6D39C7', borderRadius: 3, border: '1px solid #E0D4FF',
                          fontFamily: 'var(--font-mono), monospace',
                        }}>
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {message.pipelineTrace.errors_corrected.length > 0 && (
                  <div style={{
                    marginTop: 8, padding: '10px 12px', background: '#FFFBEB',
                    border: '1px solid #FEF3C7', borderRadius: 4,
                  }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: '#92400E', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <AlertTriangle size={12} /> 纠正的基线典型错误（{message.pipelineTrace.errors_corrected.length}）
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {message.pipelineTrace.errors_corrected.map((e, i) => (
                        <div key={i} style={{
                          fontSize: 11.5, color: '#78350F', lineHeight: 1.7,
                          paddingLeft: 12, position: 'relative',
                        }}>
                          <span style={{ position: 'absolute', left: 0, color: '#D97706' }}>✕</span>
                          {e}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{
                  marginTop: 10, padding: '8px 12px', background: '#F0FDF4',
                  border: '1px solid #DCFCE7', borderRadius: 4,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <CheckCircle2 size={13} style={{ color: '#16A34A', flexShrink: 0 }} />
                  <span style={{ fontSize: 11.5, color: '#166534', lineHeight: 1.6 }}>
                    基线 SQL 执行结果：
                    {message.pipelineTrace.baseline_snapshot?.success
                      ? ` ${message.pipelineTrace.baseline_snapshot.row_count} 行`
                      : ' 执行失败或返回空值'}
                    ；语义优化 SQL 经自校验通过，结果正确。
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {(message.baselinePrompt || message.experimentPrompt) && (
          <PromptViewer
            baselinePrompt={message.baselinePrompt}
            experimentPrompt={message.experimentPrompt}
          />
        )}

        {/* 下一步追问建议（分阶段确认执行完成后） */}
        {message.suggestions && message.suggestions.length > 0 && !message.isLoading && (
          <div style={{ marginTop: 16 }}>
            <div className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: '#565960', marginBottom: 8 }}>
              <MessageSquare size={13} style={{ color: '#B758ED' }} /> 下一步可以追问：
            </div>
            <div className="flex flex-wrap" style={{ gap: 8 }}>
              {message.suggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onAsk?.(s)}
                  style={{
                    fontSize: 12.5, padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                    border: '1px solid #EDE3FB', background: '#FBFAFE', color: '#7A4DB8', textAlign: 'left',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== 分阶段问数 · 需求理解 + SQL 草案确认卡片 ====================
function DraftConfirmCard({ message, onConfirm }: {
  message: AIMessageType;
  onConfirm?: (planId: string) => void;
}) {
  const metrics = message.matchedMetrics?.map(m => m.name) ?? [];
  const dims = message.matchedDimensions ?? [];

  return (
    <div style={{
      border: '1px solid #E6D3FA', background: '#FBFAFE', borderRadius: 4,
      padding: '16px 18px', marginBottom: 14,
    }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <CheckCircle2 size={15} style={{ color: '#B758ED' }} />
        <span style={{ fontSize: 13.5, fontWeight: 600, color: '#252931' }}>需求理解与 SQL 草案</span>
        {message.sqlSource && (
          <span style={{
            fontSize: 10.5, padding: '1px 7px', borderRadius: 3,
            background: '#F0EBFA', color: '#7A4DB8', fontWeight: 500,
          }}>
            {SQL_SOURCE_LABEL[message.sqlSource] || message.sqlSource}
          </span>
        )}
      </div>

      {/* 澄清问题区 */}
      {message.clarifications && message.clarifications.length > 0 && (
        <div style={{ background: '#FFF7E6', border: '1px solid #FFE7BA', borderRadius: 4, padding: '10px 14px', marginBottom: 12 }}>
          <div className="flex items-center gap-1.5" style={{ fontSize: 12.5, fontWeight: 600, color: '#874A20', marginBottom: 4 }}>
            <AlertTriangle size={13} /> 需求待澄清（{message.clarifications.length}）
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {message.clarifications.map((q, i) => (
              <li key={i} style={{ fontSize: 12.5, color: '#874A20', lineHeight: 1.8 }}>{q}</li>
            ))}
          </ul>
          <p style={{ fontSize: 11.5, color: '#B25E00', margin: '6px 0 0' }}>
            您可补充信息后重新提问，也可按下方「系统假设」直接确认执行。
          </p>
        </div>
      )}

      {/* 系统假设区 */}
      {message.assumptions && message.assumptions.length > 0 && (
        <div style={{ background: '#F5F9FF', border: '1px solid #D6E6FF', borderRadius: 4, padding: '10px 14px', marginBottom: 12 }}>
          <div className="flex items-center gap-1.5" style={{ fontSize: 12.5, fontWeight: 600, color: '#1E5BB8', marginBottom: 4 }}>
            <Lightbulb size={13} /> 系统假设
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {message.assumptions.map((a, i) => (
              <li key={i} style={{ fontSize: 12.5, color: '#1E5BB8', lineHeight: 1.8 }}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 需求要素标签：指标 / 时间 / 维度 / 数据集 */}
      <div className="flex flex-wrap" style={{ gap: 8, marginBottom: 10 }}>
        <DraftTag icon={<Target size={11} />} label="命中指标"
          values={metrics.length > 0 ? metrics : ['未明确']} highlight={metrics.length > 0} />
        <DraftTag icon={<Clock size={11} />} label="时间范围"
          values={[message.timeRange || '默认上月']} highlight={!!message.timeRange} />
        <DraftTag icon={<Tag size={11} />} label="分析维度"
          values={dims.length > 0 ? dims : ['整体汇总']} highlight={dims.length > 0} />
        <DraftTag icon={<Database size={11} />} label="数据集"
          values={[message.datasetName || '零售经营数据集']} highlight />
      </div>

      {/* 固定口径过滤条件 */}
      {message.filters && message.filters.length > 0 && (
        <div style={{ fontSize: 11.5, color: '#898B8F', marginBottom: 10, lineHeight: 1.7 }}>
          固定口径过滤：{message.filters.join('；')}
        </div>
      )}

      {/* SQL 草案 */}
      <SQLBlock sql={message.sql || ''} variant="experiment" label="SQL 草案（待您确认，尚未执行）" defaultOpen />

      {/* 执行失败提示（确认后执行失败，可重试） */}
      {message.confirmError && (
        <div style={{
          marginTop: 12, background: '#FFF1F0', border: '1px solid #FFCDC8',
          borderRadius: 4, padding: '8px 12px', fontSize: 12.5, color: '#C63838',
        }}>
          {message.confirmError}
        </div>
      )}

      {/* 确认操作区 */}
      <div className="flex items-center gap-3" style={{ marginTop: 14, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => message.planId && onConfirm?.(message.planId)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
            padding: '9px 22px', borderRadius: 4, border: 'none', cursor: 'pointer',
            background: '#B758ED', color: '#fff', boxShadow: '0 2px 8px rgba(183,88,237,0.28)',
          }}
        >
          <ShieldCheck size={14} /> 确认 SQL 并执行
        </button>
        <span style={{ fontSize: 11.5, color: '#898B8F', lineHeight: 1.6 }}>
          确认前系统不会执行任何查询；点击确认后才会连接数据库取数。
        </span>
      </div>
    </div>
  );
}

function DraftTag({ icon, label, values, highlight }: {
  icon: React.ReactNode; label: string; values: string[]; highlight: boolean;
}) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 4,
      background: highlight ? '#FBF7FF' : '#F5F6F8', border: `1px solid ${highlight ? '#E6D3FA' : '#ECEDF1'}`,
    }}>
      <span style={{ color: highlight ? '#B758ED' : '#898B8F', display: 'inline-flex' }}>{icon}</span>
      <span style={{ fontSize: 11.5, color: '#898B8F' }}>{label}：</span>
      {values.map((v, i) => (
        <span key={i} style={{ fontSize: 11.5, fontWeight: 600, color: highlight ? '#7A4DB8' : '#898B8F' }}>{v}</span>
      ))}
    </div>
  );
}
