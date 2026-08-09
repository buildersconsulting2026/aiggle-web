import { useState, useRef, useCallback } from 'react';
import { useRecordingStore, formatTime } from '../stores/recordingStore';

export function RecorderPanel({ onCompleted }: { onCompleted: () => void }) {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const {
    recording, paused, recordTime, audioBlob, audioUrl, micError,
    uploading, job, jobJustCompleted,
    startRecording, togglePause, stopRecording, discardRecording,
    uploadRecording, uploadFile, clearCompleted,
  } = useRecordingStore();

  // jobJustCompleted를 감지하면 MeetingRecords의 새로고침 호출
  const prevCompletedRef = useRef(false);
  if (jobJustCompleted && !prevCompletedRef.current) {
    prevCompletedRef.current = true;
    onCompleted();
  }
  if (!jobJustCompleted && prevCompletedRef.current) {
    prevCompletedRef.current = false;
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|m4a|aac|ogg|flac|webm)$/i))) {
      uploadFile(file);
    } else {
      useRecordingStore.setState({ micError: '오디오 파일만 업로드할 수 있어요. (mp3, wav, m4a, aac, ogg, flac, webm)' });
    }
  }, [uploadFile]);

  const progressColor = job?.status === 'error' ? 'var(--accent-red)' :
                        job?.status === 'done' ? 'var(--accent-green)' :
                        'var(--accent)';

  return (
    <div className="recorder-panel">
      {/* ─── 처리 중/완료 상태 ─── */}
      {job && (
        <div className={`job-status-card ${job.status === 'done' ? 'done' : ''} ${job.status === 'error' ? 'error' : ''}`}>
          <div className="job-status-header">
            <span className="job-status-icon">
              {job.status === 'done' ? '✅' : job.status === 'error' ? '❌' : '⏳'}
            </span>
            <span className="job-status-filename">{job.filename}</span>
            {job.file_size_mb && <span className="job-status-size">{job.file_size_mb}MB</span>}
          </div>
          {job.status !== 'done' && job.status !== 'error' && (
            <>
              <div className="job-progress-bar">
                <div className="job-progress-fill" style={{ width: `${job.progress}%`, background: progressColor }} />
              </div>
              <div className="job-progress-info">
                <span>{job.step}</span>
                <span>{job.progress}%</span>
              </div>
            </>
          )}
          {job.status === 'done' && (
            <>
              <div className="job-done-msg">회의록이 완성됐어요! 목록에서 확인할 수 있어요.</div>
              <button className="btn btn-sm" onClick={clearCompleted} style={{ marginTop: 8 }}>닫기</button>
            </>
          )}
          {job.status === 'error' && (
            <div className="job-error-msg">{job.error || '처리 중 오류가 발생했어요.'}</div>
          )}
        </div>
      )}

      {uploading && (
        <div className="recorder-loading">
          <div className="meetings-spinner" />
          <p>업로드 중...</p>
        </div>
      )}

      {/* ─── 녹음 중 ─── */}
      {recording ? (
        <div className="recorder-active">
          <div className="recorder-pulse-row">
            <div className={`recorder-pulse ${paused ? 'paused' : ''}`} />
            <span className="recorder-time">{formatTime(recordTime)}</span>
          </div>
          <div className="recorder-controls">
            <button className="btn btn-rec-pause" onClick={togglePause}>
              {paused ? '▶ 계속' : '⏸ 일시정지'}
            </button>
            <button className="btn btn-rec-stop" onClick={stopRecording}>
              ⏹ 녹음 종료
            </button>
          </div>
        </div>
      ) : audioBlob ? (
        /* ─── 녹음 완료 확인 ─── */
        <div className="recorder-confirm">
          <div className="recorder-confirm-icon">🎙️</div>
          <div className="recorder-confirm-title">녹음이 완료됐어요</div>
          <div className="recorder-confirm-duration">길이: {formatTime(recordTime)}</div>
          {audioUrl && <audio controls src={audioUrl} className="recorder-audio-preview" />}
          <div className="recorder-confirm-actions">
            <button className="btn btn-rec-upload" onClick={() => uploadRecording()} disabled={!!job}>
              ✅ 전사 및 요약 진행
            </button>
            <button className="btn btn-rec-discard" onClick={discardRecording} disabled={!!job}>
              ✕ 다시 녹음 / 취소
            </button>
          </div>
        </div>
      ) : !job && !uploading ? (
        /* ─── 기본: 녹음 + 업로드 ─── */
        <div className="recorder-default">
          <button className="btn btn-rec-start" onClick={startRecording}>
            🔴 회의 녹음 시작
          </button>
          <div className="recorder-divider"><span>또는</span></div>
          <div
            className={`recorder-dropzone ${dragOver ? 'active' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <span className="recorder-dropzone-icon">📁</span>
            <span>오디오 파일을 드래그하거나 클릭해서 업로드</span>
            <span className="recorder-dropzone-hint">mp3, wav, m4a, aac, ogg, flac</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadFile(file);
              e.target.value = '';
            }}
          />
        </div>
      ) : null}

      {micError && <div className="recorder-error">{micError}</div>}
    </div>
  );
}
