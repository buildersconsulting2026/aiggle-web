import { useState, useEffect, useCallback } from 'react';
import { useChatStore } from '../stores/chatStore';
import { RecorderPanel } from './RecorderPanel';

// ─── Types ───
interface MeetingListItem {
  id: string;
  filename: string;
  date: string;
  duration_sec: number;
  chunks: number;
}

interface MeetingDetail {
  id: string;
  filename: string;
  date: string;
  duration_sec: number;
  chunks: number;
  transcript: string;
  analysis: string;
  chunk_details?: Array<{
    chunk: number;
    start: number;
    end: number;
    text: string;
  }>;
}

const API_BASE = '/meetings/api';

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

export function MeetingRecords() {
  const { toggleChat, chatOpen } = useChatStore();
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [selected, setSelected] = useState<MeetingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [view, setView] = useState<'summary' | 'transcript'>('summary');
  const [error, setError] = useState<string | null>(null);

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
              {meetings.map((m, i) => (
                <div
                  key={m.id}
                  className="meeting-card"
                  onClick={() => loadDetail(m.id)}
                >
                  <div className="meeting-card-header">
                    <span className="meeting-card-date">{formatDate(m.date)}</span>
                    <span className="meeting-card-duration">⏱ {formatDuration(m.duration_sec)}</span>
                  </div>
                  <div className="meeting-card-body">
                    <span className="meeting-card-title">회의 녹음본 #{meetings.length - i}</span>
                    <span className="meeting-card-filename">{m.filename}</span>
                  </div>
                  <div className="meeting-card-footer">
                    <span className="meeting-card-badge">{m.chunks}개 구간 전사</span>
                    <span className="meeting-card-arrow">열기 →</span>
                  </div>
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
            회의록 / <strong>{formatDate(selected.date)}</strong>
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
                  <span>📁 {selected.filename}</span>
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
