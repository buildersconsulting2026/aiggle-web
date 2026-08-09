import { useChatStore } from '../stores/chatStore';

export function MainContent() {
  const { toggleChat, chatOpen, users, messages } = useChatStore();

  return (
    <div className="main">
      <div className="main-header">
        <span className="breadcrumb">AIGGLE / <strong>대시보드</strong></span>
        <div className="actions">
          <button className="btn" onClick={toggleChat}>
            {chatOpen ? '💬 채팅 닫기' : '💬 채팅 열기'}
          </button>
          <button className="btn btn-primary">+ 새 태스크</button>
        </div>
      </div>

      <div className="main-content">
        {/* Dashboard stats */}
        <div className="dash-grid">
          <div className="dash-card">
            <div className="label">진행 중 태스크</div>
            <div className="value" style={{ color: 'var(--accent-orange)' }}>5</div>
            <div className="sub">담담 2 · 삼쬐 1 · 짱구 1 · 프렌즈 1</div>
          </div>
          <div className="dash-card">
            <div className="label">완료</div>
            <div className="value" style={{ color: 'var(--accent-green)' }}>12</div>
            <div className="sub">이번 주 3개 완료</div>
          </div>
          <div className="dash-card">
            <div className="label">팀원</div>
            <div className="value" style={{ color: 'var(--accent)' }}>{users.length}</div>
            <div className="sub">{users.map(u => u.name).join(' · ')}</div>
          </div>
          <div className="dash-card">
            <div className="label">오늘 메시지</div>
            <div className="value" style={{ color: 'var(--accent-purple)' }}>{messages.length}</div>
            <div className="sub">실시간 채팅 활발</div>
          </div>
        </div>

        {/* Tasks */}
        <div className="task-section">
          <h3>📌 진행 중인 태스크</h3>
          <div className="task-item">
            <div className="task-status progress">●</div>
            <span>MVP 웹 채팅 프로토타입 개발</span>
            <span className="task-assignee">담담</span>
          </div>
          <div className="task-item">
            <div className="task-status progress">●</div>
            <span>애기 캐릭터 아트 (베이스 + 10 트레이트)</span>
            <span className="task-assignee">삼쬐</span>
          </div>
          <div className="task-item">
            <div className="task-status pending">○</div>
            <span>컬렉션 발행 수량 확정</span>
            <span className="task-assignee">짱구</span>
          </div>
          <div className="task-item">
            <div className="task-status pending">○</div>
            <span>화리 특전 설계 (프리민트 vs 할인)</span>
            <span className="task-assignee">짱구</span>
          </div>
          <div className="task-item">
            <div className="task-status pending">○</div>
            <span>애기 캐릭터 영상 콘텐츠 기획</span>
            <span className="task-assignee">프렌즈</span>
          </div>
        </div>

        <div className="task-section">
          <h3>📋 MVP 개발 진척</h3>
          <div className="task-item">
            <div className="task-status done">✓</div>
            <span>기획서 작성</span>
            <span className="task-assignee">GLM</span>
          </div>
          <div className="task-item">
            <div className="task-status done">✓</div>
            <span>백엔드 FastAPI + WebSocket</span>
            <span className="task-assignee">GLM</span>
          </div>
          <div className="task-item">
            <div className="task-status done">✓</div>
            <span>프론트엔드 React + 채팅 UI</span>
            <span className="task-assignee">GLM</span>
          </div>
          <div className="task-item">
            <div className="task-status progress">●</div>
            <span>슬라이드 채팅 패널 통합</span>
            <span className="task-assignee">GLM</span>
          </div>
          <div className="task-item">
            <div className="task-status pending">○</div>
            <span>AI 미들웨어 연동</span>
            <span className="task-assignee">삼쬐</span>
          </div>
          <div className="task-item">
            <div className="task-status pending">○</div>
            <span>인증 (로그인)</span>
            <span className="task-assignee">나중에</span>
          </div>
        </div>
      </div>
    </div>
  );
}
