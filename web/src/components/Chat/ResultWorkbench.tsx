import { useState } from 'react';
import {
  ClipboardList, Database, ShieldCheck, AlertTriangle, Lightbulb, Table2,
  Download, BarChart3, Edit3, ArrowRight, Inbox, FileWarning, CheckCircle2,
  Code2, Copy, Check,
} from 'lucide-react';
import type { AIMessage } from '../../types';
import { useApp } from '../../store/ChatContext';
import ResultChart from '../common/ResultChart';

// ==================== 结果分析工作台（第三轮） ====================
// 结构化分区：执行摘要 → 数据来源与口径 → 核心发现 → 图表 → 结果表（可导出）→ 风险提醒 → 下一步动作
// 正常 / 空结果 / 异常结果 / 前端 Mock 四种状态差异化展示；所有结论来自后端基于真实数据行的计算。

function SectionTitle({ icon, title, extra }: { icon: React.ReactNode; title: string; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between flex-wrap" style={{ gap: 8, marginBottom: 10 }}>
      <div className="flex items-center gap-2" style={{ fontSize: 13, fontWeight: 600, color: '#252931' }}>
        <span style={{ color: '#B758ED', display: 'inline-flex' }}>{icon}</span>
        {title}
      </div>
      {extra}
    </div>
  );
}

