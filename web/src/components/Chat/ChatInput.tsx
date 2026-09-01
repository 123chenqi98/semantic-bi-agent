import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles, BookOpen, BarChart3, Clock, Code2, FlaskConical, HelpCircle, Trash2, Lightbulb, ArrowRight } from 'lucide-react';
import { useApp } from '../../store/ChatContext';
import { quickQuestions } from '../../mock/data';
import type { AIMessage } from '../../types';

interface ChatInputProps {
  onSend: (question: string) => void;
}

interface SkillItem {
  id: string;
  keyword: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  action?: 'chart' | 'eval';
}

interface SlashItem {
  id: string;
  keyword: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  action?: 'clear' | 'chart' | 'dict' | 'example' | 'help';
}

const SKILLS: SkillItem[] = [
  { id: 'dict', keyword: '指标词典', label: '指标词典', desc: '查询指标定义、口径规则与同义词（发送以@指标词典开头的消息）', icon: <BookOpen size={14} /> },
  { id: 'chart', keyword: '图表生成', label: '图表生成', desc: '立即跳转图表助手，自动载入最近一次查询结果', icon: <BarChart3 size={14} />, action: 'chart' },
  { id: 'time', keyword: '时间解析', label: '时间解析', desc: '智能识别上月/近6个月/Q2等时间表达（作为前缀使用）', icon: <Clock size={14} /> },
  { id: 'sql', keyword: 'SQL优化', label: 'SQL优化', desc: '对比基线 SQL 与优化后 SQL 的差异（作为前缀使用）', icon: <Code2 size={14} /> },
  { id: 'exp', keyword: '对比实验', label: '对比实验', desc: '立即跳转到 25 题准确率对照评测', icon: <FlaskConical size={14} />, action: 'eval' },
];

const SLASHES: SlashItem[] = [
  { id: 'help', keyword: 'help', label: '/help', desc: '查看使用帮助与技能说明', icon: <HelpCircle size={14} />, action: 'help' },
  { id: 'clear', keyword: 'clear', label: '/clear', desc: '清空当前对话，开始新对话', icon: <Trash2 size={14} />, action: 'clear' },
  { id: 'example', keyword: 'example', label: '/example', desc: '随机插入一个示例问题', icon: <Lightbulb size={14} />, action: 'example' },
  { id: 'chart', keyword: 'chart', label: '/chart', desc: '跳转到图表生成助手', icon: <BarChart3 size={14} />, action: 'chart' },
  { id: 'dict', keyword: 'dict', label: '/dict', desc: '跳转到指标语义词典', icon: <BookOpen size={14} />, action: 'dict' },
];

type MenuKind = 'skill' | 'slash' | null;

interface MenuState {
  kind: MenuKind;
  query: string;
  start: number;
  activeIndex: number;
  items: Array<SkillItem | SlashItem>;
}

