import { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react';
import type { Message, Conversation, PageType, ChartPendingPayload } from '../types';

interface AppState {
  currentPage: PageType;
  conversations: Conversation[];
  currentConversationId: string;
  isLoading: boolean;
  showBaselineCompare: boolean;
  pendingChartPayload: ChartPendingPayload | null;
  pendingDictQuery: string | null;
}

type AppAction =
  | { type: 'SET_PAGE'; payload: PageType }
  | { type: 'NEW_CONVERSATION' }
  | { type: 'SELECT_CONVERSATION'; payload: string }
  | { type: 'ADD_MESSAGE'; payload: { conversationId: string; message: Message } }
  | { type: 'UPDATE_MESSAGE'; payload: { conversationId: string; messageId: string; updates: Partial<Message> } }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'TOGGLE_BASELINE_COMPARE' }
  | { type: 'DELETE_CONVERSATION'; payload: string }
  | { type: 'LOAD_STATE'; payload: AppState }
  | { type: 'SET_CHART_PAYLOAD'; payload: ChartPendingPayload | null }
  | { type: 'SET_DICT_QUERY'; payload: string | null };

const STORAGE_KEY = 'nosql-chat-state';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function createNewConversation(): Conversation {
  return {
    id: generateId(),
    title: '新对话',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

const initialState: AppState = {
  currentPage: 'chat',
  conversations: [createNewConversation()],
  currentConversationId: '',
  isLoading: false,
  showBaselineCompare: true,
  pendingChartPayload: null,
  pendingDictQuery: null,
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PAGE':
      return { ...state, currentPage: action.payload };

    case 'NEW_CONVERSATION': {
      const conv = createNewConversation();
      return {
        ...state,
        conversations: [conv, ...state.conversations],
        currentConversationId: conv.id,
      };
    }

    case 'SELECT_CONVERSATION':
      return { ...state, currentConversationId: action.payload };

    case 'ADD_MESSAGE': {
      const msg = action.payload.message;
      const userContent = msg.type === 'user' ? msg.content : '';
      return {
        ...state,
        conversations: state.conversations.map(conv => {
          if (conv.id !== action.payload.conversationId) return conv;
          const newTitle = conv.messages.length === 0 && msg.type === 'user'
            ? userContent.slice(0, 20)
            : conv.title;
          return {
            ...conv,
            title: newTitle,
            messages: [...conv.messages, msg],
            updatedAt: Date.now(),
          };
        })
      };
    }

    case 'UPDATE_MESSAGE': {
      return {
        ...state,
        conversations: state.conversations.map(conv => {
          if (conv.id !== action.payload.conversationId) return conv;
          return {
            ...conv,
            messages: conv.messages.map(msg => {
              if (msg.id !== action.payload.messageId) return msg;
              return { ...msg, ...action.payload.updates } as Message;
            }),
          };
        })
      };
    }

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'TOGGLE_BASELINE_COMPARE':
      return { ...state, showBaselineCompare: !state.showBaselineCompare };

    case 'DELETE_CONVERSATION': {
      const remaining = state.conversations.filter(c => c.id !== action.payload);
      const newConversations = remaining.length > 0 ? remaining : [createNewConversation()];
      const newCurrentId = state.currentConversationId === action.payload
        ? newConversations[0].id
        : state.currentConversationId;
      return {
        ...state,
        conversations: newConversations,
        currentConversationId: newCurrentId,
      };
    }

    case 'LOAD_STATE':
      return { ...action.payload, pendingChartPayload: null, pendingDictQuery: null };

    case 'SET_CHART_PAYLOAD':
      return { ...state, pendingChartPayload: action.payload };

    case 'SET_DICT_QUERY':
      return { ...state, pendingDictQuery: action.payload };

    default:
      return state;
  }
}

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  currentConversation: Conversation;
} | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // 初始化：设置默认对话ID + 从localStorage加载
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.conversations && parsed.conversations.length > 0) {
          dispatch({ type: 'LOAD_STATE', payload: { ...parsed, isLoading: false } });
          return;
        }
      } catch (e) {}
    }
    dispatch({ type: 'SELECT_CONVERSATION', payload: state.conversations[0].id });
  }, []);

  // 持久化到localStorage（排除临时 pending 字段和 isLoading）
  useEffect(() => {
    if (state.currentConversationId) {
      const { pendingChartPayload, pendingDictQuery, isLoading, ...rest } = state;
      void pendingChartPayload; void pendingDictQuery; void isLoading;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
    }
  }, [state]);

  const currentConversation = state.conversations.find(c => c.id === state.currentConversationId) || state.conversations[0];

  return (
    <AppContext.Provider value={{ state, dispatch, currentConversation }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