function Chip({ children, tone = 'gray' }: { children: React.ReactNode; tone?: 'gray' | 'purple' | 'green' | 'amber' | 'red' }) {
  const tones: Record<string, { bg: string; color: string; border: string }> = {
    gray: { bg: '#F5F6F8', color: '#565960', border: '#ECEDF1' },
    purple: { bg: '#F5F0FF', color: '#6D39C7', border: '#E6D3FA' },
    green: { bg: '#EAFBF1', color: '#0F8A2F', border: '#BFEBD0' },
    amber: { bg: '#FFF7E6', color: '#B25E00', border: '#FFE7BA' },
    red: { bg: '#FFF1F0', color: '#C63838', border: '#FFCDC8' },
  };
  const t = tones[tone];
  return (
    <span style={{
      fontSize: 11.5, fontWeight: 500, padding: '2px 9px', borderRadius: 3,
      background: t.bg, color: t.color, border: `1px solid ${t.border}`, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

function buildCsv(msg: AIMessage): string {
  const { columns, rows } = msg.result!;
  const esc = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // 单值（1列1行）→ 补成"指标,数值"两列，导出更可用
  if (columns.length === 1 && rows.length === 1) {
    return ['metric,value', `${esc(columns[0])},${esc(rows[0][0])}`].join('\n');
  }
  if (columns.length === 1 && rows.length > 1) {
    const lines = [`序号,${esc(columns[0])}`];
    rows.forEach((r, i) => lines.push(`${i + 1},${esc(r[0])}`));
    return lines.join('\n');
  }
  const lines = [columns.map(esc).join(',')];
  for (const row of rows) lines.push(row.map(esc).join(','));
  return lines.join('\n');
}

const NUMERIC_KEYS = /(amount|cnt|count|num|rate|pct|ratio|share|sales|price|total|sum|avg|max|min|额|量|数|率|占比|金额)/i;

export default function ResultWorkbench({ message, onAsk }: { message: AIMessage; onAsk: (q: string) => void }) {
  const { dispatch } = useApp();
  const result = message.result!;
  const hasError = !result.success;
  const isEmpty = result.success && result.rowCount === 0;
  const [sqlCopied, setSqlCopied] = useState(false);

  // 复制实际执行的 SQL（结果页作为可交付的工作成果，便于讲解与留档）
  const copySql = () => {
    const sql = message.sql || '';
    if (!sql) return;
    navigator.clipboard?.writeText(sql).then(() => {
      setSqlCopied(true);
      setTimeout(() => setSqlCopied(false), 1500);
    }).catch(() => {});
  };
  // 前端降级（离线 Mock）：后端 provenance 不存在时的兜底标注
  const isFrontMock = !message.provenance && !hasError && !!message.degraded;

  const provenance = message.provenance ?? {
    dataset: '前端内置演示数据（离线 Mock，非真实查询）',
    timeRange: message.timeRange || '',
    fixedFilters: message.filters || [],
    executionMode: '离线模拟',
    stagedConfirm: false,
    bankFallback: false,
    mockMode: true,
  };
  const usageVerdict = message.usageVerdict ?? (isFrontMock
    ? { usable: false, label: '仅适合演示', reason: '当前为前端离线模拟数据，不代表真实查询结果。' }
    : undefined);

  const findings = (message.findings && message.findings.length > 0)
    ? message.findings
    : (message.summary?.key_findings || []);

  const chartData = result.columns.length && !hasError
    ? result.rows.map(r => Object.fromEntries(result.columns.map((c, i) => [c, r[i]])))
    : [];

  const exportCsv = () => {
    const csv = buildCsv(message);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `问数结果_${(message.timeRange || 'data').replace(/[\\/:*?"<>|]/g, '')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const goChartAssistant = () => {
    const metricNames = (message.matchedMetrics || []).map(m => m.name).join('/') || '查询结果';
    dispatch({
      type: 'SET_CHART_PAYLOAD',
      payload: {
        fileName: `${metricNames}_${message.timeRange || 'data'}.csv`,
        background: message.timeRange
          ? `时间范围：${message.timeRange}；来自对话"${message.question}"的查询结果`
          : `来自对话"${message.question}"的查询结果`,
        goal: '可视化展示本次查询结果',
        csvData: buildCsv(message),
        autoGenerate: true,
      },
    });
    dispatch({ type: 'SET_PAGE', payload: 'chartAssistant' });
  };

  // 修改口径重问：把原问题回填到输入框（ChatInput 监听该事件），用户改完直接重发
  const reviseQuestion = () => {
    window.dispatchEvent(new CustomEvent('chat:prefill', { detail: message.question }));
  };

  const cellText = (v: any) => {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'number') {
      return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return String(v);
  };

  return (
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ① 执行摘要：一句话结论 + 执行状态徽标 */}
      <div style={{ background: '#FBFAFE', border: '1px solid #EDE3FB', borderRadius: 6, padding: '14px 16px' }}>
        <SectionTitle
          icon={<ClipboardList size={14} />}
          title="执行摘要"
          extra={
            <div className="flex items-center gap-1.5 flex-wrap">
              {provenance.stagedConfirm
                ? <Chip tone="green"><ShieldCheck size={11} style={{ display: 'inline', marginRight: 3 }} />用户确认后执行</Chip>
                : <Chip tone="purple">自动取数</Chip>}
              {provenance.bankFallback && <Chip tone="amber">标准口径兜底</Chip>}
              {provenance.mockMode && <Chip tone="amber">模拟环境</Chip>}
              {isFrontMock && <Chip tone="red">前端演示数据</Chip>}
            </div>
          }
        />
        <div style={{ fontSize: 14.5, fontWeight: 600, color: '#252931', lineHeight: 1.7 }}>
          {message.conclusion || (hasError ? '查询失败，暂无可展示的结论。' : (isEmpty ? '查询已完成，但没有命中数据。' : '查询已完成。'))}
        </div>
      </div>

      {/* ② 数据来源与口径说明 */}
      <div style={{ border: '1px solid #ECEDF1', borderRadius: 6, padding: '12px 16px', background: '#fff' }}>
        <SectionTitle icon={<Database size={14} />} title="数据来源与查询口径" />
        <div className="flex items-center flex-wrap" style={{ gap: 6, marginBottom: 8 }}>
          <Chip tone="purple">{provenance.dataset}</Chip>
          {provenance.timeRange && <Chip tone="gray">时间范围：{provenance.timeRange}</Chip>}
          <Chip tone="gray">{provenance.executionMode}</Chip>
        </div>
        {(provenance.fixedFilters || []).length > 0 && (
          <div style={{ fontSize: 12, color: '#898B8F', lineHeight: 1.8 }}>
            固定口径过滤：{(provenance.fixedFilters || []).join('；')}
          </div>
        )}
        {usageVerdict && (
          <div
            className="flex items-start gap-2"
            style={{
              marginTop: 10, padding: '8px 12px', borderRadius: 4, fontSize: 12.5, lineHeight: 1.7,
              background: usageVerdict.usable ? '#F3FBF6' : '#FFF7E6',
              border: `1px solid ${usageVerdict.usable ? '#BFEBD0' : '#FFE7BA'}`,
              color: usageVerdict.usable ? '#0F6B28' : '#874A20',
            }}
          >
            {usageVerdict.usable
              ? <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              : <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />}
            <span>
              <b>可信度判定：{usageVerdict.label}</b>。{usageVerdict.reason}
            </span>
          </div>
        )}
      </div>

      {/* ②·五 SQL 依据：实际执行的 SQL（与用户确认的草案逐字一致），可复制留档 */}
      {!hasError && message.sql && (
        <div style={{ border: '1px solid #ECEDF1', borderRadius: 6, padding: '12px 16px', background: '#fff' }}>
          <SectionTitle
            icon={<Code2 size={14} />}
            title={provenance.stagedConfirm ? 'SQL 依据（已按您确认的草案执行）' : 'SQL 依据（本次执行）'}
            extra={
              <button
                onClick={copySql}
                className="flex items-center gap-1"
                style={{
                  fontSize: 11.5, padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
                  border: '1px solid #D9BAF7', background: '#fff', color: '#B758ED', fontWeight: 500,
                }}
              >
                {sqlCopied ? <Check size={12} /> : <Copy size={12} />}
                {sqlCopied ? '已复制' : '复制 SQL'}
              </button>
            }
          />
          <pre
            style={{
              margin: 0, background: '#2A2733', color: '#E8E6EF', borderRadius: 4,
              padding: '12px 14px', fontSize: 12, lineHeight: 1.7,
              fontFamily: 'var(--font-mono)', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}
          >
            {message.sql}
          </pre>
        </div>
      )}

      {/* ③ 核心发现：每条均关联具体数据；数据不足时明确声明 */}
      <div style={{ border: '1px solid #ECEDF1', borderRadius: 6, padding: '14px 16px', background: '#fff' }}>
        <SectionTitle icon={<Lightbulb size={14} />} title="核心发现" />
        {findings.length > 0 ? (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', rowGap: 7 }}>
            {findings.map((f, i) => (
              <li key={i} className="flex gap-2.5" style={{ fontSize: 13.5, color: '#252931', lineHeight: 1.8 }}>
                <span style={{ color: '#B758ED', flexShrink: 0 }}>•</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex items-start gap-2" style={{ fontSize: 13, color: '#874A20', lineHeight: 1.8 }}>
            <FileWarning size={14} style={{ flexShrink: 0, marginTop: 3 }} />
            <span>现有数据不足以支持结论（结果为空或查询失败），不输出无数据支撑的判断；请调整筛选条件或重试。</span>
          </div>
        )}
      </div>

      {/* ④ 图表展示 */}
      {!hasError && chartData.length > 0 && message.chartSpec && message.chartSpec.type !== 'table' && (
        <div style={{ border: '1px solid #ECEDF1', borderRadius: 6, padding: '14px 16px', background: '#fff' }}>
          <SectionTitle icon={<BarChart3 size={14} />} title="图表展示" />
          <ResultChart
            type={message.chartSpec.type}
            data={chartData}
            columns={result.columns}
            xField={message.chartSpec.xField}
          />
          {message.chartSpec.reason && (
            <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#898B8F' }}>
              <Lightbulb size={11} style={{ display: 'inline', marginRight: 4 }} />
              图表建议：{message.chartSpec.reason}
            </p>
          )}
        </div>
      )}

      {/* ⑤ 数据结果表（可导出 CSV） */}
      <div style={{ border: '1px solid #ECEDF1', borderRadius: 6, overflow: 'hidden', background: '#fff' }}>
        <div
          className="flex items-center justify-between flex-wrap"
          style={{ padding: '10px 16px', background: '#FBFCFD', borderBottom: '1px solid #F1F2F3', gap: 8 }}
        >
          <div className="flex items-center gap-2" style={{ fontSize: 13, fontWeight: 600, color: '#252931' }}>
            <Table2 size={13} style={{ color: '#B758ED' }} />
            数据结果表
            <span style={{ fontSize: 11.5, color: '#898B8F', fontWeight: 400, fontVariantNumeric: 'tabular-nums' }}>
              {result.rowCount} 行 · {(result.executionTimeMs || 0).toFixed(0)}ms
            </span>
          </div>
          {!hasError && result.rowCount > 0 && (
            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5"
              style={{
                fontSize: 12, padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
                border: '1px solid #D9BAF7', background: '#fff', color: '#B758ED', fontWeight: 500,
              }}
            >
              <Download size={12} /> 导出 CSV
            </button>
          )}
        </div>
        {hasError ? (
          <div style={{ padding: '14px 16px', background: '#FFF1F0', color: '#C63838', fontSize: 13, lineHeight: 1.7 }}>
            <FileWarning size={14} style={{ display: 'inline', marginRight: 6 }} />
            查询执行失败：{result.error}
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center" style={{ padding: '36px 16px', color: '#898B8F' }}>
            <Inbox size={28} style={{ marginBottom: 8, color: '#C9CDD4' }} />
            <span style={{ fontSize: 13 }}>查询成功，但没有命中任何数据行（0 行）</span>
            <span style={{ fontSize: 12, marginTop: 4 }}>建议放宽时间范围或检查筛选条件后重新查询</span>
          </div>
        ) : (
          <div className="overflow-x-auto" style={{ maxHeight: 360, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#FBFCFD' }}>
                  {result.columns.map((c, i) => {
                    const num = NUMERIC_KEYS.test(c);
                    return (
                      <th
                        key={i}
                        style={{
                          padding: '9px 16px', color: '#898B8F', borderBottom: '1px solid #F1F2F3',
                          whiteSpace: 'nowrap', fontSize: 12, fontWeight: 500, textAlign: num ? 'right' : 'left',
                          position: 'sticky', top: 0, background: '#FBFCFD',
                        }}
                      >
                        {c}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr
                    key={i}
                    style={{ borderBottom: i < result.rows.length - 1 ? '1px solid #F1F2F3' : 'none' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#FAFBFC')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
                  >
                    {row.map((cell, j) => {
                      const num = NUMERIC_KEYS.test(result.columns[j]);
                      return (
                        <td
                          key={j}
                          style={{
                            padding: '9px 16px', color: '#252931', whiteSpace: 'nowrap',
                            textAlign: num ? 'right' : 'left',
                            fontVariantNumeric: num ? 'tabular-nums' : undefined,
                            fontFamily: num ? 'var(--font-mono)' : undefined,
                          }}
                        >
                          {cellText(cell)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ⑥ 风险与口径提醒 */}
      {message.warnings && message.warnings.length > 0 && (
        <div style={{ background: '#FFF7E6', border: '1px solid #FFE7BA', borderRadius: 6, padding: '12px 16px' }}>
          <SectionTitle icon={<AlertTriangle size={14} />} title="风险与口径提醒" />
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', rowGap: 6 }}>
            {message.warnings.map((w, i) => (
              <li key={i} style={{ fontSize: 12.5, color: '#874A20', lineHeight: 1.7 }}>· {w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ⑦ 下一步建议：可继续追问 / 生成图表 / 导出 / 修改口径重问 */}
      <div style={{ border: '1px solid #ECEDF1', borderRadius: 6, padding: '14px 16px', background: '#fff' }}>
        <SectionTitle icon={<ArrowRight size={14} />} title="下一步建议" />
        <div className="flex flex-wrap" style={{ gap: 8, marginBottom: 12 }}>
          {(message.suggestions || []).map((s, i) => (
            <button
              key={i}
              onClick={() => onAsk(s)}
              className="flex items-center gap-1.5"
              style={{
                fontSize: 12.5, padding: '6px 12px', borderRadius: 16, cursor: 'pointer',
                border: '1px solid #E6D3FA', background: '#FBFAFE', color: '#6D39C7', fontWeight: 500,
              }}
            >
              {s}
              <ArrowRight size={12} />
            </button>
          ))}
        </div>
        <div className="flex items-center flex-wrap" style={{ gap: 8 }}>
          {!hasError && result.rowCount > 0 && (
            <button
              onClick={goChartAssistant}
              className="flex items-center gap-1.5"
              style={{
                fontSize: 12.5, padding: '6px 14px', borderRadius: 4, cursor: 'pointer',
                border: 'none', background: '#B758ED', color: '#fff', fontWeight: 500,
              }}
            >
              <BarChart3 size={13} /> 基于结果生成图表
            </button>
          )}
          {!hasError && result.rowCount > 0 && (
            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5"
              style={{
                fontSize: 12.5, padding: '6px 14px', borderRadius: 4, cursor: 'pointer',
                border: '1px solid #D9BAF7', background: '#fff', color: '#B758ED', fontWeight: 500,
              }}
            >
              <Download size={13} /> 导出结果表
            </button>
          )}
          <button
            onClick={reviseQuestion}
            className="flex items-center gap-1.5"
            style={{
              fontSize: 12.5, padding: '6px 14px', borderRadius: 4, cursor: 'pointer',
              border: '1px solid #D9BAF7', background: '#fff', color: '#B758ED', fontWeight: 500,
            }}
          >
            <Edit3 size={13} /> 修改口径重问
          </button>
        </div>
      </div>
    </div>
  );
}
