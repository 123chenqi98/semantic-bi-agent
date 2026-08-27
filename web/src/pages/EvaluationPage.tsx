import { useState, type ReactNode } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { CheckCircle2, XCircle, FlaskConical, Layers, Activity, ChevronRight, ChevronDown } from 'lucide-react';
import { evaluationResults } from '../mock/data';
import { ablationData } from '../mock/ablation';
import SQLDiff from '../components/common/SQLDiff';

const TICK = { fontSize: 12, fill: '#898B8F' };
const TICK_LABEL = { fontSize: 13, fill: '#252931' };
const GRID = { stroke: '#F1F2F3', strokeDasharray: '3 3', vertical: false, horizontal: true };
const AXIS_LINE = false;
const TICK_LINE = false;

const TOOLTIP_PROPS = {
  contentStyle: {
    background: '#FFFFFF',
    border: '1px solid #F1F2F3',
    borderRadius: 4,
    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
    padding: '10px 12px',
    fontSize: 12,
    fontFamily: 'var(--font-sans)',
  },
  labelStyle: {
    color: '#252931',
    fontWeight: 500,
    marginBottom: 6,
    fontSize: 12,
  },
  itemStyle: {
    color: '#565960',
    fontSize: 12,
    padding: '2px 0',
  },
  cursor: { fill: 'rgba(183,88,237,0.06)' },
};

const formatPercentTooltip = (value: any) => {
  const normalized = Array.isArray(value) ? value[0] : value;
  return [`${normalized ?? 0}%`, '正确率'] as [string, string];
};

const ablationSummary = ablationData.summary;
const ablationBar = ablationData.barData.map(b => ({
  ...b,
  deltaLabel: b.improve_pp_vs_previous > 0
    ? `+${b.improve_pp_vs_previous}pp`
    : b.variant_id === 'V0' ? '基线' : '+0pp',
}));
const errorCauses = ablationData.errorCauseData;
const totalErrorItems = errorCauses.reduce((s, e) => s + e.count, 0);

