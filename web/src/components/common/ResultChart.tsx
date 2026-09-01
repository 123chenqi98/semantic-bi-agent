import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';

// ==================== 结果图表（KPI 指标卡 / 柱状 / 折线，第三轮起为聊天工作台与企业 BI 共用） ====================
export default function ResultChart({ type, data, columns, xField }: {
  type: string; data: Record<string, any>[]; columns: string[]; xField?: string;
}) {
  if (!data.length) return null;

  // KPI 单值卡
  if (type === 'kpi') {
    const val = data[0][columns[0]];
    return (
      <div style={{ background: 'linear-gradient(135deg, #FBF7FF, #F5F0FF)', border: '1px solid #E6D3FA', borderRadius: 4, padding: '28px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: '#898B8F', marginBottom: 8, fontFamily: 'var(--font-mono)' }}>{columns[0]}</div>
        <div style={{ fontSize: 34, fontWeight: 700, color: '#B758ED', fontFamily: 'var(--font-mono)', lineHeight: 1.1 }}>
          {typeof val === 'number' ? val.toLocaleString() : String(val)}
        </div>
      </div>
    );
  }

  const xKey = xField || columns[0];
  // 数值列（除 X 轴外）作为度量
  const metricCols = columns.filter(c => c !== xKey).filter(c =>
    data.every(row => typeof row[c] === 'number' || row[c] === null));

  if ((type === 'bar' || type === 'line') && metricCols.length) {
    const COLORS = ['#B758ED', '#1E6FFF', '#00B42A', '#FF7D00'];
    return (
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          {type === 'bar' ? (
            <BarChart data={data} margin={{ top: 10, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F1F3" />
              <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: '#898B8F' }} />
              <YAxis tick={{ fontSize: 11, fill: '#898B8F' }} />
              <Tooltip />
              {metricCols.map((c, i) => (
                <Bar key={c} dataKey={c} fill={COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} />
              ))}
            </BarChart>
          ) : (
            <LineChart data={data} margin={{ top: 10, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F1F3" />
              <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: '#898B8F' }} />
              <YAxis tick={{ fontSize: 11, fill: '#898B8F' }} />
              <Tooltip />
              {metricCols.map((c, i) => (
                <Line key={c} type="monotone" dataKey={c} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    );
  }

  // 兜底：不额外渲染（调用方有明细表格）
  return null;
}
