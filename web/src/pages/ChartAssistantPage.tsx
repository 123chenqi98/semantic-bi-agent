import { useState, useMemo, useRef, useEffect } from 'react';
import { Upload, Sparkles, BarChart3, FileText, Lightbulb, TrendingUp } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ComposedChart, ZAxis,
} from 'recharts';
import {
  CHART_TYPES, CHART_STYLES, CHART_EXAMPLES,
  recommendChartType, buildResult,
  type ChartKind, type ChartResult, type ChartExample,
} from '../mock/chartAssistant';
import { useApp } from '../store/ChatContext';

export default function ChartAssistantPage() {
  const { state, dispatch } = useApp();
  const [fileName, setFileName] = useState('');
  const [background, setBackground] = useState('');
  const [goal, setGoal] = useState('');
  const [csvData, setCsvData] = useState('');
  const [chartType, setChartType] = useState<ChartKind>('auto');
  const [styleId, setStyleId] = useState('business');
  const [result, setResult] = useState<ChartResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoTriggeredRef = useRef(false);

  // 接收来自 @图表生成 / /chart 的预填数据
  useEffect(() => {
    const payload = state.pendingChartPayload;
    if (!payload) return;
    setFileName(payload.fileName);
    setBackground(payload.background);
    setGoal(payload.goal);
    setCsvData(payload.csvData);
    setResult(null);
    if (payload.autoGenerate) {
      autoTriggeredRef.current = true;
    }
    dispatch({ type: 'SET_CHART_PAYLOAD', payload: null });
  }, [state.pendingChartPayload, dispatch]);

  // autoGenerate: 等 state 更新后自动触发
  useEffect(() => {
    if (autoTriggeredRef.current && fileName && csvData && !isGenerating && !result) {
      autoTriggeredRef.current = false;
      setIsGenerating(true);
      setTimeout(() => {
        const type = chartType === 'auto'
          ? recommendChartType(background + ' ' + goal + ' ' + csvData).type
          : chartType;
        const reason = chartType === 'auto'
          ? recommendChartType(background + ' ' + goal + ' ' + csvData).reason
          : undefined;
        const r = buildResult(fileName, background, goal, csvData, type, styleId, reason);
        setResult(r);
        setIsGenerating(false);
      }, 700);
    }
  }, [fileName, csvData, background, goal, chartType, styleId, isGenerating, result]);

  const currentStyle = CHART_STYLES.find(s => s.id === styleId) || CHART_STYLES[0];
  const effectiveType: Exclude<ChartKind, 'auto'> = useMemo(() => {
    if (chartType !== 'auto') return chartType;
    const rec = recommendChartType(background + ' ' + goal + ' ' + csvData);
    return rec.type;
  }, [chartType, background, goal, csvData]);

  const recommendReason = useMemo(() => {
    if (chartType !== 'auto') return undefined;
    const rec = recommendChartType(background + ' ' + goal + ' ' + csvData);
    return rec.reason;
  }, [chartType, background, goal, csvData]);

  const canGenerate = fileName.trim() && csvData.trim();

  const handleGenerate = () => {
    if (!canGenerate) return;
    setIsGenerating(true);
    setTimeout(() => {
      const type = chartType === 'auto'
        ? recommendChartType(background + ' ' + goal + ' ' + csvData).type
        : chartType;
      const reason = chartType === 'auto'
        ? recommendChartType(background + ' ' + goal + ' ' + csvData).reason
        : undefined;
      const r = buildResult(fileName, background, goal, csvData, type, styleId, reason);
      setResult(r);
      setIsGenerating(false);
    }, 600);
  };

  const handleExampleClick = (ex: ChartExample) => {
    setFileName(ex.fileName);
    setBackground(ex.background);
    setGoal(ex.goal);
    setCsvData(ex.data);
    setChartType(ex.chartType);
    setStyleId(ex.style);
    setResult(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = ev => {
      const text = (ev.target?.result as string) || '';
      setCsvData(text);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const renderChart = () => {
    if (!result) return null;
    const { chartData, xKey, series, chartType: ct } = result;
    const colors = currentStyle.colors;

    const sharedAxis = {
      stroke: currentStyle.axis,
      fontSize: 12,
      axisLine: false,
      tickLine: false,
    };
    const sharedGrid = { stroke: currentStyle.grid, strokeDasharray: '3 3', vertical: false, horizontal: true };

    if (ct === 'bar') {
      return (
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={{ top: 16, right: 24, bottom: 8, left: 8 }}>
            <CartesianGrid {...sharedGrid} />
            <XAxis dataKey={xKey} tick={sharedAxis} />
            <YAxis tick={sharedAxis} width={56} />
            <Tooltip
              contentStyle={{
                background: currentStyle.tooltip.bg,
                border: `1px solid ${currentStyle.tooltip.border}`,
                borderRadius: 4,
                fontSize: 12,
                color: currentStyle.tooltip.text,
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
              }}
              cursor={{ fill: 'rgba(183,88,237,0.04)' }}
            />
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color || colors[i % colors.length]} radius={[4, 4, 0, 0]} barSize={Math.min(40, Math.max(16, 200 / chartData.length))} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (ct === 'line') {
      return (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData} margin={{ top: 16, right: 24, bottom: 8, left: 8 }}>
            <CartesianGrid {...sharedGrid} />
            <XAxis dataKey={xKey} tick={sharedAxis} />
            <YAxis tick={sharedAxis} width={56} />
            <Tooltip
              contentStyle={{
                background: currentStyle.tooltip.bg,
                border: `1px solid ${currentStyle.tooltip.border}`,
                borderRadius: 4, fontSize: 12, color: currentStyle.tooltip.text,
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
              }}
            />
            {series.map((s, i) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color || colors[i % colors.length]}
                strokeWidth={2.5}
                dot={{ r: 3, fill: s.color || colors[i % colors.length], strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      );
    }

    if (ct === 'pie') {
      const s = series[0];
      const pieData = chartData.map(d => ({ name: String(d[xKey]), value: Number(d[s.key]) }));
      return (
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={110}
              innerRadius={50}
              paddingAngle={2}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              labelLine={{ stroke: '#B0B5BD', strokeWidth: 1 }}
            >
              {pieData.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} stroke="#fff" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: currentStyle.tooltip.bg,
                border: `1px solid ${currentStyle.tooltip.border}`,
                borderRadius: 4, fontSize: 12, color: currentStyle.tooltip.text,
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
              }}
              formatter={(v: number) => v.toLocaleString()}
            />
          </PieChart>
        </ResponsiveContainer>
      );
    }

    if (ct === 'scatter') {
      const cols = Object.keys(chartData[0] || {});
      const xCol = cols[1] || cols[0];
      const yCol = cols[2] || cols[1];
      const nameCol = cols[0];
      return (
        <ResponsiveContainer width="100%" height={320}>
          <ScatterChart margin={{ top: 16, right: 24, bottom: 8, left: 8 }}>
            <CartesianGrid {...sharedGrid} />
            <XAxis type="number" dataKey={xCol} name={xCol} tick={sharedAxis} />
            <YAxis type="number" dataKey={yCol} name={yCol} tick={sharedAxis} width={56} />
            <ZAxis range={[48, 48]} />
            <Tooltip
              cursor={{ strokeDasharray: '3 3', stroke: currentStyle.axis }}
              content={({ active, payload }) => {
                if (active && payload?.[0]) {
                  const d = payload[0].payload;
                  const yVal = typeof d[yCol] === 'number' && d[yCol] < 1
                    ? (d[yCol] * 100).toFixed(0) + '%'
                    : (typeof d[yCol] === 'number' ? d[yCol].toLocaleString() : d[yCol]);
                  const xVal = typeof d[xCol] === 'number' ? d[xCol].toLocaleString() : d[xCol];
                  return (
                    <div style={{
                      background: currentStyle.tooltip.bg,
                      border: `1px solid ${currentStyle.tooltip.border}`,
                      borderRadius: 4, padding: '8px 12px', fontSize: 12,
                      color: currentStyle.tooltip.text,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                    }}>
                      <div style={{ fontWeight: 500, marginBottom: 4 }}>{d[nameCol]}</div>
                      <div>{xCol}: {xVal}</div>
                      <div>{yCol}: {yVal}</div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Scatter
              name="数据点"
              data={chartData}
              fill={colors[0]}
              fillOpacity={0.7}
            />
          </ScatterChart>
        </ResponsiveContainer>
      );
    }

    if (ct === 'funnel') {
      const s = series[0];
      const maxVal = Math.max(...chartData.map(d => Number(d[s.key]) || 0));
      const funnelData = chartData.map((d, i) => ({
        ...d,
        __name: String(d[xKey]),
        __value: Number(d[s.key]),
        __percent: maxVal ? (Number(d[s.key]) / maxVal) * 100 : 0,
        __index: i,
      }));
      return (
        <div style={{ padding: '16px 32px', height: 320, display: 'flex', flexDirection: 'column', justifyContent: 'center', rowGap: 4 }}>
          {funnelData.map((d, i) => {
            const prev = i > 0 ? funnelData[i - 1].__value : d.__value;
            const convRate = i > 0 ? ((d.__value / prev) * 100).toFixed(1) : '100';
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', height: 40 }}>
                <div style={{ width: 100, fontSize: 13, color: '#252931', textAlign: 'right', paddingRight: 16, flexShrink: 0 }}>{d.__name}</div>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                  <div
                    style={{
                      width: `${d.__percent * 0.7}%`,
                      maxWidth: '100%',
                      height: 28,
                      background: `linear-gradient(90deg, ${colors[i % colors.length]} 0%, ${colors[(i + 1) % colors.length]}88 100%)`,
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 500,
                      transition: 'width .5s ease',
                      minWidth: 60,
                    }}
                  >
                    {d.__value.toLocaleString()}
                  </div>
                </div>
                <div style={{ width: 80, fontSize: 12, color: '#898B8F', paddingLeft: 16, flexShrink: 0 }}>
                  {i > 0 ? `${convRate}%` : '入口'}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    if (ct === 'waterfall') {
      const valKey = series[0]?.key || Object.keys(chartData[0] || {}).find(k => typeof chartData[0]?.[k] === 'number') || '';
      let runningTotal = 0;
      const wfData = chartData.map((d, i) => {
        const v = Number(d[valKey]) || 0;
        const t = String(d['type'] ?? '');
        let start = 0;
        let end = v;
        let barType: 'total' | 'positive' | 'negative' = v >= 0 ? 'positive' : 'negative';
        if (t === 'total' || i === 0 || i === chartData.length - 1) {
          start = 0;
          end = i === 0 ? v : runningTotal;
          barType = 'total';
        } else {
          if (v >= 0) { start = runningTotal; end = v; barType = 'positive'; }
          else { start = runningTotal + v; end = -v; barType = 'negative'; }
          runningTotal += v;
        }
        return {
          ...d,
          __name: String(d[xKey]),
          __start: start,
          __end: end,
          __total: barType === 'total' ? (i === 0 ? v : runningTotal) : null,
          __barType: barType,
        };
      });
      const allVals = wfData.flatMap(d => [d.__start + d.__end, d.__start, d.__total ?? 0]);
      const maxVal = Math.max(...allVals);
      const minVal = Math.min(...allVals, 0);
      return (
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={wfData} margin={{ top: 16, right: 24, bottom: 8, left: 8 }}>
            <CartesianGrid {...sharedGrid} />
            <XAxis dataKey="__name" tick={sharedAxis} />
            <YAxis tick={sharedAxis} domain={[Math.floor(minVal * 0.9 / 10) * 10, Math.ceil(maxVal * 1.1 / 10) * 10]} width={56} />
            <Tooltip
              contentStyle={{
                background: currentStyle.tooltip.bg,
                border: `1px solid ${currentStyle.tooltip.border}`,
                borderRadius: 4, fontSize: 12, color: currentStyle.tooltip.text,
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
              }}
              formatter={(value: number, name: string) => {
                if (name === '__start') return [null, null];
                if (name === '__end') return [Math.abs(value).toLocaleString(), '变动'];
                if (name === '__total') return [value != null ? value.toLocaleString() : '-', '总计'];
                return [value, name];
              }}
            />
            <Bar dataKey="__start" stackId="wf" fill="transparent" />
            <Bar dataKey="__end" stackId="wf" radius={[4, 4, 0, 0]} barSize={36}>
              {wfData.map((d, i) => {
                let color = '#4E7BF7';
                if (d.__barType === 'total') color = '#565960';
                else if (d.__barType === 'positive') color = '#00B42A';
                else if (d.__barType === 'negative') color = '#F53F3F';
                return <Cell key={i} fill={color} />;
              })}
            </Bar>
            {wfData.filter(d => d.__total !== null).length > 0 && (
              <Bar dataKey="__total" barSize={4} fill="#B758ED" />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      );
    }

    return null;
  };

  return (
    <div className="flex-1 h-[calc(100vh-64px)] overflow-y-auto">
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 48px 64px 48px', display: 'flex', flexDirection: 'column', rowGap: 24 }}>

        {/* 图表类型 Tabs */}
        <div className="bg-white" style={{ border: '1px solid #ECEDF1', borderRadius: 4, padding: '6px 8px', display: 'flex', gap: 2 }}>
          {CHART_TYPES.map(t => {
            const isActive = chartType === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setChartType(t.id)}
                className="flex items-center gap-1.5 outline-none"
                style={{
                  padding: '8px 16px',
                  height: 36,
                  borderRadius: 4,
                  fontSize: 13,
                  fontWeight: isActive ? 500 : 400,
                  background: isActive ? '#F0EBFA' : 'transparent',
                  color: isActive ? '#B758ED' : '#565960',
                  transition: 'background .15s, color .15s',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#F5F6F8'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 14 }}>{t.icon}</span>
                <span>{t.label}</span>
                {t.id === 'auto' && (
                  <Sparkles size={12} style={{ color: isActive ? '#B758ED' : '#B0B5BD' }} />
                )}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-[1fr_320px]" style={{ columnGap: 24 }}>
          {/* 左侧主区 */}
          <div style={{ display: 'flex', flexDirection: 'column', rowGap: 24 }}>
            {/* 数据源输入卡 */}
            <div className="bg-white" style={{ border: '1px solid #ECEDF1', borderRadius: 4 }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #F1F2F3', display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={15} style={{ color: '#B758ED' }} />
                <h3 className="text-[14px] font-semibold" style={{ color: '#252931' }}>数据源</h3>
              </div>
              <div style={{ padding: 24, display: 'flex', flexDirection: 'column', rowGap: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 16 }}>
                  <div>
                    <label className="text-[12px] font-medium block mb-2" style={{ color: '#898B8F', letterSpacing: '0.02em' }}>数据源文件名</label>
                    <input
                      value={fileName}
                      onChange={e => setFileName(e.target.value)}
                      placeholder="例如：sales_monthly.csv"
                      className="w-full outline-none"
                      style={{
                        height: 36,
                        padding: '0 12px',
                        border: '1px solid #E3E5E8',
                        borderRadius: 4,
                        fontSize: 14,
                        color: '#252931',
                        background: '#FFFFFF',
                        transition: 'border-color .15s, box-shadow .15s',
                      }}
                      onFocus={e => {
                        e.currentTarget.style.borderColor = '#B758ED';
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(183,88,237,0.10)';
                      }}
                      onBlur={e => {
                        e.currentTarget.style.borderColor = '#E3E5E8';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-medium block mb-2" style={{ color: '#898B8F', letterSpacing: '0.02em' }}>上传 CSV 文件</label>
                    <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center justify-center gap-1.5 w-full outline-none"
                      style={{
                        height: 36,
                        border: '1px dashed #D9BAF7',
                        borderRadius: 4,
                        background: '#FBF9FE',
                        color: '#B758ED',
                        fontSize: 13,
                        fontWeight: 500,
                        transition: 'background .15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#F5F0FF'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#FBF9FE'; }}
                    >
                      <Upload size={14} />
                      <span>选择文件</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[12px] font-medium block mb-2" style={{ color: '#898B8F', letterSpacing: '0.02em' }}>背景描述</label>
                  <input
                    value={background}
                    onChange={e => setBackground(e.target.value)}
                    placeholder="描述数据来源、时间范围、业务背景..."
                    className="w-full outline-none"
                    style={{
                      height: 36,
                      padding: '0 12px',
                      border: '1px solid #E3E5E8',
                      borderRadius: 4,
                      fontSize: 14,
                      color: '#252931',
                      background: '#FFFFFF',
                      transition: 'border-color .15s, box-shadow .15s',
                    }}
                    onFocus={e => {
                      e.currentTarget.style.borderColor = '#B758ED';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(183,88,237,0.10)';
                    }}
                    onBlur={e => {
                      e.currentTarget.style.borderColor = '#E3E5E8';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>

                <div>
                  <label className="text-[12px] font-medium block mb-2" style={{ color: '#898B8F', letterSpacing: '0.02em' }}>展示诉求</label>
                  <input
                    value={goal}
                    onChange={e => setGoal(e.target.value)}
                    placeholder="希望突出什么结论？例如：对比差异、趋势变化、占比构成..."
                    className="w-full outline-none"
                    style={{
                      height: 36,
                      padding: '0 12px',
                      border: '1px solid #E3E5E8',
                      borderRadius: 4,
                      fontSize: 14,
                      color: '#252931',
                      background: '#FFFFFF',
                      transition: 'border-color .15s, box-shadow .15s',
                    }}
                    onFocus={e => {
                      e.currentTarget.style.borderColor = '#B758ED';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(183,88,237,0.10)';
                    }}
                    onBlur={e => {
                      e.currentTarget.style.borderColor = '#E3E5E8';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>

                <div>
                  <label className="text-[12px] font-medium block mb-2" style={{ color: '#898B8F', letterSpacing: '0.02em' }}>
                    数据（CSV 格式，首行为列名）
                  </label>
                  <textarea
                    value={csvData}
                    onChange={e => setCsvData(e.target.value)}
                    placeholder={'month,销售额\n2026-01,1890000\n2026-02,1560000\n...'}
                    className="w-full outline-none font-mono"
                    style={{
                      minHeight: 160,
                      padding: 12,
                      border: '1px solid #E3E5E8',
                      borderRadius: 4,
                      fontSize: 12,
                      color: '#252931',
                      background: '#FAFBFC',
                      lineHeight: 1.7,
                      fontFamily: 'var(--font-mono)',
                      resize: 'vertical',
                      transition: 'border-color .15s, box-shadow .15s',
                    }}
                    onFocus={e => {
                      e.currentTarget.style.borderColor = '#B758ED';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(183,88,237,0.10)';
                    }}
                    onBlur={e => {
                      e.currentTarget.style.borderColor = '#E3E5E8';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>

                {/* 智能推荐提示 */}
                {chartType === 'auto' && csvData.trim() && (
                  <div style={{ background: '#FBF9FE', border: '1px solid #EDE3FB', borderRadius: 4, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <Sparkles size={14} style={{ color: '#B758ED', flexShrink: 0, marginTop: 2 }} />
                    <div style={{ fontSize: 13, color: '#4A3A6B', lineHeight: 1.7 }}>
                      <span style={{ fontWeight: 500 }}>智能推荐：</span>
                      {CHART_TYPES.find(t => t.id === effectiveType)?.label}。{recommendReason}
                    </div>
                  </div>
                )}

                <button
                  onClick={handleGenerate}
                  disabled={!canGenerate || isGenerating}
                  className="flex items-center justify-center gap-2 outline-none"
                  style={{
                    height: 40,
                    borderRadius: 6,
                    background: canGenerate && !isGenerating ? '#B758ED' : '#F2F3F5',
                    color: canGenerate && !isGenerating ? '#FFFFFF' : '#C9CDD4',
                    fontSize: 14,
                    fontWeight: 500,
                    border: 'none',
                    cursor: canGenerate && !isGenerating ? 'pointer' : 'not-allowed',
                    transition: 'background .15s, box-shadow .15s',
                    boxShadow: canGenerate && !isGenerating ? '0 2px 8px rgba(183,88,237,0.20)' : 'none',
                  }}
                  onMouseEnter={e => {
                    if (canGenerate && !isGenerating) e.currentTarget.style.background = '#A246D9';
                  }}
                  onMouseLeave={e => {
                    if (canGenerate && !isGenerating) e.currentTarget.style.background = '#B758ED';
                  }}
                >
                  {isGenerating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      <span>生成中...</span>
                    </>
                  ) : (
                    <>
                      <BarChart3 size={16} />
                      <span>生成图表</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* 结果区 */}
            {result && (
              <div className="bg-white" style={{ border: '1px solid #ECEDF1', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ padding: '16px 24px', borderBottom: '1px solid #F1F2F3', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 className="text-[14px] font-semibold" style={{ color: '#252931' }}>图表结果</h3>
                  <div className="flex gap-2">
                    <span className="text-[12px]" style={{ background: '#F5F0FF', color: '#B758ED', padding: '3px 10px', borderRadius: 4, fontWeight: 500 }}>
                      {CHART_TYPES.find(t => t.id === result.chartType)?.label}
                    </span>
                    <span className="text-[12px]" style={{ background: '#F5F6F8', color: '#565960', padding: '3px 10px', borderRadius: 4, fontWeight: 500 }}>
                      {CHART_STYLES.find(s => s.id === result.style)?.label}
                    </span>
                  </div>
                </div>
                <div style={{ padding: '16px 8px', background: currentStyle.id === 'high-contrast' ? '#1F2329' : '#FFFFFF' }}>
                  {renderChart()}
                </div>
                <div style={{ padding: '20px 24px', borderTop: '1px solid #F1F2F3', display: 'flex', flexDirection: 'column', rowGap: 16 }}>
                  <div>
                    <div className="text-[12px] font-medium mb-2" style={{ color: '#898B8F' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <FileText size={12} /> 摘要
                      </span>
                    </div>
                    <p className="text-[14px]" style={{ color: '#252931', lineHeight: 1.8 }}>{result.summary}</p>
                  </div>
                  {result.insights.length > 0 && (
                    <div>
                      <div className="text-[12px] font-medium mb-2" style={{ color: '#898B8F' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Lightbulb size={12} /> 数据洞察
                        </span>
                      </div>
                      <ul style={{ rowGap: 8, display: 'flex', flexDirection: 'column' }}>
                        {result.insights.map((ins, i) => (
                          <li key={i} className="flex gap-2 text-[13px]" style={{ color: '#565960', lineHeight: 1.7 }}>
                            <span style={{ color: '#B758ED', flexShrink: 0, fontSize: 14 }}>•</span>
                            <span>{ins}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 空状态提示 */}
            {!result && !isGenerating && (
              <div style={{
                padding: '48px 24px',
                border: '1px dashed #E3E5E8',
                borderRadius: 4,
                textAlign: 'center',
                background: '#FBFCFD',
              }}>
                <BarChart3 size={40} style={{ color: '#D9BAF7', margin: '0 auto 16px' }} />
                <p className="text-[14px]" style={{ color: '#898B8F', marginBottom: 4 }}>输入数据源与 CSV 数据后点击「生成图表」</p>
                <p className="text-[12px]" style={{ color: '#B0B5BD' }}>或点击右侧示例快速体验</p>
              </div>
            )}
          </div>

          {/* 右侧面板 */}
          <div style={{ display: 'flex', flexDirection: 'column', rowGap: 20 }}>
            {/* 图表风格 */}
            <div className="bg-white" style={{ border: '1px solid #ECEDF1', borderRadius: 4 }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F2F3' }}>
                <h3 className="text-[13px] font-semibold" style={{ color: '#252931' }}>图表风格</h3>
              </div>
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', rowGap: 4 }}>
                {CHART_STYLES.map(s => {
                  const isActive = styleId === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setStyleId(s.id)}
                      className="flex items-center gap-3 w-full outline-none"
                      style={{
                        padding: '10px 12px',
                        borderRadius: 4,
                        background: isActive ? '#F0EBFA' : 'transparent',
                        border: isActive ? '1px solid #D9BAF7' : '1px solid transparent',
                        transition: 'background .15s',
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#FAFBFC'; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
                        {s.colors.slice(0, 4).map((c, i) => (
                          <span key={i} style={{ width: 12, height: 12, borderRadius: 2, background: c, display: 'inline-block' }} />
                        ))}
                      </div>
                      <span className="text-[13px]" style={{ color: isActive ? '#B758ED' : '#252931', fontWeight: isActive ? 500 : 400 }}>{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 示例 */}
            <div className="bg-white" style={{ border: '1px solid #ECEDF1', borderRadius: 4 }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F2F3', display: 'flex', alignItems: 'center', gap: 6 }}>
                <TrendingUp size={13} style={{ color: '#B758ED' }} />
                <h3 className="text-[13px] font-semibold" style={{ color: '#252931' }}>示例场景</h3>
              </div>
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', rowGap: 4 }}>
                {CHART_EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => handleExampleClick(ex)}
                    className="text-left outline-none"
                    style={{
                      padding: '10px 12px',
                      borderRadius: 4,
                      transition: 'background .15s',
                      width: '100%',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#FAFBFC'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[13px] font-medium" style={{ color: '#252931' }}>{ex.title}</span>
                      <span className="text-[11px] shrink-0" style={{ background: '#F5F6F8', color: '#898B8F', padding: '2px 6px', borderRadius: 4 }}>{ex.tag}</span>
                    </div>
                    <p className="text-[12px]" style={{ color: '#898B8F', lineHeight: 1.5 }}>{ex.background}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
