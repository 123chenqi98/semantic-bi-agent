import { Circle, Menu } from 'lucide-react';
import { useApp } from '../../store/ChatContext';

interface HeaderProps {
  onToggleSidebar?: () => void;
}

export default function Header({ onToggleSidebar }: HeaderProps) {
  const { state } = useApp();

  const pageMeta: Record<string, { title: string; desc?: string }> = {
    home: { title: '工作台首页', desc: '数据源连接状态、常用功能入口与最近分析记录' },
    chat: { title: 'NoSQL 经营分析助手' },
    chartAssistant: { title: '图表生成助手', desc: '上传 CSV / 粘贴数据，AI 智能推荐图表类型并生成可视化' },
    dictionary: { title: '指标语义词典', desc: '维护指标定义、口径规则与时间语义映射' },
    evaluation: { title: '实验评测中心', desc: '基线组 vs 实验组对照实验结果与逐题明细' },
    semanticEditor: { title: '语义层管理', desc: '可视化编辑指标定义、SQL 模板、同义词与口径规则（localStorage 持久化）' },
    enterpriseBi: { title: '企业 BI 问数', desc: '连接企业 BI（风神 BI）：需求澄清 → SQL 草案确认 → 执行取数与图表分析' },
    settings: { title: '系统设置', desc: '项目信息、技术栈与模型配置' },
  };

  // 兜底：未配置标题的页面类型不再因 meta 为 undefined 而整页白屏
  const meta = pageMeta[state.currentPage] || { title: '' };
  const isChat = state.currentPage === 'chat';

  return (
    <div
      className="shrink-0 flex items-center bg-white px-4 md:px-6 relative"
      style={{
        height: 64,
        borderBottom: '1px solid #F1F2F3',
        justifyContent: isChat ? 'center' : 'space-between',
      }}
    >
      <button
        className="mobile-menu-btn"
        onClick={onToggleSidebar}
        aria-label="切换菜单"
        style={{
          display: 'none',
          width: 36,
          height: 36,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 4,
          color: '#565960',
          flexShrink: 0,
          marginRight: 8,
        }}
      >
        <Menu size={20} />
      </button>
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
            <h1 className="text-[15px] md:text-[18px] font-semibold" style={{ color: '#252931', letterSpacing: '-0.01em' }}>
              {meta.title}
            </h1>
          </div>
          <div
            className="absolute right-4 md:right-6 flex items-center gap-1.5 text-[12px]"
            style={{
              color: '#565960',
              background: '#FAFBFC',
              padding: '5px 10px',
              borderRadius: 100,
              border: '1px solid #F1F2F3',
            }}
          >
            <Circle size={6} style={{ color: '#00B42A', fill: '#00B42A' }} />
            <span className="hidden sm:inline">doubao-seed-2-pro</span>
            <span className="sm:hidden">在线</span>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col" style={{ minWidth: 0 }}>
            <h1 className="text-[16px] md:text-[18px] font-semibold leading-tight truncate" style={{ color: '#252931', letterSpacing: '-0.01em' }}>
              {meta.title}
            </h1>
            {meta.desc && (
              <span className="hidden md:block text-[12px] mt-1 truncate" style={{ color: '#898B8F' }}>{meta.desc}</span>
            )}
          </div>
          <div
            className="flex items-center gap-1.5 text-[12px] shrink-0"
            style={{ color: '#565960', background: '#FAFBFC', padding: '5px 10px', borderRadius: 100, border: '1px solid #F1F2F3' }}
          >
            <Circle size={6} style={{ color: '#00B42A', fill: '#00B42A' }} />
            <span className="hidden sm:inline">已连接</span>
          </div>
        </>
      )}
    </div>
  );
}
