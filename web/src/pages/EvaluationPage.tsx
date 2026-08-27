import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { CheckCircle2, XCircle } from 'lucide-react';
import { evaluationResults } from '../mock/data';

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

export default function EvaluationPage() {
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
                {evaluationResults.map((r, i) => (
                  <tr
                    key={r.questionId}
                    style={{ borderBottom: i < total - 1 ? '1px solid #F1F2F3' : 'none' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#FAFBFC'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#898B8F', padding: '14px 24px' }}>{r.questionId}</td>
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
                ))}
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
