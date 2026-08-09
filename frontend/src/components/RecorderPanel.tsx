import { useState, useRef, useEffect, useCallback } from 'react';

// ─── Types ───
interface JobStatus {
  id: string;
  status: 'queued' | 'transcribing' | 'analyzing' | 'done' | 'error';
  step: string;
  progress: number;
  filename: string;
  total_chunks: number;
  file_size_mb?: number;
  meeting_id?: string;
  error?: string;
}

const API_BASE = '/meetings/api';

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function RecorderPanel({ onCompleted }: { onCompleted: () => void }) {
  // ─── 상태 ───
  const [showConfirm, setShowConfirm] = useState(false);

  // ─── 녹음 상태 ───
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  // ─── 업로드/처리 상태 ───
  const [uploading, setUploading] = useState(false);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // ─── refs ───
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ─── 타이머 정리 ───
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // ─── 녹음 시작 ───
  const startRecording = useCallback(async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
      streamRef.current = stream;
      chunksRef.current = [];

      // webm/opus 지원 확인, fallback to audio/webm
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/mp4';
      }

      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
      };

      mr.start(1000); // 1초마다 데이터 수집
      setRecording(true);
      setPaused(false);
      setRecordTime(0);
      setAudioBlob(null);
      setAudioUrl(null);

      timerRef.current = setInterval(() => {
        setRecordTime(t => t + 1);
      }, 1000);
    } catch (e: any) {
      if (e.name === 'NotAllowedError') {
        setMicError('마이크 접근 권한이 거부되었어요. 브라우저 설정에서 마이크를 허용해주세요.');
      } else if (e.name === 'NotFoundError') {
        setMicError('마이크를 찾을 수 없어요. 마이크가 연결되어 있는지 확인해주세요.');
      } else {
        setMicError(`마이크 오류: ${e.message || e}`);
      }
    }
  }, []);

  // ─── 녹음 일시정지/재개 ───
  const togglePause = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    if (paused) {
      mr.resume();
      setPaused(false);
      timerRef.current = setInterval(() => setRecordTime(t => t + 1), 1000);
    } else {
      mr.pause();
      setPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [paused]);

  // ─── 녹음 중지 ───
  const stopRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') {
      mr.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecording(false);
    setPaused(false);
    setShowConfirm(true); // 확인 다이얼로그 표시
  }, []);

  // ─── 녹음 취소 ───
  const discardRecording = useCallback(() => {
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setRecordTime(0);
    setJob(null);
  }, [audioUrl]);

  // ─── 파일 업로드 처리 ───
  const uploadFile = useCallback(async (file: File) => {
    setUploading(true);
    setJob(null);
    setMicError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('language', 'ko');

      const resp = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
      });
      if (!resp.ok) throw new Error('업로드 실패');
      const data = await resp.json();
      setJob({
        id: data.job_id,
        status: 'queued',
        step: '대기 중',
        progress: 0,
        filename: data.filename,
        total_chunks: 0,
        file_size_mb: data.file_size_mb,
      });
      startPolling(data.job_id);
    } catch (e: any) {
      setMicError(`업로드 오류: ${e.message || e}`);
    } finally {
      setUploading(false);
    }
  }, []);

  // ─── 녹음본 업로드 ───
  const uploadRecording = useCallback(async () => {
    if (!audioBlob) return;
    const ext = audioBlob.type.includes('mp4') ? 'm4a' : 'webm';
    const filename = `회의녹음_${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.${ext}`;
    const file = new File([audioBlob], filename, { type: audioBlob.type });
    await uploadFile(file);
    discardRecording();
  }, [audioBlob, uploadFile, discardRecording]);

  // ─── 작업 상태 폴링 ───
  const startPolling = useCallback((jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`${API_BASE}/job/${jobId}`);
        if (!resp.ok) return;
        const data: JobStatus = await resp.json();
        setJob(data);
        if (data.status === 'done' || data.status === 'error') {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          if (data.status === 'done') {
            setTimeout(() => onCompleted(), 1500);
          }
        }
      } catch { /* retry next tick */ }
    }, 2000);
  }, [onCompleted]);

  // ─── 드래그 앤 드롭 ───
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|m4a|aac|ogg|flac|webm)$/i))) {
      uploadFile(file);
    } else {
      setMicError('오디오 파일만 업로드할 수 있어요. (mp3, wav, m4a, aac, ogg, flac, webm)');
    }
  }, [uploadFile]);

  // ─── 진행률 바 ───
  const progressColor = job?.status === 'error' ? 'var(--accent-red)' :
                        job?.status === 'done' ? 'var(--accent-green)' :
                        'var(--accent)';

  return (
    <div className="recorder-panel">
      {/* ─── 처리 중 상태 ─── */}
      {job && (
        <div className={`job-status-card ${job.status === 'done' ? 'done' : ''} ${job.status === 'error' ? 'error' : ''}`}>
          <div className="job-status-header">
            <span className="job-status-icon">
              {job.status === 'done' ? '✅' : job.status === 'error' ? '❌' : '⏳'}
            </span>
            <span className="job-status-filename">{job.filename}</span>
            {job.file_size_mb && <span className="job-status-size">{job.file_size_mb}MB</span>}
          </div>
          <div className="job-progress-bar">
            <div
              className="job-progress-fill"
              style={{ width: `${job.progress}%`, background: progressColor }}
            />
          </div>
          <div className="job-progress-info">
            <span>{job.step}</span>
            <span>{job.progress}%</span>
          </div>
          {job.status === 'done' && job.meeting_id && (
            <div className="job-done-msg">회의록이 완성됐어요! 목록에서 확인할 수 있어요.</div>
          )}
          {job.status === 'error' && (
            <div className="job-error-msg">{job.error || '처리 중 오류가 발생했어요.'}</div>
          )}
        </div>
      )}

      {/* ─── 업로드 중 ─── */}
      {uploading && (
        <div className="recorder-loading">
          <div className="meetings-spinner" />
          <p>업로드 중...</p>
        </div>
      )}

      {/* ─── 녹음 중 UI ─── */}
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
        /* ─── 녹음 완료 후 미리보기 ─── */
        <div className="recorder-preview">
          <div className="recorder-preview-header">
            <span>🎙 녹음 완료</span>
            <span className="recorder-preview-time">{formatTime(recordTime)}</span>
          </div>
          {audioUrl && (
            <audio controls src={audioUrl} className="recorder-audio-preview" />
          )}
          <div className="recorder-controls">
            <button className="btn btn-rec-upload" onClick={uploadRecording} disabled={!!job}>
              📤 전사 및 요약 시작
            </button>
            <button className="btn" onClick={discardRecording} disabled={!!job}>
              ✕ 취소
            </button>
          </div>
        </div>
      ) : !job && !uploading ? (
        /* ─── 기본 UI: 녹음 + 업로드 ─── */
        <div className="recorder-default">
          <button className="btn btn-rec-start" onClick={startRecording}>
            🔴 회의 녹음 시작
          </button>
          <div className="recorder-divider">
            <span>또는</span>
          </div>
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

      {/* ─── 에러 메시지 ─── */}
      {micError && (
        <div className="recorder-error">{micError}</div>
      )}
    </div>
  );
}
