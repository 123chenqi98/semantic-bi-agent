import { MessageSquarePlus, TrendingUp, LineChart, ShieldCheck } from 'lucide-react';
import { exampleGroups } from '../../mock/data';

interface WelcomePageProps {
  onSelectQuestion: (q: string) => void;
}

// 分组图标：业务问数 / 趋势分析 / 结果追问与图表
function GroupIcon({ groupKey }: { groupKey: string }) {
  if (groupKey === 'trend') return <TrendingUp size={14} style={{ color: '#B758ED', flexShrink: 0 }} />;
  if (groupKey === 'followup') return <LineChart size={14} style={{ color: '#B758ED', flexShrink: 0 }} />;
  return <MessageSquarePlus size={14} style={{ color: '#B758ED', flexShrink: 0 }} />;
}

export default function WelcomePage({ onSelectQuestion }: WelcomePageProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '64px 48px 56px 48px' }}>
        {/* Hero 区 */}
        <div className="flex flex-col items-center text-center mb-10">
          <div
            className="mb-4 inline-flex items-center"
            style={{
              height: 28,
              padding: '0 12px',
              borderRadius: 999,
              background: '#F5F0FF',
              color: '#B758ED',
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: '0.01em',
              border: '1px solid #EADDFF',
            }}
          >
            语义增强型经营分析助手
          </div>
          <h1
            className="mb-3"
            style={{ fontSize: 26, fontWeight: 600, color: '#252931', letterSpacing: '-0.03em', lineHeight: 1.15 }}
          >
            用一句话，完成一次经营分析
          </h1>
          <p
            className="text-[13.5px]"
            style={{ color: '#565960', lineHeight: 1.85, maxWidth: 600 }}
          >
            自然语言提问即可：系统先对齐需求与 SQL 口径，<b>您确认后才执行查询</b>，
            结果以结构化分析工作台呈现，支持追问、导出与图表生成。
          </p>
          <div
            className="inline-flex items-center gap-1.5 mt-4"
            style={{ fontSize: 12, color: '#6D39C7', background: '#F5F0FF', border: '1px solid #E6D3FA', borderRadius: 999, padding: '5px 14px' }}
          >
            <ShieldCheck size={13} />
            全程只读查询 · SQL 需确认后执行 · 当前数据源：本地零售数据集（真实可查）
          </div>
        </div>

        {/* 三类典型任务示例 */}
        <div className="w-full" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {exampleGroups.map(group => (
            <div key={group.key}>
              <div className="flex items-center gap-2 mb-2">
                <GroupIcon groupKey={group.key} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#252931' }}>{group.title}</span>
                <span style={{ fontSize: 11.5, color: '#B0B5BD' }}>{group.desc}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', rowGap: 8 }}>
                {group.items.map((item, i) => (
                  <button
                    key={i}
                    onClick={() => onSelectQuestion(item.q)}
                    className="text-left"
                    style={{
                      padding: '12px 16px',
                      background: '#FFFFFF',
                      border: '1px solid #F1F2F3',
                      borderRadius: 4,
                      color: '#252931',
                      fontSize: 13.5,
                      lineHeight: 1.6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      transition: 'background .15s, border-color .15s',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = '#FBF9FE';
                      e.currentTarget.style.borderColor = '#D9BAF7';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = '#FFFFFF';
                      e.currentTarget.style.borderColor = '#F1F2F3';
                    }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 500 }}>{item.q}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: '#B0B5BD', marginTop: 2 }}>
                        {item.metric} · {item.period}
                      </span>
                    </span>
                    <span
                      style={{
                        color: '#B0B5BD',
                        fontSize: 12,
                        flexShrink: 0,
                        marginLeft: 8,
                      }}
                    >
                      立即提问
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-[12px] mt-8" style={{ color: '#B0B5BD' }}>
          点击任意示例即可开始，或在下方输入框直接提出你的业务问题
        </p>
      </div>
    </div>
  );
}
