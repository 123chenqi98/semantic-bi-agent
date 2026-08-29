import { useState, useEffect, useCallback } from 'react';
import {
  Building2, CheckCircle2, AlertTriangle, Loader2, FileText,
  Target, Clock, Tag, Database, ShieldCheck, RefreshCw, Lightbulb, Table2,
  AtSign, Paperclip, Settings, ChevronDown, Plus, ChevronRight, ArrowUpRight, Sparkles,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useApp } from '../store/ChatContext';

// ==================== 类型定义（与后端 /api/enterprise-bi/* 契约对齐） ====================

interface MatchedMetric { id: string; name: string }

interface PlanResponse {
  success: boolean;
  stage: string;
  plan_id: string;
  needs_clarification: boolean;
  clarification_questions: string[];
  assumptions: string[];
  question: string;
  sql_draft: string;
  sql_source: string;
  matched_metrics: MatchedMetric[];
  time_range: string;
  dimensions: string[];
  dataset_id: string | null;
  connection_status: string;
  is_real: boolean;
  error?: string;
}

interface ConfirmResponse {
  success: boolean;
  stage: string;
  question: string;
  sql: string;
  source_type: string;
  is_real: boolean;
  mock: boolean;
  mock_note: string;
  pending_integration: boolean;
  audited: boolean;
  result: {
    columns: string[];
    rows: any[][];
    rowCount: number;
    totalCount: number;
    success: boolean;
    error: string | null;
    executionTimeMs: number;
  };
  summary: { key_findings: string[] };
  chart_suggestion: { type: string; xField?: string; reason: string };
  matched_metrics: MatchedMetric[];
  time_range: string;
  error?: string;
}

interface EntStatus {
  ok: boolean;
  source_type: string;
  display_name: string;
  is_real: boolean;
  connection_status: string;
  message: string;
}

interface DatasetItem {
  id: string;
  name: string;
  description?: string;
  row_count?: number;
  columns?: number;
  mock?: boolean;
}

// 业务线 → 推荐数据集 / 引导示例（可交互，选中后联动数据表 chips 与输入框占位）
const BUSINESS_LINES = [
  { id: 'retail', label: '零售经营分析', dataset: 'fs_sales_daily',
    hint: '如：结合「销售日汇总」，分析上月各渠道销售额占比是多少' },
  { id: 'user', label: '用户画像分析', dataset: 'fs_user_profile',
    hint: '如：各会员等级的累计消费金额与客单价对比' },
  { id: 'product', label: '商品表现分析', dataset: 'fs_product_performance',
    hint: '如：各品类的 GMV、销量与退货率表现如何' },
];

const GRADIENT_BTN = 'linear-gradient(135deg, #B758ED 0%, #D645D2 100%)';

// 连接状态 → 展示样式
const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  mock: { bg: '#FFF7E6', color: '#B25E00', label: 'Mock 演示模式' },
  unconfigured: { bg: '#F5F6F8', color: '#898B8F', label: '未配置' },
  configured: { bg: '#E8F3FF', color: '#1E6FFF', label: '已配置 · 待联调' },
  verified: { bg: '#EAFBF1', color: '#0F8A2F', label: '凭证已验证' },
  real_ready: { bg: '#EAFBF1', color: '#0F8A2F', label: '真实可用' },
};

const SQL_SOURCE_LABEL: Record<string, string> = {
  'semantic-llm': '语义层 + LLM 生成',
  'preset-bank': '内置语义题库',
  'dimension-template': '维度下钻模板',
  'fallback': '兜底模板',
};

