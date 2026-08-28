import { useState } from 'react';
import { ChevronRight, ChevronDown, AlertTriangle } from 'lucide-react';
import { metrics, globalRules, timeSemantics } from '../mock/data';

export default function DictionaryPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="flex-1 h-[calc(100vh-64px)] overflow-y-auto">
      <div className="page-padding-responsive" style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 48px 64px 48px', display: 'flex', flexDirection: 'column', rowGap: 32 }}>
        {/* 全局口径规则 */}
        <div className="bg-white" style={{ border: '1px solid #ECEDF1', borderRadius: 4, padding: 32 }}>
          <h3 className="text-[16px] font-semibold mb-6" style={{ color: '#252931' }}>全局口径规则</h3>
          <div style={{ rowGap: 14, display: 'flex', flexDirection: 'column' }}>
            {globalRules.map((rule, i) => (
              <div key={i} className="flex items-start gap-4 text-[14px]" style={{ color: '#252931', lineHeight: 1.8 }}>
                <span
                  className="shrink-0 flex items-center justify-center text-[12px] font-semibold"
                  style={{ width: 24, height: 24, borderRadius: 4, background: '#EADDFF', color: '#8B45C9', marginTop: 2 }}
                >{i + 1}</span>
                <span>{rule}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 时间语义映射 */}
        <div className="overflow-hidden bg-white" style={{ border: '1px solid #ECEDF1', borderRadius: 4 }}>
          <div style={{ background: '#FBFCFD', borderBottom: '1px solid #F1F2F3', padding: '16px 24px' }}>
            <h3 className="text-[14px] font-semibold" style={{ color: '#252931' }}>时间语义映射</h3>
            <p className="text-[12px] mt-1" style={{ color: '#898B8F' }}>假设今天 = 2026-07-01，数据截止 2026-06-30</p>
          </div>
          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#FBFCFD' }}>
                  <th style={{ textAlign: 'left', fontWeight: 500, fontSize: 12, color: '#898B8F', borderBottom: '1px solid #F1F2F3', padding: '12px 24px' }}>中文表达</th>
                  <th style={{ textAlign: 'left', fontWeight: 500, fontSize: 12, color: '#898B8F', borderBottom: '1px solid #F1F2F3', padding: '12px 24px' }}>日期范围</th>
                  <th style={{ textAlign: 'left', fontWeight: 500, fontSize: 12, color: '#898B8F', borderBottom: '1px solid #F1F2F3', padding: '12px 24px' }}>SQL 写法</th>
                </tr>
              </thead>
              <tbody>
                {timeSemantics.map((t, i) => (
                  <tr
                    key={i}
                    style={{ borderBottom: i < timeSemantics.length - 1 ? '1px solid #F1F2F3' : 'none' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#FAFBFC'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <td style={{ fontWeight: 500, color: '#252931', padding: '14px 24px' }}>{t.name}</td>
                    <td style={{ color: '#565960', padding: '14px 24px', fontVariantNumeric: 'tabular-nums' }}>{t.range}</td>
                    <td style={{ padding: '14px 24px' }}>
                      <code className="font-mono text-[13px]" style={{ background: '#F8F9FB', color: '#252931', padding: '4px 10px', borderRadius: 4, fontFamily: 'var(--font-mono)', border: '1px solid #F1F2F3' }}>{t.sql}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 指标词典 */}
        <div style={{ marginTop: 8 }}>
          <h3 className="text-[14px] font-semibold mb-5" style={{ color: '#252931' }}>指标词典</h3>
          <div style={{ rowGap: 8, display: 'flex', flexDirection: 'column' }}>
            {metrics.map(metric => {
              const isOpen = expandedId === metric.id;
              return (
                <div key={metric.id} className="overflow-hidden bg-white" style={{
                  border: isOpen ? '1px solid #D9BAF7' : '1px solid #ECEDF1',
                  borderRadius: 4,
                  transition: 'border-color .15s',
                }}>
                  <div
                    className="flex items-center gap-3 cursor-pointer"
                    style={{
                      padding: '14px 20px',
                      background: isOpen ? '#F7F0FF' : 'transparent',
                      borderLeft: isOpen ? '4px solid #B758ED' : '4px solid transparent',
                      paddingLeft: isOpen ? 16 : 20,
                      transition: 'background .15s',
                    }}
                    onClick={() => setExpandedId(isOpen ? null : metric.id)}
                    onMouseEnter={e => {
                      if (!isOpen) (e.currentTarget as HTMLElement).style.background = '#FAFBFC';
                    }}
                    onMouseLeave={e => {
                      if (!isOpen) (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }}
                  >
                    {isOpen
                      ? <ChevronDown size={16} style={{ color: '#B758ED', flexShrink: 0 }} />
                      : <ChevronRight size={16} style={{ color: '#898B8F', flexShrink: 0 }} />}
                    <span
                      className="font-mono font-medium text-[12px]"
                      style={{
                        background: isOpen ? '#EADDFF' : '#F5F0FF',
                        color: isOpen ? '#8B45C9' : '#B758ED',
                        padding: '3px 8px',
                        borderRadius: 4,
                        lineHeight: 1.4,
                      }}
                    >{metric.id}</span>
                    <span className="text-[14px] font-medium" style={{ color: isOpen ? '#8B45C9' : '#252931' }}>{metric.name}</span>
                    <div className="flex gap-1.5 ml-auto">
                      {metric.aliases.slice(0, 3).map(a => (
                        <span key={a} className="text-[12px]" style={{ background: '#F5F6F8', color: '#565960', padding: '3px 8px', borderRadius: 4 }}>{a}</span>
                      ))}
                    </div>
                  </div>
                  {isOpen && (
                    <div style={{
                      padding: '20px 24px 24px 48px',
                      rowGap: 18,
                      display: 'flex',
                      flexDirection: 'column',
                      background: '#FCFBFE',
                      borderTop: '1px solid #F1F2F3',
                    }}>
                      <div>
                        <div className="text-[12px] font-medium mb-2" style={{ color: '#898B8F', letterSpacing: '0.02em' }}>定义</div>
                        <p className="text-[14px]" style={{ color: '#252931', lineHeight: 1.8 }}>{metric.definition}</p>
                      </div>
                      <div>
                        <div className="text-[12px] font-medium mb-2" style={{ color: '#898B8F', letterSpacing: '0.02em' }}>SQL 计算模板</div>
                        <div className="overflow-x-auto" style={{ background: '#FFFFFF', border: '1px solid #F1F2F3', borderRadius: 4, padding: 16 }}>
                          <code
                            className="block text-[13px] leading-relaxed"
                            style={{ color: '#252931', whiteSpace: 'pre', lineHeight: 1.75, fontFamily: 'var(--font-mono)' }}
                          >
                            {metric.sql_template}
                          </code>
                        </div>
                      </div>
                      {metric.aliases.length > 3 && (
                        <div>
                          <div className="text-[12px] font-medium mb-2" style={{ color: '#898B8F', letterSpacing: '0.02em' }}>所有同义词</div>
                          <div className="flex flex-wrap" style={{ gap: 6 }}>
                            {metric.aliases.map(a => (
                              <span key={a} className="text-[12px]" style={{ background: '#F5F6F8', color: '#565960', padding: '3px 8px', borderRadius: 4 }}>{a}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {metric.confusing_notes.length > 0 && (
                        <div style={{ background: '#FFFDF5', border: '1px solid #FCEBBF', borderRadius: 4, padding: 14 }}>
                          <div className="flex items-center gap-1.5 text-[12px] font-medium mb-2" style={{ color: '#B76E00' }}>
                            <AlertTriangle size={13} /> 易混淆口径
                          </div>
                          <ul style={{ rowGap: 6, display: 'flex', flexDirection: 'column' }}>
                            {metric.confusing_notes.map((note, i) => (
                              <li key={i} className="text-[13px] flex gap-2" style={{ color: '#7D4A00', lineHeight: 1.7 }}>
                                <span style={{ color: '#FFB020' }}>•</span><span>{note}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
