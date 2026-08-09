import { useChatStore } from '../stores/chatStore';
import { useRecordingStore, formatTime } from '../stores/recordingStore';
import { PAGES, type PageKey } from '../pages';

interface SidebarProps {
  page: PageKey;
  setPage: (p: PageKey) => void;
}

export function Sidebar({ page, setPage }: SidebarProps) {
  const { rooms, currentRoom, setCurrentRoom, users, currentUser } = useChatStore();
  const { recording, paused, recordTime, job, otherRecordings } = useRecordingStore();

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">A</div>
        <div className="sidebar-title">AIGGLE</div>
      </div>

      {/* 메인 페이지 네비게이션 */}
      <div className="sidebar-section">
        <div className="sidebar-section-title">워크스페이스</div>
        {(Object.keys(PAGES) as PageKey[]).map(key => (
          <div
            key={key}
            className={`sidebar-item ${page === key ? 'active' : ''}`}
            onClick={() => setPage(key)}
          >
            <span className="icon">{PAGES[key].icon}</span>
            {PAGES[key].label}
          </div>
        ))}
      </div>

      {/* 채팅방은 대시보드에서만 표시 */}
      {page === 'dashboard' && (
        <div className="sidebar-section">
          <div className="sidebar-section-title">채팅방</div>
          {rooms.map(room => (
            <div
              key={room.id}
              className={`sidebar-item ${currentRoom === room.id ? 'active' : ''}`}
              onClick={() => setCurrentRoom(room.id)}
            >
              <span className="icon">#</span>
              {room.name}
            </div>
          ))}
        </div>
      )}

      <div className="sidebar-section">
        <div className="sidebar-section-title">팀원</div>
        {users.map(user => (
          <div key={user.id} className="sidebar-item">
            <div className="avatar avatar-sm" style={{ background: user.avatar_color }}>
              {user.name[0]}
            </div>
            <span style={{ fontSize: 13 }}>{user.name}</span>
            {user.role === 'ai' && (
              <span className="msg-ai-badge" style={{ fontSize: 9 }}>AI</span>
            )}
          </div>
        ))}
      </div>

      {/* 다른 팀원 녹음 중 표시 */}
      {otherRecordings.map((r) => (
        <div key={r.session_id} className="sidebar-other-recording" onClick={() => setPage('meetings')}>
          <div className={`rec-dot ${r.status === 'paused' ? 'paused' : ''}`} />
          <div className="other-rec-info">
            <span className="other-rec-name">{r.recorder}님 녹음 중</span>
            <span className="other-rec-meta">
              {formatTime(r.elapsed_sec)} · {r.device}
            </span>
          </div>
        </div>
      ))}

      {/* 내 녹음 중 표시기 */}
      {(recording || job) && (
        <div className="sidebar-recording-indicator" onClick={() => setPage('meetings')}>
          {recording ? (
            <>
              <div className={`rec-dot ${paused ? 'paused' : ''}`} />
              <span>녹음 중 {formatTime(recordTime)}</span>
            </>
          ) : job && job.status !== 'done' && job.status !== 'error' ? (
            <>
              <div className="rec-dot processing" />
              <span>전사 처리 중 {job.progress}%</span>
            </>
          ) : null}
        </div>
      )}

      <div className="sidebar-footer">
        {currentUser && (
          <div className="user-chip">
            <div className="avatar avatar-sm" style={{ background: currentUser.avatar_color }}>
              {currentUser.name[0]}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{currentUser.name}</div>
              <div style={{ fontSize: 11, color: 'var(--accent-green)' }}>● 온라인</div>
            </div>
          </div>
        )}
        <div className="sidebar-version">v{__APP_VERSION__} · {__BUILD_TIME__}</div>
      </div>
    </div>
  );
}
