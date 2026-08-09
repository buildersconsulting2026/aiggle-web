import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../stores/chatStore';
import { ChatMessage } from './ChatMain';

export function ThreadPanel() {
  const { threadParent, threadMessages, closeThread, sendMessage, chatOpen } = useChatStore();
  const [input, setInput] = useState('');
  const messagesEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages]);

  if (!threadParent) return null;

  const handleSend = () => {
    if (!input.trim()) return;
    const mentionRegex = /@([가-힣a-zA-Z0-9]+)/g;
    const mentions: string[] = [];
    let match;
    while ((match = mentionRegex.exec(input)) !== null) {
      mentions.push(match[1]);
    }
    sendMessage(input, threadParent.id, mentions);
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
    <div className={`thread-panel open ${!chatOpen ? 'chat-closed' : ''}`}>
      <div className="thread-header">
        <span className="title">스레드</span>
        <button className="close-btn" onClick={closeThread}>✕</button>
      </div>

      <div className="thread-messages">
        {/* 부모 메시지 */}
        <div className="thread-parent">
          <ChatMessage msg={threadParent} onReply={() => {}} />
        </div>

        {/* 스레드 답글들 */}
        {threadMessages.map(msg => (
          <div key={msg.id} style={{ padding: '4px 16px' }}>
            <ChatMessage msg={msg} onReply={() => {}} />
          </div>
        ))}
        <div ref={messagesEnd} />
      </div>

      <div className="chat-input-area">
        <div className="chat-input-wrapper">
          <textarea
            className="chat-input"
            placeholder="스레드에 답글 달기..."
            value={input}
            onChange={e => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={handleKeyDown}
            rows={1}
            autoFocus
          />
          <button className="chat-send-btn" onClick={handleSend} disabled={!input.trim()}>
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}
