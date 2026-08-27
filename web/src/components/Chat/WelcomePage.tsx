import { MessageSquarePlus } from 'lucide-react';
import { quickQuestions } from '../../mock/data';

interface WelcomePageProps {
  onSelectQuestion: (q: string) => void;
}

export default function WelcomePage({ onSelectQuestion }: WelcomePageProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '88px 48px 56px 48px' }}>
        {/* Hero 区 */}
        <div className="flex flex-col items-center text-center mb-14">
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
          <div
            className="flex items-center justify-center mb-5"
            style={{
              width: 48,
              height: 48,
              background: '#B758ED',
              borderRadius: 14,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1
            className="mb-3"
            style={{ fontSize: 28, fontWeight: 600, color: '#252931', letterSpacing: '-0.03em', lineHeight: 1.15 }}
          >
            你好，我是 NoSQL
          </h1>
          <p
            className="text-[14px]"
            style={{ color: '#565960', lineHeight: 1.85, maxWidth: 620 }}
          >
            基于指标语义层增强的经营分析智能助手。用自然语言提问即可获得准确的 SQL 查询与业务洞察，
            相比普通 Text-to-SQL 系统，结果正确率从 44% 提升至 100%。
          </p>
        </div>

        {/* 快速提问区 */}
        <div className="mb-4 flex items-center gap-3">
          <div style={{ flex: 1, height: 1, background: '#F1F2F3' }} />
          <span style={{ fontSize: 12, color: '#898B8F', fontWeight: 500, letterSpacing: '0.02em' }}>
            试试这些问题
          </span>
          <div style={{ flex: 1, height: 1, background: '#F1F2F3' }} />
        </div>

        <div className="w-full" style={{ maxWidth: 652, margin: '0 auto', display: 'flex', flexDirection: 'column', rowGap: 8 }}>
          {quickQuestions.map((q, i) => (
            <button
              key={i}
              onClick={() => onSelectQuestion(q)}
              className="text-left"
              style={{
                padding: '14px 16px',
                background: '#FFFFFF',
                border: '1px solid #F1F2F3',
                borderRadius: 4,
                color: '#252931',
                fontSize: 14,
                lineHeight: 1.6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                transition: 'background .15s, border-color .15s',
                outline: 'none',
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
              <span className="flex items-start gap-3">
                <MessageSquarePlus
                  size={15}
                  style={{ color: '#B758ED', flexShrink: 0, marginTop: 2 }}
                />
                <span>{q}</span>
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

        <p className="text-center text-[12px] mt-9" style={{ color: '#B0B5BD' }}>
          点击任意预设问题即可开始对比体验，或在下方输入框直接提问
        </p>
      </div>
    </div>
  );
}
