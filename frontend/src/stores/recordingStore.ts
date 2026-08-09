import { create } from 'zustand';
import { useChatStore } from './chatStore';

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

interface ActiveRecording {
  session_id: string;
  recorder: string;
  device: string;
  started_at: string;
  status: 'recording' | 'paused';
  elapsed_sec: number;
}

interface RecordingState {
  // 내 녹음 상태
  recording: boolean;
  paused: boolean;
  recordTime: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  micError: string | null;

  // 업로드/처리 상태
  uploading: boolean;
  job: JobStatus | null;
  jobJustCompleted: boolean; // job이 방금 완료됨 (목록 새로고침용)

  // 다른 팀원 녹음 (서버에서 가져옴)
  otherRecordings: ActiveRecording[];

  // 내부용
  _mediaRecorder: MediaRecorder | null;
  _stream: MediaStream | null;
  _chunks: Blob[];
  _timerId: ReturnType<typeof setInterval> | null;
  _pollId: ReturnType<typeof setInterval> | null;
  _syncId: ReturnType<typeof setInterval> | null;
  _sessionId: string | null;
  _mimeType: string;

  // 액션
  startRecording: () => Promise<void>;
  togglePause: () => void;
  stopRecording: () => void;
  discardRecording: () => void;
  uploadRecording: () => Promise<void>;
  uploadFile: (file: File) => Promise<void>;
  clearCompleted: () => void;
  startOtherRecordingsPolling: () => void;
  stopOtherRecordingsPolling: () => void;
  _syncToServer: () => void;
  _stopServerSession: () => void;
}

const API_BASE = `${import.meta.env.VITE_API_BASE || ''}/meetings/api`;

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// 브라우저/기기 정보 수집
function getDeviceInfo(): string {
  const ua = navigator.userAgent;
  let browser = '알 수 없음';
  let os = '알 수 없음';

  if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Mac/.test(ua)) os = 'macOS';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Linux/.test(ua)) os = 'Linux';

  if (/Chrome\/[\d.]+/.test(ua) && !/Edg/.test(ua)) browser = 'Chrome';
  else if (/Safari\/[\d.]+/.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
  else if (/Firefox\/[\d.]+/.test(ua)) browser = 'Firefox';
  else if (/Edg\/[\d.]+/.test(ua)) browser = 'Edge';

  return `${os} / ${browser}`;
}

