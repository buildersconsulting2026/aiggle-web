import { useState } from 'react';
import { useChatStore } from './stores/chatStore';
import { LoginScreen } from './components/LoginScreen';
import { Sidebar } from './components/Sidebar';
import { MainContent } from './components/MainContent';
import { ChatMain } from './components/ChatMain';
import { ThreadPanel } from './components/ThreadPanel';
import { MeetingsPage } from './components/MeetingsPage';
import { MeetingRecords } from './components/MeetingRecords';
import { PAGES, type PageKey } from './pages';

export default function App() {
  const currentUser = useChatStore(s => s.currentUser);
  const chatOpen = useChatStore(s => s.chatOpen);
  const [page, setPage] = useState<PageKey>('dashboard');

  if (!currentUser) {
    return <LoginScreen />;
  }

  return (
    <div className="app">
      <Sidebar page={page} setPage={setPage} />
      {page === 'dashboard' && <MainContent />}
      {page === 'meetings' && <MeetingRecords />}
      {page !== 'dashboard' && page !== 'meetings' && PAGES[page].embedPath && (
        <MeetingsPage
          pageLabel={PAGES[page].label}
          embedPath={PAGES[page].embedPath!}
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
