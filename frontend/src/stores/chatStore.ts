import { create } from 'zustand';
import type { User, Room, Message } from '../types';
import { apiFetch, getWsBase, invalidateApiBase } from '../lib/apiBase';

const API = '/api';

interface ChatState {
  // Auth
  currentUser: User | null;
  login: (name: string) => Promise<void>;

  // Rooms
  rooms: Room[];
  currentRoom: number | null;
  fetchRooms: () => Promise<void>;
  setCurrentRoom: (id: number) => void;

  // Messages
  messages: Message[];
  threadMessages: Message[];
  threadParent: Message | null;
  fetchMessages: (roomId: number) => Promise<void>;
  fetchThreads: (parentId: number) => Promise<void>;
  openThread: (parent: Message) => Promise<void>;
  closeThread: () => void;

  // Users
  users: User[];
  fetchUsers: () => Promise<void>;

  // WebSocket
  ws: WebSocket | null;
  connected: boolean;
  _wsRetryTimer: ReturnType<typeof setTimeout> | null;
  _wsRetries: number;
  connectWS: (roomId: number) => void;
  _scheduleWsRetry: (roomId: number, attempt: number) => void;
  disconnectWS: () => void;
  sendMessage: (content: string, parentId?: number | null, mentions?: string[]) => void;
  // UI
  sidebarOpen: boolean;
  chatOpen: boolean;
  toggleSidebar: () => void;
  toggleChat: () => void;

  // Discord Sync
  discordConnected: boolean | null;
  syncing: boolean;
  checkDiscord: () => Promise<void>;
  syncDiscord: (roomId?: number) => Promise<void>;

  // AI
  aiConnected: boolean | null;
  aiThinking: boolean;
  checkAI: () => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  currentUser: null,