export default function EnterpriseBiPage() {
  const { dispatch } = useApp();
  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState<EntStatus | null>(null);

  // 阶段：idle（欢迎/输入）→ planning → planned（草案待确认）→ confirming → done
  const [stage, setStage] = useState<'idle' | 'planning' | 'planned' | 'confirming' | 'done'>('idle');
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [confirm, setConfirm] = useState<ConfirmResponse | null>(null);
  const [error, setError] = useState('');

  // DataBot 风格问数入口的交互状态
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const [showAllDatasets, setShowAllDatasets] = useState(false);
  const [deepResearch, setDeepResearch] = useState(false);
  const [businessLine, setBusinessLine] = useState(BUSINESS_LINES[0].id);
  const [lineOpen, setLineOpen] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [attachTip, setAttachTip] = useState(false);

  const busy = stage === 'planning' || stage === 'confirming';
  const currentLine = BUSINESS_LINES.find(l => l.id === businessLine) || BUSINESS_LINES[0];
  const selectedDatasetName = datasets.find(d => d.id === selectedDataset)?.name;

  const refreshStatus = useCallback(() => {
    fetch('/api/enterprise-bi/status')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: EntStatus) => setStatus(d))
      .catch(() => setStatus(null));
  }, []);

  const loadDatasets = useCallback(() => {
    fetch('/api/enterprise-bi/datasets')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((d: { datasets?: DatasetItem[] }) => setDatasets(Array.isArray(d.datasets) ? d.datasets : []))
      .catch(() => setDatasets([]));
  }, []);

  useEffect(() => { refreshStatus(); loadDatasets(); }, [refreshStatus, loadDatasets]);

  function toggleDataset(id: string) {
    setSelectedDataset(prev => (prev === id ? null : id));
    setMentionOpen(false);
  }

  function pickBusinessLine(id: string) {
    const line = BUSINESS_LINES.find(l => l.id === id);
    setBusinessLine(id);
    setLineOpen(false);
    if (line) setSelectedDataset(line.dataset);
  }

  function handleAttach() {
    setAttachTip(true);
    window.setTimeout(() => setAttachTip(false), 2600);
  }

  // 【阶段一】生成需求澄清 + SQL 草案（不执行）
  function handlePlan() {
    const q = question.trim();
    if (!q) { setError('请输入业务问题'); return; }
    setError('');
    setStage('planning');
    setPlan(null);
    setConfirm(null);
    setMentionOpen(false);
    setLineOpen(false);
    fetch('/api/enterprise-bi/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, dataset_id: selectedDataset, deep: deepResearch }),
    })
      .then(r => r.json())
      .then((d: PlanResponse) => {
        if (d.error) { setError(d.error); setStage('idle'); return; }
        setPlan(d);
        setStage('planned');
      })
      .catch(e => { setError('生成草案失败：' + e); setStage('idle'); });
  }

  // 【阶段二】用户确认 SQL 后执行
  function handleConfirm() {
    if (!plan) return;
    setStage('confirming');
    setError('');
    fetch('/api/enterprise-bi/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan_id: plan.plan_id,
        confirmed: true,
        dataset_id: plan.dataset_id ?? selectedDataset,
      }),
    })
      .then(r => r.json())
      .then((d: ConfirmResponse) => {
        if (d.error) { setError(d.error); setStage('planned'); return; }
        setConfirm(d);
        setStage('done');
        refreshStatus();
      })
      .catch(e => { setError('执行查询失败：' + e); setStage('planned'); });
  }

  function handleReset() {
    setStage('idle');
    setPlan(null);
    setConfirm(null);
    setError('');
    setQuestion('');
  }

  const st = status ? STATUS_STYLE[status.connection_status] || STATUS_STYLE.unconfigured : null;
  const chipDatasets = showAllDatasets ? datasets : datasets.slice(0, 3);

  return (
    <div className="flex-1 h-[calc(100vh-64px)] overflow-y-auto">
      <div className="page-padding-responsive" style={{ maxWidth: 960, margin: '0 auto', padding: '30px 48px 64px 48px', display: 'flex', flexDirection: 'column', rowGap: 18 }}>

        {/* 顶部：数据源身份 + 状态 + 快捷入口 */}
        <div className="bg-white" style={{ border: '1px solid #ECEDF1', borderRadius: 12, padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div className="flex items-center" style={{ gap: 10 }}>
            <span style={{ width: 32, height: 32, borderRadius: 9, background: GRADIENT_BTN, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
              <Building2 size={16} />
            </span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#252931', lineHeight: 1.3 }}>
                {status?.display_name || '风神 BI'} · 智能问数
              </div>
              <div style={{ fontSize: 11.5, color: '#898B8F' }}>需求澄清 → SQL 草案确认 → 执行取数</div>
            </div>
            {st && (
              <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, fontWeight: 500, background: st.bg, color: st.color }}>
                {st.label}
              </span>
            )}
          </div>
          <div className="flex items-center" style={{ gap: 16 }}>
            <button
              onClick={() => dispatch({ type: 'SET_PAGE', payload: 'settings' })}
              className="flex items-center"
              style={{ gap: 5, fontSize: 12, color: '#565960', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <Settings size={13} /> 凭证配置
            </button>
            <button
              onClick={refreshStatus}
              className="flex items-center"
              style={{ gap: 5, fontSize: 12, color: '#B758ED', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <RefreshCw size={12} /> 刷新状态
            </button>
          </div>
        </div>

        {/* 分析中 / 有结果：步骤指示器 */}
        {stage !== 'idle' && <StepIndicator stage={stage} />}

        {/* planning 加载占位 */}
        {stage === 'planning' && (
          <div className="bg-white flex items-center justify-center" style={{ border: '1px solid #ECEDF1', borderRadius: 16, padding: '52px 0', gap: 10, color: '#B758ED', fontSize: 13.5 }}>
            <Loader2 size={18} className="animate-spin" /> 正在理解需求、识别指标口径并生成 SQL 草案…
          </div>
        )}

        {/* 欢迎语 + 问数输入卡片（仅 idle 态展示，对齐 DataBot 问数入口） */}
        {stage === 'idle' && (
          <>
            <div style={{ textAlign: 'center', padding: '22px 0 2px' }}>
              <h2 style={{ fontSize: 27, fontWeight: 700, color: '#252931', margin: 0, letterSpacing: 0.5 }}>
                你好，我是语义分析 Agent
              </h2>
              <p style={{ fontSize: 13.5, color: '#898B8F', margin: '10px 0 0', lineHeight: 1.7 }}>
                直接提问自动取数分析，支持自动识别指标 / 时间 / 维度，或点选下方数据表指定分析范围
              </p>
            </div>

            {/* 常用数据表 chips */}
            <div className="flex items-center" style={{ gap: 10, overflowX: 'auto', padding: '4px 2px' }}>
              <span className="flex items-center" style={{ fontSize: 13, fontWeight: 600, color: '#565960', whiteSpace: 'nowrap', gap: 5 }}>
                <Database size={14} style={{ color: '#B758ED' }} /> 常用数据表
              </span>
              {chipDatasets.map(ds => {
                const active = selectedDataset === ds.id;
                return (
                  <button
                    key={ds.id}
                    onClick={() => toggleDataset(ds.id)}
                    title={ds.description || ds.name}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', cursor: 'pointer',
                      fontSize: 12.5, padding: '7px 13px', borderRadius: 10,
                      border: `1px solid ${active ? '#B758ED' : '#E5E6EB'}`,
                      background: active ? '#FBF7FF' : '#fff',
                      color: active ? '#7A4DB8' : '#252931', fontWeight: active ? 600 : 400,
                    }}
                  >
                    <Plus size={13} style={{ color: active ? '#B758ED' : '#B0B5BD' }} />
                    <Sparkles size={13} style={{ color: '#B758ED' }} />
                    {ds.name}
                  </button>
                );
              })}
              {datasets.length > 3 && (
                <button
                  onClick={() => setShowAllDatasets(v => !v)}
                  className="flex items-center"
                  style={{ whiteSpace: 'nowrap', fontSize: 12.5, color: '#B758ED', background: 'none', border: 'none', cursor: 'pointer', padding: '7px 6px', gap: 2 }}
                >
                  {showAllDatasets ? '收起' : '更多数据表'}
                  <ChevronRight size={13} style={{ transform: showAllDatasets ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} />
                </button>
              )}
            </div>

            {/* 大输入卡片 */}
            <div style={{ background: '#fff', border: '1px solid #E9EAF0', borderRadius: 16, padding: '16px 16px 12px', boxShadow: '0 6px 24px rgba(120,80,180,0.07)' }}>
              <textarea
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handlePlan(); }}
                placeholder={`直接提问自动取数分析，支持自动识别指标 / 时间 / 维度${selectedDatasetName ? `，当前指定数据表「${selectedDatasetName}」` : '，或点选上方数据表'}…\n（${currentLine.hint}）`}
                rows={4}
                style={{ width: '100%', resize: 'none', border: 'none', outline: 'none', fontSize: 14.5, color: '#252931', fontFamily: 'inherit', lineHeight: 1.7, boxSizing: 'border-box', background: 'transparent' }}
              />

              {/* 底部工具栏 */}
              <div className="flex items-center justify-between" style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                <div className="flex items-center" style={{ gap: 8, flexWrap: 'wrap' }}>
                  {/* @ 提及数据表 */}
                  <div style={{ position: 'relative' }}>
                    <IconBtn title="@ 引用数据表" active={mentionOpen} onClick={() => setMentionOpen(o => !o)}><AtSign size={15} /></IconBtn>
                    {mentionOpen && (
                      <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, width: 248, background: '#fff', border: '1px solid #ECEDF1', borderRadius: 10, boxShadow: '0 10px 28px rgba(0,0,0,0.12)', padding: 6, zIndex: 30 }}>
                        <div style={{ fontSize: 11, color: '#898B8F', padding: '4px 8px 6px' }}>选择要引用的数据表</div>
                        {datasets.length === 0 && <div style={{ fontSize: 12, color: '#B0B5BD', padding: '8px 10px' }}>暂无可用数据表</div>}
                        {datasets.map(ds => (
                          <button
                            key={ds.id}
                            onClick={() => toggleDataset(ds.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12.5, background: selectedDataset === ds.id ? '#FBF7FF' : 'transparent', color: selectedDataset === ds.id ? '#7A4DB8' : '#252931' }}
                          >
                            <Database size={13} style={{ color: '#B758ED', flexShrink: 0 }} />
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ds.name}</span>
                            {selectedDataset === ds.id && <CheckCircle2 size={13} style={{ color: '#B758ED' }} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 附件（演示环境不支持） */}
                  <div style={{ position: 'relative' }}>
                    <IconBtn title="附件（演示环境暂不支持）" onClick={handleAttach}><Paperclip size={15} /></IconBtn>
                    {attachTip && (
                      <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, width: 210, background: '#2A2B33', color: '#fff', fontSize: 11.5, lineHeight: 1.5, padding: '7px 10px', borderRadius: 7, zIndex: 30 }}>
                        演示环境暂不支持附件上传
                      </div>
                    )}
                  </div>

                  {/* 深入研究开关 */}
                  <button
                    onClick={() => setDeepResearch(v => !v)}
                    className="flex items-center"
                    style={{ gap: 7, height: 34, padding: '0 12px', borderRadius: 9, border: `1px solid ${deepResearch ? '#E6D3FA' : '#E5E6EB'}`, background: deepResearch ? '#FBF7FF' : '#fff', cursor: 'pointer', fontSize: 12.5, color: deepResearch ? '#7A4DB8' : '#565960' }}
                  >
                    深入研究
                    <span style={{ width: 32, height: 18, borderRadius: 11, background: deepResearch ? GRADIENT_BTN : '#D7D9DE', position: 'relative', transition: 'all .2s', display: 'inline-block', flexShrink: 0 }}>
                      <span style={{ position: 'absolute', top: 2, left: deepResearch ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'all .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
                    </span>
                  </button>

                  {/* 业务线下拉 */}
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => setLineOpen(o => !o)}
                      className="flex items-center"
                      style={{ gap: 6, height: 34, padding: '0 12px', borderRadius: 9, border: '1px solid #E5E6EB', background: '#fff', cursor: 'pointer', fontSize: 12.5, color: '#252931' }}
                    >
                      {currentLine.label}
                      <ChevronDown size={14} style={{ color: '#898B8F', transform: lineOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                    </button>
                    {lineOpen && (
                      <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, width: 184, background: '#fff', border: '1px solid #ECEDF1', borderRadius: 10, boxShadow: '0 10px 28px rgba(0,0,0,0.12)', padding: 6, zIndex: 30 }}>
                        {BUSINESS_LINES.map(l => (
                          <button
                            key={l.id}
                            onClick={() => pickBusinessLine(l.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12.5, background: businessLine === l.id ? '#FBF7FF' : 'transparent', color: businessLine === l.id ? '#7A4DB8' : '#252931' }}
                          >
                            <Sparkles size={13} style={{ color: '#B758ED' }} /> {l.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 右：队列状态 + 开始分析 */}
                <div className="flex items-center" style={{ gap: 14 }}>
                  <span className="flex items-center" style={{ gap: 6, fontSize: 12, color: '#898B8F' }}>
                    {busy
                      ? <Loader2 size={13} className="animate-spin" style={{ color: '#B758ED' }} />
                      : <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#00B42A', display: 'inline-block' }} />}
                    {busy ? '分析中' : '队列空闲'}
                  </span>
                  <button
                    onClick={handlePlan}
                    disabled={busy}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 600,
                      padding: '9px 20px', borderRadius: 10, border: 'none',
                      cursor: busy ? 'not-allowed' : 'pointer', background: GRADIENT_BTN, color: '#fff',
                      boxShadow: '0 4px 14px rgba(183,88,237,0.32)', opacity: busy ? 0.7 : 1,
                    }}
                  >
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <>开始分析 <ArrowUpRight size={15} /></>}
                  </button>
                </div>
              </div>

              {error && (
                <div style={{ marginTop: 12, fontSize: 12.5, color: '#C63838', background: '#FFF1F0', border: '1px solid #FFCDC8', borderRadius: 8, padding: '8px 12px' }}>
                  {error}
                </div>
              )}
            </div>

            {/* 示例问题快捷填充 */}
            <div className="flex flex-wrap" style={{ gap: 8, justifyContent: 'center' }}>
              {BUSINESS_LINES.map(l => (
                <button
                  key={l.id}
                  onClick={() => { setQuestion(l.hint.replace(/^如：/, '')); setSelectedDataset(l.dataset); }}
                  style={{ fontSize: 12, padding: '6px 14px', borderRadius: 20, cursor: 'pointer', border: '1px solid #EDE3FB', background: '#FBFAFE', color: '#7A4DB8' }}
                >
                  {l.hint}
                </button>
              ))}
            </div>
          </>
        )}

        {/* 【阶段一结果】需求确认 + SQL 草案 */}
        {plan && (stage === 'planned' || stage === 'confirming' || stage === 'done') && (
          <PlanCard plan={plan} onConfirm={handleConfirm} confirming={stage === 'confirming'} done={stage === 'done'} />
        )}

        {/* 【阶段二结果】执行结果 + 图表 + 分析 */}
        {confirm && stage === 'done' && <ResultCard confirm={confirm} onReset={handleReset} />}

        {/* 底部安全说明 */}
        <div style={{ background: '#FBFAFE', border: '1px solid #EDE3FB', borderRadius: 12, padding: '14px 18px' }}>
          <div className="flex items-start gap-2 text-[12px]" style={{ color: '#4A3A6B', lineHeight: 1.8 }}>
            <ShieldCheck size={14} style={{ color: '#B758ED', flexShrink: 0, marginTop: 2 }} />
            <span>
              企业 BI 凭证由后端内存托管，密钥不落浏览器持久化、不明文回显。取数经风神 MCP 通道：
              未配置内网网关 / 凭证时，需求识别与 SQL 草案为真实能力，最终取数为明确标注的模拟数据；
              配置 MCP 网关与凭证后即自动切换为真实取数。
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== 问数入口图标按钮 ====================
function IconBtn({ children, onClick, title, active }: {
  children: React.ReactNode; onClick: () => void; title?: string; active?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 34, height: 34, borderRadius: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${active ? '#E6D3FA' : '#E5E6EB'}`, background: active ? '#FBF7FF' : '#fff',
        color: active ? '#B758ED' : '#565960', cursor: 'pointer', padding: 0,
      }}
    >
      {children}
    </button>
  );
}

// ==================== 步骤指示器 ====================
function StepIndicator({ stage }: { stage: string }) {
  const steps = [
    { key: 'plan', label: '需求确认', icon: <Target size={13} /> },
    { key: 'sql', label: 'SQL 确认', icon: <FileText size={13} /> },
    { key: 'run', label: '执行取数', icon: <Database size={13} /> },
  ];
  // 当前到达的步骤索引
  const activeIdx = stage === 'idle' || stage === 'planning' ? 0
    : stage === 'planned' || stage === 'confirming' ? 1 : 2;
  return (
    <div className="flex items-center" style={{ gap: 4 }}>
      {steps.map((s, i) => {
        const reached = stage !== 'idle' && i <= activeIdx;
        const active = i === activeIdx && stage !== 'idle';
        return (
          <div key={s.key} className="flex items-center" style={{ gap: 4 }}>
            <div className="flex items-center gap-1.5" style={{
              fontSize: 12, fontWeight: active ? 600 : 400,
              color: reached ? '#B758ED' : '#B0B5BD',
            }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 22, height: 22, borderRadius: '50%',
                background: reached ? '#B758ED' : '#F0F1F3', color: reached ? '#fff' : '#B0B5BD',
              }}>{s.icon}</span>
              {s.label}
            </div>
            {i < steps.length - 1 && <div style={{ width: 28, height: 1, background: i < activeIdx ? '#B758ED' : '#E5E6EB', margin: '0 6px' }} />}
          </div>
        );
      })}
    </div>
  );
}

// ==================== 阶段一：需求确认 + SQL 草案卡片 ====================
function PlanCard({ plan, onConfirm, confirming, done }: {
  plan: PlanResponse; onConfirm: () => void; confirming: boolean; done: boolean;
}) {
  return (
    <div className="bg-white" style={{ border: '1px solid #ECEDF1', borderRadius: 4, padding: 22 }}>
      <div className="flex items-center gap-2 mb-4">
        <CheckCircle2 size={15} style={{ color: '#B758ED' }} />
        <span className="text-[13px] font-semibold" style={{ color: '#252931' }}>需求确认与 SQL 草案</span>
        <span style={{ fontSize: 10.5, padding: '1px 7px', borderRadius: 3, background: '#F0EBFA', color: '#7A4DB8', fontWeight: 500 }}>
          {SQL_SOURCE_LABEL[plan.sql_source] || plan.sql_source}
        </span>
      </div>

      {/* 澄清问题 */}
      {plan.needs_clarification && (
        <div style={{ background: '#FFF7E6', border: '1px solid #FFE7BA', borderRadius: 4, padding: '12px 14px', marginBottom: 14 }}>
          <div className="flex items-center gap-1.5 mb-1.5" style={{ fontSize: 12.5, fontWeight: 600, color: '#874A20' }}>
            <AlertTriangle size={13} /> 需求待澄清（{plan.clarification_questions.length}）
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {plan.clarification_questions.map((q, i) => (
              <li key={i} style={{ fontSize: 12.5, color: '#874A20', lineHeight: 1.8 }}>{q}</li>
            ))}
          </ul>
          <p className="text-[11.5px] m-0 mt-1.5" style={{ color: '#B25E00' }}>
            您可补充信息后重新生成，也可按下方「系统假设」直接确认执行。
          </p>
        </div>
      )}

      {/* 系统假设 */}
      {plan.assumptions.length > 0 && (
        <div style={{ background: '#F5F9FF', border: '1px solid #D6E6FF', borderRadius: 4, padding: '12px 14px', marginBottom: 14 }}>
          <div className="flex items-center gap-1.5 mb-1.5" style={{ fontSize: 12.5, fontWeight: 600, color: '#1E5BB8' }}>
            <Lightbulb size={13} /> 系统假设
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {plan.assumptions.map((a, i) => (
              <li key={i} style={{ fontSize: 12.5, color: '#1E5BB8', lineHeight: 1.8 }}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 命中要素 */}
      <div className="flex flex-wrap" style={{ gap: 8, marginBottom: 14 }}>
        <ElementTag icon={<Target size={11} />} label="命中指标"
          values={plan.matched_metrics.length ? plan.matched_metrics.map(m => m.name) : ['未明确']}
          highlight={plan.matched_metrics.length > 0} />
        <ElementTag icon={<Clock size={11} />} label="时间范围"
          values={[plan.time_range || '默认上月']} highlight={!!plan.time_range} />
        <ElementTag icon={<Tag size={11} />} label="分析维度"
          values={plan.dimensions.length ? plan.dimensions : ['整体汇总']} highlight={plan.dimensions.length > 0} />
      </div>

      {/* SQL 草案 */}
      <div className="text-[12px] font-semibold mb-2" style={{ color: '#252931' }}>
        <FileText size={12} style={{ display: 'inline', marginRight: 5, color: '#B758ED' }} />
        SQL 草案（待人工确认，尚未执行）
      </div>
      <pre style={{
        margin: 0, padding: '14px 16px', borderRadius: 4, background: '#2A2B33', color: '#E6E6E6',
        fontSize: 12.5, lineHeight: 1.7, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {plan.sql_draft}
      </pre>

      {/* 确认按钮 */}
      {!done && (
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <button
            onClick={onConfirm}
            disabled={confirming}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500,
              padding: '9px 22px', borderRadius: 4, border: 'none', cursor: 'pointer',
              background: confirming ? '#9A6FC4' : '#B758ED', color: '#fff',
            }}
          >
            {confirming ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            {confirming ? '正在执行...' : '确认 SQL 并执行'}
          </button>
          <span className="text-[11.5px]" style={{ color: '#898B8F' }}>
            点击即表示您确认上述口径与 SQL，系统将通过企业 BI 数据源执行取数。
          </span>
        </div>
      )}
    </div>
  );
}

function ElementTag({ icon, label, values, highlight }: {
  icon: React.ReactNode; label: string; values: string[]; highlight: boolean;
}) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 4,
      background: highlight ? '#FBF7FF' : '#F5F6F8', border: `1px solid ${highlight ? '#E6D3FA' : '#ECEDF1'}`,
    }}>
      <span style={{ color: highlight ? '#B758ED' : '#898B8F', display: 'inline-flex' }}>{icon}</span>
      <span style={{ fontSize: 11.5, color: '#898B8F' }}>{label}：</span>
      {values.map((v, i) => (
        <span key={i} style={{ fontSize: 11.5, fontWeight: 600, color: highlight ? '#7A4DB8' : '#898B8F' }}>{v}</span>
      ))}
    </div>
  );
}

// ==================== 阶段二：执行结果 + 图表 + 分析 ====================
function ResultCard({ confirm, onReset }: { confirm: ConfirmResponse; onReset: () => void }) {
  const { result, chart_suggestion, summary, mock, mock_note, pending_integration } = confirm;
  const data = result.columns.length
    ? result.rows.map(r => Object.fromEntries(result.columns.map((c, i) => [c, r[i]])))
    : [];

  return (
    <div className="bg-white" style={{ border: '1px solid #ECEDF1', borderRadius: 4, padding: 22 }}>
      <div className="flex items-center justify-between mb-4 flex-wrap" style={{ gap: 8 }}>
        <div className="flex items-center gap-2">
          <Database size={15} style={{ color: '#B758ED' }} />
          <span className="text-[13px] font-semibold" style={{ color: '#252931' }}>执行结果</span>
          {confirm.audited && (
            <span style={{ fontSize: 10.5, padding: '1px 7px', borderRadius: 3, background: '#EAFBF1', color: '#0F8A2F', fontWeight: 500 }}>
              ✓ 已经人工确认
            </span>
          )}
        </div>
        <span className="text-[11.5px]" style={{ color: '#898B8F', fontFamily: 'var(--font-mono)' }}>
          {result.rowCount} 行 · {result.executionTimeMs.toFixed(0)} ms
        </span>
      </div>

      {/* Mock / 待联调 提示 */}
      {(mock || pending_integration) && (
        <div style={{ background: '#FFF7E6', border: '1px solid #FFE7BA', borderRadius: 4, padding: '10px 14px', marginBottom: 16 }}>
          <div className="flex items-center gap-1.5" style={{ fontSize: 12.5, fontWeight: 600, color: '#874A20' }}>
            <AlertTriangle size={13} /> {pending_integration ? '凭证已配置 · 真实接口待联调' : 'Mock 演示数据'}
          </div>
          <p className="text-[12px] m-0 mt-1" style={{ color: '#B25E00', lineHeight: 1.7 }}>
            {mock_note || '风神 BI 真实 API 待接入，当前结果为模拟数据；需求识别与 SQL 草案为真实生成。'}
          </p>
        </div>
      )}

      {!result.success ? (
        <div style={{ background: '#FFF1F0', border: '1px solid #FFCDC8', borderRadius: 4, padding: '12px 14px', fontSize: 12.5, color: '#C63838' }}>
          查询失败：{result.error}
        </div>
      ) : (
        <>
          {/* 可视化区 */}
          <ChartArea type={chart_suggestion.type} data={data} columns={result.columns} xField={chart_suggestion.xField} />

          {/* 图表建议说明 */}
          <p className="text-[11.5px] m-0 mt-2 mb-4" style={{ color: '#898B8F' }}>
            <Lightbulb size={11} style={{ display: 'inline', marginRight: 4 }} />
            图表建议：{chart_suggestion.reason}
          </p>

          {/* 明细表格 */}
          <div className="text-[12px] font-semibold mb-2" style={{ color: '#252931' }}>
            <Table2 size={12} style={{ display: 'inline', marginRight: 5, color: '#B758ED' }} />
            结果明细
          </div>
          <div style={{ overflowX: 'auto', border: '1px solid #F1F2F3', borderRadius: 4 }}>
            <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  {result.columns.map(c => (
                    <th key={c} style={{
                      textAlign: 'left', padding: '8px 12px', background: '#F5F6F8',
                      borderBottom: '1px solid #ECEDF1', fontFamily: 'var(--font-mono)',
                      fontWeight: 600, color: '#565960', whiteSpace: 'nowrap',
                    }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.slice(0, 50).map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} style={{
                        padding: '7px 12px', borderBottom: '1px solid #F5F6F8',
                        fontFamily: 'var(--font-mono)', color: '#252931', whiteSpace: 'nowrap',
                      }}>{typeof cell === 'number' ? cell.toLocaleString() : String(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 分析结论 */}
          {summary.key_findings.length > 0 && (
            <div style={{ background: '#FBFAFE', border: '1px solid #EDE3FB', borderRadius: 4, padding: '14px 16px', marginTop: 16 }}>
              <div className="text-[12.5px] font-semibold mb-2" style={{ color: '#4A3A6B' }}>分析结论</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {summary.key_findings.map((f, i) => (
                  <li key={i} style={{ fontSize: 12.5, color: '#4A3A6B', lineHeight: 1.9 }}>{f}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <div className="mt-5">
        <button
          onClick={onReset}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13,
            padding: '8px 18px', borderRadius: 4, cursor: 'pointer',
            border: '1px solid #D9BAF7', background: '#fff', color: '#B758ED', fontWeight: 500,
          }}
        >
          <RefreshCw size={13} /> 再问一个
        </button>
      </div>
    </div>
  );
}

// ==================== 图表渲染（KPI / 柱状 / 折线 / 表格兜底） ====================
function ChartArea({ type, data, columns, xField }: {
  type: string; data: Record<string, any>[]; columns: string[]; xField?: string;
}) {
  if (!data.length) return <p style={{ fontSize: 12.5, color: '#898B8F' }}>无结果数据。</p>;

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

  // 兜底：不额外渲染（下方有明细表格）
  return null;
}
