export type ChartKind = 'auto' | 'bar' | 'line' | 'pie' | 'scatter' | 'waterfall' | 'funnel';

export interface ChartStyle {
  id: string;
  label: string;
  colors: string[];
  grid: string;
  axis: string;
  tooltip: { bg: string; border: string; text: string };
}

export interface ChartExample {
  title: string;
  fileName: string;
  background: string;
  goal: string;
  data: string;
  chartType: Exclude<ChartKind, 'auto'>;
  style: string;
  tag: string;
}

export interface ChartResult {
  chartType: Exclude<ChartKind, 'auto'>;
  style: string;
  reason?: string;
  chartData: Array<Record<string, string | number>>;
  xKey: string;
  series: { key: string; name: string; color?: string }[];
  summary: string;
  insights: string[];
}

export const CHART_TYPES: { id: ChartKind; label: string; icon: string }[] = [
  { id: 'auto', label: '智能推荐', icon: '✨' },
  { id: 'bar', label: '柱状图', icon: '▮' },
  { id: 'line', label: '折线图', icon: '📈' },
  { id: 'pie', label: '饼图', icon: '◐' },
  { id: 'scatter', label: '散点图', icon: '⋮' },
  { id: 'waterfall', label: '瀑布图', icon: '▚' },
  { id: 'funnel', label: '漏斗图', icon: '▽' },
];

export const CHART_STYLES: ChartStyle[] = [
  {
    id: 'business',
    label: '默认商务',
    colors: ['#4E7BF7', '#14B8A6', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'],
    grid: '#F1F2F3',
    axis: '#898B8F',
    tooltip: { bg: '#FFFFFF', border: '#F1F2F3', text: '#252931' },
  },
  {
    id: 'muted',
    label: '低饱和',
    colors: ['#7B8AAB', '#9BB5B0', '#C9B79C', '#C29898', '#A89AB5', '#8FB5C4'],
    grid: '#F1F2F3',
    axis: '#898B8F',
    tooltip: { bg: '#FFFFFF', border: '#F1F2F3', text: '#252931' },
  },
  {
    id: 'candy',
    label: '糖果色',
    colors: ['#FF6B9D', '#FFA94D', '#FFE066', '#51CF66', '#339AF0', '#CC5DE8'],
    grid: '#F5F1F4',
    axis: '#A8899E',
    tooltip: { bg: '#FFFFFF', border: '#F1E4EC', text: '#5C3D4F' },
  },
  {
    id: 'macaron',
    label: '马卡龙',
    colors: ['#B5D8EB', '#D4E4BD', '#F5D0C5', '#E8C9E0', '#F7E4A8', '#C0D8C0'],
    grid: '#F3F5F1',
    axis: '#8A9684',
    tooltip: { bg: '#FFFFFF', border: '#E8EDE3', text: '#4A5244' },
  },
  {
    id: 'high-contrast',
    label: '高对比',
    colors: ['#1A56DB', '#059669', '#D97706', '#DC2626', '#7C3AED', '#0891B2'],
    grid: '#E3E5E8',
    axis: '#565960',
    tooltip: { bg: '#1F2329', border: '#1F2329', text: '#FFFFFF' },
  },
];

export const CHART_EXAMPLES: ChartExample[] = [
  {
    title: '近12个月销售额趋势',
    fileName: 'sales_monthly.csv',
    background: '公司2025年7月至2026年6月的月度销售额数据',
    goal: '展示销售额随时间的变化趋势，识别季节性规律',
    data: 'month,销售额\n2025-07,1280000\n2025-08,1350000\n2025-09,1190000\n2025-10,1420000\n2025-11,1680000\n2025-12,2150000\n2026-01,1890000\n2026-02,1560000\n2026-03,1720000\n2026-04,1630000\n2026-05,1780000\n2026-06,1850000',
    chartType: 'line',
    style: 'business',
    tag: '趋势分析',
  },
  {
    title: '7大区域销售额占比',
    fileName: 'region_share.csv',
    background: '2026年6月各大区域的销售额数据',
    goal: '直观展示各区域对总销售额的贡献占比',
    data: 'region,销售额\n华东,685000\n华南,520000\n华北,480000\n华中,325000\n西南,240000\n东北,185000\n西北,125000',
    chartType: 'pie',
    style: 'business',
    tag: '占比构成',
  },
  {
    title: '各渠道转化漏斗',
    fileName: 'funnel_conversion.csv',
    background: '2026年Q2用户从浏览到下单的各阶段转化数据',
    goal: '展示用户在各环节的留存与流失情况，定位转化瓶颈',
    data: 'stage,users\n商品浏览,128000\n加购,52000\n结算页,32000\n支付成功,21500\n复购,8600',
    chartType: 'funnel',
    style: 'business',
    tag: '转化分析',
  },
  {
    title: '各品类季度销售额对比',
    fileName: 'category_quarter.csv',
    background: '2026年上半年食品、日用品、数码、服装四个品类的季度销售数据',
    goal: '对比不同品类在各季度的表现差异',
    data: 'category,Q1,Q2\n食品,420000,468000\n日用品,356000,392000\n数码,580000,512000\n服装,290000,345000',
    chartType: 'bar',
    style: 'candy',
    tag: '对比排名',
  },
  {
    title: '客单价与复购率关系',
    fileName: 'scatter_relation.csv',
    background: '20个城市的平均客单价与复购率数据',
    goal: '探索客单价与复购率之间的相关性',
    data: 'city,客单价,复购率\n北京,128,0.42\n上海,145,0.38\n广州,112,0.45\n深圳,138,0.40\n杭州,120,0.48\n成都,98,0.52\n武汉,105,0.46\n南京,115,0.44\n重庆,92,0.55\n西安,102,0.50\n苏州,132,0.39\n郑州,96,0.51\n长沙,108,0.47\n青岛,110,0.45\n天津,118,0.43\n沈阳,94,0.49\n合肥,106,0.48\n厦门,125,0.41\n东莞,88,0.54\n福州,104,0.46',
    chartType: 'scatter',
    style: 'muted',
    tag: '相关性',
  },
  {
    title: '月度利润增减拆解（瀑布）',
    fileName: 'waterfall_profit.csv',
    background: '某产品线各因素对月度利润变化的贡献',
    goal: '拆解各因素对利润的增减贡献，识别正向/负向驱动',
    data: 'item,value,type\n上月利润,180,total\n销量增长,45,positive\n涨价贡献,28,positive\n成本上涨,-22,negative\n营销费用,-18,negative\n本月利润,0,total',
    chartType: 'waterfall',
    style: 'business',
    tag: '增减拆解',
  },
];

const KEYWORD_RULES: { keywords: string[]; type: Exclude<ChartKind, 'auto'>; reason: string }[] = [
  { keywords: ['趋势', '变化', '每月', '月度', '季度', '走势', '增长', '环比', '同比', '随时间'], type: 'line', reason: '涉及时间序列变化趋势，折线图最适合展示连续数据的走向与波动' },
  { keywords: ['占比', '份额', '构成', '比例', '分布', '占', '结构'], type: 'pie', reason: '需要展示部分与整体的关系，饼图最直观呈现占比构成' },
  { keywords: ['转化', '漏斗', '留存', '流失', '环节', '阶段'], type: 'funnel', reason: '描述用户/流程的转化阶段，漏斗图清晰展示各环节留存与流失' },
  { keywords: ['关系', '相关', '关联', '散点', '相关性'], type: 'scatter', reason: '探索两个指标之间的相关关系，散点图能直观显示分布与趋势' },
  { keywords: ['增减', '贡献', '拆解', '瀑布', '驱动因素', '归因'], type: 'waterfall', reason: '需要拆解各因素对总量的增减贡献，瀑布图能清晰展示正/负向驱动' },
  { keywords: ['对比', '排名', '比较', '柱状', '各', 'TOP'], type: 'bar', reason: '涉及多类别数值对比或排名，柱状图最适合横向/纵向比较' },
];

export interface RecommendResult {
  type: Exclude<ChartKind, 'auto'>;
  reason: string;
}

export function recommendChartType(text: string): RecommendResult {
  const lower = text.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      if (text.includes(kw) || lower.includes(kw.toLowerCase())) {
        return { type: rule.type, reason: rule.reason };
      }
    }
  }
  return { type: 'bar', reason: '未识别到特定语义，默认使用柱状图进行数值对比展示' };
}

