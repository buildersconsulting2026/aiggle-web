import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../stores/chatStore';
import type { Message } from '../types';

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
  const { messages, currentRoom, rooms, connected, sendMessage, openThread, toggleChat, discordConnected, syncing, checkDiscord, syncDiscord } = useChatStore();
  const [input, setInput] = useState('');
  const messagesEnd = useRef<HTMLDivElement>(null);

  const room = rooms.find(r => r.id === currentRoom);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    checkDiscord();
  }, []);

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
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // 한국어 IME 조합 중이면 전송하지 않음 (끝 음절 중복 전송 방지)
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      handleSend();
    }
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
        <button className="chat-close-btn" onClick={toggleChat} title="채팅 닫기">✕</button>
      </div>

      <div className="messages">
        {renderMessages()}
        <div ref={messagesEnd} />
      </div>

      <div className="chat-input-area">
        <div className="chat-input-wrapper">
          <textarea
            className="chat-input"
            placeholder={`#${room?.name || ''}에 메시지 보내기...`}
            value={input}
            onChange={e => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={handleKeyDown}
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
