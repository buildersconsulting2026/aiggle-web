import { useState, useEffect, useCallback, useRef } from 'react';
import { useChatStore } from '../stores/chatStore';
import { RecorderPanel } from './RecorderPanel';
import { useRecordingStore } from '../stores/recordingStore';

// ─── Types ───
interface MeetingListItem {
  id: string;
  filename: string;
  date: string;
  duration_sec: number;
  chunks: number;
  title?: string;
  recorder?: string;
  device?: string;
  source?: string;
}

interface MeetingDetail {
  id: string;
  filename: string;
  date: string;
  duration_sec: number;
  chunks: number;
  transcript: string;
  analysis: string;
  title?: string;
  recorder?: string;
  device?: string;
  source?: string;
  chunk_details?: Array<{
    chunk: number;
    start: number;
    end: number;
    text: string;
  }>;
}

const API_BASE = `${import.meta.env.VITE_API_BASE || ''}/meetings/api`;

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}분 ${s}초`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
      + ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function getDisplayTitle(m: { title?: string; filename?: string; date?: string }): string {
  if (m.title && m.title.trim()) return m.title;
  return m.filename || '제목 없음';
}

export function MeetingRecords() {
  const { toggleChat, chatOpen } = useChatStore();
  const { jobJustCompleted } = useRecordingStore();
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [selected, setSelected] = useState<MeetingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [view, setView] = useState<'summary' | 'transcript'>('summary');
  const [error, setError] = useState<string | null>(null);

  // 삭제/이름수정 상태
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // 회의록 목록 로드
  const loadMeetings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${API_BASE}/meetings`);
      if (!resp.ok) throw new Error('서버 응답 없음');
      const data = await resp.json();
      setMeetings(data.meetings || []);
    } catch (e) {
      setError('whisper-serve에 연결할 수 없어요. 서버가 실행 중인지 확인해주세요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMeetings();
  }, [loadMeetings]);

  // job 완료 시 자동 새로고침 (다른 탭에 있다가 돌아와도 동작)
  const prevCompletedRef = useRef(false);
  useEffect(() => {
    if (jobJustCompleted && !prevCompletedRef.current) {
      prevCompletedRef.current = true;
      loadMeetings();
    }
    if (!jobJustCompleted) {
      prevCompletedRef.current = false;
    }
  }, [jobJustCompleted, loadMeetings]);

  // 회의록 상세 로드
  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setSelected(null);
    setView('summary');
    try {
      const resp = await fetch(`${API_BASE}/meeting/${encodeURIComponent(id)}`);
      if (!resp.ok) throw new Error('불러오기 실패');
      const data: MeetingDetail = await resp.json();
      setSelected(data);
    } catch (e) {
      setError('회의록을 불러오는 중 오류가 발생했어요.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // 회의록 삭제
  const handleDelete = useCallback(async (id: string) => {
    setEditLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/meeting/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!resp.ok) throw new Error('삭제 실패');
      setDeletingId(null);
      await loadMeetings();
    } catch (e) {
      setError('삭제 중 오류가 발생했어요.');
    } finally {
      setEditLoading(false);
    }
  }, [loadMeetings]);

  // 회의록 이름 수정
  const handleRename = useCallback(async (id: string) => {
    const title = editValue.trim();
    if (!title) return;
    setEditLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/meeting/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!resp.ok) throw new Error('수정 실패');
      setEditingId(null);
      setEditValue('');
      await loadMeetings();
    } catch (e) {
      setError('이름 수정 중 오류가 발생했어요.');
    } finally {
      setEditLoading(false);
    }
  }, [editValue, loadMeetings]);

  // 이름 수정 시작
  const startRename = useCallback((m: MeetingListItem) => {
    setEditingId(m.id);
    setEditValue(m.title || '');
    setDeletingId(null);
  }, []);

  // ─── 목록 화면 ───
  if (!selected && !detailLoading) {
    return (
      <div className="meeting-records">
        <div className="main-header">
          <span className="breadcrumb">AIGGLE / <strong>회의록</strong></span>
          <div className="actions">
            <button className="btn" onClick={loadMeetings}>↻ 새로고침</button>
            <button className="btn" onClick={toggleChat}>
              {chatOpen ? '💬 채팅 닫기' : '💬 채팅 열기'}
            </button>
          </div>
        </div>
        <div className="meeting-list-container">
          {/* 녹음/업로드 패널 */}
          <div className="recorder-section">
            <RecorderPanel onCompleted={loadMeetings} />
          </div>

          {loading ? (
            <div className="meeting-placeholder">
              <div className="meetings-spinner" />
              <p>회의록을 불러오는 중...</p>
            </div>
          ) : error ? (
            <div className="meeting-placeholder">
              <div className="meetings-icon">⚠️</div>
              <h3>{error}</h3>
              <p style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 13 }}>
                <code>cd ~/AIGGLE/whisper-serve && source venv/bin/activate && uvicorn main:app --port 3000</code>
              </p>
            </div>
          ) : meetings.length === 0 ? (
            <div className="meeting-placeholder">
              <div className="meetings-icon">📋</div>
              <h3>아직 회의록이 없어요</h3>
              <p style={{ marginTop: 8, color: 'var(--text-muted)' }}>
                회의 녹음 파일을 업로드하면 자동으로 회의록이 생성돼요.
              </p>
            </div>
          ) : (
            <div className="meeting-list">
              {meetings.map((m) => (
                <div key={m.id} className="meeting-card">
                  {/* 삭제 확인 모드 */}
                  {deletingId === m.id ? (
                    <div className="meeting-card-confirm-delete">
                      <span className="confirm-delete-text">정말 삭제할까요?</span>
                      <div className="confirm-delete-actions">
                        <button
                          className="btn btn-danger-sm"
                          onClick={(e) => { e.stopPropagation(); handleDelete(m.id); }}
                          disabled={editLoading}
                        >삭제</button>
                        <button
                          className="btn"
                          onClick={(e) => { e.stopPropagation(); setDeletingId(null); }}
                          disabled={editLoading}
                        >취소</button>
                      </div>
                    </div>
                  ) : editingId === m.id ? (
                    /* 이름 수정 모드 */
                    <div className="meeting-card-edit" onClick={(e) => e.stopPropagation()}>
                      <input
                        className="meeting-edit-input"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        placeholder="회의록 이름"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(m.id);
                          if (e.key === 'Escape') { setEditingId(null); setEditValue(''); }
                        }}
                      />
                      <div className="meeting-edit-actions">
                        <button
                          className="btn btn-primary-sm"
                          onClick={() => handleRename(m.id)}
                          disabled={editLoading || !editValue.trim()}
                        >저장</button>
                        <button
                          className="btn"
                          onClick={() => { setEditingId(null); setEditValue(''); }}
                          disabled={editLoading}
                        >취소</button>
                      </div>
                    </div>
                  ) : (
                    /* 기본 카드 */
                    <div className="meeting-card-main" onClick={() => loadDetail(m.id)}>
                      <div className="meeting-card-header">
                        <span className="meeting-card-date">{formatDate(m.date)}</span>
                        <span className="meeting-card-duration">⏱ {formatDuration(m.duration_sec)}</span>
                      </div>
                      <div className="meeting-card-body">
                        <span className="meeting-card-title">{getDisplayTitle(m)}</span>
                        {m.recorder && m.recorder !== '알 수 없음' && (
                          <span className="meeting-card-recorder">🎙 {m.recorder}</span>
                        )}
                      </div>
                      <div className="meeting-card-footer">
                        <span className="meeting-card-badge">{m.chunks}개 구간 전사</span>
                        <div className="meeting-card-actions">
                          <button
                            className="btn-icon"
                            title="이름 수정"
                            onClick={(e) => { e.stopPropagation(); startRename(m); }}
                          >✏️</button>
                          <button
                            className="btn-icon"
                            title="삭제"
                            onClick={(e) => { e.stopPropagation(); setDeletingId(m.id); }}
                          >🗑️</button>
                          <span className="meeting-card-arrow">열기 →</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── 상세 화면 ───
  return (
    <div className="meeting-records">
      <div className="main-header">
        <button className="btn" onClick={() => setSelected(null)}>← 목록으로</button>
        {selected && (
          <span className="breadcrumb" style={{ marginLeft: 12 }}>
            회의록 / <strong>{getDisplayTitle(selected)}</strong>
          </span>
        )}
        <div className="actions">
          {selected && (
            <>
              <button
                className={`btn ${view === 'summary' ? 'btn-active' : ''}`}
                onClick={() => setView('summary')}
              >📋 요약</button>
              <button
                className={`btn ${view === 'transcript' ? 'btn-active' : ''}`}
                onClick={() => setView('transcript')}
              >📄 전사</button>
            </>
          )}
          <button className="btn" onClick={toggleChat}>
            {chatOpen ? '💬 닫기' : '💬 채팅'}
          </button>
        </div>
      </div>
      <div className="meeting-detail-container">
        {detailLoading ? (
          <div className="meeting-placeholder">
            <div className="meetings-spinner" />
            <p>회의록을 불러오는 중...</p>
          </div>
        ) : selected ? (
          <>
            {/* 요약 뷰 */}
            {view === 'summary' && (
              <div className="meeting-detail-content">
                <div className="meeting-meta-bar">
                  <span>📅 {formatDate(selected.date)}</span>
                  <span>⏱ {formatDuration(selected.duration_sec)}</span>
                  <span>🎙 {selected.chunks}개 구간</span>
                  {selected.recorder && selected.recorder !== '알 수 없음' && (
                    <span>👤 {selected.recorder}</span>
                  )}
                  {selected.device && selected.device !== '알 수 없음' && (
                    <span>💻 {selected.device}</span>
                  )}
                </div>
                <div className="meeting-analysis">
                  {selected.analysis ? (
                    <div
                      className="meeting-analysis-content"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(selected.analysis) }}
                    />
                  ) : (
                    <p className="meeting-empty">이 회의록에는 요약 분석이 없어요.</p>
                  )}
                </div>
              </div>
            )}
            {/* 전사 뷰 */}
            {view === 'transcript' && (
              <div className="meeting-detail-content">
                <div className="meeting-meta-bar">
                  <span>📅 {formatDate(selected.date)}</span>
                  <span>⏱ {formatDuration(selected.duration_sec)}</span>
                </div>
                <div className="meeting-transcript">
                  {selected.chunk_details && selected.chunk_details.length > 0 ? (
                    selected.chunk_details.map((ch, i) => (
                      <div key={i} className="transcript-chunk">
                        <div className="transcript-time">
                          {Math.floor(ch.start / 60)}:{String(Math.round(ch.start % 60)).padStart(2, '0')}
                          {' ~ '}
                          {Math.floor(ch.end / 60)}:{String(Math.round(ch.end % 60)).padStart(2, '0')}
                        </div>
                        <div className="transcript-text">{ch.text}</div>
                      </div>
                    ))
                  ) : (
                    <pre className="transcript-raw">{selected.transcript}</pre>
                  )}
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

// ─── 간단한 마크다운 렌더러 ───
function renderMarkdown(text: string): string {
  let html = text;
  // 이스케이프
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // 헤딩
  html = html.replace(/^### (.+)$/gm, '<h4 class="md-h4">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="md-h3">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2 class="md-h2">$1</h2>');
  // 굵게
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // 이탤릭
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // 인라인 코드
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // 리스트
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);
  // 단락
  html = html.replace(/\n\n/g, '</p><p>');
  html = `<p>${html}</p>`;
  // 빈 단락 정리
  html = html.replace(/<p>\s*<\/p>/g, '');
  return html;
}
