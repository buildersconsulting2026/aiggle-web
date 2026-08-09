import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useChatStore } from '../stores/chatStore';
import type { Message, User } from '../types';

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  if (isToday) return `오늘 ${hh}:${mm}`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${hh}:${mm}`;
}

function formatDateSep(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return '오늘';
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function renderContent(content: string, mentions: string[]) {
  if (!mentions.length) return content;
  let result = content;
  mentions.forEach(m => {
    const regex = new RegExp(`@${m}`, 'g');
    result = result.replace(regex, `⟦MENTION⟧${m}⟦/MENTION⟧`);
  });
  const parts = result.split(/⟦MENTION⟧|⟦\/MENTION⟧/);
  return parts.map((part, i) => {
    if (i % 2 === 1) return <span key={i} className="mention">@{part}</span>;
    return <span key={i}>{part}</span>;
  });
}

function roleBadge(role: string) {
  if (role === 'ai') return <span className="msg-ai-badge">AI</span>;
  const labels: Record<string, { text: string; color: string }> = {
    leader: { text: 'PM', color: '#58a6ff' },
    designer: { text: '디자인', color: '#bc8cff' },
    marketer: { text: '마케팅', color: '#f778ba' },
    content: { text: '콘텐츠', color: '#3fb950' },
  };
  const label = labels[role];
  if (!label) return null;
  return (
    <span className="msg-role-badge" style={{ background: `${label.color}22`, color: label.color }}>
      {label.text}
    </span>
  );
}

// ─── 멘션 자동완성 ───
interface MentionCandidate {
  name: string;
  role: string;
  color: string;
  isAI?: boolean;
}

/** 텍스트 내 cursor 위치에서 현재 타이핑 중인 @멘션 정보 추출 */
function detectMention(text: string, cursorPos: number): { query: string; start: number } | null {
  // cursor 이전 텍스트에서 마지막 @ 찾기
  const before = text.slice(0, cursorPos);
  const atIdx = before.lastIndexOf('@');
  if (atIdx === -1) return null;

  // @ 앞가 공백이거나 텍스트 시작이어야 함 (이메일 등 오탐지 방지)
  if (atIdx > 0 && !/\s/.test(text[atIdx - 1])) return null;

  // @ 와 cursor 사이에 공백이 있으면 무효
  const query = text.slice(atIdx + 1, cursorPos);
  if (/\s/.test(query)) return null;

  return { query, start: atIdx };
}


export function ChatMessage({ msg, onReply }: { msg: Message; onReply: (msg: Message) => void }) {
  return (
    <div className="msg-group">
      <div className="avatar avatar-md" style={{ background: msg.user_color }}>
        {msg.user_name[0]}
      </div>
      <div className="msg-content">
        <div className="msg-header">
          <span className="msg-name" style={{ color: msg.user_color }}>{msg.user_name}</span>
          {roleBadge(msg.user_role)}
          <span className="msg-time">{formatTime(msg.created_at)}</span>
        </div>
        <div className="msg-body">{renderContent(msg.content, msg.mentions)}</div>
        {msg.reply_count > 0 && (
          <div className="reply-count" onClick={() => onReply(msg)}>
            💬 {msg.reply_count}개 답글
          </div>
        )}
      </div>
      {/* hover 시에만 표시되는 액션 바 */}
      <div className="msg-actions">
        <button className="msg-action-btn" title="답글 달기" onClick={() => onReply(msg)}>↩</button>
        <button className="msg-action-btn" title="복사" onClick={() => navigator.clipboard?.writeText(msg.content)}>📋</button>
      </div>
    </div>
  );
}

export function ChatMain() {
  const { messages, currentRoom, rooms, connected, sendMessage, openThread, toggleChat, discordConnected, syncing, checkDiscord, syncDiscord, aiConnected, aiThinking, checkAI, users, fetchUsers } = useChatStore();
  const [input, setInput] = useState('');
  const [mentionState, setMentionState] = useState<{ query: string; start: number; index: number } | null>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const room = rooms.find(r => r.id === currentRoom);

  // 멤버 + GLM 후보 목록 (GLM은 AI 트리거용으로 항상 포함)
  const mentionCandidates: MentionCandidate[] = useMemo(() => {
    const fromUsers = users.map((u: User) => ({
      name: u.name,
      role: u.role,
      color: u.avatar_color,
      isAI: u.role === 'ai',
    }));
    // GLM이 users에 없어도 항상 후보에 포함
    if (!fromUsers.some(u => u.name === 'GLM')) {
      fromUsers.push({ name: 'GLM', role: 'ai', color: '#6e40c9', isAI: true });
    }
    return fromUsers;
  }, [users]);

  // 필터링된 멘션 후보
  const filteredMentions = useMemo(() => {
    if (!mentionState) return [];
    const q = mentionState.query.toLowerCase();
    return mentionCandidates.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.isAI && '지엘엠'.includes(q))
    ).slice(0, 8);
  }, [mentionState, mentionCandidates]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    checkDiscord();
    checkAI();
    fetchUsers();
  }, []);

  // 멘션 삽입
  const insertMention = useCallback((candidate: MentionCandidate) => {
    const ta = textareaRef.current;
    if (!ta || !mentionState) return;

    const before = input.slice(0, mentionState.start);
    const after = input.slice(ta.selectionStart);
    const newText = `${before}@${candidate.name} ${after}`;
    setInput(newText);
    setMentionState(null);

    // 커서를 삽입된 멘션 뒤로 이동
    const newCursorPos = before.length + candidate.name.length + 2; // @name + space
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newCursorPos, newCursorPos);
    });
  }, [input, mentionState]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);

    // 자동 높이 조절
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';

    // 멘션 감지
    const cursor = e.target.selectionStart;
    const mention = detectMention(val, cursor);
    if (mention) {
      setMentionState({ query: mention.query, start: mention.start, index: 0 });
    } else {
      setMentionState(null);
    }
  };

  const handleSelectChange = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    // 커서 이동 시 멘션 상태 재감지
    const ta = e.currentTarget;
    const cursor = ta.selectionStart;
    const mention = detectMention(input, cursor);
    if (mention) {
      setMentionState(prev => prev ? { ...prev, query: mention.query, start: mention.start } : null);
    } else {
      setMentionState(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 멘션 드롭다운이 열려있을 때 키보드 제어
    if (mentionState && filteredMentions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionState(prev => prev ? { ...prev, index: (prev.index + 1) % filteredMentions.length } : null);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionState(prev => prev ? { ...prev, index: (prev.index - 1 + filteredMentions.length) % filteredMentions.length } : null);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = filteredMentions[mentionState.index];
        if (selected) insertMention(selected);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionState(null);
        return;
      }
    }

    // 일반 Enter 전송
    if (e.key === 'Enter' && !e.shiftKey) {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (!input.trim()) return;
    // 멘션 추출 (@닉네임)
    const mentionRegex = /@([가-힣a-zA-Z0-9]+)/g;
    const mentions: string[] = [];
    let match;
    while ((match = mentionRegex.exec(input)) !== null) {
      mentions.push(match[1]);
    }
    sendMessage(input, null, mentions);
    setInput('');
    setMentionState(null);
  };

  // 날짜 구분선 계산
  let lastDate = '';
  const renderMessages = () => {
    return messages.map(msg => {
      const dateStr = msg.created_at ? formatDateSep(msg.created_at) : '';
      const showDate = dateStr !== lastDate;
      lastDate = dateStr;
      return (
        <div key={msg.id}>
          {showDate && <div className="date-sep">{dateStr}</div>}
          <ChatMessage msg={msg} onReply={openThread} />
        </div>
      );
    });
  };

  return (
    <>
      <div className="chat-header">
        <span className="room-name">#{room?.name || ''}</span>
        <span className="room-meta">채팅방</span>
        <div className="conn-status">
          <span className={`dot ${connected ? 'on' : 'off'}`} />
          {connected ? '연결됨' : '연결 중...'}
        </div>
        {discordConnected && (
          <button
            className="btn-discord-sync"
            onClick={() => syncDiscord(currentRoom || undefined)}
            disabled={syncing}
            title="Discord에서 최근 메시지 가져오기"
          >
            {syncing ? '⏳' : '🔄 Discord'}
          </button>
        )}
        {aiConnected && (
          <span className="ai-status-badge" title={`GLM ${aiThinking ? '응답 중' : '연결됨'}`}>
            🤖 GLM {aiThinking ? '...' : '✓'}
          </span>
        )}
        <button className="chat-close-btn" onClick={toggleChat} title="채팅 닫기">✕</button>
      </div>

      <div className="messages">
        {renderMessages()}
        {aiThinking && (
          <div className="ai-thinking">
            <span className="avatar avatar-md" style={{ background: '#6e40c9' }}>G</span>
            GLM이 생각하는 중...
          </div>
        )}
        <div ref={messagesEnd} />
      </div>

      <div className="chat-input-area">
        {/* 멘션 자동완성 드롭다운 */}
        {mentionState && filteredMentions.length > 0 && (
          <div className="mention-dropdown">
            {filteredMentions.map((c, i) => (
              <div
                key={c.name}
                className={`mention-item ${i === mentionState.index ? 'active' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); insertMention(c); }}
                onMouseEnter={() => setMentionState(prev => prev ? { ...prev, index: i } : null)}
              >
                <span className="avatar avatar-sm" style={{ background: c.color }}>
                  {c.name[0]}
                </span>
                <span className="mention-item-name">{c.name}</span>
                {c.isAI && <span className="msg-ai-badge">AI</span>}
                {!c.isAI && roleBadge(c.role)}
              </div>
            ))}
          </div>
        )}
        <div className="chat-input-wrapper">
          <textarea
            ref={textareaRef}
            className="chat-input"
            placeholder={`#${room?.name || ''}에 메시지 보내기... (@로 멘션)`}
            value={input}
            onChange={handleInputChange}
            onSelect={handleSelectChange}
            onKeyDown={handleKeyDown}
            onBlur={() => { setTimeout(() => setMentionState(null), 150); }}
            rows={1}
          />
          <button className="chat-send-btn" onClick={handleSend} disabled={!input.trim()}>
            ➤
          </button>
        </div>
      </div>
    </>
  );
}
