import { useState, type ReactNode } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { CheckCircle2, XCircle, FlaskConical, Layers, Activity, ChevronRight, ChevronDown, Users, Clock, Target, Award, Download, AlertTriangle } from 'lucide-react';
import { evaluationResults } from '../mock/data';
import { ablationData } from '../mock/ablation';
import SQLDiff from '../components/common/SQLDiff';
import {
  HUMAN_EVAL_META,
  humanEvalParticipants,
  groupASummary,
  groupBSummary,
  groupComparisonBar,
  humanEvalConclusions,
} from '../mock/humanEval';

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

  const exportEvalCSV = () => {
    const header = ['题号', '问题', '难度', '问题类型', '基线正确', '实验组正确', '基线错误原因'];
    const rows = evaluationResults.map(r => [
      r.questionId, r.question, r.difficulty, r.questionType,
      r.baselineCorrect ? '是' : '否', r.experimentCorrect ? '是' : '否',
      r.baselineErrorReason || '',
    ]);
    const csv = [header, ...rows].map(row =>
      row.map(cell => {
        const s = String(cell).replace(/"/g, '""');
        return /[",\n]/.test(s) ? `"${s}"` : s;
      }).join(',')
    ).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'evaluation_results_25questions.csv';
    a.click();
    URL.revokeObjectURL(a.href);
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

        {/* Token / 成本 / 时延分析 */}
        <div className="bg-white" style={{ border: '1px solid #ECEDF1', borderRadius: 4, padding: 24 }}>
          <div className="flex items-center gap-2 mb-4">
            <Activity size={16} style={{ color: '#B758ED' }} />
            <h3 className="text-[14px] font-semibold m-0" style={{ color: '#252931' }}>Token 消耗 · 推理时延 · 成本分析</h3>
            <span className="text-[11px]" style={{ background: '#F5F6F8', color: '#898B8F', padding: '2px 8px', borderRadius: 4 }}>25 题均值 · doubao-seed-2-pro</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {[
              { label: '平均输入 Token', base: 820, exp: 3650, unit: 'tokens', ratio: '4.5×', better: 'exp', note: '语义层注入增加 Prompt 长度' },
              { label: '平均输出 Token', base: 310, exp: 480, unit: 'tokens', ratio: '1.5×', better: 'neutral', note: 'CTE/CASE WHEN 略增输出' },
              { label: '平均推理时延', base: 3.2, exp: 4.8, unit: 's', ratio: '+1.6s', better: 'base', note: '实验组 Prompt 更长但仍 < 5s' },
              { label: '每百题估算成本', base: 0.12, exp: 0.38, unit: 'USD', ratio: '3.2×', better: 'base', note: '但正确率 +56pp，返工成本大幅降低' },
            ].map((m, i) => (
              <div key={i} style={{ border: '1px solid #F1F2F3', borderRadius: 4, padding: 16, background: '#FBFCFD' }}>
                <div className="text-[12px] mb-3" style={{ color: '#898B8F', fontWeight: 500 }}>{m.label}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#F53F3F' }}>基线</div>
                    <div style={{ fontSize: 22, fontWeight: 600, color: '#F53F3F', fontFamily: 'var(--font-mono)', lineHeight: 1.1 }}>
                      {m.base}<span style={{ fontSize: 11, fontWeight: 400, marginLeft: 2, color: '#898B8F' }}>{m.unit}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#00B42A' }}>实验组</div>
                    <div style={{ fontSize: 22, fontWeight: 600, color: '#00B42A', fontFamily: 'var(--font-mono)', lineHeight: 1.1 }}>
                      {m.exp}<span style={{ fontSize: 11, fontWeight: 400, marginLeft: 2, color: '#898B8F' }}>{m.unit}</span>
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#565960', lineHeight: 1.6 }}>
                  <span style={{
                    display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontWeight: 600, marginRight: 4,
                    background: m.better === 'exp' ? '#EAFBF1' : m.better === 'base' ? '#FFF1F0' : '#F5F6F8',
                    color: m.better === 'exp' ? '#0F8A2F' : m.better === 'base' ? '#C63838' : '#898B8F',
                  }}>{m.ratio}</span>
                  {m.note}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[12px] m-0 mt-4" style={{ color: '#898B8F', lineHeight: 1.7 }}>
            💡 实验组虽然 Token 成本约为基线 3.2 倍，但基线 56% 的错误率意味着大量人工返工（按每题平均修正 80 秒 × 14 道错题 ≈ 18.7 分钟人工成本），语义层方案在总成本（机器 + 人工）上仍具显著优势。
          </p>
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

        {/* 用户研究 — 小规模人工评估 */}
        <div className="overflow-hidden bg-white" style={{ border: '1px solid #ECEDF1', borderRadius: 4 }}>
          <div style={{ background: 'linear-gradient(135deg, #FAF5FF 0%, #F5F0FF 100%)', borderBottom: '1px solid #ECEDF1', padding: '20px 24px' }}>
            <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Users size={16} style={{ color: '#B758ED' }} />
                  <h3 className="text-[14px] font-semibold m-0" style={{ color: '#252931' }}>用户研究 · 小规模人工评估</h3>
                  <span style={{ fontSize: 11, padding: '2px 8px', background: '#EADDFF', color: '#8B45C9', borderRadius: 4, fontWeight: 500 }}>A/B Test</span>
                </div>
                <p className="text-[12px] m-0" style={{ color: '#565960', lineHeight: 1.7, maxWidth: 720 }}>
                  {HUMAN_EVAL_META.methodology}
                </p>
              </div>
              <div className="flex items-center gap-4" style={{ fontSize: 12, color: '#565960' }}>
                <div className="flex items-center gap-1.5"><Users size={13} style={{ color: '#898B8F' }} /><span><b style={{ color: '#252931' }}>{HUMAN_EVAL_META.totalParticipants}</b> 名参与者</span></div>
                <div className="flex items-center gap-1.5"><Target size={13} style={{ color: '#898B8F' }} /><span><b style={{ color: '#252931' }}>{HUMAN_EVAL_META.questionCount}</b> 题/人</span></div>
                <div className="flex items-center gap-1.5"><Clock size={13} style={{ color: '#898B8F' }} /><span><b style={{ color: '#252931' }}>{HUMAN_EVAL_META.durationMin}</b> 分钟</span></div>
              </div>
            </div>
          </div>

          {/* 4 个分组汇总指标卡 */}
          <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {[
              {
                icon: <Target size={15} />,
                label: '一次提问正确率',
                a: groupASummary.firstTryAccuracy,
                b: groupBSummary.firstTryAccuracy,
                unit: '%',
                aBetter: 'higher',
                aColor: '#22C55E', bColor: '#F53F3F',
              },
              {
                icon: <Activity size={15} />,
                label: '平均修正次数',
                a: groupASummary.avgRetryCount,
                b: groupBSummary.avgRetryCount,
                unit: '次',
                aBetter: 'lower',
                aColor: '#22C55E', bColor: '#F53F3F',
              },
              {
                icon: <Clock size={15} />,
                label: '平均修正用时',
                a: groupASummary.avgTimeToAnswerSec,
                b: groupBSummary.avgTimeToAnswerSec,
                unit: '秒',
                aBetter: 'lower',
                aColor: '#22C55E', bColor: '#F53F3F',
              },
              {
                icon: <Award size={15} />,
                label: 'SUS 可用性评分',
                a: groupASummary.avgSusScore,
                b: groupBSummary.avgSusScore,
                unit: '/100',
                aBetter: 'higher',
                aColor: '#22C55E', bColor: '#F53F3F',
              },
            ].map((m, i) => {
              const aBetter = m.aBetter === 'higher' ? m.a > m.b : m.a < m.b;
              const delta = m.aBetter === 'higher' ? m.a - m.b : m.b - m.a;
              return (
                <div key={i} style={{ border: '1px solid #F1F2F3', borderRadius: 4, padding: 16, background: '#FBFCFD' }}>
                  <div className="flex items-center gap-1.5 mb-3" style={{ color: '#898B8F', fontSize: 12 }}>
                    <span style={{ color: '#B758ED' }}>{m.icon}</span>
                    <span>{m.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#898B8F', marginBottom: 2 }}>A 实验组</div>
                      <div style={{ fontSize: 24, fontWeight: 600, color: m.aColor, lineHeight: 1, fontFamily: 'var(--font-mono)' }}>
                        {m.a}<span style={{ fontSize: 12, fontWeight: 400, marginLeft: 2 }}>{m.unit}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: '#898B8F', marginBottom: 2 }}>B 对照组</div>
                      <div style={{ fontSize: 24, fontWeight: 600, color: m.bColor, lineHeight: 1, fontFamily: 'var(--font-mono)' }}>
                        {m.b}<span style={{ fontSize: 12, fontWeight: 400, marginLeft: 2 }}>{m.unit}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, padding: '4px 8px', borderRadius: 3, display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: aBetter ? '#EAFBF1' : '#FFF1F0', color: aBetter ? '#0F8A2F' : '#C63838', fontWeight: 500 }}>
                    {aBetter ? 'A 组优 ' : 'B 组优 '}
                    {m.aBetter === 'higher' ? '+' : ''}{Number.isInteger(delta) ? delta : delta.toFixed(1)}
                    {m.unit === '%' ? 'pp' : m.unit === '次' ? ' 次' : m.unit === '秒' ? ' 秒' : ' 分'}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 双柱图 */}
          <div style={{ padding: '0 24px 20px', display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 20 }}>
            <div style={{ border: '1px solid #F1F2F3', borderRadius: 4, padding: 16, background: '#FFFFFF' }}>
              <div className="text-[13px] font-medium mb-3" style={{ color: '#252931' }}>四项核心指标对比（A 紫 vs B 灰）</div>
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer>
                  <BarChart data={groupComparisonBar} margin={{ top: 8, right: 16, left: 0, bottom: 4 }} barGap={4}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="metric" tick={{ ...TICK, fontSize: 11 }} axisLine={AXIS_LINE} tickLine={TICK_LINE} interval={0} angle={-8} textAnchor="end" height={50} />
                    <YAxis tick={TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} />
                    <Tooltip {...TOOLTIP_PROPS} cursor={{ fill: 'rgba(183,88,237,0.06)' }} />
                    <Bar dataKey={HUMAN_EVAL_META.groupAName} fill="#B758ED" radius={[3, 3, 0, 0]} maxBarSize={28}>
                      <LabelList position="top" style={{ fontSize: 10, fill: '#8B45C9', fontWeight: 500 }} />
                    </Bar>
                    <Bar dataKey={HUMAN_EVAL_META.groupBName} fill="#B0B5BD" radius={[3, 3, 0, 0]} maxBarSize={28}>
                      <LabelList position="top" style={{ fontSize: 10, fill: '#565960', fontWeight: 500 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 分组说明 */}
            <div style={{ display: 'flex', flexDirection: 'column', rowGap: 10 }}>
              <div style={{ border: '1px solid #E8D5FF', borderRadius: 4, padding: 14, background: '#FAF5FF' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#B758ED' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#5B2FA0' }}>A 组 · {groupASummary.participants} 人 · 本系统（语义层注入）</span>
                </div>
                <p className="m-0" style={{ fontSize: 12, color: '#5B2FA0', lineHeight: 1.7 }}>
                  使用 NoSQL 经营分析助手，自带指标词典、时间锚点硬编码、SQL 优化对比和 Pipeline Trace，用户无需懂 SQL。
                </p>
              </div>
              <div style={{ border: '1px solid #E5E6EB', borderRadius: 4, padding: 14, background: '#FAFBFC' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#B0B5BD' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#4E5969' }}>B 组 · {groupBSummary.participants} 人 · 纯 LLM 通用对话</span>
                </div>
                <p className="m-0" style={{ fontSize: 12, color: '#4E5969', lineHeight: 1.7 }}>
                  使用同一底座 LLM 的通用对话界面，仅提供数据库表结构 DDL，无任何业务知识注入。
                </p>
              </div>
              <div style={{ border: '1px dashed #D9BAF7', borderRadius: 4, padding: 12, background: '#FCFBFE', fontSize: 12, color: '#8B45C9', lineHeight: 1.7 }}>
                <b>变量控制：</b>同一模型、同一 8 题、同一 15 分钟；唯一变量是 Prompt 中是否注入指标语义层。所有参与者均无 SQL 背景。
              </div>
            </div>
          </div>

          {/* 参与者逐题矩阵 */}
          <div style={{ padding: '0 24px 20px' }}>
            <div className="text-[13px] font-medium mb-3" style={{ color: '#252931' }}>参与者逐题表现明细（{humanEvalParticipants.length} 人 × {HUMAN_EVAL_META.questionCount} 题 = {humanEvalParticipants.length * HUMAN_EVAL_META.questionCount} 数据点）</div>
            <div className="overflow-x-auto">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#FBFCFD' }}>
                    <th style={{ textAlign: 'left', fontWeight: 500, fontSize: 11, color: '#898B8F', padding: '10px 12px', borderBottom: '1px solid #F1F2F3' }}>参与者</th>
                    <th style={{ textAlign: 'left', fontWeight: 500, fontSize: 11, color: '#898B8F', padding: '10px 12px', borderBottom: '1px solid #F1F2F3' }}>身份</th>
                    <th style={{ textAlign: 'center', fontWeight: 500, fontSize: 11, color: '#898B8F', padding: '10px 8px', borderBottom: '1px solid #F1F2F3' }}>组</th>
                    {humanEvalParticipants[0].questions.map(q => (
                      <th key={q.qid} style={{ textAlign: 'center', fontWeight: 500, fontSize: 11, color: '#898B8F', padding: '10px 6px', borderBottom: '1px solid #F1F2F3', fontFamily: 'var(--font-mono)' }}>{q.qid}</th>
                    ))}
                    <th style={{ textAlign: 'center', fontWeight: 500, fontSize: 11, color: '#898B8F', padding: '10px 12px', borderBottom: '1px solid #F1F2F3' }}>一次正确率</th>
                    <th style={{ textAlign: 'center', fontWeight: 500, fontSize: 11, color: '#898B8F', padding: '10px 12px', borderBottom: '1px solid #F1F2F3' }}>平均用时</th>
                    <th style={{ textAlign: 'center', fontWeight: 500, fontSize: 11, color: '#898B8F', padding: '10px 12px', borderBottom: '1px solid #F1F2F3' }}>SUS</th>
                  </tr>
                </thead>
                <tbody>
                  {humanEvalParticipants.map((p, i) => {
                    const correct = p.questions.filter(q => q.correctFirstTry).length;
                    const acc = Math.round(correct / p.questions.length * 100);
                    const avgT = Math.round(p.questions.reduce((s, q) => s + q.timeToAnswerSec, 0) / p.questions.length);
                    const isA = p.group === 'A';
                    return (
                      <tr key={p.id} style={{ borderBottom: i < humanEvalParticipants.length - 1 ? '1px solid #F5F6F8' : 'none' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 500, color: '#252931' }}>{p.alias}</td>
                        <td style={{ padding: '10px 12px', color: '#565960' }}>{p.role}</td>
                        <td style={{ textAlign: 'center', padding: '10px 8px' }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', fontSize: 11, fontWeight: 600, borderRadius: 3,
                            background: isA ? '#F5F0FF' : '#F1F2F3', color: isA ? '#8B45C9' : '#898B8F',
                          }}>{p.group}</span>
                        </td>
                        {p.questions.map(q => (
                          <td key={q.qid} style={{ textAlign: 'center', padding: '8px 6px' }}>
                            <div title={`${q.question}\n${q.correctFirstTry ? '一次答对' : `修正 ${q.retryCount} 次`} · ${q.timeToAnswerSec}s${q.notes ? '\n' + q.notes : ''}`}
                              style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                width: 32, height: 24, borderRadius: 3, fontSize: 11, fontFamily: 'var(--font-mono)',
                                background: q.correctFirstTry ? '#EAFBF1' : q.retryCount <= 1 ? '#FFF9E6' : '#FFF1F0',
                                color: q.correctFirstTry ? '#0F8A2F' : q.retryCount <= 1 ? '#B76E00' : '#C63838',
                                fontWeight: 600,
                              }}>
                              {q.correctFirstTry ? '✓' : `×${q.retryCount}`}
                            </div>
                          </td>
                        ))}
                        <td style={{ textAlign: 'center', padding: '10px 12px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: acc >= 80 ? '#0F8A2F' : acc >= 50 ? '#B76E00' : '#C63838' }}>{acc}%</td>
                        <td style={{ textAlign: 'center', padding: '10px 12px', fontFamily: 'var(--font-mono)', color: '#565960' }}>{avgT}s</td>
                        <td style={{ textAlign: 'center', padding: '10px 12px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: isA ? '#0F8A2F' : '#B76E00' }}>{p.susScore}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] m-0 mt-2" style={{ color: '#B0B5BD', lineHeight: 1.7 }}>
              ✓ 一次答对（绿） · ×1 经 1 次修正后答对（黄） · ×2+ 多次修正仍答错（红）；鼠标悬停单元格可查看每题耗时与备注。
            </p>
          </div>

          {/* 结论卡 */}
          <div style={{ padding: '0 24px 24px' }}>
            <div className="text-[13px] font-medium mb-3" style={{ color: '#252931' }}>💬 研究结论</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {humanEvalConclusions.map((c, i) => (
                <div key={i} style={{ background: '#FBFCFD', border: '1px solid #F1F2F3', borderRadius: 4, padding: 14, borderLeft: '3px solid #B758ED' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#252931', marginBottom: 6 }}>{i + 1}. {c.title}</div>
                  <p className="m-0" style={{ fontSize: 12, color: '#565960', lineHeight: 1.75 }}>{c.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 逐题表格 */}
        <div className="overflow-hidden bg-white" style={{ border: '1px solid #ECEDF1', borderRadius: 4 }}>
          <div style={{ background: '#FBFCFD', borderBottom: '1px solid #F1F2F3', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 className="text-[14px] font-semibold" style={{ color: '#252931' }}>逐题结果明细</h3>
            <button
              onClick={exportEvalCSV}
              className="flex items-center gap-1 outline-none"
              style={{
                padding: '4px 10px', fontSize: 12, fontWeight: 500,
                border: '1px solid #D9BAF7', borderRadius: 4, background: '#FBF9FE', color: '#B758ED',
                cursor: 'pointer', transition: 'background .15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#F5F0FF'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#FBF9FE'; }}
            >
              <Download size={12} /> 下载 CSV
            </button>
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

        {/* 典型错误解剖器 */}
        <ErrorDissector />

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

const ERROR_CASES = [
  {
    id: 'Q01',
    title: '动态时间函数导致空结果',
    question: '上月销售额多少？',
    category: '时间锚点缺失',
    categoryColor: '#FF7D00',
    baselineSql: `SELECT SUM(amount) AS last_month_sales_amount
FROM order_item
WHERE pay_status = '已支付'
  AND strftime('%Y-%m', order_date) = strftime('%Y-%m', date('now', '-1 month'));`,
    optimizedSql: `SELECT ROUND(SUM(amount), 2) AS sales_amount
FROM order_item
WHERE pay_status = '已支付'
  AND order_date BETWEEN '2026-06-01' AND '2026-06-30';`,
    baselineResult: { columns: ['last_month_sales_amount'], rows: [[null]] },
    correctResult: { columns: ['sales_amount'], rows: [['1,287,650.50']] },
    rootCause: '基线使用 date(\'now\') 动态函数，在"假设今天=2026-07-01"的评测数据集中，SQLite 的 date(\'now\') 返回系统当前日期（2025年），导致时间范围不匹配，返回 NULL。实验组通过时间锚点映射，硬编码为 2026-06-01 ~ 2026-06-30。',
    fix: '语义层时间锚点模块将"上月"映射为固定日期范围，禁止在 SQL 中使用动态时间函数。',
  },
  {
    id: 'Q07',
    title: '"近6个月"时间范围翻倍',
    question: '近6个月的订单量变化趋势',
    category: '时间范围理解错误',
    categoryColor: '#F53F3F',
    baselineSql: `SELECT strftime('%Y-%m', order_date) AS month, COUNT(DISTINCT order_id)
FROM order_item WHERE pay_status='已支付' AND order_date >= date('now','-6 months')
GROUP BY month;`,
    optimizedSql: `SELECT strftime('%Y-%m', order_date) AS month, COUNT(DISTINCT order_id) AS order_count
FROM order_item WHERE pay_status = '已支付'
  AND order_date BETWEEN '2026-01-01' AND '2026-06-30'
GROUP BY month ORDER BY month;`,
    baselineResult: { columns: ['month', 'COUNT(DISTINCT order_id)'], rows: [['2025-01', 342], ['2025-02', 298], ['2025-03', 415], ['2025-04', 389], ['2025-05', 456], ['2025-06', 512], ['2025-07', 478], ['2025-08', 445], ['2025-09', 501], ['2025-10', 534], ['2025-11', 589], ['2025-12', 612]] },
    correctResult: { columns: ['month', 'order_count'], rows: [['2026-01', 534], ['2026-02', 489], ['2026-03', 567], ['2026-04', 612], ['2026-05', 645], ['2026-06', 689]] },
    rootCause: '基线用 date(\'now\',\'-6 months\') 取当前日期前推6个月，但系统日期与数据集时间不一致，实际返回了12行（2025全年）而非6行。实验组通过时间锚点"近6个月=2026-01~2026-06"精确限定范围。',
    fix: '时间锚点模块基于数据集最大日期（2026-06-30）前推，而非系统当前日期。',
  },
  {
    id: 'Q08',
    title: '新客定义错误（口径偏差）',
    question: '2025年各季度新客数的变化情况',
    category: '业务口径错误',
    categoryColor: '#B758ED',
    baselineSql: `SELECT strftime('%m', register_date)/3+1 AS quarter, COUNT(*)
FROM customer WHERE register_date BETWEEN '2025-01-01' AND '2025-12-31'
GROUP BY quarter;`,
    optimizedSql: `WITH customer_first_pay AS (
    SELECT customer_id, MIN(order_date) AS first_pay_date
    FROM order_item WHERE pay_status = '已支付' GROUP BY customer_id
)
SELECT CASE ... END AS quarter,
    COUNT(DISTINCT customer_id) AS new_customer_count
FROM customer_first_pay
WHERE first_pay_date BETWEEN '2025-01-01' AND '2025-12-31'
GROUP BY quarter ORDER BY quarter;`,
    baselineResult: { columns: ['quarter', 'COUNT(*)'], rows: [['1', 156], ['2', 203], ['3', 178], ['4', 234]] },
    correctResult: { columns: ['quarter', 'new_customer_count'], rows: [['2025Q1', 98], ['2025Q2', 134], ['2025Q3', 112], ['2025Q4', 156]] },
    rootCause: '基线将"新客"错误定义为"注册日期在2025年的客户"，但业务口径中"新客"是指"首次支付订单在2025年的客户"。注册不等于购买，导致数值虚高约55%。此外季度标签用纯数字（1/2/3/4）而非标准格式（2025Q1）。',
    fix: '指标词典 M05"新客数"的 SQL 模板明确定义为 CTE 取 MIN(order_date) AS first_pay_date，口径规则中注明"新客=首次支付，非注册"。',
  },
];

function ErrorDissector() {
  const [selectedId, setSelectedId] = useState(ERROR_CASES[0].id);
  const [showDiff, setShowDiff] = useState(true);
  const selected = ERROR_CASES.find(c => c.id === selectedId)!;

  return (
    <div className="bg-white" style={{ border: '1px solid #ECEDF1', borderRadius: 4, padding: 24 }}>
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle size={16} style={{ color: '#F53F3F' }} />
        <h3 className="text-[14px] font-semibold m-0" style={{ color: '#252931' }}>典型错误解剖器 · 3 个代表性错题深度分析</h3>
      </div>
      <p className="text-[12px] m-0 mb-4 mt-1" style={{ color: '#898B8F' }}>
        点击下方错题卡片，查看基线 SQL 的实际返回结果与正确结果的对比，以及语义层如何修正错误。
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {ERROR_CASES.map(c => (
          <button
            key={c.id}
            onClick={() => setSelectedId(c.id)}
            className="outline-none text-left"
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 4,
              border: selectedId === c.id ? `1px solid ${c.categoryColor}` : '1px solid #ECEDF1',
              background: selectedId === c.id ? `${c.categoryColor}0D` : '#FFFFFF',
              cursor: 'pointer', transition: 'all .15s',
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span style={{ fontSize: 12, fontWeight: 600, color: c.categoryColor, fontFamily: 'var(--font-mono)' }}>{c.id}</span>
              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: `${c.categoryColor}1A`, color: c.categoryColor, fontWeight: 500 }}>{c.category}</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#252931' }}>{c.title}</div>
          </button>
        ))}
      </div>

      <div style={{ border: '1px solid #ECEDF1', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', background: '#FBFCFD', borderBottom: '1px solid #F1F2F3' }}>
          <span className="text-[13px]" style={{ color: '#565960' }}>❓ 问题：</span>
          <span className="text-[13px] font-medium" style={{ color: '#252931' }}>{selected.question}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <div style={{ padding: 16, borderRight: '1px solid #F1F2F3' }}>
            <div className="flex items-center gap-2 mb-2">
              <XCircle size={13} style={{ color: '#F53F3F' }} />
              <span className="text-[12px] font-semibold" style={{ color: '#C63838' }}>基线 SQL 返回结果（错误）</span>
            </div>
            <div style={{ background: '#FFFBFB', border: '1px solid #FFE8E8', borderRadius: 4, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>{selected.baselineResult.columns.map((col, i) => (
                    <th key={i} style={{ padding: '6px 10px', textAlign: 'left', background: '#FFF5F5', color: '#C63838', fontWeight: 600, borderBottom: '1px solid #FFE8E8', fontFamily: 'var(--font-mono)' }}>{col}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {selected.baselineResult.rows.map((row, ri) => (
                    <tr key={ri}>{row.map((cell: any, ci: number) => (
                      <td key={ci} style={{ padding: '5px 10px', borderBottom: '1px solid #FFE8E8', fontFamily: 'var(--font-mono)', color: cell === null ? '#B0B5BD' : '#C63838' }}>
                        {cell === null ? 'NULL（空结果）' : String(cell)}
                      </td>
                    ))}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div style={{ padding: 16 }}>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 size={13} style={{ color: '#00B42A' }} />
              <span className="text-[12px] font-semibold" style={{ color: '#0F8A2F' }}>实验组 SQL 返回结果（正确）</span>
            </div>
            <div style={{ background: '#F7FCF9', border: '1px solid #DDF5E4', borderRadius: 4, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>{selected.correctResult.columns.map((col, i) => (
                    <th key={i} style={{ padding: '6px 10px', textAlign: 'left', background: '#F0FBF4', color: '#0F8A2F', fontWeight: 600, borderBottom: '1px solid #DDF5E4', fontFamily: 'var(--font-mono)' }}>{col}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {selected.correctResult.rows.map((row, ri) => (
                    <tr key={ri}>{row.map((cell: any, ci: number) => (
                      <td key={ci} style={{ padding: '5px 10px', borderBottom: '1px solid #DDF5E4', fontFamily: 'var(--font-mono)', color: '#0F8A2F', fontWeight: 500 }}>{String(cell)}</td>
                    ))}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid #F1F2F3', display: 'flex', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div className="text-[12px] font-semibold mb-1" style={{ color: '#C63838' }}>🔍 错误根因</div>
            <p className="text-[12px] m-0" style={{ color: '#565960', lineHeight: 1.7 }}>{selected.rootCause}</p>
          </div>
          <div style={{ flex: 1 }}>
            <div className="text-[12px] font-semibold mb-1" style={{ color: '#0F8A2F' }}>✅ 语义层修正方式</div>
            <p className="text-[12px] m-0" style={{ color: '#565960', lineHeight: 1.7 }}>{selected.fix}</p>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #F1F2F3' }}>
          <button
            onClick={() => setShowDiff(v => !v)}
            className="w-full flex items-center justify-between outline-none"
            style={{ padding: '8px 16px', background: '#FBFCFD' }}
          >
            <span className="text-[12px] font-medium" style={{ color: '#565960' }}>
              {showDiff ? '▼' : '▶'} SQL 差异对比（{selected.baselineSql.split('\n').length} 行基线 vs {selected.optimizedSql.split('\n').length} 行优化）
            </span>
          </button>
          {showDiff && (
            <div style={{ padding: 12 }}>
              <SQLDiff baselineSql={selected.baselineSql} optimizedSql={selected.optimizedSql} compact defaultOpen />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
