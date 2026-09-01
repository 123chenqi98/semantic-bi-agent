import { useEffect, useState } from 'react';
import {
  MessageSquare, Building2, BarChart3, BookOpen, SlidersHorizontal, FlaskConical,
  Settings, Plug, RefreshCw, ArrowRight, Inbox, Clock, CheckCircle2, AlertTriangle,
  Sparkles, History, ChevronRight, Database, CloudOff, TrendingUp, LineChart,
  Rocket, CircleDot,
} from 'lucide-react';
import { useApp } from '../store/ChatContext';
import { exampleGroups } from '../mock/data';
import type { PageType, Conversation } from '../types';

// ==================== 数据源状态类型（对齐后端 /api/datasource/status） ====================
interface DsProvider {
  ok: boolean;
  source_type: string;
  display_name: string;
  is_real: boolean;
  is_available?: boolean;
  message: string;
  details?: Record<string, any>;
}
interface DsStatus {
  current: string;
  provider: DsProvider;
  registry: Record<string, {
    source_type: string;
    display_name: string;
    is_real: boolean;
    is_available: boolean;
  }>;
}
interface HealthInfo {
  ok: boolean;
  real_llm_enabled: boolean;
  mode: string;
}
// 风神 BI 五态连接状态机：mock / configured / verified / real_ready
interface EntStatus {
  ok: boolean;
  is_real: boolean;
  connection_status: string;
  message: string;
}

