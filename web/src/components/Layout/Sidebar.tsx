import { useState } from 'react';
import { MessageSquare, BookOpen, FlaskConical, Settings, Plus, Trash2, ChevronDown, ExternalLink, BarChart3, SlidersHorizontal } from 'lucide-react';
import { useApp } from '../../store/ChatContext';
import type { PageType } from '../../types';

const navItems: { id: PageType; label: string; icon: React.ReactNode }[] = [
  { id: 'chat', label: 'AI 对话', icon: <MessageSquare size={16} /> },
  { id: 'chartAssistant', label: '图表生成', icon: <BarChart3 size={16} /> },
  { id: 'dictionary', label: '指标词典', icon: <BookOpen size={16} /> },
  { id: 'semanticEditor', label: '语义层管理', icon: <SlidersHorizontal size={16} /> },
  { id: 'evaluation', label: '实验评测', icon: <FlaskConical size={16} /> },
  { id: 'settings', label: '系统设置', icon: <Settings size={16} /> },
];

interface SidebarProps {
  onNavigate?: () => void;
}

export default function Sidebar({ onNavigate }: SidebarProps) {
  const { state, dispatch, currentConversation } = useApp();
  const [showHistory, setShowHistory] = useState(true);

  const chatConversations = state.conversations;

  return (
    <div
      className="shrink-0 flex flex-col h-full"
      style={{ width: 268, background: '#F9FAFD', borderRight: '1px solid #E5E6EB' }}
    >
      {/* Logo + 产品名 */}
      <div style={{ padding: '20px 20px 16px 20px' }}>
        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center justify-center shrink-0"
            style={{
              width: 32,
              height: 32,
              background: '#B758ED',
              borderRadius: 8,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <span className="text-[17px] font-semibold leading-tight truncate" style={{ color: '#252931' }}>NoSQL</span>
            <ExternalLink size={11} style={{ color: '#B0B5BD', flexShrink: 0 }} />
          </div>
        </div>
      </div>

      {/* 新建对话 */}
      <div style={{ padding: '0 16px 12px 16px' }}>
        <button
          onClick={() => dispatch({ type: 'NEW_CONVERSATION' })}
          className="w-full flex items-center justify-center gap-2 text-[14px]"
          style={{
            height: 36,
            borderRadius: 4,
            border: '1px solid #D9BAF7',
            background: '#FFFFFF',
            color: '#B758ED',
            fontWeight: 500,
            outline: 'none',
            transition: 'background .15s, border-color .15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = '#F5F0FF';
            e.currentTarget.style.borderColor = '#B758ED';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = '#FFFFFF';
            e.currentTarget.style.borderColor = '#D9BAF7';
          }}
        >
          <Plus size={15} />
          新对话
        </button>
      </div>

      {/* 导航 */}
      <div style={{ padding: '4px 12px' }}>
        {navItems.map(item => {
          const isActive = state.currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                dispatch({ type: 'SET_PAGE', payload: item.id });
                if (item.id === 'chat' && chatConversations.length > 0) {
                  dispatch({ type: 'SELECT_CONVERSATION', payload: chatConversations[0].id });
                }
                onNavigate?.();
              }}
              className="w-full flex items-center gap-2.5 text-[14px] relative outline-none"
              style={{
                height: 38,
                padding: '0 10px',
                marginBottom: 2,
                borderRadius: 4,
                background: isActive ? '#F0EBFA' : 'transparent',
                color: isActive ? '#B758ED' : '#565960',
                fontWeight: isActive ? 500 : 400,
                transition: 'background .15s, color .15s',
              }}
              onMouseEnter={e => {
                if (!isActive) e.currentTarget.style.background = '#F2F3F6';
              }}
              onMouseLeave={e => {
                if (!isActive) e.currentTarget.style.background = 'transparent';
              }}
            >
              {isActive && (
                <div
                  className="absolute"
                  style={{ left: -12, top: '50%', transform: 'translateY(-50%)', width: 3, height: 16, background: '#B758ED', borderRadius: '0 2px 2px 0' }}
                />
              )}
              <span style={{ color: isActive ? '#B758ED' : '#898B8F', display: 'inline-flex' }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* 分割线 */}
      <div style={{ margin: '12px 16px', height: 1, background: '#E5E6EB' }} />

      {/* 历史会话 */}
      {state.currentPage === 'chat' && (
        <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: '0 12px' }}>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full flex items-center justify-between text-[12px] transition-colors"
            style={{ height: 28, padding: '0 10px', color: '#898B8F', borderRadius: 6 }}
            onMouseEnter={e => (e.currentTarget.style.background = '#F2F3F6')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ fontWeight: 500, letterSpacing: '0.02em' }}>历史对话</span>
            <ChevronDown
              size={13}
              style={{
                color: '#898B8F',
                transform: showHistory ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 0.2s',
              }}
            />
          </button>
          {showHistory && (
            <div style={{ marginTop: 4 }}>
              {chatConversations.map(conv => {
                const isActive = conv.id === currentConversation.id;
                return (
                  <div
                    key={conv.id}
                    onClick={() => { dispatch({ type: 'SELECT_CONVERSATION', payload: conv.id }); onNavigate?.(); }}
                    className="group flex items-center gap-2 text-[13px] cursor-pointer transition-colors overflow-hidden relative"
                    style={{
                      height: 34,
                      padding: '0 10px',
                      marginBottom: 1,
                      borderRadius: 6,
                      background: isActive ? '#F0EBFA' : 'transparent',
                      color: isActive ? '#B758ED' : '#565960',
                      fontWeight: isActive ? 500 : 400,
                    }}
                    onMouseEnter={e => {
                      if (!isActive) e.currentTarget.style.background = '#F2F3F6';
                    }}
                    onMouseLeave={e => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <MessageSquare size={13} style={{ color: isActive ? '#B758ED' : '#898B8F', flexShrink: 0 }} />
                    <span className="truncate flex-1">{conv.title || '新对话'}</span>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        dispatch({ type: 'DELETE_CONVERSATION', payload: conv.id });
                      }}
                      className="p-1 rounded transition-opacity"
                      style={{
                        opacity: 0,
                        color: '#898B8F',
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.opacity = '1';
                        (e.currentTarget as HTMLElement).style.color = '#F53F3F';
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.opacity = '0';
                        (e.currentTarget as HTMLElement).style.color = '#898B8F';
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                    <style>{`.group:hover button { opacity: 1; }`}</style>
                  </div>
                );
              })}
              {chatConversations.length === 0 && (
                <div style={{ padding: '16px 10px', color: '#B0B5BD', fontSize: 12, textAlign: 'center' }}>
                  暂无历史对话
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 底部版本 */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid #E5E6EB', background: '#FBFBFC' }}>
        <div className="text-[11px]" style={{ color: '#B0B5BD', letterSpacing: '0.01em' }}>v1.0 · 毕业设计演示项目</div>
      </div>
    </div>
  );
}
