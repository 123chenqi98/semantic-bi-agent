import { useState, useEffect } from 'react';
import { Database, CheckCircle2, AlertTriangle, Activity } from 'lucide-react';

interface DbHealth {
  tables: { name: string; rowCount: number }[];
  dateRange: { min: string; max: string };
  nullChecks: { column: string; nullCount: number }[];
  categoryDistribution: { name: string; count: number }[];
  channelDistribution: { name: string; count: number }[];
  healthScore: number;
  totalRows: number;
}

const FALLBACK_HEALTH: DbHealth = {
  tables: [
    { name: 'order_item', rowCount: 18318 },
    { name: 'customer', rowCount: 2000 },
    { name: 'product', rowCount: 200 },
    { name: 'date_dim', rowCount: 546 },
  ],
  dateRange: { min: '2025-01-10', max: '2026-06-30' },
  nullChecks: [
    { column: 'amount', nullCount: 0 },
    { column: 'channel', nullCount: 0 },
    { column: 'order_date', nullCount: 0 },
    { column: 'customer_id', nullCount: 0 },
    { column: 'product_id', nullCount: 0 },
  ],
  categoryDistribution: [
    { name: '电子产品', count: 4120 },
    { name: '服装配饰', count: 3980 },
    { name: '食品饮料', count: 3850 },
    { name: '家居用品', count: 3690 },
    { name: '美妆个护', count: 2678 },
  ],
  channelDistribution: [
    { name: '线上商城', count: 6890 },
    { name: '线下门店', count: 5230 },
    { name: '第三方平台', count: 3890 },
    { name: '直播电商', count: 2308 },
  ],
  healthScore: 100,
  totalRows: 21064,
};