// 相对时间：把会话时间戳转成「刚刚 / x 分钟前 / x 小时前 / x 天前」
function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} 天前`;
  const date = new Date(ts);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

// 通用区块标题：紫色图标 + 标题 + 右侧操作
function SectionTitle({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span style={{ color: '#B758ED', display: 'inline-flex' }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#252931' }}>{title}</span>
      </div>
      {action}
    </div>
  );
}

function Badge({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'gray' | 'purple'; children: React.ReactNode }) {
  const styles: Record<string, { bg: string; color: string }> = {
    green: { bg: '#EAFBF1', color: '#0F8A2F' },
    amber: { bg: '#FFF7E6', color: '#B25E00' },
    red: { bg: '#FFF1F0', color: '#C63838' },
    gray: { bg: '#F2F3F6', color: '#898B8F' },
    purple: { bg: '#F5F0FF', color: '#8A3ED8' },
  };
  const s = styles[tone];
  return (
    <span style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 3, fontWeight: 500,
      background: s.bg, color: s.color, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

export default function HomePage() {
  const { state, dispatch } = useApp();
  const [dsStatus, setDsStatus] = useState<DsStatus | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [entStatus, setEntStatus] = useState<EntStatus | null>(null);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // 拉取数据源与模型连接状态（首页必须让用户一眼看清当前数据底座）
  const loadStatus = () => {
    setRefreshing(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    Promise.allSettled([
      fetch('/api/datasource/status', { signal: ctrl.signal }).then(r => r.ok ? r.json() : Promise.reject()),
      fetch('/api/health', { signal: ctrl.signal }).then(r => r.ok ? r.json() : Promise.reject()),
      fetch('/api/enterprise-bi/status', { signal: ctrl.signal }).then(r => r.ok ? r.json() : Promise.reject()),
    ]).then(([dsRes, healthRes, entRes]) => {
      clearTimeout(timer);
      if (dsRes.status === 'fulfilled') {
        setDsStatus(dsRes.value as DsStatus);
        setBackendOk(true);
      } else {
        setDsStatus(null);
        setBackendOk(false);
      }
      if (healthRes.status === 'fulfilled') setHealth(healthRes.value as HealthInfo);
      else setHealth(null);
      if (entRes.status === 'fulfilled') setEntStatus(entRes.value as EntStatus);
      else setEntStatus(null);
      setRefreshing(false);
    }).catch(() => {
      clearTimeout(timer);
      setBackendOk(false);
      setRefreshing(false);
    });
  };

  useEffect(() => { loadStatus(); }, []);

  // 跳转到指定功能页
  const goPage = (page: PageType) => dispatch({ type: 'SET_PAGE', payload: page });

  // 发起问数：开新会话并携带问题，ChatPage 挂载后自动发送（空问题则仅进入对话页）
  const startAsk = (question?: string) => {
    dispatch({ type: 'NEW_CONVERSATION' });
    if (question) dispatch({ type: 'SET_CHAT_QUESTION', payload: question });
    dispatch({ type: 'SET_PAGE', payload: 'chat' });
  };

  // 继续最近一次分析：回到对应会话
  const continueConv = (convId: string) => {
    dispatch({ type: 'SELECT_CONVERSATION', payload: convId });
    dispatch({ type: 'SET_PAGE', payload: 'chat' });
  };

  // 最近分析：有消息的会话按更新时间倒序，最多 3 条
  const recentConvs: Conversation[] = state.conversations
    .filter(c => c.messages.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 3);

  const localProvider = dsStatus?.current === 'currentLocal' ? dsStatus.provider : null;
  // 风神 BI 连接态：以五态状态机为准诚实标注，避免把「已配置待联调」误报为可用
  const entConn = entStatus?.connection_status;
  const entReady = entConn === 'real_ready' || entConn === 'verified';
  const entConfigured = entConn === 'configured';
  const entBadge = backendOk !== true
    ? { tone: 'gray' as const, text: '状态未知' }
    : entReady
      ? { tone: 'green' as const, text: '真实可用' }
      : entConfigured
        ? { tone: 'amber' as const, text: '已配置 · 待联调' }
        : { tone: 'amber' as const, text: 'Mock 演示' };

  // ==================== 常用入口配置 ====================
  const entries: {
    page: PageType; icon: React.ReactNode; title: string; desc: string;
    badge?: { tone: 'green' | 'amber' | 'red' | 'gray' | 'purple'; text: string };
    primary?: boolean;
  }[] = [
    {
      page: 'chat', icon: <MessageSquare size={18} />, title: '智能问数', primary: true,
      desc: '自然语言提问，先确认需求与 SQL 草案，确认后才执行取数，结果进入分析工作台。',
      badge: { tone: 'purple', text: '分阶段确认已启用' },
    },
    {
      page: 'enterpriseBi', icon: <Building2 size={18} />, title: '企业 BI 问数',
      desc: '对接风神 BI 的企业级问数：需求澄清 → 草案确认 → 执行取数与图表分析。',
      badge: entBadge,
    },
    {
      page: 'chartAssistant', icon: <BarChart3 size={18} />, title: '图表生成',
      desc: '上传 CSV 或粘贴数据，AI 推荐图表类型并生成可视化，也可从问数结果一键带入。',
    },
    {
      page: 'dictionary', icon: <BookOpen size={18} />, title: '指标词典',
      desc: '查看指标定义、SQL 模板、同义词与易混淆口径，提问前先对齐指标含义。',
    },
    {
      page: 'semanticEditor', icon: <SlidersHorizontal size={18} />, title: '语义层管理',
      desc: '可视化维护指标语义层规则（定义、模板、同义词），本地持久化即时生效。',
    },
    {
      page: 'evaluation', icon: <FlaskConical size={18} />, title: '实验评测',
      desc: '25 题对照评测：基线 Text-to-SQL vs 语义增强方案的正确率与逐题明细。',
    },
    {
      page: 'settings', icon: <Settings size={18} />, title: '系统设置',
      desc: '数据源切换、风神 BI 凭证配置、数据集健康度与模型参数查看。',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 32px 56px 32px' }}>

        {/* ① 顶部定位区：一句话说明这是什么、能做什么 */}
        <div className="flex items-start justify-between gap-6" style={{ marginBottom: 24 }}>
          <div style={{ minWidth: 0 }}>
            <div
              className="inline-flex items-center mb-3"
              style={{
                height: 26, padding: '0 12px', borderRadius: 999,
                background: '#F5F0FF', color: '#B758ED', fontSize: 12, fontWeight: 500,
                border: '1px solid #EADDFF',
              }}
            >
              <Sparkles size={12} style={{ marginRight: 5 }} />
              语义增强型经营分析助手
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 600, color: '#252931', letterSpacing: '-0.02em', margin: '0 0 8px 0' }}>
              分析工作台
            </h1>
            <p style={{ fontSize: 13, color: '#565960', lineHeight: 1.8, margin: 0, maxWidth: 640 }}>
              用自然语言完成取数、确认、分析与可视化：提问后先对齐需求与 SQL 口径，确认后才执行；
              结果以结构化分析工作台呈现，支持追问、导出与图表生成。
            </p>
          </div>
          <button
            onClick={() => startAsk()}
            className="shrink-0 flex items-center gap-2"
            style={{
              height: 40, padding: '0 20px', borderRadius: 4, border: 'none', cursor: 'pointer',
              background: '#B758ED', color: '#fff', fontSize: 14, fontWeight: 500,
              boxShadow: '0 2px 8px rgba(183,88,237,0.25)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#A544E0'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#B758ED'; }}
          >
            <MessageSquare size={15} />
            开始智能问数
          </button>
        </div>

        {/* ② 数据源与连接状态：当前数据源 / 风神 BI / 模型服务，一眼可见 */}
        <div style={{ background: '#fff', border: '1px solid #ECEDF1', borderRadius: 4, padding: '20px 22px', marginBottom: 28 }}>
          <SectionTitle
            icon={<Plug size={15} />}
            title="数据源与连接状态"
            action={
              <button
                onClick={loadStatus}
                className="flex items-center gap-1"
                style={{ fontSize: 12, color: '#898B8F', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <RefreshCw size={12} style={{ transform: refreshing ? 'rotate(180deg)' : 'none', transition: 'transform .3s' }} />
                刷新状态
              </button>
            }
          />

          {/* 后端不可达横幅：第一轮错误恢复能力在入口层的体现 */}
          {backendOk === false && (
            <div
              className="flex items-start gap-2"
              style={{
                background: '#FFF7E6', border: '1px solid #FFE7BA', borderRadius: 4,
                padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#874A20', lineHeight: 1.7,
              }}
            >
              <CloudOff size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                后端服务暂不可达，以下状态为离线推断。问数功能会自动降级为前端演示数据（非真实取数），
                服务恢复后可点击「刷新状态」重连，或前往
                <button onClick={() => goPage('settings')} style={{ background: 'none', border: 'none', color: '#B758ED', cursor: 'pointer', fontSize: 12, padding: '0 2px', textDecoration: 'underline' }}>系统设置</button>
                查看配置。
              </span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {/* 当前数据源 */}
            <div style={{ background: '#FBFCFD', border: '1px solid #F1F2F3', borderRadius: 4, padding: '14px 16px' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Database size={14} style={{ color: '#898B8F' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#252931' }}>当前数据源</span>
                </div>
                {backendOk === true && localProvider
                  ? <Badge tone="green">已连接 · 真实数据</Badge>
                  : backendOk === false
                    ? <Badge tone="red">后端未连接</Badge>
                    : <Badge tone="gray">检测中</Badge>}
              </div>
              <div style={{ fontSize: 13, color: '#252931', fontWeight: 500, marginBottom: 4 }}>
                {localProvider?.display_name || '本地零售数据集（retail.db）'}
              </div>
              <div style={{ fontSize: 11.5, color: '#898B8F', lineHeight: 1.6, fontFamily: 'var(--font-mono)' }}>
                {localProvider?.message || (backendOk === false
                  ? '离线状态：问数将使用前端内置演示数据'
                  : '正在读取数据源信息…')}
              </div>
              <div style={{ marginTop: 10 }}>
                <Badge tone="purple">currentLocal</Badge>
              </div>
            </div>

            {/* 风神 BI 企业数据源（五态状态机：mock / configured / verified / real_ready） */}
            <div style={{ background: '#FBFCFD', border: '1px solid #F1F2F3', borderRadius: 4, padding: '14px 16px' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Building2 size={14} style={{ color: '#898B8F' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#252931' }}>企业 BI（风神）</span>
                </div>
                <Badge tone={entBadge.tone}>{entBadge.text}</Badge>
              </div>
              <div style={{ fontSize: 13, color: '#252931', fontWeight: 500, marginBottom: 4 }}>
                风神 BI 企业级接入层
              </div>
              <div style={{ fontSize: 11.5, color: '#898B8F', lineHeight: 1.6 }}>
                {backendOk !== true
                  ? '后端连接后可读取企业数据源接入状态'
                  : entReady
                    ? 'MCP 通道已在本服务进程内完成真实验证（测试连接或取数成功）；后续若调用失败会自动降级回退 Mock，状态同步更新'
                    : entConfigured
                      ? '凭证已配置但尚未真实验证（待内网联调 / 白名单开通），当前问数由 Mock 数据兜底；可在设置页「测试连接」'
                      : '接口链路可用，数据为模拟；配置凭证并开通白名单后切换真实取数'}
              </div>
              <div style={{ marginTop: 10 }} className="flex items-center gap-2">
                <button
                  onClick={() => goPage('enterpriseBi')}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: '#B758ED', display: 'inline-flex', alignItems: 'center', gap: 2 }}
                >
                  去问数 <ChevronRight size={12} />
                </button>
                <span style={{ color: '#E5E6EB' }}>|</span>
                <button
                  onClick={() => goPage('settings')}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: '#B758ED', display: 'inline-flex', alignItems: 'center', gap: 2 }}
                >
                  配置凭证 <ChevronRight size={12} />
                </button>
              </div>
            </div>

            {/* 智能模型服务 */}
            <div style={{ background: '#FBFCFD', border: '1px solid #F1F2F3', borderRadius: 4, padding: '14px 16px' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} style={{ color: '#898B8F' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#252931' }}>智能模型服务</span>
                </div>
                {backendOk !== true
                  ? <Badge tone="gray">状态未知</Badge>
                  : health?.real_llm_enabled
                    ? <Badge tone="green">真实 LLM 已启用</Badge>
                    : <Badge tone="amber">模拟模式</Badge>}
              </div>
              <div style={{ fontSize: 13, color: '#252931', fontWeight: 500, marginBottom: 4 }}>
                doubao-seed-2.0-pro
              </div>
              <div style={{ fontSize: 11.5, color: '#898B8F', lineHeight: 1.6 }}>
                {backendOk !== true
                  ? '后端连接后可读取模型服务状态'
                  : health?.real_llm_enabled
                    ? '需求理解、SQL 生成与结论分析由真实大模型驱动，失败时自动走题库兜底'
                    : '当前未启用真实 LLM，SQL 由模板与题库生成'}
              </div>
              <div style={{ marginTop: 10 }}>
                {backendOk === true && !health?.real_llm_enabled && (
                  <span style={{ fontSize: 11.5, color: '#B25E00' }}>提示：在 .env 配置模型 Key 后启用</span>
                )}
                {backendOk === true && health?.real_llm_enabled && (
                  <span className="inline-flex items-center gap-1" style={{ fontSize: 11.5, color: '#0F8A2F' }}>
                    <CheckCircle2 size={12} /> 限流时自动重试与降级，不影响出结果
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ③ 常用入口区：主要任务一卡直达 */}
        <div style={{ marginBottom: 28 }}>
          <SectionTitle icon={<BarChart3 size={15} />} title="常用功能" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {entries.map(entry => (
              <button
                key={entry.page}
                onClick={() => goPage(entry.page)}
                className="text-left"
                style={{
                  background: '#fff', border: entry.primary ? '1px solid #D9BAF7' : '1px solid #ECEDF1',
                  borderRadius: 4, padding: '16px 18px', cursor: 'pointer', outline: 'none',
                  transition: 'border-color .15s, background .15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = '#B758ED';
                  e.currentTarget.style.background = '#FBF9FE';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = entry.primary ? '#D9BAF7' : '#ECEDF1';
                  e.currentTarget.style.background = '#fff';
                }}
              >
                <div className="flex items-center justify-between mb-2.5">
                  <div
                    className="flex items-center justify-center"
                    style={{
                      width: 34, height: 34, borderRadius: 8,
                      background: entry.primary ? '#B758ED' : '#F5F0FF',
                      color: entry.primary ? '#fff' : '#B758ED',
                    }}
                  >
                    {entry.icon}
                  </div>
                  {entry.badge && <Badge tone={entry.badge.tone}>{entry.badge.text}</Badge>}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#252931', marginBottom: 5 }} className="flex items-center justify-between">
                  <span>{entry.title}</span>
                  <ArrowRight size={14} style={{ color: '#C9CCD4' }} />
                </div>
                <div style={{ fontSize: 12, color: '#898B8F', lineHeight: 1.7 }}>{entry.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ④ 最近分析 + 推荐起步动作 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: 16, marginBottom: 28 }}>
          {/* 最近分析：基于本地会话历史，不伪造任何后端数据 */}
          <div style={{ background: '#fff', border: '1px solid #ECEDF1', borderRadius: 4, padding: '20px 22px' }}>
            <SectionTitle
              icon={<History size={15} />}
              title="最近分析"
              action={
                recentConvs.length > 0
                  ? <button onClick={() => goPage('chat')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: '#B758ED', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                      全部对话 <ChevronRight size={12} />
                    </button>
                  : undefined
              }
            />
            {recentConvs.length === 0 ? (
              <div className="flex flex-col items-center text-center" style={{ padding: '26px 12px' }}>
                <Inbox size={30} style={{ color: '#D4D7DD', marginBottom: 10 }} />
                <div style={{ fontSize: 13, color: '#565960', fontWeight: 500, marginBottom: 4 }}>还没有分析记录</div>
                <div style={{ fontSize: 12, color: '#B0B5BD', lineHeight: 1.7, marginBottom: 12 }}>
                  从下方示例问题开始第一次问数，结果会自动出现在这里
                </div>
                <button
                  onClick={() => startAsk()}
                  className="flex items-center gap-1.5"
                  style={{ height: 32, padding: '0 16px', borderRadius: 4, border: '1px solid #D9BAF7', background: '#fff', color: '#B758ED', fontSize: 13, cursor: 'pointer' }}
                >
                  <MessageSquare size={13} /> 开始第一次问数
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {recentConvs.map(conv => {
                  const msgs = conv.messages;
                  const lastUser = [...msgs].reverse().find(m => m.type === 'user');
                  const lastAi = [...msgs].reverse().find(m => m.type === 'ai' && (m as any).conclusion);
                  const aiMsg = lastAi as any;
                  const title = conv.title && conv.title !== '新对话'
                    ? conv.title
                    : (lastUser?.type === 'user' ? lastUser.content : '新对话');
                  const degraded = msgs.some(m => m.type === 'ai' && (m as any).degraded);
                  return (
                    <div
                      key={conv.id}
                      className="flex items-center justify-between gap-3"
                      style={{
                        background: '#FBFCFD', border: '1px solid #F1F2F3', borderRadius: 4,
                        padding: '12px 14px', cursor: 'pointer', transition: 'border-color .15s',
                      }}
                      onClick={() => continueConv(conv.id)}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#D9BAF7'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#F1F2F3'; }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="flex items-center gap-2 mb-1">
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#252931' }} className="truncate">
                            {title}
                          </span>
                          <span className="flex items-center gap-1 shrink-0" style={{ fontSize: 11, color: '#B0B5BD' }}>
                            <Clock size={11} /> {relTime(conv.updatedAt)}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: '#898B8F', lineHeight: 1.6, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>
                          {aiMsg?.conclusion || (lastUser?.type === 'user' ? lastUser.content : '')}
                        </div>
                        <div className="flex items-center gap-1.5 mt-2" style={{ flexWrap: 'wrap' }}>
                          <Badge tone="gray">{msgs.length} 条消息</Badge>
                          <Badge tone={degraded ? 'red' : 'green'}>
                            {degraded ? '前端演示数据' : '本地零售数据集'}
                          </Badge>
                          {aiMsg?.usageVerdict && (
                            <Badge tone={aiMsg.usageVerdict.usable ? 'green' : 'amber'}>
                              {aiMsg.usageVerdict.usable ? '结果可用' : '数据不足'}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); continueConv(conv.id); }}
                        className="shrink-0 flex items-center gap-1"
                        style={{ height: 30, padding: '0 12px', borderRadius: 4, border: '1px solid #D9BAF7', background: '#fff', color: '#B758ED', fontSize: 12, cursor: 'pointer' }}
                      >
                        继续分析 <ArrowRight size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 推荐起步动作：承接第二、三轮的分阶段确认与分析工作台 */}
          <div style={{ background: '#fff', border: '1px solid #ECEDF1', borderRadius: 4, padding: '20px 22px' }}>
            <SectionTitle icon={<Sparkles size={15} />} title="三步完成一次分析" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
              {[
                { step: 1, title: '提出业务问题', desc: '如「上月各渠道销售额」，自然语言即可，无需写 SQL' },
                { step: 2, title: '确认需求与 SQL 草案', desc: '系统先给出需求理解、口径与 SQL，确认后才执行查询' },
                { step: 3, title: '在分析工作台深挖', desc: '查看结论与图表，可追问、导出 CSV、一键生成图表' },
              ].map(item => (
                <div key={item.step} className="flex items-start gap-3">
                  <div
                    className="flex items-center justify-center shrink-0"
                    style={{ width: 24, height: 24, borderRadius: 999, background: '#F5F0FF', color: '#B758ED', fontSize: 12, fontWeight: 600, marginTop: 1 }}
                  >
                    {item.step}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#252931', marginBottom: 3 }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: '#898B8F', lineHeight: 1.7 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            {backendOk === false && (
              <div
                className="flex items-start gap-2"
                style={{ background: '#FFF1F0', border: '1px solid #FFD5D2', borderRadius: 4, padding: '8px 10px', fontSize: 11.5, color: '#C63838', lineHeight: 1.6, marginBottom: 12 }}
              >
                <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                后端离线中：提问将走前端演示数据，真实取数需后端服务在线。
              </div>
            )}
            <button
              onClick={() => startAsk()}
              className="w-full flex items-center justify-center gap-2"
              style={{ height: 36, borderRadius: 4, border: 'none', background: '#B758ED', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#A544E0'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#B758ED'; }}
            >
              <MessageSquare size={14} /> 开始第一次问数
            </button>
          </div>
        </div>

        {/* ⑤ 推荐体验路径：首次使用者 / 答辩演示一眼知道怎么测核心价值 */}
        <div
          className="flex items-start gap-3"
          style={{
            background: 'linear-gradient(135deg, #FAF6FF 0%, #F5F0FF 100%)',
            border: '1px solid #E6D3FA', borderRadius: 6, padding: '14px 18px', marginBottom: 16,
          }}
        >
          <div
            className="flex items-center justify-center shrink-0"
            style={{ width: 30, height: 30, borderRadius: 8, background: '#B758ED', color: '#fff' }}
          >
            <Rocket size={16} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: '#252931', marginBottom: 6 }}>
              首次使用 / 演示推荐路径（约 3 分钟）
            </div>
            <div style={{ fontSize: 12.5, color: '#565960', lineHeight: 1.9 }}>
              <b style={{ color: '#6D39C7' }}>①</b> 点下方「业务问数」示例发起提问 →
              <b style={{ color: '#6D39C7' }}>②</b> 核对需求理解与 SQL 草案，点「确认执行」（确认前绝不跑 SQL）→
              <b style={{ color: '#6D39C7' }}>③</b> 在分析工作台看结论、口径与图表 →
              <b style={{ color: '#6D39C7' }}>④</b> 用「结果追问与图表」体验拆分追问、一键出图、导出 CSV。
            </div>
            <div className="flex items-center gap-1.5 flex-wrap" style={{ marginTop: 8 }}>
              <CircleDot size={12} style={{ color: '#B758ED' }} />
              <span style={{ fontSize: 12, color: '#6D39C7' }}>
                当前用「本地零售数据集」即可完整体验全流程（真实取数 + 真实分析）；
                风神企业 BI 已完成接入准备，待白名单开通后切换为真实企业数据。
              </span>
            </div>
          </div>
        </div>

        {/* ⑥ 精选示例：3 类典型任务，点击直接发起一次真实问数流程 */}
        <div style={{ background: '#fff', border: '1px solid #ECEDF1', borderRadius: 4, padding: '20px 22px' }}>
          <SectionTitle
            icon={<MessageSquare size={15} />}
            title="精选示例 · 三类典型分析任务"
            action={<span style={{ fontSize: 12, color: '#B0B5BD' }}>点击任意问题即开新会话提问</span>}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {exampleGroups.map((group) => {
              const gIcon = group.key === 'business'
                ? <MessageSquare size={15} />
                : group.key === 'trend'
                  ? <TrendingUp size={15} />
                  : <LineChart size={15} />;
              return (
                <div key={group.key} style={{ border: '1px solid #F1F2F3', borderRadius: 6, padding: '14px 16px', background: '#FBFCFD' }}>
                  <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                    <span style={{ color: '#B758ED', display: 'inline-flex' }}>{gIcon}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: '#252931' }}>{group.title}</span>
                  </div>
                  <p style={{ fontSize: 11.5, color: '#B0B5BD', lineHeight: 1.6, margin: '0 0 12px' }}>{group.desc}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {group.items.map((item, i) => (
                      <button
                        key={i}
                        onClick={() => startAsk(item.q)}
                        className="text-left"
                        style={{
                          padding: '10px 12px', borderRadius: 4, background: '#fff',
                          border: '1px solid #ECEDF1', cursor: 'pointer',
                          transition: 'border-color .15s, background .15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#D9BAF7'; e.currentTarget.style.background = '#FBF9FE'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#ECEDF1'; e.currentTarget.style.background = '#fff'; }}
                      >
                        <div className="flex items-center justify-between gap-2" style={{ marginBottom: 5 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#252931', lineHeight: 1.5 }}>{item.q}</span>
                          <ArrowRight size={13} style={{ color: '#C9CCD4', flexShrink: 0 }} />
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap" style={{ marginBottom: 5 }}>
                          <Badge tone="purple">{item.metric}</Badge>
                          <Badge tone="gray">{item.period}</Badge>
                        </div>
                        <div style={{ fontSize: 11, color: '#898B8F', lineHeight: 1.6 }}>{item.goal}</div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-center" style={{ fontSize: 11.5, color: '#B0B5BD', margin: '22px 0 0' }}>
          所有查询均以只读模式执行 · SQL 需您确认后才会运行 · 演示数据集覆盖 2025-01 至 2026-06
        </p>
      </div>
    </div>
  );
}