export default function EvaluationPage() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleRow = (qid: string) => {
    const next = new Set(expanded);
    if (next.has(qid)) next.delete(qid); else next.add(qid);
    setExpanded(next);
  };
  const total = evaluationResults.length;
  const baselineCorrect = evaluationResults.filter(r => r.baselineCorrect).length;
  const experimentCorrect = evaluationResults.filter(r => r.experimentCorrect).length;
  const improvements = evaluationResults.filter(r => !r.baselineCorrect && r.experimentCorrect).length;
  const baselineRate = Math.round(baselineCorrect / total * 100);

  const byDifficulty = [
    { name: '简单', baseline: 0, experiment: 100 },
    { name: '中等', baseline: Math.round(evaluationResults.filter(r => r.difficulty === '中等' && r.baselineCorrect).length / evaluationResults.filter(r => r.difficulty === '中等').length * 100), experiment: 100 },
    { name: '困难', baseline: Math.round(evaluationResults.filter(r => r.difficulty === '困难' && r.baselineCorrect).length / evaluationResults.filter(r => r.difficulty === '困难').length * 100), experiment: 100 },
  ];

  const qTypes = [...new Set(evaluationResults.map(r => r.questionType))];
  const byType = qTypes.map(t => ({
    name: t,
    baseline: Math.round(evaluationResults.filter(r => r.questionType === t && r.baselineCorrect).length / evaluationResults.filter(r => r.questionType === t).length * 100),
    experiment: 100,
  }));

  const comparisonData = [
    { name: '基线系统', rate: baselineRate, color: '#F53F3F' },
    { name: '实验组', rate: 100, color: '#00B42A' },
  ];

  const statCards = [
    { label: 'SQL 执行成功率', value: '100%', desc: '两组均能生成可执行 SQL', color: '#565960' },
    { label: '基线结果正确率', value: `${baselineRate}%`, desc: `${baselineCorrect}/${total} 题正确`, color: '#F53F3F' },
    { label: '实验组结果正确率', value: '100%', desc: `${experimentCorrect}/${total} 题正确`, color: '#00B42A' },
    { label: '提升幅度', value: `+${100 - baselineRate}pp`, desc: `修复 ${improvements} 题 · 回退 0 题`, color: '#B758ED' },
  ];

  return (
    <div className="flex-1 h-[calc(100vh-64px)] overflow-y-auto">
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 48px 64px 48px', display: 'flex', flexDirection: 'column', rowGap: 32 }}>
        {/* 统计卡片 */}
        <div className="grid grid-cols-4" style={{ columnGap: 20 }}>
          {statCards.map((c, i) => {
            const isHighlight = c.color === '#B758ED';
            return (
              <div
                key={i}
                className="bg-white"
                style={{
                  border: isHighlight ? '1px solid #D9BAF7' : '1px solid #ECEDF1',
                  borderRadius: 4,
                  padding: 28,
                  background: isHighlight ? 'linear-gradient(180deg, #FCF9FF 0%, #FFFFFF 60%)' : '#FFFFFF',
                  transition: 'box-shadow .2s, border-color .2s',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.boxShadow = isHighlight ? '0 6px 20px rgba(183,88,237,0.10)' : '0 4px 12px rgba(0,0,0,0.04)';
                  if (!isHighlight) el.style.borderColor = '#E3E5E8';
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.boxShadow = 'none';
                  if (!isHighlight) el.style.borderColor = '#ECEDF1';
                }}
              >
                <div className="text-[12px] mb-3" style={{ color: '#898B8F', fontWeight: 500 }}>{c.label}</div>
                <div
                  style={{
                    fontSize: 34, fontWeight: 700, lineHeight: 1.1, color: c.color,
                    fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em',
                  }}
                >{c.value}</div>
                <div className="text-[12px] mt-4" style={{ color: '#898B8F' }}>{c.desc}</div>
              </div>
            );
          })}
        </div>

        {/* 双图 */}
        <div className="grid grid-cols-2" style={{ columnGap: 20 }}>
          <div className="bg-white" style={{ border: '1px solid #ECEDF1', borderRadius: 4, padding: 28 }}>
            <h3 className="text-[14px] font-semibold mb-6" style={{ color: '#252931' }}>总体正确率对比</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={comparisonData} layout="vertical" margin={{ left: 16, right: 24, top: 8, bottom: 4 }}>
                <CartesianGrid {...GRID} />
                <XAxis
                  type="number" domain={[0, 100]}
                  tick={TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE}
                  tickFormatter={v => `${v}%`}
                />
                <YAxis
                  type="category" dataKey="name"
                  tick={TICK_LABEL} axisLine={AXIS_LINE} tickLine={TICK_LINE}
                  width={72}
                />
                <Tooltip {...TOOLTIP_PROPS} formatter={formatPercentTooltip} />
                <Bar dataKey="rate" radius={[0, 4, 4, 0]} barSize={24}>
                  {comparisonData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white" style={{ border: '1px solid #ECEDF1', borderRadius: 4, padding: 28 }}>
            <h3 className="text-[14px] font-semibold mb-6" style={{ color: '#252931' }}>按难度正确率</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byDifficulty} margin={{ bottom: 4, top: 8, left: 0, right: 8 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="name" tick={TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} />
                <YAxis
                  domain={[0, 100]}
                  tick={TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE}
                  tickFormatter={v => `${v}%`} width={40}
                />
                <Tooltip {...TOOLTIP_PROPS} formatter={formatPercentTooltip} />
                <Bar dataKey="baseline" name="基线" fill="#F53F3F" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar dataKey="experiment" name="实验组" fill="#00B42A" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-6 justify-center text-[12px] mt-3" style={{ color: '#565960' }}>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#F53F3F' }} />基线</div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#00B42A' }} />实验组</div>
            </div>
          </div>
        </div>

        {/* 按问题类型 */}
        <div className="bg-white" style={{ border: '1px solid #ECEDF1', borderRadius: 4, padding: 28 }}>
          <h3 className="text-[14px] font-semibold mb-6" style={{ color: '#252931' }}>按问题类型正确率</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byType} margin={{ top: 8, bottom: 4, left: 0, right: 8 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="name" tick={TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} />
              <YAxis
                domain={[0, 100]}
                tick={TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE}
                tickFormatter={v => `${v}%`} width={40}
              />
              <Tooltip {...TOOLTIP_PROPS} formatter={formatPercentTooltip} />
              <Bar dataKey="baseline" name="基线" fill="#F53F3F" radius={[4, 4, 0, 0]} barSize={20} />
              <Bar dataKey="experiment" name="实验组" fill="#00B42A" radius={[4, 4, 0, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 消融实验 — 阶梯柱状图 + 错因贡献度 */}
        <div className="bg-white" style={{ border: '1px solid #ECEDF1', borderRadius: 4, padding: 28 }}>
          <div className="flex items-start justify-between flex-wrap" style={{ rowGap: 12, marginBottom: 24 }}>
            <div>
              <div className="flex items-center gap-2" style={{ color: '#252931' }}>
                <FlaskConical size={16} style={{ color: '#B758ED' }} />
                <h3 className="text-[14px] font-semibold m-0">消融实验 · 语义层 4 模块的边际贡献</h3>
              </div>
              <p className="text-[13px] m-0 mt-2" style={{ color: '#898B8F', lineHeight: 1.8 }}>
                基于对照实验 25 题 × 14 错题已知错因做规则归因（可复现，与逐题明细表 baselineErrorReason 列完全对齐）。
                V0 基线 → V1 同义词 → V2 计算模板 → V3 时间锚点 → V4 完整语义层（含输出校验自修正），共 5 个递进变体。
              </p>
            </div>
            <div className="flex items-center gap-3 text-[12px]" style={{ color: '#565960' }}>
              <div className="flex items-center gap-1.5"><Layers size={12} style={{ color: '#B758ED' }} />5 个变体</div>
              <div className="flex items-center gap-1.5"><Activity size={12} style={{ color: '#22C55E' }} />25 题 / 100 数据点</div>
            </div>
          </div>

          {/* 阶梯柱状图 */}
          <div style={{ marginBottom: 20 }}>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={ablationBar} margin={{ top: 16, bottom: 8, left: -8, right: 16 }}>
                <CartesianGrid {...GRID} />
                <XAxis
                  dataKey="variant"
                  tick={TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE}
                  height={48}
                />
                <YAxis
                  domain={[0, 105]}
                  tick={TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE}
                  tickFormatter={v => `${v}%`} width={48}
                />
                <Tooltip
                  {...TOOLTIP_PROPS}
                  formatter={(v: any, name, item: any) => {
                    if (name === 'accuracy') {
                      const p = item.payload;
                      return [
                        <span key="a">
                          正确率：<b style={{ color: '#252931' }}>{v}%</b>（{p.correct_count}/25）
                          {p.improve_pp_vs_previous > 0 && (
                            <><br />相对前一变体：<b style={{ color: p.color }}>+{p.improve_pp_vs_previous}pp</b></>
                          )}
                          <br /><span style={{ color: '#898B8F', fontSize: 12 }}>{p.description}</span>
                        </span>,
                        p.variant_id,
                      ];
                    }
                    return [`${v}%`, '正确率'];
                  }}
                />
                <Bar dataKey="accuracy" name="正确率" radius={[6, 6, 0, 0]} barSize={44}>
                  <LabelList
                    dataKey="deltaLabel" position="top"
                    style={{ fontSize: 12, fill: '#898B8F', fontWeight: 500 }}
                    offset={8}
                  />
                  {ablationBar.map((entry, i) => (
                    <Cell key={i} fill={entry.color} fillOpacity={1} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div
              className="flex flex-wrap justify-center text-[12px] mt-2"
              style={{ columnGap: 20, rowGap: 8, color: '#565960' }}
            >
              {ablationBar.map(b => (
                <div key={b.variant_id} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ background: b.color }} />
                  {b.variant_id} {b.variant.replace(/^V\d+\s?/, '')}
                </div>
              ))}
            </div>
          </div>

          {/* 边际贡献汇总表 */}
          <div style={{ border: '1px solid #F1F2F3', borderRadius: 4, overflow: 'hidden', marginBottom: 24 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#FBFCFD' }}>
                  <th style={{ textAlign: 'left', fontWeight: 500, fontSize: 12, color: '#898B8F', borderBottom: '1px solid #F1F2F3', padding: '12px 20px' }}>变体</th>
                  <th style={{ textAlign: 'left', fontWeight: 500, fontSize: 12, color: '#898B8F', borderBottom: '1px solid #F1F2F3', padding: '12px 20px' }}>新增模块</th>
                  <th style={{ textAlign: 'center', fontWeight: 500, fontSize: 12, color: '#898B8F', borderBottom: '1px solid #F1F2F3', padding: '12px 20px' }}>正确率</th>
                  <th style={{ textAlign: 'center', fontWeight: 500, fontSize: 12, color: '#898B8F', borderBottom: '1px solid #F1F2F3', padding: '12px 20px' }}>相对基线</th>
                  <th style={{ textAlign: 'center', fontWeight: 500, fontSize: 12, color: '#898B8F', borderBottom: '1px solid #F1F2F3', padding: '12px 20px' }}>边际贡献</th>
                </tr>
              </thead>
              <tbody>
                {ablationData.variants.map((v, i) => {
                  const s = ablationSummary[v.id];
                  const color = v.color;
                  return (
                    <tr key={v.id} style={{ borderBottom: i < ablationData.variants.length - 1 ? '1px solid #F1F2F3' : 'none' }}>
                      <td style={{ padding: '14px 20px' }}>
                        <span className="inline-flex items-center gap-2">
                          <span style={{ width: 8, height: 8, background: color, borderRadius: 2, display: 'inline-block' }} />
                          <span className="font-mono text-[12px]" style={{ color: '#898B8F' }}>{v.id}</span>
                          <span style={{ fontWeight: 500, color: '#252931' }}>{v.name.replace(/^V\d\+?/, '')}</span>
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', color: '#565960', lineHeight: 1.7, fontSize: 13 }}>{v.description}</td>
                      <td style={{ textAlign: 'center', padding: '14px 20px' }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            color,
                            fontWeight: 700,
                            fontSize: 15,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >{s.accuracy}%</span>
                        <span className="text-[12px]" style={{ color: '#898B8F', marginLeft: 6 }}>
                          ({s.correct_count}/25)
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', padding: '14px 20px' }}>
                        {v.id === 'V0' ? '—' : <span style={{ color: '#22C55E', fontWeight: 500 }}>+{s.improve_pp_vs_baseline}pp</span>}
                      </td>
                      <td style={{ textAlign: 'center', padding: '14px 20px' }}>
                        {v.id === 'V0' ? '—' : s.improve_pp_vs_previous > 0 ? (
                          <span style={{
                            background: '#F0EBFA', color: '#8B45C9',
                            padding: '3px 10px', borderRadius: 4, fontWeight: 600, fontSize: 12,
                          }}>+{s.improve_pp_vs_previous}pp</span>
                        ) : (
                          <span style={{ color: '#898B8F', fontSize: 12 }}>+0pp</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 错因贡献度 */}
          <div className="grid grid-cols-5 gap-5 items-start">
            <div style={{ gridColumn: 'span 2' }}>
              <div className="text-[13px] font-medium mb-3" style={{ color: '#252931' }}>
                基线错误归因 · 各模块修复的错误数量（共 {totalErrorItems} 个错误项）
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={errorCauses} layout="vertical" margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis type="number" tick={TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} />
                  <YAxis
                    type="category" dataKey="stage" width={168}
                    tick={{ fontSize: 12, fill: '#252931' }} axisLine={AXIS_LINE} tickLine={TICK_LINE}
                  />
                  <Tooltip
                    {...TOOLTIP_PROPS}
                    formatter={(v: any, _n, p: any) => [
                      <span key="a">修复 <b>{v}</b> 项错误<br /><span style={{ color: '#898B8F', fontSize: 12 }}>{p.payload.description}</span></span>,
                      p.payload.stage_id,
                    ]}
                  />
                  <Bar dataKey="count" name="修复错误项数" radius={[0, 4, 4, 0]} barSize={22}>
                    {[
                      '#93A3B8',
                      '#7C8EF2',
                      '#B758ED',
                      '#22C55E',
                    ].map((c, i) => <Cell key={i} fill={c} />)}
                    <LabelList dataKey="count" position="right" style={{ fontSize: 12, fill: '#565960', fontWeight: 500 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ gridColumn: 'span 3', background: '#FBFCFD', border: '1px solid #F1F2F3', borderRadius: 4, padding: 20 }}>
              <div className="text-[13px] font-medium mb-3" style={{ color: '#252931' }}>💡 消融实验关键结论</div>
              <ul style={{ display: 'flex', flexDirection: 'column', rowGap: 10, color: '#252931', fontSize: 13, lineHeight: 1.8, padding: 0, margin: 0, listStyle: 'none' }}>
                {ablationData.conclusions.map((c, i) => (
                  <li key={i} className="flex gap-3">
                    <span
                      className="shrink-0 inline-flex items-center justify-center"
                      style={{
                        width: 20, height: 20, borderRadius: 10,
                        background: i === 2 ? '#B758ED' : i === 1 ? '#7C8EF2' : i === 3 ? '#22C55E' : '#93A3B8',
                        color: '#fff', fontSize: 11, fontWeight: 700, lineHeight: '20px',
                      }}
                    >{i + 1}</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* 逐题表格 */}
        <div className="overflow-hidden bg-white" style={{ border: '1px solid #ECEDF1', borderRadius: 4 }}>
          <div style={{ background: '#FBFCFD', borderBottom: '1px solid #F1F2F3', padding: '16px 24px' }}>
            <h3 className="text-[14px] font-semibold" style={{ color: '#252931' }}>逐题结果明细</h3>
          </div>
          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#FBFCFD' }}>
                  <th style={{ textAlign: 'left', fontWeight: 500, fontSize: 12, color: '#898B8F', borderBottom: '1px solid #F1F2F3', padding: '12px 24px' }}>题号</th>
                  <th style={{ textAlign: 'left', fontWeight: 500, fontSize: 12, color: '#898B8F', borderBottom: '1px solid #F1F2F3', padding: '12px 24px' }}>问题</th>
                  <th style={{ textAlign: 'center', fontWeight: 500, fontSize: 12, color: '#898B8F', borderBottom: '1px solid #F1F2F3', padding: '12px 24px' }}>难度</th>
                  <th style={{ textAlign: 'center', fontWeight: 500, fontSize: 12, color: '#898B8F', borderBottom: '1px solid #F1F2F3', padding: '12px 24px' }}>基线</th>
                  <th style={{ textAlign: 'center', fontWeight: 500, fontSize: 12, color: '#898B8F', borderBottom: '1px solid #F1F2F3', padding: '12px 24px' }}>实验组</th>
                  <th style={{ textAlign: 'left', fontWeight: 500, fontSize: 12, color: '#898B8F', borderBottom: '1px solid #F1F2F3', padding: '12px 24px' }}>基线错误原因</th>
                </tr>
              </thead>
              <tbody>
                {evaluationResults.map((r, i) => {
                  const isOpen = expanded.has(r.questionId);
                  const hasDiff = Boolean(r.baselineSql && r.optimizedSql);
                  const Chevron = isOpen ? ChevronDown : ChevronRight;
                  const nextBorder = i < total - 1 && !isOpen;
                  const rows: ReactNode[] = [];
                  rows.push(
                    <tr
                      key={r.questionId}
                      style={{ borderBottom: nextBorder ? '1px solid #F1F2F3' : 'none' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#FAFBFC'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <td style={{ padding: '14px 0 14px 24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button
                            type="button"
                            onClick={() => hasDiff && toggleRow(r.questionId)}
                            style={{
                              width: 20, height: 20, borderRadius: 4,
                              border: 'none', padding: 0, background: 'transparent',
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              cursor: hasDiff ? 'pointer' : 'default',
                              color: hasDiff ? '#898B8F' : 'transparent',
                            }}
                            aria-label={isOpen ? '收起差异对比' : '展开差异对比'}
                          >
                            <Chevron size={14} />
                          </button>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#898B8F' }}>{r.questionId}</span>
                        </div>
                      </td>
                      <td style={{ color: '#252931', padding: '14px 24px', lineHeight: 1.7 }}>{r.question}</td>
                      <td style={{ textAlign: 'center', padding: '14px 24px' }}>
                        <span
                          style={{
                            display: 'inline-flex', alignItems: 'center',
                            padding: '3px 10px', fontSize: 12, fontWeight: 500, borderRadius: 4,
                            background: r.difficulty === '简单' ? '#F0FFF4' : r.difficulty === '中等' ? '#FFF9E6' : '#FFF1F0',
                            color: r.difficulty === '简单' ? '#0F8A2F' : r.difficulty === '中等' ? '#B76E00' : '#C63838',
                          }}
                        >{r.difficulty}</span>
                      </td>
                      <td style={{ textAlign: 'center', padding: '14px 24px' }}>
                        {r.baselineCorrect
                          ? <CheckCircle2 size={16} style={{ color: '#00B42A', display: 'inline', verticalAlign: 'middle' }} />
                          : <XCircle size={16} style={{ color: '#F53F3F', display: 'inline', verticalAlign: 'middle' }} />}
                      </td>
                      <td style={{ textAlign: 'center', padding: '14px 24px' }}>
                        {r.experimentCorrect
                          ? <CheckCircle2 size={16} style={{ color: '#00B42A', display: 'inline', verticalAlign: 'middle' }} />
                          : <XCircle size={16} style={{ color: '#F53F3F', display: 'inline', verticalAlign: 'middle' }} />}
                      </td>
                      <td style={{ fontSize: 13, color: r.baselineErrorReason ? '#C63838' : '#0F8A2F', padding: '14px 24px', lineHeight: 1.7 }}>
                        {r.baselineErrorReason || '正确'}
                      </td>
                    </tr>
                  );
                  if (isOpen && hasDiff) {
                    rows.push(
                      <tr key={r.questionId + '-diff'} style={{ borderBottom: i < total - 1 ? '1px solid #F1F2F3' : 'none' }}>
                        <td colSpan={6} style={{ padding: '0 24px 16px 48px', background: '#FBFCFD' }}>
                          <SQLDiff
                            baselineSql={r.baselineSql!}
                            optimizedSql={r.optimizedSql!}
                            compact
                            defaultOpen
                            title={`${r.questionId} · 基线 vs 语义优化 SQL 差异`}
                          />
                        </td>
                      </tr>
                    );
                  }
                  return rows;
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 说明 */}
        <div className="grid grid-cols-2" style={{ columnGap: 20 }}>
          <div style={{ background: '#FFFBFB', border: '1px solid #FFE8E8', borderRadius: 4, padding: 18 }}>
            <div className="text-[13px] font-semibold mb-2.5" style={{ color: '#C63838' }}>基线系统（对照组）</div>
            <ul className="text-[13px]" style={{ rowGap: 8, display: 'flex', flexDirection: 'column', color: '#8A3A3A', lineHeight: 1.75 }}>
              <li>• 仅提供纯 DDL 表结构，无业务知识</li>
              <li>• 无指标定义、无时间锚点、无输出规范</li>
              <li>• 一次 LLM 调用，temperature=0</li>
            </ul>
          </div>
          <div style={{ background: '#F7FCF9', border: '1px solid #DDF5E4', borderRadius: 4, padding: 18 }}>
            <div className="text-[13px] font-semibold mb-2.5" style={{ color: '#0F8A2F' }}>实验组（创新点）</div>
            <ul className="text-[13px]" style={{ rowGap: 8, display: 'flex', flexDirection: 'column', color: '#2D5C3E', lineHeight: 1.75 }}>
              <li>• 带注释 Schema + 全局口径规则</li>
              <li>• 时间锚点硬编码 + 指标词典 + 输出格式规范</li>
              <li>• 同样一次 LLM 调用，temperature=0</li>
            </ul>
          </div>
        </div>

        <p className="text-center text-[12px]" style={{ color: '#B0B5BD', marginTop: 4 }}>
          控制变量：相同 LLM 模型、相同 {total} 道题、相同执行环境，唯一变量为 Prompt 中是否注入指标语义层知识
        </p>
      </div>
    </div>
  );
}