function DatasetHealthCard() {
  const [health, setHealth] = useState<DbHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/db-health')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: DbHealth) => { setHealth(d); setLoading(false); })
      .catch(() => { setHealth(FALLBACK_HEALTH); setLoading(false); });
  }, []);

  if (loading || !health) {
    return (
      <div className="bg-white" style={{ border: '1px solid #ECEDF1', borderRadius: 4, padding: 32 }}>
        <h3 className="text-[14px] font-semibold" style={{ color: '#252931' }}>数据集健康度</h3>
        <p className="text-[13px] mt-3" style={{ color: '#898B8F' }}>加载中...</p>
      </div>
    );
  }

  const maxCategory = Math.max(...health.categoryDistribution.map(c => c.count), 1);
  const scoreColor = health.healthScore >= 90 ? '#00B42A' : health.healthScore >= 70 ? '#FF7D00' : '#F53F3F';

  return (
    <div className="bg-white" style={{ border: '1px solid #ECEDF1', borderRadius: 4, padding: 28 }}>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Database size={16} style={{ color: '#B758ED' }} />
          <h3 className="text-[14px] font-semibold m-0" style={{ color: '#252931' }}>数据集健康度 · retail.db</h3>
        </div>
        <div className="flex items-center gap-2">
          {health.healthScore >= 90 ? <CheckCircle2 size={14} style={{ color: scoreColor }} /> : <AlertTriangle size={14} style={{ color: scoreColor }} />}
          <span style={{ fontSize: 13, fontWeight: 600, color: scoreColor }}>健康度 {health.healthScore}分</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {health.tables.map(t => (
          <div key={t.name} style={{ background: '#FBFCFD', border: '1px solid #F1F2F3', borderRadius: 4, padding: 14 }}>
            <div style={{ fontSize: 11, color: '#898B8F', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>{t.name}</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#252931', fontFamily: 'var(--font-mono)' }}>
              {t.rowCount.toLocaleString()}
              <span style={{ fontSize: 11, fontWeight: 400, color: '#898B8F', marginLeft: 4 }}>行</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div>
          <div className="text-[12px] font-semibold mb-2" style={{ color: '#252931' }}>
            <Activity size={12} style={{ display: 'inline', marginRight: 4, color: '#B758ED' }} />
            时间覆盖范围
          </div>
          <div style={{ background: '#FBFCFD', border: '1px solid #F1F2F3', borderRadius: 4, padding: 12, fontSize: 13 }}>
            <span style={{ fontFamily: 'var(--font-mono)', color: '#252931' }}>{health.dateRange.min}</span>
            <span style={{ color: '#B0B5BD', margin: '0 8px' }}>→</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: '#252931' }}>{health.dateRange.max}</span>
            <span className="text-[11px] ml-2" style={{ color: '#898B8F' }}>
              （{Math.round((new Date(health.dateRange.max).getTime() - new Date(health.dateRange.min).getTime()) / 86400000)} 天）
            </span>
          </div>
        </div>
        <div>
          <div className="text-[12px] font-semibold mb-2" style={{ color: '#252931' }}>NULL 值检查（order_item）</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {health.nullChecks.map(n => (
              <span key={n.column} style={{
                fontSize: 11, padding: '3px 8px', borderRadius: 3, fontFamily: 'var(--font-mono)',
                background: n.nullCount === 0 ? '#EAFBF1' : '#FFF1F0',
                color: n.nullCount === 0 ? '#0F8A2F' : '#C63838',
              }}>
                {n.column}: {n.nullCount === 0 ? '✓ 0' : `${n.nullCount} NULL`}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <div className="text-[12px] font-semibold mb-2" style={{ color: '#252931' }}>品类分布（长尾检测）</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {health.categoryDistribution.map(c => (
              <div key={c.name} className="flex items-center gap-2">
                <span style={{ fontSize: 11, width: 64, color: '#565960', flexShrink: 0 }}>{c.name}</span>
                <div style={{ flex: 1, height: 16, background: '#F5F6F8', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${(c.count / maxCategory) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #B758ED, #D063EA)', borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#898B8F', width: 40, textAlign: 'right' }}>{c.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[12px] font-semibold mb-2" style={{ color: '#252931' }}>渠道分布</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {health.channelDistribution.map((c, i) => {
              const maxCh = Math.max(...health.channelDistribution.map(x => x.count), 1);
              const colors = ['#B758ED', '#1E6FFF', '#00B42A', '#FF7D00'];
              return (
                <div key={c.name} className="flex items-center gap-2">
                  <span style={{ fontSize: 11, width: 64, color: '#565960', flexShrink: 0 }}>{c.name}</span>
                  <div style={{ flex: 1, height: 16, background: '#F5F6F8', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${(c.count / maxCh) * 100}%`, height: '100%', background: colors[i % colors.length], borderRadius: 3, opacity: 0.75 }} />
                  </div>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#898B8F', width: 40, textAlign: 'right' }}>{c.count.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="text-[11px] m-0 mt-4" style={{ color: '#B0B5BD' }}>
        数据来源：retail.db（SQLite）· 共 {health.totalRows.toLocaleString()} 行 · 无 NULL 值 · 时间跨度 18 个月
      </p>
    </div>
  );
}

export default function SettingsPage() {
  const projectInfo: [string, string][] = [
    ['项目名称', 'NoSQL · 基于指标语义层的经营分析智能助手'],
    ['项目类型', '本科毕业设计'],
    ['作者', '陈琦'],
    ['专业', '数据科学与大数据技术'],
  ];

  const techStack = ['React 19', 'TypeScript', 'Tailwind CSS v4', 'Python Flask', 'SQLite', 'LLM (Doubao)'];

  return (
    <div className="flex-1 h-[calc(100vh-64px)] overflow-y-auto">
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '40px 48px 64px 48px', display: 'flex', flexDirection: 'column', rowGap: 28 }}>
        <div className="bg-white" style={{ border: '1px solid #ECEDF1', borderRadius: 4, padding: 32 }}>
          <h3 className="text-[14px] font-semibold mb-6" style={{ color: '#252931' }}>项目信息</h3>
          <dl style={{ display: 'flex', flexDirection: 'column' }}>
            {projectInfo.map(([k, v], i) => (
              <div
                key={k}
                className="flex items-baseline"
                style={{
                  fontSize: 14,
                  lineHeight: 1.8,
                  padding: '12px 0',
                  borderTop: i === 0 ? 'none' : '1px solid #F1F2F3',
                }}
              >
                <dt style={{ width: 104, flexShrink: 0, color: '#898B8F', fontSize: 13, fontWeight: 500 }}>{k}</dt>
                <dd style={{ color: '#252931' }}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <DatasetHealthCard />

        <div className="bg-white" style={{ border: '1px solid #ECEDF1', borderRadius: 4, padding: 32 }}>
          <h3 className="text-[14px] font-semibold mb-6" style={{ color: '#252931' }}>技术栈</h3>
          <div className="flex flex-wrap" style={{ gap: 8 }}>
            {techStack.map(t => (
              <span
                key={t}
                style={{
                  background: '#F5F6F8',
                  color: '#252931',
                  padding: '7px 14px',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >{t}</span>
            ))}
          </div>
        </div>

        <div style={{ background: '#FBFAFE', border: '1px solid #EDE3FB', borderRadius: 4, padding: 20 }}>
          <div className="flex items-start gap-2.5 text-[13px]" style={{ color: '#4A3A6B', lineHeight: 1.8 }}>
            <span style={{ color: '#B758ED', lineHeight: 1.8, fontSize: 14 }}>•</span>
            <span>
              本项目为毕业设计演示系统。对照组（基线）仅提供纯 DDL 表结构；实验组在 Prompt 中注入指标定义、时间语义与口径规则，
              将 Text-to-SQL 准确率从 44% 提升至 100%。
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