export default function ChatInput({ onSend }: ChatInputProps) {
  const { state, dispatch, currentConversation } = useApp();
  const [value, setValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 180) + 'px';
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          textareaRef.current && !textareaRef.current.contains(e.target as Node)) {
        setMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 第三轮：结果工作台「修改口径重问」→ 把原问题回填输入框，用户改完直接重发
  useEffect(() => {
    const handlePrefill = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      if (text) {
        setValue(text);
        setMenu(null);
        requestAnimationFrame(() => {
          textareaRef.current?.focus();
          const len = text.length;
          textareaRef.current?.setSelectionRange(len, len);
        });
      }
    };
    window.addEventListener('chat:prefill', handlePrefill);
    return () => window.removeEventListener('chat:prefill', handlePrefill);
  }, []);

  const detectTrigger = (text: string, caret: number): MenuState | null => {
    const before = text.slice(0, caret);
    const atMatch = before.match(/@([^\s@/]*)$/);
    if (atMatch && (atMatch.index === 0 || /\s/.test(before[atMatch.index! - 1] ?? ' '))) {
      const query = atMatch[1];
      const items = SKILLS.filter(s =>
        !query || s.keyword.toLowerCase().includes(query.toLowerCase()) || s.label.toLowerCase().includes(query.toLowerCase())
      );
      if (items.length === 0) return null;
      return { kind: 'skill', query, start: atMatch.index!, activeIndex: 0, items };
    }
    const slashMatch = before.match(/\/([a-zA-Z]*)$/);
    if (slashMatch && (slashMatch.index === 0 || /\s/.test(before[slashMatch.index! - 1] ?? ' '))) {
      const query = slashMatch[1];
      const items = SLASHES.filter(s =>
        !query || s.keyword.toLowerCase().startsWith(query.toLowerCase())
      );
      if (items.length === 0) return null;
      return { kind: 'slash', query, start: slashMatch.index!, activeIndex: 0, items };
    }
    return null;
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setValue(v);
    const caret = e.target.selectionStart;
    const next = detectTrigger(v, caret);
    setMenu(next);
  };

  const insertAtCaret = (snippet: string, replaceLen: number) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const caret = ta.selectionStart;
    const start = caret - replaceLen;
    const before = value.slice(0, start);
    const after = value.slice(caret);
    const next = before + snippet + after;
    setValue(next);
    setMenu(null);
    requestAnimationFrame(() => {
      const newPos = before.length + snippet.length;
      ta.focus();
      ta.setSelectionRange(newPos, newPos);
    });
  };

  const findLastAIResult = (): AIMessage | null => {
    const msgs = currentConversation?.messages || [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.type === 'ai' && m.result && !m.isLoading) return m as AIMessage;
    }
    return null;
  };

  const resultToCsv = (msg: AIMessage): string => {
    if (!msg.result) return '';
    const { columns, rows } = msg.result;
    const esc = (v: any) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    // 单值（1列1行）→ 补成"指标,数值"两列
    if (columns.length === 1 && rows.length === 1) {
      const col = columns[0];
      const val = rows[0][0];
      return ['metric,value', `${esc(col)},${esc(val)}`].join('\n');
    }
    // 单列多行 → 补成"序号,列名"
    if (columns.length === 1 && rows.length > 1) {
      const col = columns[0];
      const lines = [`序号,${esc(col)}`];
      rows.forEach((r, i) => lines.push(`${i + 1},${esc(r[0])}`));
      return lines.join('\n');
    }
    const lines = [columns.map(esc).join(',')];
    for (const row of rows) lines.push(row.map(esc).join(','));
    return lines.join('\n');
  };

  const goToChartWithResult = () => {
    const lastAi = findLastAIResult();
    const timeR = lastAi?.timeRange || '';
    const metricNames = (lastAi?.matchedMetrics || []).map(m => m.name).join('/') || '查询结果';
    if (lastAi?.result) {
      const csv = resultToCsv(lastAi);
      dispatch({
        type: 'SET_CHART_PAYLOAD',
        payload: {
          fileName: `${metricNames}_${timeR || 'data'}.csv`,
          background: timeR ? `时间范围：${timeR}；来自对话"${lastAi.question}"的查询结果` : `来自对话"${lastAi.question}"的查询结果`,
          goal: '可视化展示本次查询结果',
          csvData: csv,
          autoGenerate: true,
        },
      });
    } else {
      dispatch({ type: 'SET_CHART_PAYLOAD', payload: null });
    }
    dispatch({ type: 'SET_PAGE', payload: 'chartAssistant' });
    setValue('');
    setMenu(null);
  };

  const selectItem = (item: SkillItem | SlashItem) => {
    if (!menu) return;
    const replaceLen = menu.query.length + 1;
    if (menu.kind === 'skill') {
      const sk = item as SkillItem;
      if (sk.action === 'chart') {
        goToChartWithResult();
        return;
      }
      if (sk.action === 'eval') {
        dispatch({ type: 'SET_PAGE', payload: 'evaluation' });
        setValue('');
        setMenu(null);
        return;
      }
      insertAtCaret(`@${sk.keyword} `, replaceLen);
    } else {
      const slash = item as SlashItem;
      if (slash.action === 'clear') {
        dispatch({ type: 'NEW_CONVERSATION' });
        setValue('');
        setMenu(null);
        return;
      }
      if (slash.action === 'example') {
        handleExampleSlash();
        return;
      }
      if (slash.action === 'help') {
        setMenu(null);
        setValue('');
        onSend('/help');
        return;
      }
      if (slash.action === 'chart') {
        goToChartWithResult();
        return;
      }
      if (slash.action === 'dict') {
        dispatch({ type: 'SET_PAGE', payload: 'dictionary' });
        setValue('');
        setMenu(null);
        return;
      }
      insertAtCaret(`/${slash.keyword} `, replaceLen);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menu && menu.items.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMenu({ ...menu, activeIndex: (menu.activeIndex + 1) % menu.items.length });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMenu({ ...menu, activeIndex: (menu.activeIndex - 1 + menu.items.length) % menu.items.length });
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectItem(menu.items[menu.activeIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenu(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    const q = value.trim();
    if (!q || state.isLoading) return;
    onSend(q);
    setValue('');
    setMenu(null);
  };

  const handleExampleSlash = () => {
    const q = quickQuestions[Math.floor(Math.random() * quickQuestions.length)];
    setValue(q);
    setMenu(null);
    textareaRef.current?.focus();
  };

  const handleSlashClick = (item: SlashItem) => {
    if (item.keyword === 'example') {
      handleExampleSlash();
      return;
    }
    selectItem(item);
  };

  const canSend = value.trim().length > 0 && !state.isLoading;

  return (
    <div className="shrink-0 flex justify-center" style={{ padding: '8px 48px 24px 48px' }}>
      <div className="w-full" style={{ maxWidth: 880 }}>
        <div
          className="relative bg-white transition-all"
          style={{
            border: isFocused ? '1.5px solid #B758ED' : '1px solid #E3E5E8',
            boxShadow: isFocused
              ? '0 0 0 4px rgba(183,88,237,0.10), 0 8px 24px rgba(15,23,41,0.06)'
              : '0 1px 3px rgba(0,0,0,0.04)',
            minHeight: 60,
            borderRadius: 12,
            background: isFocused ? '#FFFFFF' : '#FCFCFD',
          }}
        >
          {menu && menu.items.length > 0 && (
            <div
              ref={menuRef}
              className="absolute"
              style={{
                bottom: 'calc(100% + 8px)',
                left: 0,
                right: 0,
                background: '#FFFFFF',
                border: '1px solid #E3E5E8',
                borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                padding: 6,
                maxHeight: 320,
                overflowY: 'auto',
                zIndex: 50,
              }}
            >
              <div
                className="text-[11px] font-medium"
                style={{ color: '#898B8F', padding: '6px 10px 4px 10px', letterSpacing: '0.02em' }}
              >
                {menu.kind === 'skill' ? '选择技能' : '快捷指令'}
              </div>
              {menu.items.map((item, i) => {
                const isActive = i === menu.activeIndex;
                const isSlash = menu.kind === 'slash';
                return (
                  <div
                    key={item.id}
                    onMouseEnter={() => setMenu({ ...menu, activeIndex: i })}
                    onClick={() => isSlash ? handleSlashClick(item as SlashItem) : selectItem(item)}
                    className="flex items-center gap-3 cursor-pointer"
                    style={{
                      padding: '8px 10px',
                      borderRadius: 4,
                      background: isActive ? '#F5F0FF' : 'transparent',
                      transition: 'background .1s',
                    }}
                  >
                    <span
                      className="flex items-center justify-center shrink-0"
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        background: isActive ? '#EADDFF' : '#F5F6F8',
                        color: isActive ? '#8B45C9' : '#565960',
                      }}
                    >
                      {item.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium" style={{ color: '#252931' }}>
                          {isSlash ? (item as SlashItem).label : `@${(item as SkillItem).label}`}
                        </span>
                      </div>
                      <div className="text-[12px] truncate" style={{ color: '#898B8F', marginTop: 1 }}>{item.desc}</div>
                    </div>
                    {isActive && (
                      <ArrowRight size={14} style={{ color: '#B758ED', flexShrink: 0 }} />
                    )}
                  </div>
                );
              })}
              <div
                className="flex items-center justify-between text-[11px]"
                style={{ padding: '6px 10px 2px', color: '#B0B5BD', borderTop: '1px solid #F5F6F8', marginTop: 4 }}
              >
                <span>↑↓ 选择 · Enter/Tab 确认 · Esc 关闭</span>
              </div>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
              setTimeout(() => setIsFocused(false), 150);
            }}
            placeholder="输入业务问题，如：上个月各渠道的销售额是多少？（@ 选技能，/ 看指令）"
            rows={1}
            className="w-full bg-transparent border-0 outline-none resize-none text-[14px]"
            style={{
              maxHeight: 180,
              lineHeight: 1.7,
              fontFamily: 'inherit',
              padding: '16px 112px 16px 16px',
              color: '#252931',
              caretColor: '#B758ED',
            }}
            disabled={state.isLoading}
          />

          <button
            onClick={handleSubmit}
            disabled={!canSend}
            className="flex items-center justify-center gap-1.5 text-[13px] font-medium transition-all outline-none"
            style={{
              position: 'absolute',
              right: 10,
              bottom: 10,
              height: 36,
              minWidth: 68,
              paddingLeft: 14,
              paddingRight: 14,
              borderRadius: 8,
              background: canSend ? '#B758ED' : '#F2F3F5',
              color: canSend ? '#FFFFFF' : '#C9CDD4',
              cursor: canSend ? 'pointer' : 'not-allowed',
              boxShadow: canSend ? '0 2px 8px rgba(183,88,237,0.20)' : 'none',
              border: 'none',
            }}
            onMouseEnter={e => { if (canSend) (e.currentTarget as HTMLElement).style.background = '#A246D9'; }}
            onMouseLeave={e => { if (canSend) (e.currentTarget as HTMLElement).style.background = '#B758ED'; }}
          >
            {state.isLoading
              ? <Loader2 size={14} className="animate-spin" />
              : <Send size={14} />}
            {state.isLoading ? '生成中' : '发送'}
          </button>
        </div>

        {!menu && (
          <div className="flex items-center justify-between" style={{ marginTop: 10 }}>
            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: '#B0B5BD' }}>
              <Sparkles size={11} style={{ color: '#B758ED' }} />
              <span>输入 <kbd style={{ padding: '1px 5px', background: '#F5F6F8', borderRadius: 3, color: '#898B8F', fontFamily: 'var(--font-mono)', fontSize: 11 }}>@</kbd> 唤起技能 · <kbd style={{ padding: '1px 5px', background: '#F5F6F8', borderRadius: 3, color: '#898B8F', fontFamily: 'var(--font-mono)', fontSize: 11 }}>/</kbd> 快捷指令</span>
            </div>
            <span className="text-[11px]" style={{ color: '#B0B5BD' }}>内容由 AI 生成，请注意甄别</span>
          </div>
        )}
        {menu && <div style={{ height: 0 }} />}
      </div>
    </div>
  );
}
