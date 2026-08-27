export default function SettingsPage() {
  const projectInfo: [string, string][] = [
    ['项目名称', 'NoSQL · 基于指标语义层的经营分析智能助手'],
    ['项目类型', '本科毕业设计'],
    ['作者', '陈琦'],
    ['专业', '数据科学与大数据技术'],
  ];

  const techStack = ['React 18', 'TypeScript', 'Tailwind CSS v4', 'Python Flask', 'SQLite', 'LLM (Doubao)'];

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
