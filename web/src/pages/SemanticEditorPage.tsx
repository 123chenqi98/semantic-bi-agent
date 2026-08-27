import { useState, useEffect } from 'react';
import { Save, RotateCcw, Sparkles, CheckCircle2, Edit3, Plus, X, Code2, BookOpen } from 'lucide-react';
import { metrics as defaultMetrics, globalRules as defaultRules } from '../mock/data';
import type { Metric } from '../types';

const STORAGE_KEY = 'nosql_semantic_editor_v1';

function loadMetrics(): Metric[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return JSON.parse(JSON.stringify(defaultMetrics));
}

function saveMetrics(metrics: Metric[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(metrics));
}

export default function SemanticEditorPage() {
  const [metrics, setMetrics] = useState<Metric[]>(loadMetrics);
  const [selectedId, setSelectedId] = useState(metrics[0]?.id || 'M01');
  const [saved, setSaved] = useState(false);
  const [newAlias, setNewAlias] = useState('');
  const [newNote, setNewNote] = useState('');
  const [showDemo, setShowDemo] = useState(false);

  const selected = metrics.find(m => m.id === selectedId)!;
  const isDirty = JSON.stringify(metrics) !== JSON.stringify(defaultMetrics);

  useEffect(() => {
    if (saved) {
      const t = setTimeout(() => setSaved(false), 2000);
      return () => clearTimeout(t);
    }
  }, [saved]);

  const updateMetric = (patch: Partial<Metric>) => {
    setMetrics(prev => prev.map(m => m.id === selectedId ? { ...m, ...patch } : m));
  };

  const handleSave = () => {
    saveMetrics(metrics);
    setSaved(true);
  };

  const handleReset = () => {
    setMetrics(JSON.parse(JSON.stringify(defaultMetrics)));
    localStorage.removeItem(STORAGE_KEY);
    setSaved(true);
  };

  const addAlias = () => {
    const v = newAlias.trim();
    if (v && !selected.aliases.includes(v)) {
      updateMetric({ aliases: [...selected.aliases, v] });
      setNewAlias('');
    }
  };

  const removeAlias = (alias: string) => {
    updateMetric({ aliases: selected.aliases.filter(a => a !== alias) });
  };

  const addNote = () => {
    const v = newNote.trim();
    if (v) {
      updateMetric({ confusing_notes: [...selected.confusing_notes, v] });
      setNewNote('');
    }
  };

  const removeNote = (idx: number) => {
    updateMetric({ confusing_notes: selected.confusing_notes.filter((_, i) => i !== idx) });
  };

  const runDemo = () => {
    const demoAlias = 'GMV（不含税）';
    const m01 = metrics.find(m => m.id === 'M01')!;
    if (!m01.aliases.includes(demoAlias)) {
      setMetrics(prev => prev.map(m =>
        m.id === 'M01' ? { ...m, aliases: [...m.aliases, demoAlias] } : m
      ));
    }
    setSelectedId('M01');
    setShowDemo(true);
    setTimeout(() => setShowDemo(false), 6000);
  };

  return (
    <div className="flex-1 h-[calc(100vh-64px)] overflow-hidden flex">
      <div style={{ width: 280, borderRight: '1px solid #F1F2F3', background: '#FBFCFD', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 16px 8px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#898B8F', letterSpacing: '0.02em' }}>指标列表（{metrics.length}）</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
          {metrics.map(m => (
            <button
              key={m.id}
              onClick={() => setSelectedId(m.id)}
              className="w-full text-left outline-none"
              style={{
                padding: '10px 12px', borderRadius: 4, marginBottom: 2,
                background: m.id === selectedId ? '#F0EBFA' : 'transparent',
                borderLeft: m.id === selectedId ? '3px solid #B758ED' : '3px solid transparent',
              }}
            >
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: m.id === selectedId ? '#B758ED' : '#B0B5BD', fontWeight: 600 }}>{m.id}</span>
                <span style={{ fontSize: 13, fontWeight: m.id === selectedId ? 600 : 400, color: m.id === selectedId ? '#B758ED' : '#252931' }}>{m.name}</span>
              </div>
              <div style={{ fontSize: 11, color: '#898B8F', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.aliases.length} 个同义词 · {m.confusing_notes.length} 条口径
              </div>
            </button>
          ))}
        </div>

        <div style={{ padding: 12, borderTop: '1px solid #F1F2F3', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            onClick={runDemo}
            className="flex items-center justify-center gap-1.5 outline-none"
            style={{ width: '100%', padding: '8px', fontSize: 12, fontWeight: 500, background: '#FBF9FE', border: '1px dashed #D9BAF7', color: '#B758ED', borderRadius: 4, cursor: 'pointer' }}
          >
            <Sparkles size={13} /> 演示：添加 GMV 别名
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px 48px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-[20px] font-semibold m-0" style={{ color: '#252931' }}>
                <span style={{ fontFamily: 'var(--font-mono)', color: '#B758ED', marginRight: 8 }}>{selected.id}</span>
                {selected.name}
              </h2>
              <p className="text-[12px] m-0 mt-1" style={{ color: '#898B8F' }}>编辑指标定义、SQL 计算模板、同义词和口径规则。保存后持久化到浏览器 localStorage。</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleReset} className="flex items-center gap-1.5 outline-none" style={{ padding: '7px 14px', fontSize: 12, fontWeight: 500, border: '1px solid #E3E5E8', borderRadius: 4, background: '#FFFFFF', color: '#565960', cursor: 'pointer' }}>
                <RotateCcw size={13} /> 重置
              </button>
              <button onClick={handleSave} className="flex items-center gap-1.5 outline-none brand-btn" style={{ padding: '7px 16px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                {saved ? <CheckCircle2 size={13} /> : <Save size={13} />}
                {saved ? '已保存' : '保存修改'}
              </button>
            </div>
          </div>

          {isDirty && (
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 4, padding: '8px 14px', marginBottom: 20, fontSize: 12, color: '#92400E' }}>
              ⚠️ 有未保存的修改。点击"保存修改"持久化到 localStorage，或"重置"恢复默认。
            </div>
          )}

          {showDemo && (
            <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 4, padding: '12px 16px', marginBottom: 20, fontSize: 12, color: '#166534', lineHeight: 1.7 }}>
              <div className="flex items-center gap-2 mb-1" style={{ fontWeight: 600 }}>
                <Sparkles size={13} /> 可扩展性演示
              </div>
              已为 <b>M01 销售额</b> 添加同义词 <code style={{ background: '#DCFCE7', padding: '1px 6px', borderRadius: 3, fontFamily: 'var(--font-mono)' }}>GMV（不含税）</code>。
              现在用户提问"上个月 GMV（不含税）是多少？"时，语义层能正确匹配到 M01 并生成带 pay_status 过滤的正确 SQL——
              无需修改任何代码，仅通过词典配置即可扩展系统能力。
            </div>
          )}

          <Field label="指标定义" icon={<BookOpen size={13} />}>
            <textarea
              value={selected.definition}
              onChange={e => updateMetric({ definition: e.target.value })}
              rows={2}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #E3E5E8', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.7, color: '#252931' }}
            />
          </Field>

          <Field label="SQL 计算模板" icon={<Code2 size={13} />}>
            <textarea
              value={selected.sql_template}
              onChange={e => updateMetric({ sql_template: e.target.value })}
              rows={3}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #E3E5E8', borderRadius: 4, fontSize: 12, fontFamily: 'var(--font-mono)', resize: 'vertical', lineHeight: 1.7, color: '#252931', background: '#FAFBFC' }}
            />
          </Field>

          <Field label={`同义词 / 别名（${selected.aliases.length}）`} icon={<Edit3 size={13} />}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {selected.aliases.map(a => (
                <span key={a} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: '#F5F0FF', color: '#8B45C9', borderRadius: 3, fontSize: 12 }}>
                  {a}
                  <button onClick={() => removeAlias(a)} className="outline-none" style={{ display: 'flex', color: '#B758ED', opacity: 0.6 }}>
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newAlias}
                onChange={e => setNewAlias(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addAlias()}
                placeholder="输入新同义词后按 Enter 添加..."
                style={{ flex: 1, padding: '7px 10px', border: '1px solid #E3E5E8', borderRadius: 4, fontSize: 12 }}
              />
              <button onClick={addAlias} className="outline-none" style={{ padding: '7px 12px', fontSize: 12, background: '#F5F6F8', border: '1px solid #E3E5E8', borderRadius: 4, color: '#565960', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Plus size={12} /> 添加
              </button>
            </div>
          </Field>

          <Field label={`易混淆口径规则（${selected.confusing_notes.length}）`} icon={<Edit3 size={13} />}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              {selected.confusing_notes.map((note, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', background: '#FFFBF0', border: '1px solid #FEF3C7', borderRadius: 4, fontSize: 12, color: '#92400E', lineHeight: 1.6 }}>
                  <span style={{ flex: 1 }}>{note}</span>
                  <button onClick={() => removeNote(i)} className="outline-none" style={{ color: '#D97706', opacity: 0.6, flexShrink: 0 }}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addNote()}
                placeholder="输入口径规则后按 Enter 添加..."
                style={{ flex: 1, padding: '7px 10px', border: '1px solid #E3E5E8', borderRadius: 4, fontSize: 12 }}
              />
              <button onClick={addNote} className="outline-none" style={{ padding: '7px 12px', fontSize: 12, background: '#F5F6F8', border: '1px solid #E3E5E8', borderRadius: 4, color: '#565960', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Plus size={12} /> 添加
              </button>
            </div>
          </Field>

          <div style={{ marginTop: 32, padding: 20, background: '#FBFCFD', border: '1px solid #ECEDF1', borderRadius: 4 }}>
            <div className="text-[12px] font-semibold mb-3" style={{ color: '#252931' }}>📋 全局规则（只读）</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {defaultRules.map((r, i) => (
                <li key={i} style={{ fontSize: 12, color: '#565960', lineHeight: 1.7, paddingLeft: 16, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 0, color: '#B758ED' }}>•</span>{r}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <label className="flex items-center gap-1.5 text-[12px] font-semibold mb-2" style={{ color: '#565960' }}>
        <span style={{ color: '#B758ED' }}>{icon}</span>
        {label}
      </label>
      {children}
    </div>
  );
}
