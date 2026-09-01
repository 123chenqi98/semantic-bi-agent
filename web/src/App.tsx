import { useState } from 'react';
import { AppProvider, useApp } from './store/ChatContext';
import Sidebar from './components/Layout/Sidebar';
import Header from './components/Layout/Header';
import HomePage from './pages/HomePage';
import ChatPage from './pages/ChatPage';
import ChartAssistantPage from './pages/ChartAssistantPage';
import DictionaryPage from './pages/DictionaryPage';
import EvaluationPage from './pages/EvaluationPage';
import SettingsPage from './pages/SettingsPage';
import SemanticEditorPage from './pages/SemanticEditorPage';
import EnterpriseBiPage from './pages/EnterpriseBiPage';

function AppContent() {
  const { state } = useApp();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const renderPage = () => {
    switch (state.currentPage) {
      case 'home': return <HomePage />;
      case 'chat': return <ChatPage />;
      case 'enterpriseBi': return <EnterpriseBiPage />;
      case 'chartAssistant': return <ChartAssistantPage />;
      case 'dictionary': return <DictionaryPage />;
      case 'evaluation': return <EvaluationPage />;
      case 'settings': return <SettingsPage />;
      case 'semanticEditor': return <SemanticEditorPage />;
      default: return <HomePage />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: '#F9FAFD' }}>
      {sidebarOpen && (
        <div
          className="mobile-backdrop"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className={`sidebar-wrapper ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <Sidebar onNavigate={() => setSidebarOpen(false)} />
      </div>
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header onToggleSidebar={() => setSidebarOpen(v => !v)} />
        {renderPage()}
      </div>
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
