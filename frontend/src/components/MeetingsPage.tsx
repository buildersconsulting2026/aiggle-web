import { useState, useEffect } from 'react';
import { useChatStore } from '../stores/chatStore';

interface MeetingsPageProps {
  pageLabel: string;
  embedPath: string;
}

/**
 * whisper-serve 페이지를 iframe으로 임베드하는 제네릭 컨테이너
 * 각 탭(전사/회의록/업무일지/페인포인트/PM 로드맵)마다 독립적으로 동작
 */
export function MeetingsPage({ pageLabel, embedPath }: MeetingsPageProps) {
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(false);
  const { toggleChat, chatOpen } = useChatStore();

  useEffect(() => {
    setLoading(true);
    fetch(embedPath, { cache: 'no-store' })
      .then(res => setAvailable(res.ok))
      .catch(() => setAvailable(false))
      .finally(() => setLoading(false));
  }, [embedPath]);

  return (
    <div className="meetings-page">
      <div className="main-header">
        <span className="breadcrumb">AIGGLE / <strong>{pageLabel}</strong></span>
        <div className="actions">
          <button className="btn" onClick={toggleChat}>
            {chatOpen ? '💬 채팅 닫기' : '💬 채팅 열기'}
          </button>
          <a
            className="btn"
            href={embedPath}
            target="_blank"
            rel="noopener noreferrer"
          >
            ↗ 새 창에서 열기
          </a>
        </div>
      </div>
      <div className="meetings-content">
        {loading ? (
          <div className="meetings-placeholder">
            <div className="meetings-spinner" />
            <p>{pageLabel} 로딩 중...</p>
          </div>
        ) : available ? (
          <iframe
            src={embedPath}
            className="meetings-iframe"
            title={pageLabel}
          />
        ) : (
          <div className="meetings-placeholder">
            <div className="meetings-icon">🎙️</div>
            <h3>whisper-serve가 실행되지 않았어요</h3>
            <p>서버가 현재 offline 상태예요.</p>
            <div className="meetings-help">
              <code>cd ~/AIGGLE/whisper-serve && source venv/bin/activate && uvicorn main:app --port 3000</code>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
