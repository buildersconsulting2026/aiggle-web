import { useState } from 'react';
import { useChatStore } from './stores/chatStore';
import { LoginScreen } from './components/LoginScreen';
import { Sidebar } from './components/Sidebar';
import { MainContent } from './components/MainContent';
import { ChatMain } from './components/ChatMain';
import { ThreadPanel } from './components/ThreadPanel';
import { MeetingsPage } from './components/MeetingsPage';
import { MeetingRecords } from './components/MeetingRecords';
import { useApiBaseStore } from './lib/apiBase';
import { PAGES, embedUrl, type PageKey } from './pages';

export default function App() {
  const currentUser = useChatStore(s => s.currentUser);
  const chatOpen = useChatStore(s => s.chatOpen);
  const apiBase = useApiBaseStore(s => s.apiBase); // 터널 교체 시 리렌더
  const [page, setPage] = useState<PageKey>('dashboard');

  if (!currentUser) {
    return <LoginScreen />;
  }

  const embed = embedUrl(page);

  return (
    <div className="app">
      <Sidebar page={page} setPage={setPage} />
      {page === 'dashboard' && <MainContent />}
      {page === 'meetings' && <MeetingRecords />}
      {page !== 'dashboard' && page !== 'meetings' && embed && (
        <MeetingsPage
          key={apiBase} // 베이스가 바뀌면 iframe 재마운트
          pageLabel={PAGES[page].label}
          embedPath={embed}
        />
      )}
      <div className="chat-area">
        <div className={`chat-main ${chatOpen ? 'open' : ''}`}>
          <ChatMain />
        </div>
        <ThreadPanel />
      </div>
    </div>
  );
}
