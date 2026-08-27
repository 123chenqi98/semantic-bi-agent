import { Circle } from 'lucide-react';
import { useApp } from '../../store/ChatContext';

export default function Header() {
  const { state } = useApp();

  const pageMeta: Record<string, { title: string; desc?: string }> = {
    chat: { title: 'NoSQL 经营分析助手' },
    chartAssistant: { title: '图表生成助手', desc: '上传 CSV / 粘贴数据，AI 智能推荐图表类型并生成可视化' },
    dictionary: { title: '指标语义词典', desc: '维护指标定义、口径规则与时间语义映射' },
    evaluation: { title: '实验评测中心', desc: '基线组 vs 实验组对照实验结果与逐题明细' },
    settings: { title: '系统设置', desc: '项目信息、技术栈与模型配置' },
  };

  const meta = pageMeta[state.currentPage];
  const isChat = state.currentPage === 'chat';

  return (
    <div
      className="shrink-0 flex items-center bg-white px-6 relative"
      style={{
        height: 64,
        borderBottom: '1px solid #F1F2F3',
        justifyContent: isChat ? 'center' : 'space-between',
      }}
    >
      {isChat ? (
        <>
          <div className="flex items-center gap-2.5">
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: '#B758ED',
                boxShadow: '0 0 0 4px rgba(183,88,237,0.12)',
                flexShrink: 0,
              }}
            />
            <h1 className="text-[18px] font-semibold" style={{ color: '#252931', letterSpacing: '-0.01em' }}>
              {meta.title}
            </h1>
          </div>
          <div
            className="absolute right-6 flex items-center gap-1.5 text-[12px]"
            style={{
              color: '#565960',
              background: '#FAFBFC',
              padding: '5px 10px',
              borderRadius: 100,
              border: '1px solid #F1F2F3',
            }}
          >
            <Circle size={6} style={{ color: '#00B42A', fill: '#00B42A' }} />
            <span>doubao-seed-2-pro</span>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col">
            <h1 className="text-[18px] font-semibold leading-tight" style={{ color: '#252931', letterSpacing: '-0.01em' }}>
              {meta.title}
            </h1>
            {meta.desc && (
              <span className="text-[12px] mt-1" style={{ color: '#898B8F' }}>{meta.desc}</span>
            )}
          </div>
          <div
            className="flex items-center gap-1.5 text-[12px]"
            style={{ color: '#565960', background: '#FAFBFC', padding: '5px 10px', borderRadius: 100, border: '1px solid #F1F2F3' }}
          >
            <Circle size={6} style={{ color: '#00B42A', fill: '#00B42A' }} />
            <span>已连接</span>
          </div>
        </>
      )}
    </div>
  );
}
