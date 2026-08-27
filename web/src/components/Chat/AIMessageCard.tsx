import { useState } from 'react';
import { Sparkles, Lightbulb, BookOpen, Clock, Code2, AlertTriangle, HelpCircle, BarChart3, FlaskConical, Trash2, Zap, ChevronDown, ChevronRight, Activity, CheckCircle2, XCircle, FileText } from 'lucide-react';
import SQLBlock from '../common/SQLBlock';
import SQLDiff from '../common/SQLDiff';
import ResultTable from '../common/ResultTable';
import type { AIMessage as AIMessageType } from '../../types';
import { useApp } from '../../store/ChatContext';

interface AIMessageCardProps {
  message: AIMessageType;
}

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

export default function AIMessageCard({ message }: AIMessageCardProps) {
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

        {/* 词典卡片 */}
        {isDictOnly && message.dictResult && <DictCard metric={message.dictResult} />}

        {/* 普通问答 */}
        {!isDictOnly && (
          <>
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

            {message.result && <ResultTable result={message.result} title="查询结果" />}
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

        {message.summary && message.summary.key_findings.length > 0 && (
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
          <div style={{ marginTop: 16, border: '1px solid #ECEDF1', borderRadius: 4, background: '#FBFCFD' }}>
            <button
              type="button"
              onClick={() => setTraceOpen(v => !v)}
              className="w-full flex items-center justify-between text-left"
              style={{ padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              <div className="flex items-center gap-2" style={{ color: '#252931', fontSize: 13, fontWeight: 500 }}>
                <Activity size={14} style={{ color: '#B758ED' }} />
                <span>语义层 Pipeline Trace · {message.pipelineTrace.mode}</span>
                <span className="text-[11px] font-normal" style={{ color: '#898B8F' }}>
                  ({message.pipelineTrace.steps.length} 步 · 命中 {message.pipelineTrace.rules_applied.length} 条规则
                  {message.pipelineTrace.errors_corrected.length
                    ? ` · 纠正 ${message.pipelineTrace.errors_corrected.length} 项典型错误`
                    : ''})
                </span>
              </div>
              {traceOpen
                ? <ChevronDown size={14} style={{ color: '#898B8F' }} />
                : <ChevronRight size={14} style={{ color: '#898B8F' }} />}
            </button>
            {traceOpen && (
              <div style={{ padding: '0 16px 16px 16px', display: 'flex', flexDirection: 'column', rowGap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr', rowGap: 12 }}>
                  {message.pipelineTrace.steps.map(s => (
                    <>
                      <div className="flex items-start justify-center pt-0.5">
                        {s.status === 'ok'
                          ? <CheckCircle2 size={16} style={{ color: '#22C55E' }} />
                          : s.status === 'error'
                            ? <XCircle size={16} style={{ color: '#EF4444' }} />
                            : <AlertTriangle size={16} style={{ color: '#F59E0B' }} />}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#252931' }}>
                          Step {s.step} · {s.name}
                        </div>
                        <div style={{ fontSize: 12, lineHeight: 1.8, color: '#565960', marginTop: 4 }}>
                          {s.detail}
                        </div>
                      </div>
                    </>
                  ))}
                </div>
                <div style={{ borderTop: '1px solid #F1F2F3', paddingTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#252931', marginBottom: 8 }}>
                    ✅ 本次命中的语义规则
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {message.pipelineTrace.rules_applied.map((r, i) => (
                      <span key={i} className="text-[11px]"
                        style={{ padding: '3px 8px', background: '#F0EBFA', color: '#8B45C9', borderRadius: 4 }}>
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
                {message.pipelineTrace.errors_corrected.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#252931', marginBottom: 8 }}>
                      ⚠️ 纠正的基线典型错误
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', rowGap: 6 }}>
                      {message.pipelineTrace.errors_corrected.map((e, i) => (
                        <div key={i} className="text-[12px]"
                          style={{ padding: 8, background: '#FFF3E8', border: '1px solid #FFE0C2', color: '#874A20', borderRadius: 4, lineHeight: 1.8 }}>
                          {e}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
      </div>
    </div>
  );
}

function PromptViewer({ baselinePrompt, experimentPrompt }: { baselinePrompt?: string; experimentPrompt?: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'experiment' | 'baseline'>('experiment');
  const activePrompt = tab === 'experiment' ? experimentPrompt : baselinePrompt;
  const tokenEstimate = activePrompt ? Math.ceil(activePrompt.length / 3.5) : 0;

  return (
    <div style={{ marginTop: 12, border: '1px solid #ECEDF1', borderRadius: 4, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between text-left outline-none"
        style={{ padding: '10px 14px', background: '#FBFCFD' }}
      >
        <div className="flex items-center gap-2">
          <FileText size={14} style={{ color: '#B758ED' }} />
          <span className="text-[13px] font-medium" style={{ color: '#252931' }}>查看完整 Prompt（发送给 LLM 的实际输入）</span>
          {activePrompt && (
            <span className="text-[11px]" style={{ color: '#898B8F', background: '#F5F6F8', padding: '1px 7px', borderRadius: 3 }}>
              ≈ {tokenEstimate} tokens · {activePrompt.length.toLocaleString()} chars
            </span>
          )}
        </div>
        {open ? <ChevronDown size={14} style={{ color: '#898B8F' }} /> : <ChevronRight size={14} style={{ color: '#898B8F' }} />}
      </button>
      {open && (
        <div>
          <div style={{ display: 'flex', borderBottom: '1px solid #ECEDF1', background: '#FFFFFF' }}>
            <button
              onClick={() => setTab('experiment')}
              className="outline-none"
              style={{
                padding: '8px 16px', fontSize: 12, fontWeight: 500,
                color: tab === 'experiment' ? '#B758ED' : '#898B8F',
                borderBottom: tab === 'experiment' ? '2px solid #B758ED' : '2px solid transparent',
              }}
            >
              🧪 实验组 Prompt（含语义层）
            </button>
            <button
              onClick={() => setTab('baseline')}
              className="outline-none"
              style={{
                padding: '8px 16px', fontSize: 12, fontWeight: 500,
                color: tab === 'baseline' ? '#F53F3F' : '#898B8F',
                borderBottom: tab === 'baseline' ? '2px solid #F53F3F' : '2px solid transparent',
              }}
            >
              ⚪ 基线 Prompt（仅 Schema）
            </button>
          </div>
          <pre
            style={{
              margin: 0, padding: 16, maxHeight: 400, overflow: 'auto',
              background: '#FAFBFC', fontSize: 12, lineHeight: 1.7,
              fontFamily: 'var(--font-mono)', color: '#252931', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}
          >
            {activePrompt || '（无 Prompt 数据）'}
          </pre>
          <div style={{ padding: '8px 14px', background: '#FBFCFD', borderTop: '1px solid #F1F2F3', fontSize: 11, color: '#898B8F' }}>
            💡 实验组 System Prompt 中注入了指标定义、口径规则、时间锚点映射、常见陷阱等语义知识；基线组仅提供 DDL Schema，这是准确率差异的根本原因。
          </div>
        </div>
      )}
    </div>
  );
}