export function parseCSV(csv: string): { columns: string[]; rows: Array<Record<string, string | number>> } {
  const lines = csv.trim().split('\n').filter(l => l.trim());
  if (lines.length === 0) return { columns: [], rows: [] };
  const columns = lines[0].split(',').map(c => c.trim());
  const rows = lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim());
    const obj: Record<string, string | number> = {};
    columns.forEach((col, i) => {
      const v = vals[i];
      const num = Number(v);
      obj[col] = v !== '' && !isNaN(num) && /^-?\d+(\.\d+)?$/.test(v) ? num : v;
    });
    return obj;
  });
  return { columns, rows };
}

export function buildResult(
  fileName: string,
  background: string,
  goal: string,
  csvData: string,
  chartType: Exclude<ChartKind, 'auto'>,
  styleId: string,
  reason?: string,
): ChartResult | null {
  const { columns, rows } = parseCSV(csvData);
  if (columns.length < 2 || rows.length === 0) return null;

  const style = CHART_STYLES.find(s => s.id === styleId) || CHART_STYLES[0];
  const isNumeric = (v: unknown): v is number => typeof v === 'number';

  let xKey = columns[0];
  let valueKeys = columns.slice(1).filter(c => rows.every(r => isNumeric(r[c])));
  if (valueKeys.length === 0) {
    valueKeys = columns.slice(1);
  }

  const series = valueKeys.map((key, i) => ({
    key,
    name: key,
    color: style.colors[i % style.colors.length],
  }));

  let summary = '';
  const insights: string[] = [];

  if (chartType === 'line' || chartType === 'bar') {
    if (valueKeys.length === 1) {
      const vals = rows.map(r => Number(r[valueKeys[0]])).filter(v => !isNaN(v));
      const max = Math.max(...vals);
      const min = Math.min(...vals);
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const maxIdx = vals.indexOf(max);
      const minIdx = vals.indexOf(min);
      summary = `基于 ${fileName} 的数据，${valueKeys[0]}平均值为 ${formatNum(avg)}，最高值 ${formatNum(max)} 出现在 ${rows[maxIdx][xKey]}，最低值 ${formatNum(min)} 出现在 ${rows[minIdx][xKey]}。`;
      if (chartType === 'line' && vals.length >= 2) {
        const first = vals[0];
        const last = vals[vals.length - 1];
        const change = ((last - first) / first * 100).toFixed(1);
        insights.push(`整体${Number(change) >= 0 ? '上升' : '下降'} ${Math.abs(Number(change))}%`);
      }
      insights.push(`波动范围 ${formatNum(max - min)}（${((max - min) / avg * 100).toFixed(1)}%）`);
      if (background) insights.push(`背景：${background}`);
    } else {
      summary = `基于 ${fileName}，展示了 ${columns.slice(1).join('、')} 在不同${xKey}下的${chartType === 'line' ? '变化趋势' : '对比情况'}。`;
      insights.push(`共 ${rows.length} 个${xKey}分类`);
      if (goal) insights.push(`展示诉求：${goal}`);
    }
  } else if (chartType === 'pie') {
    const vals = rows.map(r => Number(r[valueKeys[0]])).filter(v => !isNaN(v));
    const total = vals.reduce((a, b) => a + b, 0);
    const maxIdx = vals.indexOf(Math.max(...vals));
    summary = `基于 ${fileName} 的数据，${rows[maxIdx][xKey]} 占比最高（${((vals[maxIdx] / total) * 100).toFixed(1)}%），总计 ${formatNum(total)}。`;
    insights.push(`共 ${rows.length} 个分类`);
    const sorted = [...vals].sort((a, b) => b - a);
    if (sorted.length >= 2) {
      insights.push(`TOP1 vs TOP2 差 ${((sorted[0] - sorted[1]) / total * 100).toFixed(1)} 个百分点`);
    }
    if (goal) insights.push(`展示诉求：${goal}`);
  } else if (chartType === 'scatter') {
    const xs = rows.map(r => Number(r[columns[1]])).filter(v => !isNaN(v));
    const ys = rows.map(r => Number(r[columns[2]])).filter(v => !isNaN(v));
    const n = Math.min(xs.length, ys.length);
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, denX = 0, denY = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      denX += (xs[i] - mx) ** 2;
      denY += (ys[i] - my) ** 2;
    }
    const r = num / (Math.sqrt(denX) * Math.sqrt(denY) || 1);
    summary = `基于 ${fileName} 共 ${n} 个样本点，${columns[1]} 与 ${columns[2]} 的 Pearson 相关系数为 ${r.toFixed(2)}。`;
    insights.push(Math.abs(r) >= 0.7 ? '强相关' : Math.abs(r) >= 0.4 ? '中等相关' : '弱相关');
    insights.push(`${columns[1]} 均值 ${formatNum(mx)}，${columns[2]} 均值 ${(my * (columns[2].includes('率') || columns[2].includes('比') ? 100 : 1)).toFixed(columns[2].includes('率') || columns[2].includes('比') ? 0 : 1)}${columns[2].includes('率') || columns[2].includes('比') ? '%' : ''}`);
    if (goal) insights.push(`展示诉求：${goal}`);
  } else if (chartType === 'funnel') {
    const vals = rows.map(r => Number(r[valueKeys[0]])).filter(v => !isNaN(v));
    const first = vals[0];
    const last = vals[vals.length - 1];
    const overall = ((last / first) * 100).toFixed(1);
    summary = `基于 ${fileName}，整体转化率为 ${overall}%（从 ${formatNum(first)} 到 ${formatNum(last)}）。`;
    for (let i = 0; i < vals.length - 1; i++) {
      const rate = (vals[i + 1] / vals[i] * 100).toFixed(1);
      insights.push(`${rows[i][xKey]} → ${rows[i + 1][xKey]}：转化 ${rate}%`);
    }
  } else if (chartType === 'waterfall') {
    summary = `基于 ${fileName}，拆解了各因素对最终结果的增减贡献。`;
    let pos = 0, neg = 0;
    rows.forEach(r => {
      const v = Number(r[valueKeys[0]]);
      const t = String(r['type'] ?? '');
      if (t === 'total') return;
      if (t === 'positive' || v > 0) pos++;
      else if (t === 'negative' || v < 0) neg++;
    });
    insights.push(`正向驱动 ${pos} 项，负向驱动 ${neg} 项`);
    if (goal) insights.push(`展示诉求：${goal}`);
  }

  if (reason) {
    insights.unshift(`🤖 推荐理由：${reason}`);
  }

  return {
    chartType,
    style: styleId,
    reason,
    chartData: rows,
    xKey,
    series,
    summary,
    insights,
  };
}

function formatNum(n: number): string {
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(1) + '万';
  if (Math.abs(n) >= 1000) return n.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
  return n.toFixed(n % 1 === 0 ? 0 : 1);
}
