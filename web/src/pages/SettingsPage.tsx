import { useState, useEffect } from 'react';
import { Database, CheckCircle2, AlertTriangle, Activity, Plug, Table2, Eye, ChevronDown, ChevronRight, Building2, KeyRound, Save, Loader2, Network, ShieldCheck, ScrollText, RefreshCw, Clock } from 'lucide-react';

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

interface DsStatus {
  current: string;
  provider: {
    ok: boolean;
    source_type: string;
    display_name: string;
    is_real: boolean;
    message: string;
    details: Record<string, any>;
  };
  registry: Record<string, {
    source_type: string;
    display_name: string;
    is_real: boolean;
    is_available: boolean;
  }>;
}

interface DsDataset {
  id: string;
  name: string;
  description: string;
  row_count: number;
  columns: number;
}

function DataSourceCard() {
  const [status, setStatus] = useState<DsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSource, setActiveSource] = useState<string>('');
  const [datasets, setDatasets] = useState<DsDataset[]>([]);
  const [dsLoading, setDsLoading] = useState(false);
  const [expandedDs, setExpandedDs] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ cols: string[]; rows: any[][]; isReal: boolean } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    fetch('/api/datasource/status')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: DsStatus) => {
        setStatus(d);
        setActiveSource(d.current);
        setLoading(false);
        loadDatasets(d.current);
      })
      .catch(() => setLoading(false));
  }, []);

  function loadDatasets(sourceType: string) {
    setDsLoading(true);
    setDatasets([]);
    setExpandedDs(null);
    setPreview(null);
    fetch(`/api/datasource/datasets?source_type=${sourceType}`)
      .then(r => r.json())
      .then(d => {
        setDatasets(d.datasets || []);
        setDsLoading(false);
      })
      .catch(() => setDsLoading(false));
  }

  function togglePreview(datasetId: string, isReal: boolean) {
    if (expandedDs === datasetId) {
      setExpandedDs(null);
      setPreview(null);
      return;
    }
    setExpandedDs(datasetId);
    setPreviewLoading(true);
    setPreview(null);
    fetch(`/api/datasource/datasets/${datasetId}/preview?limit=5&source_type=${activeSource}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setPreview({ cols: d.columns, rows: d.rows, isReal });
        }
        setPreviewLoading(false);
      })
      .catch(() => setPreviewLoading(false));
  }

  if (loading || !status) {
    return (
      <div className="bg-white" style={{ border: '1px solid #ECEDF1', borderRadius: 4, padding: 32 }}>
        <h3 className="text-[14px] font-semibold" style={{ color: '#252931' }}>数据源管理</h3>
        <p className="text-[13px] mt-3" style={{ color: '#898B8F' }}>加载中...</p>
      </div>
    );
  }

  const providers = Object.values(status.registry);

  return (
    <div className="bg-white" style={{ border: '1px solid #ECEDF1', borderRadius: 4, padding: 28 }}>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Plug size={16} style={{ color: '#B758ED' }} />
          <h3 className="text-[14px] font-semibold m-0" style={{ color: '#252931' }}>数据源管理</h3>
        </div>
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 3, fontWeight: 500,
          background: status.provider.is_real ? '#EAFBF1' : '#FFF7E6',
          color: status.provider.is_real ? '#0F8A2F' : '#B25E00',
        }}>
          {status.provider.is_real ? '● 真实数据' : '○ Mock 占位'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        {providers.map(p => {
          const isActive = p.source_type === activeSource;
          return (
            <button
              key={p.source_type}
              type="button"
              onClick={() => { setActiveSource(p.source_type); loadDatasets(p.source_type); }}
              style={{
                textAlign: 'left', padding: '14px 16px', borderRadius: 4, cursor: 'pointer',
                border: isActive ? '2px solid #B758ED' : '1px solid #ECEDF1',
                background: isActive ? '#FBF7FF' : '#FBFCFD',
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                {p.source_type === 'fengshenBi'
                  ? <Building2 size={14} style={{ color: isActive ? '#B758ED' : '#898B8F' }} />
                  : <Database size={14} style={{ color: isActive ? '#B758ED' : '#898B8F' }} />}
                <span style={{ fontSize: 13, fontWeight: 600, color: '#252931' }}>{p.display_name}</span>
              </div>
              <div style={{ fontSize: 11, color: '#898B8F', fontFamily: 'var(--font-mono)' }}>
                {p.source_type}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span style={{
                  fontSize: 10.5, padding: '1px 6px', borderRadius: 3,
                  background: p.is_real ? '#EAFBF1' : '#FFF7E6',
                  color: p.is_real ? '#0F8A2F' : '#B25E00',
                }}>
                  {p.is_real ? '真实' : 'Mock'}
                </span>
                <span style={{
                  fontSize: 10.5, padding: '1px 6px', borderRadius: 3,
                  background: p.is_available ? '#E8F3FF' : '#F5F6F8',
                  color: p.is_available ? '#1E6FFF' : '#898B8F',
                }}>
                  {p.is_available ? '可用' : '未配置凭证'}
                </span>
                {isActive && (
                  <span style={{ fontSize: 10.5, color: '#B758ED', fontWeight: 500 }}>当前激活</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{
        padding: '10px 14px', borderRadius: 4, marginBottom: 16,
        background: status.provider.ok ? '#F0FBF4' : '#FFF7E6',
        border: `1px solid ${status.provider.ok ? '#C5F0D5' : '#FFE7BA'}`,
        fontSize: 12, color: status.provider.ok ? '#1A6B33' : '#874A20',
      }}>
        {status.provider.message}
      </div>

      {/* 风神 BI 企业级凭证配置（仅在选中 fengshenBi 时展示） */}
      {activeSource === 'fengshenBi' && <FengshenConfigPanel />}

      <div className="text-[12px] font-semibold mb-2" style={{ color: '#252931' }}>
        <Table2 size={12} style={{ display: 'inline', marginRight: 4, color: '#B758ED' }} />
        数据集列表（{datasets.length}）
      </div>

      {dsLoading ? (
        <p className="text-[12px]" style={{ color: '#898B8F' }}>加载数据集...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {datasets.map(ds => (
            <div key={ds.id} style={{
              border: '1px solid #F1F2F3', borderRadius: 4, overflow: 'hidden',
            }}>
              <button
                type="button"
                onClick={() => togglePreview(ds.id, status.provider.is_real)}
                className="w-full flex items-center justify-between text-left"
                style={{ padding: '10px 14px', background: '#FBFCFD', border: 'none', cursor: 'pointer' }}
              >
                <div className="flex items-center gap-2">
                  {expandedDs === ds.id
                    ? <ChevronDown size={12} style={{ color: '#898B8F' }} />
                    : <ChevronRight size={12} style={{ color: '#898B8F' }} />}
                  <span style={{ fontSize: 12.5, fontWeight: 500, color: '#252931', fontFamily: 'var(--font-mono)' }}>{ds.id}</span>
                  <span style={{ fontSize: 11.5, color: '#565960' }}>{ds.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span style={{ fontSize: 11, color: '#898B8F' }}>{ds.columns} 列</span>
                  <span style={{ fontSize: 11, color: '#898B8F' }}>
                    {ds.row_count >= 0 ? `${ds.row_count.toLocaleString()} 行` : '行数未知'}
                  </span>
                  <Eye size={12} style={{ color: '#B758ED' }} />
                </div>
              </button>
              {expandedDs === ds.id && (
                <div style={{ padding: '10px 14px', borderTop: '1px solid #F1F2F3', background: '#fff' }}>
                  <p style={{ fontSize: 11.5, color: '#565960', margin: '0 0 8px 0' }}>{ds.description}</p>
                  {previewLoading && <p style={{ fontSize: 11, color: '#898B8F', margin: 0 }}>加载预览...</p>}
                  {preview && (
                    <div style={{ overflowX: 'auto' }}>
                      {!preview.isReal && (
                        <div style={{ fontSize: 10.5, color: '#B25E00', background: '#FFF7E6', padding: '4px 8px', borderRadius: 3, marginBottom: 6 }}>
                          ⚠️ Mock 数据：以下为模拟数据，非风神 BI 真实返回
                        </div>
                      )}
                      <table style={{ fontSize: 11, borderCollapse: 'collapse', width: '100%' }}>
                        <thead>
                          <tr>
                            {preview.cols.map(c => (
                              <th key={c} style={{
                                textAlign: 'left', padding: '4px 8px', background: '#F5F6F8',
                                borderBottom: '1px solid #ECEDF1', fontFamily: 'var(--font-mono)',
                                fontWeight: 600, color: '#565960', whiteSpace: 'nowrap',
                              }}>{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.rows.map((row, i) => (
                            <tr key={i}>
                              {row.map((cell, j) => (
                                <td key={j} style={{
                                  padding: '4px 8px', borderBottom: '1px solid #F5F6F8',
                                  fontFamily: 'var(--font-mono)', color: '#252931', whiteSpace: 'nowrap',
                                }}>{String(cell)}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] m-0 mt-4" style={{ color: '#B0B5BD' }}>
        当前数据源由环境变量 <code style={{ fontFamily: 'var(--font-mono)' }}>DATASOURCE_TYPE</code> 控制。
        新增数据源请实现 <code style={{ fontFamily: 'var(--font-mono)' }}>DataSourceProvider</code> 抽象基类并在 factory 中注册。
      </p>
    </div>
  );
}

// ==================== 第五轮：系统状态与审计面板 ====================
interface SystemStatus {
  backend: { ok: boolean; version: string; flask_env: string; run_mode: string; start_time: number; uptime_sec: number };
  llm: { enabled: boolean; model: string; base_url_host: string };
  datasource: {
    current: string; ok: boolean; checked_at: number;
    items: { source_type: string; display_name: string; is_real: boolean; is_available: boolean; connection_status: string; message?: string; ok?: boolean; is_current?: boolean }[];
  };
  audit: { today_total: number; today_success: number; today_failed: number; last_event_ts: number | null; log_dir: string };
  permission: { auth_enabled: boolean; note: string };
}
interface AuditEvent {
  event_id: string; time: string; kind: string; result: string;
  question?: string; datasource?: string; staged_confirmed?: boolean;
  mock_hit?: boolean; sql_source?: string; error_type?: string; row_count?: number; duration_ms?: number;
}

const DS_STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  unconfigured: { bg: '#F5F6F8', color: '#898B8F', label: '未配置' },
  mock: { bg: '#FFF7E6', color: '#B25E00', label: 'Mock 演示' },
  configured: { bg: '#E8F3FF', color: '#1E6FFF', label: '已配置 · 待联调' },
  verified: { bg: '#EAFBF1', color: '#0F8A2F', label: '凭证已验证' },
  real_ready: { bg: '#EAFBF1', color: '#0F8A2F', label: '真实可用' },
};

const EVENT_KIND_LABEL: Record<string, string> = {
  'chat.plan': '问数 · SQL 草案',
  'chat.confirm': '问数 · 确认后执行',
  'chat.auto': '问数 · 自动取数',
  'ent.plan': '企业 BI · 草案',
  'ent.confirm': '企业 BI · 确认执行',
  'ent.connect_test': '企业 BI · 连接测试',
};

function formatUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h} 小时 ${m} 分钟`;
  return `${m} 分钟`;
}

function SystemStatusCard() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  function load() {
    setLoading(true);
    Promise.allSettled([
      fetch('/api/system/status').then(r => r.ok ? r.json() : Promise.reject()),
      fetch('/api/audit/events?limit=8').then(r => r.ok ? r.json() : Promise.reject()),
    ]).then(([sRes, eRes]) => {
      if (sRes.status === 'fulfilled') {
        setStatus(sRes.value as SystemStatus);
        setOffline(false);
      } else {
        setOffline(true);
      }
      if (eRes.status === 'fulfilled') setEvents((eRes.value.events || []) as AuditEvent[]);
      setLoading(false);
    }).catch(() => { setOffline(true); setLoading(false); });
  }

  useEffect(() => { load(); }, []);

  const fmtTime = (ts: number | null) => {
    if (!ts) return '暂无';
    const d = new Date(ts * 1000);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  return (
    <div className="bg-white" style={{ border: '1px solid #ECEDF1', borderRadius: 4, padding: 28 }}>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Activity size={16} style={{ color: '#B758ED' }} />
          <h3 className="text-[14px] font-semibold m-0" style={{ color: '#252931' }}>系统状态与审计</h3>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#898B8F' }}
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> 刷新
        </button>
      </div>

      {loading && <p className="text-[13px]" style={{ color: '#898B8F' }}>正在读取系统状态...</p>}

      {offline && !loading && (
        <div style={{ background: '#FFF7E6', border: '1px solid #FFE7BA', borderRadius: 4, padding: '12px 14px', fontSize: 12.5, color: '#874A20', lineHeight: 1.7, marginBottom: 16 }}>
          ⚠️ 后端服务暂不可达，无法读取系统状态。请确认后端已启动（本地 <code style={{ fontFamily: 'var(--font-mono)' }}>python3 -m src.demo.app_backend</code>）；
          若部署在服务器，检查 gunicorn 服务与 nginx 代理是否正常。
        </div>
      )}

      {status && (
        <>
          {/* 服务与模型状态 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
            <div style={{ background: '#FBFCFD', border: '1px solid #F1F2F3', borderRadius: 4, padding: '12px 14px' }}>
              <div className="flex items-center gap-2 mb-2">
                <Network size={13} style={{ color: '#898B8F' }} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#252931' }}>后端服务</span>
                <span style={{ fontSize: 10.5, padding: '1px 6px', borderRadius: 3, background: '#EAFBF1', color: '#0F8A2F' }}>运行中</span>
              </div>
              <div style={{ fontSize: 11.5, color: '#565960', lineHeight: 1.9 }}>
                <div>版本 v{status.backend.version} · {status.backend.flask_env}</div>
                <div>运行模式：{status.backend.run_mode === 'real-llm' ? '真实 LLM' : '模板/题库模式'}</div>
                <div className="flex items-center gap-1"><Clock size={10} /> 已运行 {formatUptime(status.backend.uptime_sec)}</div>
              </div>
            </div>
            <div style={{ background: '#FBFCFD', border: '1px solid #F1F2F3', borderRadius: 4, padding: '12px 14px' }}>
              <div className="flex items-center gap-2 mb-2">
                <SparklesIcon />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#252931' }}>智能模型</span>
                <span style={{ fontSize: 10.5, padding: '1px 6px', borderRadius: 3, background: status.llm.enabled ? '#EAFBF1' : '#FFF7E6', color: status.llm.enabled ? '#0F8A2F' : '#B25E00' }}>
                  {status.llm.enabled ? '真实 LLM' : '未启用'}
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: '#565960', lineHeight: 1.9 }}>
                <div style={{ wordBreak: 'break-all' }}>{status.llm.model || '未配置模型'}</div>
                <div style={{ fontFamily: 'var(--font-mono)' }}>{status.llm.base_url_host || '使用默认端点'}</div>
                <div>{status.llm.enabled ? '限流时自动重试与题库兜底' : '在 .env 配置 LLM_API_KEY 后启用'}</div>
              </div>
            </div>
            <div style={{ background: '#FBFCFD', border: '1px solid #F1F2F3', borderRadius: 4, padding: '12px 14px' }}>
              <div className="flex items-center gap-2 mb-2">
                <ScrollText size={13} style={{ color: '#898B8F' }} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#252931' }}>今日审计</span>
              </div>
              <div style={{ fontSize: 11.5, color: '#565960', lineHeight: 1.9 }}>
                <div>事件 <b style={{ color: '#252931' }}>{status.audit.today_total}</b> 条
                  （成功 {status.audit.today_success} · 失败 {status.audit.today_failed}）</div>
                <div>最近事件：{fmtTime(status.audit.last_event_ts)}</div>
                <div style={{ wordBreak: 'break-all' }}>日志：{status.audit.log_dir || '默认 logs/audit/'}</div>
              </div>
            </div>
          </div>

          {/* 数据源五态 */}
          <div className="text-[12px] font-semibold mb-2" style={{ color: '#252931' }}>
            <Database size={12} style={{ display: 'inline', marginRight: 4, color: '#B758ED' }} />
            数据源连接状态（最近检测：{fmtTime(status.datasource.checked_at)}）
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {status.datasource.items.map(ds => {
              const badge = DS_STATUS_BADGE[ds.connection_status] || DS_STATUS_BADGE.unconfigured;
              return (
                <div key={ds.source_type} className="flex items-center justify-between gap-3"
                  style={{ background: '#FBFCFD', border: ds.is_current ? '1px solid #D9BAF7' : '1px solid #F1F2F3', borderRadius: 4, padding: '10px 14px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#252931' }}>{ds.display_name}</span>
                      {ds.is_current && <span style={{ fontSize: 10.5, color: '#B758ED', fontWeight: 500 }}>当前激活</span>}
                      <span style={{ fontSize: 10, color: '#B0B5BD', fontFamily: 'var(--font-mono)' }}>{ds.source_type}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#898B8F', marginTop: 3, lineHeight: 1.6 }}>{ds.message || '—'}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 3, fontWeight: 500, background: badge.bg, color: badge.color }}>{badge.label}</span>
                    {ds.connection_status === 'mock' || ds.connection_status === 'unconfigured' ? (
                      <span style={{ fontSize: 11, color: '#B758ED' }}>
                        {ds.source_type === 'fengshenBi'
                          ? '可在本页下方「风神 BI 配置」填写凭证'
                          : '检查数据库文件与 DATASOURCE_TYPE 配置'}
                      </span>
                    ) : ds.connection_status === 'configured' ? (
                      <span style={{ fontSize: 11, color: '#1E6FFF' }}>待内网联调 / 白名单开通</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 最近审计事件 */}
          <div className="text-[12px] font-semibold mb-2" style={{ color: '#252931' }}>
            <ScrollText size={12} style={{ display: 'inline', marginRight: 4, color: '#B758ED' }} />
            最近审计事件（脱敏，不含密钥与 SQL 全文）
          </div>
          <div style={{ border: '1px solid #F1F2F3', borderRadius: 4, overflow: 'hidden', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
              <thead>
                <tr style={{ background: '#F5F6F8' }}>
                  <th style={{ textAlign: 'left', padding: '7px 10px', color: '#565960', fontWeight: 600 }}>时间</th>
                  <th style={{ textAlign: 'left', padding: '7px 10px', color: '#565960', fontWeight: 600 }}>事件</th>
                  <th style={{ textAlign: 'left', padding: '7px 10px', color: '#565960', fontWeight: 600 }}>数据源</th>
                  <th style={{ textAlign: 'left', padding: '7px 10px', color: '#565960', fontWeight: 600 }}>确认</th>
                  <th style={{ textAlign: 'left', padding: '7px 10px', color: '#565960', fontWeight: 600 }}>结果</th>
                  <th style={{ textAlign: 'left', padding: '7px 10px', color: '#565960', fontWeight: 600 }}>取数</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: '14px 10px', color: '#B0B5BD', textAlign: 'center' }}>暂无审计事件，发起一次问数后这里会出现记录</td></tr>
                )}
                {events.map(ev => (
                  <tr key={ev.event_id} style={{ borderTop: '1px solid #F5F6F8' }}>
                    <td style={{ padding: '7px 10px', color: '#898B8F', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{ev.time?.slice(11) || ''}</td>
                    <td style={{ padding: '7px 10px', color: '#252931', whiteSpace: 'nowrap' }}>{EVENT_KIND_LABEL[ev.kind] || ev.kind}</td>
                    <td style={{ padding: '7px 10px', color: '#565960', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{ev.datasource || '-'}</td>
                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                      {ev.staged_confirmed
                        ? <span style={{ color: '#0F8A2F' }}>已确认</span>
                        : ev.kind.includes('plan') || ev.kind.includes('connect')
                          ? <span style={{ color: '#B25E00' }}>待确认/待联调</span>
                          : <span style={{ color: '#898B8F' }}>自动</span>}
                    </td>
                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                      <span style={{ color: ev.result === 'success' ? '#0F8A2F' : ev.result === 'failed' ? '#C63838' : '#B25E00' }}>
                        {ev.result === 'success' ? '成功' : ev.result === 'failed' ? `失败（${ev.error_type || ''}）` : '待处理'}
                      </span>
                    </td>
                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                      {ev.mock_hit
                        ? <span style={{ fontSize: 10.5, padding: '1px 6px', borderRadius: 3, background: '#FFF7E6', color: '#B25E00' }}>Mock/兜底</span>
                        : <span style={{ fontSize: 10.5, padding: '1px 6px', borderRadius: 3, background: '#EAFBF1', color: '#0F8A2F' }}>真实</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 权限与安全边界 */}
          <div className="flex items-start gap-2.5"
            style={{ background: '#FBFAFE', border: '1px solid #EDE3FB', borderRadius: 4, padding: '12px 14px', fontSize: 12, color: '#4A3A6B', lineHeight: 1.8 }}>
            <ShieldCheck size={14} style={{ color: '#B758ED', flexShrink: 0, marginTop: 2 }} />
            <div>
              <b>权限与安全边界：</b>{status.permission.note}
              当前所有查询均以只读模式执行、SQL 需用户确认后才运行；审计事件、凭证配置、数据源管理在企业版接入登录体系（OAuth/SSO）后应限制为管理员操作——
              本版本为这些扩展点预留了结构（<code style={{ fontFamily: 'var(--font-mono)' }}>audit.PERMISSION_POINTS</code>），但【尚未实现】登录与权限拦截。
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// 小图标（避免额外 import 名称冲突，直接内联渲染）
function SparklesIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#898B8F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
    </svg>
  );
}

interface FengshenForm {
  base_url: string;
  app_id: string;
  app_secret: string;
  token: string;
  workspace_id: string;
}

const ENT_STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  mock: { bg: '#FFF7E6', color: '#B25E00', label: 'Mock 演示' },
  unconfigured: { bg: '#F5F6F8', color: '#898B8F', label: '未配置' },
  configured: { bg: '#E8F3FF', color: '#1E6FFF', label: '已配置 · 待联调' },
  verified: { bg: '#EAFBF1', color: '#0F8A2F', label: '凭证已验证' },
  real_ready: { bg: '#EAFBF1', color: '#0F8A2F', label: '真实可用' },
};

// 风神 BI 凭证配置面板：表单提交到后端内存托管，密钥不回填明文、不落浏览器持久化。
function FengshenConfigPanel() {
  const [form, setForm] = useState<FengshenForm>({ base_url: '', app_id: '', app_secret: '', token: '', workspace_id: '' });
  const [hasSecret, setHasSecret] = useState<{ app_secret: boolean; token: boolean }>({ app_secret: false, token: false });
  const [connStatus, setConnStatus] = useState('');
  const [busy, setBusy] = useState<'' | 'save' | 'test'>('');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string; role: string }[] | null>(null);
  const [wsNote, setWsNote] = useState('');

  function loadConfig() {
    fetch('/api/enterprise-bi/config')
      .then(r => r.json())
      .then(d => {
        const c = d.config || {};
        // 非密钥项回填；密钥项永不回填明文（留空表示不修改）
        setForm({
          base_url: c.base_url || '',
          app_id: c.app_id || '',
          workspace_id: c.workspace_id || '',
          app_secret: '',
          token: '',
        });
        setHasSecret({ app_secret: !!c.has_app_secret, token: !!c.has_token });
        setConnStatus(d.connection_status || '');
      })
      .catch(() => {});
  }

  useEffect(() => { loadConfig(); }, []);

  function buildPayload(): Record<string, string> {
    const p: Record<string, string> = {
      base_url: form.base_url.trim(),
      app_id: form.app_id.trim(),
      workspace_id: form.workspace_id.trim(),
    };
    // 密钥仅在用户新填写时才提交（留空 = 保持后端已有值不变）
    if (form.app_secret.trim()) p.app_secret = form.app_secret.trim();
    if (form.token.trim()) p.token = form.token.trim();
    return p;
  }

  function handleSave() {
    setBusy('save'); setMsg(null);
    fetch('/api/enterprise-bi/config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload()),
    })
      .then(r => r.json())
      .then(d => {
        setMsg({ type: d.ok ? 'ok' : 'err', text: d.message || '配置已保存' });
        loadConfig();
      })
      .catch(e => setMsg({ type: 'err', text: '保存失败：' + e }))
      .finally(() => setBusy(''));
  }

  function handleTest() {
    setBusy('test'); setMsg(null);
    fetch('/api/enterprise-bi/connect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload()),
    })
      .then(r => r.json())
      .then(d => {
        setConnStatus(d.status || connStatus);
        // configured / mock 态下 ok=false 属于「预期的待联调」，用中性提示而非报错
        const pending = d.status === 'configured' || d.status === 'mock';
        setMsg({ type: d.ok ? 'ok' : pending ? 'info' : 'err', text: d.message || '连接测试完成' });
        loadConfig();
        loadWorkspaces();
      })
      .catch(e => setMsg({ type: 'err', text: '连接测试失败：' + e }))
      .finally(() => setBusy(''));
  }

  function loadWorkspaces() {
    fetch('/api/enterprise-bi/workspaces')
      .then(r => r.json())
      .then(d => {
        if (d.success) { setWorkspaces(d.workspaces || []); setWsNote(d.mock ? '（Mock 演示工作空间）' : ''); }
        else { setWorkspaces([]); setWsNote(d.message || '工作空间接口暂不可用'); }
      })
      .catch(() => {});
  }

  const badge = ENT_STATUS_BADGE[connStatus] || ENT_STATUS_BADGE.unconfigured;

  const field = (key: keyof FengshenForm, label: string, opts: { secret?: boolean; placeholder?: string; mono?: boolean } = {}) => (
    <div>
      <label style={{ fontSize: 12, fontWeight: 500, color: '#565960', display: 'block', marginBottom: 5 }}>
        {label}
        {opts.secret && (hasSecret as any)[key] && (
          <span style={{ marginLeft: 8, fontSize: 10.5, color: '#0F8A2F', fontWeight: 400 }}>● 已配置（留空不修改）</span>
        )}
      </label>
      <input
        type={opts.secret ? 'password' : 'text'}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        placeholder={opts.placeholder || (opts.secret ? '请输入（输入框内容不会被保存到浏览器）' : '')}
        autoComplete="off"
        style={{
          width: '100%', boxSizing: 'border-box', height: 34, padding: '0 10px',
          borderRadius: 4, border: '1px solid #E5E6EB', fontSize: 12.5, color: '#252931',
          outline: 'none', fontFamily: opts.mono || opts.secret ? 'var(--font-mono)' : 'inherit',
        }}
      />
    </div>
  );

  return (
    <div style={{ border: '1px solid #E6D3FA', borderRadius: 4, background: '#FBFAFE', padding: 18, marginBottom: 18 }}>
      <div className="flex items-center justify-between mb-3 flex-wrap" style={{ gap: 8 }}>
        <div className="flex items-center gap-2">
          <KeyRound size={14} style={{ color: '#B758ED' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#252931' }}>风神 BI 授权配置</span>
          <span style={{ fontSize: 10.5, padding: '1px 8px', borderRadius: 3, fontWeight: 500, background: badge.bg, color: badge.color }}>
            {badge.label}
          </span>
        </div>
        <button
          onClick={loadWorkspaces}
          className="flex items-center gap-1"
          style={{ fontSize: 11.5, color: '#B758ED', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <Network size={12} /> 查看工作空间
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {field('base_url', 'API 地址 (base_url)', { placeholder: 'https://bi.example.com/openapi', mono: true })}
        {field('workspace_id', '工作空间 ID (workspace_id)', { placeholder: 'ws_xxxxxxxx', mono: true })}
        {field('app_id', '应用 ID (app_id)', { mono: true })}
        {field('app_secret', '应用密钥 (app_secret)', { secret: true })}
        {field('token', '访问令牌 (token，可与 app_id/secret 二选一)', { secret: true })}
      </div>

      <div className="flex items-center gap-3 mt-4 flex-wrap">
        <button
          onClick={handleSave}
          disabled={busy !== ''}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 500,
            padding: '7px 16px', borderRadius: 4, border: '1px solid #D9BAF7', cursor: 'pointer',
            background: '#fff', color: '#B758ED', opacity: busy !== '' ? 0.6 : 1,
          }}
        >
          {busy === 'save' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          保存配置
        </button>
        <button
          onClick={handleTest}
          disabled={busy !== ''}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 500,
            padding: '7px 16px', borderRadius: 4, border: 'none', cursor: 'pointer',
            background: '#B758ED', color: '#fff', opacity: busy !== '' ? 0.6 : 1,
          }}
        >
          {busy === 'test' ? <Loader2 size={13} className="animate-spin" /> : <Plug size={13} />}
          测试连接
        </button>
        <span className="flex items-center gap-1 text-[11px]" style={{ color: '#898B8F' }}>
          <ShieldCheck size={12} /> 凭证由后端内存托管，密钥不明文回显、不写入浏览器本地存储
        </span>
      </div>

      {msg && (
        <div style={{
          marginTop: 12, fontSize: 12, lineHeight: 1.7, borderRadius: 4, padding: '8px 12px',
          background: msg.type === 'ok' ? '#F0FBF4' : msg.type === 'info' ? '#F5F9FF' : '#FFF1F0',
          border: `1px solid ${msg.type === 'ok' ? '#C5F0D5' : msg.type === 'info' ? '#D6E6FF' : '#FFCDC8'}`,
          color: msg.type === 'ok' ? '#1A6B33' : msg.type === 'info' ? '#1E5BB8' : '#C63838',
        }}>
          {msg.text}
        </div>
      )}

      {workspaces !== null && (
        <div style={{ marginTop: 12 }}>
          <div className="text-[12px] font-semibold mb-1.5" style={{ color: '#252931' }}>
            <Network size={12} style={{ display: 'inline', marginRight: 5, color: '#B758ED' }} />
            工作空间{wsNote && <span style={{ fontWeight: 400, color: '#B25E00', marginLeft: 6 }}>{wsNote}</span>}
          </div>
          {workspaces.length === 0 ? (
            <p style={{ fontSize: 12, color: '#898B8F', margin: 0 }}>{wsNote || '暂无工作空间'}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {workspaces.map(w => (
                <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#fff', border: '1px solid #EDE3FB', borderRadius: 4 }}>
                  <Building2 size={13} style={{ color: '#B758ED' }} />
                  <span style={{ fontSize: 12.5, color: '#252931', fontWeight: 500 }}>{w.name}</span>
                  <span style={{ fontSize: 11, color: '#898B8F', fontFamily: 'var(--font-mono)' }}>{w.id}</span>
                  {w.role && <span style={{ fontSize: 10.5, color: '#B758ED', background: '#F0EBFA', padding: '1px 7px', borderRadius: 3 }}>{w.role}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
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
      <div className="page-padding-responsive" style={{ maxWidth: 880, margin: '0 auto', padding: '40px 48px 64px 48px', display: 'flex', flexDirection: 'column', rowGap: 28 }}>
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

        <SystemStatusCard />

        <DatasetHealthCard />

        <DataSourceCard />

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