  login: async (name: string) => {
    const res = await apiFetch(`${API}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, role: 'member' }),
    });
    const user = await res.json();
    set({ currentUser: user });
    localStorage.setItem('aiggle_user', JSON.stringify(user));
    await get().fetchRooms();
    await get().fetchUsers();
  },

  rooms: [],
  currentRoom: null,

  fetchRooms: async () => {
    const res = await apiFetch(`${API}/rooms`);
    const rooms = await res.json();
    if (rooms.length > 0 && get().currentRoom === null) {
      set({ rooms, currentRoom: rooms[0].id });
      // 초기 채팅방 메시지 로드 + WebSocket 연결
      await get().fetchMessages(rooms[0].id);
      get().connectWS(rooms[0].id);
    } else {
      set({ rooms });
    }
  },

  setCurrentRoom: (id: number) => {
    const { ws } = get();
    if (ws) ws.close();
    set({ currentRoom: id, messages: [], threadMessages: [], threadParent: null });
    get().fetchMessages(id);
    get().connectWS(id);
  },

  messages: [],
  threadMessages: [],
  threadParent: null,

  fetchMessages: async (roomId: number) => {
    const res = await apiFetch(`${API}/rooms/${roomId}/messages`);
    const messages = await res.json();
    set({ messages });
  },

  fetchThreads: async (parentId: number) => {
    const res = await apiFetch(`${API}/messages/${parentId}/threads`);
    const threads = await res.json();
    set({ threadMessages: threads });
  },

  openThread: async (parent: Message) => {
    set({ threadParent: parent });
    await get().fetchThreads(parent.id);
  },

  closeThread: () => {
    set({ threadParent: null, threadMessages: [] });
  },

  users: [],

  fetchUsers: async () => {
    const res = await apiFetch(`${API}/users`);
    const users = await res.json();
    set({ users });
  },

  ws: null,
  connected: false,
  _wsRetryTimer: null,
  _wsRetries: 0,

  _scheduleWsRetry: (roomId: number, attempt: number) => {
    // 지수 백오프: 2s, 4s, 8s, ... 최대 30s
    const delay = Math.min(2000 * Math.pow(2, attempt - 1), 30000);
    const timer = setTimeout(async () => {
      set({ _wsRetryTimer: null });
      const { currentUser } = get();
      if (!currentUser) return; // 로그아웃 상태면 재연결 안 함
      try {
        await get().connectWS(roomId);
      } catch {
        get()._scheduleWsRetry(roomId, attempt + 1);
      }
    }, delay);
    set({ _wsRetryTimer: timer, _wsRetries: attempt });
  },

  connectWS: async (roomId: number) => {
    // 기존 연결 정리 (재연결 타이머도)
    const old = get().ws;
    if (old) {
      old.onclose = null;
      old.close();
    }
    const oldTimer = get()._wsRetryTimer;
    if (oldTimer) { clearTimeout(oldTimer); set({ _wsRetryTimer: null }); }

    const wsBase = await getWsBase(); // 런타임 베이스 (자동 복구 반영)
    const ws = new WebSocket(`${wsBase}/ws/${roomId}`);
    ws.onopen = () => set({ connected: true, _wsRetries: 0 });
    ws.onclose = () => {
      set({ connected: false, ws: null });
      // 비정상 종료(터널 교체 등): 캐시 무효화 + 지수 백오프 재연결
      invalidateApiBase();
      if (!get()._wsRetryTimer) {
        get()._scheduleWsRetry(roomId, 1);
      }
    };
    ws.onmessage = (ev) => {
      const msg: Message = JSON.parse(ev.data);
      const { messages, threadMessages, threadParent } = get();

      // GLM 메시지 수신 시 thinking 해제
      if (msg.user_name === 'GLM' || msg.user_role === 'ai') {
        set({ aiThinking: false });
      }

      // 스레드 메시지면 threadMessages에 추가
      if (msg.parent_id) {
        if (threadParent && msg.parent_id === threadParent.id) {
          set({ threadMessages: [...threadMessages, msg] });
        }
        // 부모 메시지의 reply_count 업데이트
        set({
          messages: messages.map(m =>
            m.id === msg.parent_id ? { ...m, reply_count: m.reply_count + 1 } : m
          ),
        });
      } else {
        // 일반 메시지
        const exists = messages.some(m => m.id === msg.id);
        if (!exists) {
          set({ messages: [...messages, msg] });
        }
      }
    };
    set({ ws });
  },

  disconnectWS: () => {
    const { ws } = get();
    if (ws) {
      ws.close();
      set({ ws: null });
    }
  },

  sendMessage: (content: string, parentId: number | null = null, mentions: string[] = []) => {
    const { ws, currentUser } = get();
    if (!ws || !currentUser || !content.trim()) return;

    // AI 트리거 감지 → thinking 상태
    const triggersAI = /@?(GLM|지엘엠|glm)\b/i.test(content);
    if (triggersAI) {
      set({ aiThinking: true });
    }

    // WS가 끊어져 있으면 재연결 후 전송
    if (ws.readyState !== WebSocket.OPEN) {
      const roomId = get().currentRoom;
      if (roomId) {
        get().connectWS(roomId);
        // 연결이 성공할 때까지 약간 대기 후 재시도
        setTimeout(() => {
          const ws2 = get().ws;
          if (ws2 && ws2.readyState === WebSocket.OPEN) {
            ws2.send(JSON.stringify({
              user_id: get().currentUser!.id,
              content: content.trim(),
              parent_id: parentId,
              mentions,
            }));
          }
        }, 500);
      }
      return;
    }
    ws.send(JSON.stringify({
      user_id: currentUser.id,
      content: content.trim(),
      parent_id: parentId,
      mentions,
    }));
  },

  sidebarOpen: true,
  chatOpen: true,

  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
  toggleChat: () => set(s => ({ chatOpen: !s.chatOpen })),

  // Discord Sync
  discordConnected: null,
  syncing: false,

  checkDiscord: async () => {
    try {
      const res = await apiFetch(`${API}/discord/status`);
      const data = await res.json();
      set({ discordConnected: data.connected === true });
    } catch {
      set({ discordConnected: false });
    }
  },

  syncDiscord: async (roomId?: number) => {
    set({ syncing: true });
    try {
      const url = roomId
        ? `${API}/discord/sync?room_id=${roomId}`
        : `${API}/discord/sync`;
      const res = await apiFetch(url, { method: 'POST' });
      const data = await res.json();
      if (data.synced > 0) {
        const { currentRoom } = get();
        if (currentRoom) await get().fetchMessages(currentRoom);
      }
    } catch (e) {
      console.error('Discord sync failed:', e);
    } finally {
      set({ syncing: false });
    }
  },

  // AI
  aiConnected: null,
  aiThinking: false,

  checkAI: async () => {
    try {
      const res = await apiFetch(`${API}/ai/status`);
      const data = await res.json();
      set({ aiConnected: data.connected === true });
    } catch {
      set({ aiConnected: false });
    }
  },
}));
