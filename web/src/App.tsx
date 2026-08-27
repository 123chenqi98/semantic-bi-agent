import { AppProvider, useApp } from './store/ChatContext';
import Sidebar from './components/Layout/Sidebar';
import Header from './components/Layout/Header';
import ChatPage from './pages/ChatPage';
import ChartAssistantPage from './pages/ChartAssistantPage';
import DictionaryPage from './pages/DictionaryPage';
import EvaluationPage from './pages/EvaluationPage';
import SettingsPage from './pages/SettingsPage';

function AppContent() {
  const { state } = useApp();

  const renderPage = () => {
    switch (state.currentPage) {
      case 'chat': return <ChatPage />;
      case 'chartAssistant': return <ChartAssistantPage />;
      case 'dictionary': return <DictionaryPage />;
      case 'evaluation': return <EvaluationPage />;
      case 'settings': return <SettingsPage />;
      default: return <ChatPage />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: '#F9FAFD' }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header />
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