export const useRecordingStore = create<RecordingState>((set, get) => ({
  recording: false,
  paused: false,
  recordTime: 0,
  audioBlob: null,
  audioUrl: null,
  micError: null,
  uploading: false,
  job: null,
  jobJustCompleted: false,
  otherRecordings: [],
  _mediaRecorder: null,
  _stream: null,
  _chunks: [],
  _timerId: null,
  _pollId: null,
  _syncId: null,
  _sessionId: null,
  _mimeType: 'audio/webm',

  startRecording: async () => {
    if (get().recording) return;

    set({ micError: null });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'audio/mp4';

      const mr = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        const oldUrl = get().audioUrl;
        if (oldUrl) URL.revokeObjectURL(oldUrl);
        set({ audioBlob: blob, audioUrl: URL.createObjectURL(blob) });
      };

      mr.start(1000);

      const timerId = setInterval(() => {
        set(s => ({ recordTime: s.recordTime + 1 }));
        const t = get().recordTime;
        if (t > 0 && t % 5 === 0) {
          get()._syncToServer();
        }
      }, 1000);

      const recorderName = useChatStore.getState().currentUser?.name || '알 수 없음';
      const device = getDeviceInfo();
      const sessionResp = await fetch(`${API_BASE}/recording/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recorder: recorderName, device }),
      });
      const sessionData = await sessionResp.json();
      const sessionId = sessionData.session_id;

      set({
        recording: true,
        paused: false,
        recordTime: 0,
        audioBlob: null,
        audioUrl: null,
        _mediaRecorder: mr,
        _stream: stream,
        _chunks: chunks,
        _timerId: timerId,
        _mimeType: mimeType,
        _sessionId: sessionId,
      });

      get().startOtherRecordingsPolling();
    } catch (e: any) {
      if (e.name === 'NotAllowedError') {
        set({ micError: '마이크 접근 권한이 거부되었어요. 브라우저 설정에서 마이크를 허용해주세요.' });
      } else if (e.name === 'NotFoundError') {
        set({ micError: '마이크를 찾을 수 없어요. 마이크가 연결되어 있는지 확인해주세요.' });
      } else {
        set({ micError: `마이크 오류: ${e.message || e}` });
      }
    }
  },

  togglePause: () => {
    const { _mediaRecorder: mr, paused, _timerId: timerId } = get();
    if (!mr) return;
    if (paused) {
      mr.resume();
      set({ paused: false });
      const newTimer = setInterval(() => {
        set(s => ({ recordTime: s.recordTime + 1 }));
        const t = get().recordTime;
        if (t > 0 && t % 5 === 0) get()._syncToServer();
      }, 1000);
      set({ _timerId: newTimer });
      get()._syncToServer();
    } else {
      mr.pause();
      set({ paused: true });
      if (timerId) { clearInterval(timerId); set({ _timerId: null }); }
      get()._syncToServer();
    }
  },

  stopRecording: () => {
    const { _mediaRecorder: mr, _stream: stream, _timerId: timerId } = get();
    if (mr && mr.state !== 'inactive') mr.stop();
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (timerId) { clearInterval(timerId); }
    get()._stopServerSession();
    set({ recording: false, paused: false, _timerId: null });
  },

  discardRecording: () => {
    const { audioUrl } = get();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    set({
      audioBlob: null,
      audioUrl: null,
      recordTime: 0,
      micError: null,
    });
  },

  uploadRecording: async () => {
    const { audioBlob, _mimeType: mimeType } = get();
    if (!audioBlob) return;
    const ext = mimeType.includes('mp4') ? 'm4a' : 'webm';
    const filename = `회의녹음_${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.${ext}`;
    const file = new File([audioBlob], filename, { type: audioBlob.type });
    await get().uploadFile(file);
    get().discardRecording();
  },

  uploadFile: async (file) => {
    set({ uploading: true, job: null, jobJustCompleted: false, micError: null });
    try {
      const recorderName = useChatStore.getState().currentUser?.name || '알 수 없음';
      const device = getDeviceInfo();

      const formData = new FormData();
      formData.append('file', file);
      formData.append('language', 'ko');
      formData.append('recorder', recorderName);
      formData.append('device', device);

      const resp = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
      });
      if (!resp.ok) throw new Error('업로드 실패');
      const data = await resp.json();
      set({
        uploading: false,
        job: {
          id: data.job_id,
          status: 'queued',
          step: '대기 중',
          progress: 0,
          filename: data.filename,
          total_chunks: 0,
          file_size_mb: data.file_size_mb,
        },
      });

      // 폴링 — store 안에서 완전히 관리, 콜백 없음
      const pollId = setInterval(async () => {
        try {
          const jobResp = await fetch(`${API_BASE}/job/${data.job_id}`);
          if (!jobResp.ok) return;
          const jobData: JobStatus = await jobResp.json();
          set({ job: jobData });
          if (jobData.status === 'done' || jobData.status === 'error') {
            const pid = get()._pollId;
            if (pid) { clearInterval(pid); set({ _pollId: null }); }
            if (jobData.status === 'done') {
              set({ jobJustCompleted: true });
            }
          }
        } catch { /* retry */ }
      }, 2000);
      set({ _pollId: pollId });
    } catch (e: any) {
      set({ uploading: false, micError: `업로드 오류: ${e.message || e}` });
    }
  },

  clearCompleted: () => {
    set({ job: null, jobJustCompleted: false });
  },

  // ─── 서버 녹음 세션 동기화 ───
  _syncToServer: () => {
    const { _sessionId: sessionId, paused, recordTime } = get();
    if (!sessionId) return;
    fetch(`${API_BASE}/recording/${sessionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: paused ? 'paused' : 'recording',
        elapsed_sec: recordTime,
      }),
    }).catch(() => {});
  },

  _stopServerSession: () => {
    const { _sessionId: sessionId } = get();
    if (!sessionId) return;
    fetch(`${API_BASE}/recording/${sessionId}`, { method: 'DELETE' }).catch(() => {});
    set({ _sessionId: null });
  },

  startOtherRecordingsPolling: () => {
    const existing = get()._syncId;
    if (existing) clearInterval(existing);
    const pollOther = async () => {
      try {
        const resp = await fetch(`${API_BASE}/recordings/active`);
        if (!resp.ok) return;
        const data = await resp.json();
        const mySession = get()._sessionId;
        const others = (data.recordings || []).filter(
          (r: ActiveRecording) => r.session_id !== mySession
        );
        set({ otherRecordings: others });
      } catch { /* ignore */ }
    };
    pollOther();
    const syncId = setInterval(pollOther, 3000);
    set({ _syncId: syncId });
  },

  stopOtherRecordingsPolling: () => {
    const syncId = get()._syncId;
    if (syncId) { clearInterval(syncId); set({ _syncId: null }); }
  },
}));

// 앱 시작 시 다른 팀원 녹음 폴링 시작
useRecordingStore.getState().startOtherRecordingsPolling();

export { formatTime };
export type { JobStatus, ActiveRecording };
