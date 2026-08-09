import { useState, useEffect } from 'react';
import { useChatStore } from '../stores/chatStore';

export function LoginScreen() {
  const login = useChatStore(s => s.login);
  const [name, setName] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('aiggle_user');
    if (saved) {
      const user = JSON.parse(saved);
      login(user.name);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) login(name.trim());
  };

  return (
    <div className="login-screen">
      <form className="login-box" onSubmit={handleSubmit}>
        <div className="login-logo">A</div>
        <h2>AIGGLE</h2>
        <p>AI 매니저와 함께하는 프로젝트 워크스페이스</p>
        <input
          className="login-input"
          type="text"
          placeholder="닉네임을 입력하세요"
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
        />
        <button className="login-btn" type="submit">입장하기</button>
      </form>
    </div>
  );
}
