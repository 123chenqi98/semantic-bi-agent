import { useMemo, useState, useRef, useEffect } from 'react';
import {
  FileText, ChevronDown, ChevronRight, Copy, Check,
  Shield, AlertTriangle, Calendar, Database, BookOpen, Target,
  ListChecks, Ruler, FlaskConical, Circle,
} from 'lucide-react';

interface PromptViewerProps {
  baselinePrompt?: string;
  experimentPrompt?: string;
}

interface PromptSection {
  title: string;
  icon: React.ReactNode;
  accent: string;
  bg: string;
  border: string;
  tagBg: string;
  tagColor: string;
  body: string;
  isInjected: boolean;
  tokens: number;
}

const SECTION_META: Record<string, Omit<PromptSection, 'body' | 'tokens'>> = {
  'intro': {
    title: '角色设定',
    icon: <Shield size={13} />,
    accent: '#252931',
    bg: '#FAFBFC',
    border: '#ECEDF1',
    tagBg: '#F1F2F3',
    tagColor: '#565960',
    isInjected: false,
  },
  '全局硬性规则': {
    title: '全局硬性规则',
    icon: <ListChecks size={13} />,
    accent: '#7C3AED',
    bg: '#FAF7FF',
    border: '#EDE4FF',
    tagBg: '#F0E8FF',
    tagColor: '#6D39C7',
    isInjected: true,
  },
  '常见错误警示': {
    title: '常见错误警示',
    icon: <AlertTriangle size={13} />,
    accent: '#D97706',
    bg: '#FFFBEB',
    border: '#FEF3C7',
    tagBg: '#FEF3C7',
    tagColor: '#92400E',
    isInjected: true,
  },
  '输出格式规范': {
    title: '输出格式规范',
    icon: <Ruler size={13} />,
    accent: '#0891B2',
    bg: '#F0FDFA',
    border: '#CCFBF1',
    tagBg: '#CCFBF1',
    tagColor: '#155E75',
    isInjected: true,
  },
  '时间语义映射表': {
    title: '时间锚点映射表',
    icon: <Calendar size={13} />,
    accent: '#2563EB',
    bg: '#EFF6FF',
    border: '#DBEAFE',
    tagBg: '#DBEAFE',
    tagColor: '#1E40AF',
    isInjected: true,
  },
  '数据库Schema': {
    title: '数据库 Schema',
    icon: <Database size={13} />,
    accent: '#475569',
    bg: '#F8FAFC',
    border: '#E2E8F0',
    tagBg: '#E2E8F0',
    tagColor: '#334155',
    isInjected: false,
  },
  '指标词典': {
    title: '指标语义词典',
    icon: <BookOpen size={13} />,
    accent: '#059669',
    bg: '#F0FDF4',
    border: '#DCFCE7',
    tagBg: '#DCFCE7',
    tagColor: '#166534',
    isInjected: true,
  },
  '输出要求': {
    title: '输出要求',
    icon: <Target size={13} />,
    accent: '#BE123C',
    bg: '#FFF1F2',
    border: '#FFE4E6',
    tagBg: '#FFE4E6',
    tagColor: '#9F1239',
    isInjected: true,
  },
  'user': {
    title: 'User Message',
    icon: <Circle size={10} />,
    accent: '#252931',
    bg: '#FFFFFF',
    border: '#ECEDF1',
    tagBg: '#F5F6F8',
    tagColor: '#565960',
    isInjected: false,
  },
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

function matchSectionKey(headerLine: string): string | null {
  for (const key of Object.keys(SECTION_META)) {
    if (key === 'intro' || key === 'user') continue;
    if (headerLine.includes(key)) return key;
  }
  return null;
}

function parsePromptSections(raw: string): { systemSections: PromptSection[]; userBody: string; systemRaw: string; userRaw: string } {
  let systemRaw = '';
  let userRaw = '';

  const sysMatch = raw.match(/\[System\]\s*\n([\s\S]*?)(?=\n\[User\]|$)/);
  const usrMatch = raw.match(/\[User\]\s*\n([\s\S]*)$/);
  if (sysMatch) systemRaw = sysMatch[1].trim();
  if (usrMatch) userRaw = usrMatch[1].trim();

  if (!sysMatch && !usrMatch) {
    systemRaw = raw.trim();
  }

  const sections: PromptSection[] = [];
  const lines = systemRaw.split('\n');
  let currentKey: string = 'intro';
  let currentBody: string[] = [];

  const flush = () => {
    const body = currentBody.join('\n').trim();
    if (body || currentKey === 'intro') {
      const meta = SECTION_META[currentKey] || SECTION_META['intro'];
      sections.push({
        ...meta,
        body,
        tokens: estimateTokens(body),
      });
    }
    currentBody = [];
  };

  for (const line of lines) {
    if (line.startsWith('## ')) {
      flush();
      const headerText = line.replace(/^##\s+/, '').trim();
      currentKey = matchSectionKey(headerText) || 'intro';
      if (currentKey === 'intro') {
        currentBody.push(`## ${headerText}`);
      }
    } else {
      currentBody.push(line);
    }
  }
  flush();

  return { systemSections: sections, userBody: userRaw, systemRaw, userRaw };
}

function renderMarkdownLight(text: string): React.ReactNode {
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  let inSqlBlock = false;
  let sqlBuffer: string[] = [];
  let key = 0;

  const flushSql = () => {
    if (sqlBuffer.length > 0) {
      out.push(
        <pre key={`sql-${key++}`} style={{
          margin: '6px 0', padding: '8px 10px', background: '#1E293B',
          borderRadius: 4, color: '#E2E8F0', fontSize: 11.5, lineHeight: 1.6,
          fontFamily: 'var(--font-mono), ui-monospace, monospace', overflowX: 'auto',
          whiteSpace: 'pre',
        }}>
          {sqlBuffer.join('\n')}
        </pre>
      );
      sqlBuffer = [];
    }
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (inSqlBlock) {
        flushSql();
        inSqlBlock = false;
      } else {
        inSqlBlock = true;
      }
      continue;
    }
    if (inSqlBlock) {
      sqlBuffer.push(line);
      continue;
    }

    if (line.startsWith('### ')) {
      out.push(<div key={key++} style={{ fontSize: 12.5, fontWeight: 600, color: '#252931', marginTop: 8, marginBottom: 3 }}>
        {line.replace(/^###\s+/, '')}
      </div>);
      continue;
    }

    if (line.trim() === '') {
      out.push(<div key={key++} style={{ height: 6 }} />);
      continue;
    }

    const inlineFormatted = renderInline(line);
    out.push(<div key={key++} style={{ fontSize: 12, lineHeight: 1.75, color: '#3A3F48' }}>
      {inlineFormatted}
    </div>);
  }
  flushSql();
  return out;
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIndex) {
      parts.push(text.slice(lastIndex, m.index));
    }
    const token = m[0];
    if (token.startsWith('**')) {
      parts.push(<strong key={key++} style={{ color: '#252931', fontWeight: 600 }}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      parts.push(<code key={key++} style={{
        background: '#F1F5F9', color: '#BE185D', padding: '1px 5px',
        borderRadius: 3, fontSize: 11, fontFamily: 'var(--font-mono), monospace',
      }}>{token.slice(1, -1)}</code>);
    }
    lastIndex = m.index + token.length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

function SectionBlock({ section, defaultOpen = true }: { section: PromptSection; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{
      border: `1px solid ${section.border}`,
      borderRadius: 4,
      overflow: 'hidden',
      background: section.bg,
    }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 text-left outline-none"
        style={{ padding: '7px 10px', background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        <span style={{ color: section.accent, display: 'flex', alignItems: 'center' }}>
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <span style={{ color: section.accent, display: 'flex', alignItems: 'center' }}>{section.icon}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: section.accent }}>{section.title}</span>
        {section.isInjected && (
          <span style={{
            fontSize: 9.5, fontWeight: 600, padding: '1px 6px', borderRadius: 3,
            background: section.tagBg, color: section.tagColor, letterSpacing: 0.3,
          }}>
            语义注入
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 10.5, color: '#B0B5BD', fontFamily: 'var(--font-mono), monospace' }}>
          {section.tokens} tok
        </span>
      </button>
      {open && (
        <div style={{ padding: '4px 12px 10px 28px' }}>
          {renderMarkdownLight(section.body)}
        </div>
      )}
    </div>
  );
}

export default function PromptViewer({ baselinePrompt, experimentPrompt }: PromptViewerProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'experiment' | 'baseline'>('experiment');
  const [viewMode, setViewMode] = useState<'structured' | 'raw'>('structured');
  const [copied, setCopied] = useState(false);
  const [collapsedAll, setCollapsedAll] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const activePrompt = tab === 'experiment' ? experimentPrompt : baselinePrompt;
  const tokenEstimate = activePrompt ? estimateTokens(activePrompt) : 0;

  const parsed = useMemo(() => {
    if (!activePrompt) return null;
    return parsePromptSections(activePrompt);
  }, [activePrompt]);

  const injectedCount = parsed?.systemSections.filter(s => s.isInjected).length ?? 0;
  const injectedTokens = parsed?.systemSections
    .filter(s => s.isInjected)
    .reduce((sum, s) => sum + s.tokens, 0) ?? 0;

  const handleCopy = async () => {
    if (!activePrompt) return;
    try {
      await navigator.clipboard.writeText(activePrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = activePrompt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const scrollToSection = (idx: number) => {
    const el = contentRef.current?.querySelector(`[data-section-idx="${idx}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  useEffect(() => {
    if (!open) return;
    setViewMode('structured');
    setCollapsedAll(false);
  }, [open, tab]);

  return (
    <div style={{ marginTop: 12, border: '1px solid #ECEDF1', borderRadius: 4, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between text-left outline-none"
        style={{ padding: '10px 14px', background: '#FBFCFD' }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <FileText size={14} style={{ color: '#B758ED' }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: '#252931' }}>
            查看完整 Prompt（发送给 LLM 的实际输入）
          </span>
          {activePrompt && (
            <span style={{ fontSize: 11, color: '#898B8F', background: '#F5F6F8', padding: '1px 7px', borderRadius: 3 }}>
              ≈ {tokenEstimate.toLocaleString()} tokens · {activePrompt.length.toLocaleString()} chars
            </span>
          )}
          {tab === 'experiment' && injectedCount > 0 && (
            <span style={{
              fontSize: 10.5, color: '#6D39C7', background: '#F0E8FF',
              padding: '1px 7px', borderRadius: 3, fontWeight: 600,
            }}>
              {injectedCount} 段语义注入 · {injectedTokens.toLocaleString()} tok
            </span>
          )}
        </div>
        {open ? <ChevronDown size={14} style={{ color: '#898B8F', flexShrink: 0 }} /> : <ChevronRight size={14} style={{ color: '#898B8F', flexShrink: 0 }} />}
      </button>

      {open && (
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 0,
            borderBottom: '1px solid #ECEDF1', background: '#FFFFFF', flexWrap: 'wrap',
          }}>
            <button
              onClick={() => setTab('experiment')}
              className="outline-none"
              style={{
                padding: '8px 14px', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5,
                color: tab === 'experiment' ? '#B758ED' : '#898B8F',
                borderBottom: tab === 'experiment' ? '2px solid #B758ED' : '2px solid transparent',
                background: 'transparent', border: 'none', borderBottomWidth: 2, cursor: 'pointer',
              }}
            >
              <FlaskConical size={12} /> 实验组（含语义层）
            </button>
            <button
              onClick={() => setTab('baseline')}
              className="outline-none"
              style={{
                padding: '8px 14px', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5,
                color: tab === 'baseline' ? '#F53F3F' : '#898B8F',
                borderBottom: tab === 'baseline' ? '2px solid #F53F3F' : '2px solid transparent',
                background: 'transparent', border: 'none', borderBottomWidth: 2, cursor: 'pointer',
              }}
            >
              <Circle size={10} /> 基线（仅 Schema）
            </button>

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, paddingRight: 8 }}>
              <button
                onClick={() => setViewMode(v => v === 'structured' ? 'raw' : 'structured')}
                style={{
                  fontSize: 10.5, padding: '3px 8px', borderRadius: 3, cursor: 'pointer',
                  border: '1px solid #ECEDF1', background: viewMode === 'structured' ? '#F5F0FF' : '#fff',
                  color: viewMode === 'structured' ? '#6D39C7' : '#898B8F', fontWeight: 500,
                }}
              >
                {viewMode === 'structured' ? '结构化' : '原文'}
              </button>
              <button
                onClick={handleCopy}
                style={{
                  fontSize: 10.5, padding: '3px 8px', borderRadius: 3, cursor: 'pointer',
                  border: '1px solid #ECEDF1', background: '#fff', color: '#565960',
                  display: 'flex', alignItems: 'center', gap: 3,
                }}
              >
                {copied ? <Check size={11} style={{ color: '#16A34A' }} /> : <Copy size={11} />}
                {copied ? '已复制' : '复制'}
              </button>
            </div>
          </div>

          {tab === 'experiment' && parsed && viewMode === 'structured' && parsed.systemSections.length > 2 && (
            <div style={{
              display: 'flex', gap: 5, padding: '7px 12px', background: '#FAFBFC',
              borderBottom: '1px solid #F1F2F3', flexWrap: 'wrap',
            }}>
              {parsed.systemSections.map((s, i) => (
                <button
                  key={i}
                  onClick={() => scrollToSection(i)}
                  style={{
                    fontSize: 10.5, padding: '2px 8px', borderRadius: 3, cursor: 'pointer',
                    border: `1px solid ${s.border}`, background: s.bg, color: s.accent,
                    display: 'flex', alignItems: 'center', gap: 3, fontWeight: 500,
                  }}
                >
                  {s.icon}
                  {s.title}
                </button>
              ))}
              <button
                onClick={() => setCollapsedAll(v => !v)}
                style={{
                  fontSize: 10.5, padding: '2px 8px', borderRadius: 3, cursor: 'pointer',
                  border: '1px solid #ECEDF1', background: '#fff', color: '#898B8F',
                }}
              >
                {collapsedAll ? '全部展开' : '全部折叠'}
              </button>
            </div>
          )}

          <div ref={contentRef} style={{
            padding: 12, maxHeight: 520, overflow: 'auto', background: '#FAFBFC',
          }}>
            {viewMode === 'structured' && parsed ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{
                  fontSize: 10.5, fontWeight: 600, color: '#B0B5BD', letterSpacing: 0.5,
                  textTransform: 'uppercase', marginBottom: 2, paddingLeft: 2,
                }}>
                  [System Prompt]
                </div>
                {parsed.systemSections.map((section, i) => (
                  <div key={i} data-section-idx={i}>
                    <SectionBlock section={section} defaultOpen={!collapsedAll} />
                  </div>
                ))}

                {parsed.userBody && (
                  <>
                    <div style={{
                      fontSize: 10.5, fontWeight: 600, color: '#B0B5BD', letterSpacing: 0.5,
                      textTransform: 'uppercase', marginTop: 8, marginBottom: 2, paddingLeft: 2,
                    }}>
                      [User Message]
                    </div>
                    <div style={{
                      border: '1px solid #ECEDF1', borderRadius: 4,
                      background: '#fff', padding: '8px 12px',
                    }}>
                      {renderMarkdownLight(parsed.userBody)}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <pre style={{
                margin: 0, fontSize: 12, lineHeight: 1.7,
                fontFamily: 'var(--font-mono), ui-monospace, monospace',
                color: '#252931', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {activePrompt || '（无 Prompt 数据）'}
              </pre>
            )}
          </div>

          <div style={{
            padding: '8px 14px', background: '#FBFCFD', borderTop: '1px solid #F1F2F3',
            fontSize: 11, color: '#898B8F', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {tab === 'experiment' ? (
              <>
                <span style={{
                  display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#F0E8FF',
                  border: '1px solid #D4B8FF',
                }} />
                实验组在 Schema 之上额外注入了
                <strong style={{ color: '#6D39C7' }}>{injectedCount} 段语义知识</strong>
                （{injectedTokens.toLocaleString()} tokens），包括全局口径规则、时间锚点映射、指标定义与易错警示——这是"强约束"机制的核心。
              </>
            ) : (
              <>
                <Circle size={8} style={{ color: '#F53F3F' }} />
                基线组仅提供 DDL Schema 和基础指令，不含任何业务口径知识——LLM 需自行猜测"销售额"的计算方式，这是 44% 错误率的根源。
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
