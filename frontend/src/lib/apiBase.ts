// ─────────────────────────────────────────────────────────────
// apiBase — 런타임 API 주소 관리자
//
// 문제: VITE_API_BASE가 빌드 시점에 JS 번들에 굳어버려서,
//       Cloudflare Quick Tunnel URL이 바뀌면 운영계 전체가 죽음.
//
// 해결: 1) 현재 주소가 살아있으면 그대로 사용 (빠른 경로)
//       2) 죽었으면 GitHub에서 최신 터널 URL을 받아와 자동 전환
//       3) Mac mini의 tunnel-keeper가 URL 변경 시 자동 발행
//
// 참고:
//  - tunnel.json은 tunnel-keeper 스크립트가 develop 브랜치에 커밋함
//  - raw.githubusercontent.com은 5분 캐시 → 캐시 무시 쿼리스트링 사용
// ─────────────────────────────────────────────────────────────

import { create } from 'zustand';

const GITHUB_RAW_BASE =
  'https://raw.githubusercontent.com/buildersconsulting2026/aiggle-web/develop/tunnel.json';

/** 빌드 시점에 주입된 기본값 (터널 URL 또는 '' = 같은 오리진) */
const BUILTIN_BASE: string = import.meta.env.VITE_API_BASE || '';

/** health check 경로 — 가장 가벼운 GET 엔드포인트 */
const HEALTH_PATH = '/api/rooms';

/** 현재 유효한 API 베이스. 초기값은 번들에 박힌 값 */
let currentBase: string = BUILTIN_BASE;
/** 현재 진행 중인 ensureBase() 호출 (동시 호출 병합용) */
let inflight: Promise<string> | null = null;
/** 마지막 성공 시각 (ms) — 이 시간 내 재검증 생략 */
let lastVerifiedAt = 0;
/** 검증 유효 기간 */
const VERIFY_TTL_MS = 60_000;

export interface ApiBaseState {
  /** 런타임 API 베이스 ('' = 같은 오리진) */
  apiBase: string;
  /** 자동 복구 절차 진행 중 여부 */
  recovering: boolean;
  /** 복구 이력 (최근 것부터, 최대 5개) */
  recoveries: Array<{ from: string; to: string; at: string }>;
}

export const useApiBaseStore = create<ApiBaseState>(() => ({
  apiBase: BUILTIN_BASE,
  recovering: false,
  recoveries: [],
}));

function setRecovering(b: boolean) {
  useApiBaseStore.setState({ recovering: b });
}

function pushRecovery(from: string, to: string) {
  const recoveries = [
    { from, to, at: new Date().toISOString() },
    ...useApiBaseStore.getState().recoveries,
  ].slice(0, 5);
  useApiBaseStore.setState({ recoveries, apiBase: to });
}

/** URL이 살아있는지 확인 (타임아웃 5초) */
async function isAlive(base: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => tunnelTimeoutAbort(ctrl), 5000);
    const res = await fetch(`${base}${HEALTH_PATH}`, {
      signal: ctrl.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

function tunnelTimeoutAbort(ctrl: AbortController) {
  ctrl.abort();
}

/** GitHub develop 브랜치에서 최신 tunnel.json 페치 (캐시 무시) */
async function fetchTunnelFromGitHub(): Promise<string | null> {
  try {
    const res = await fetch(`${GITHUB_RAW_BASE}?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    const url: unknown = data?.url;
    if (typeof url !== 'string') return null;
    const trimmed = url.replace(/\/+$/, '');
    if (!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(trimmed)) return null;
    return trimmed;
  } catch {
    return null;
  }
}

/**
 * 유효한 API 베이스를 반환. 필요하면 자동 복구 수행.
 * 모든 API 호출 전에 await ensureBase() 후 값을 사용한다.
 */
export async function ensureBase(): Promise<string> {
  const now = Date.now();
  if (now - lastVerifiedAt < VERIFY_TTL_MS) return currentBase;

  if (inflight) return inflight;

  inflight = (async () => {
    try {
      if (await isAlive(currentBase)) {
        lastVerifiedAt = now;
        if (import.meta.env.DEV) console.debug('[apiBase] alive:', currentBase);
        return currentBase;
      }
      // 죽었음 → GitHub에서 최신 URL 수신
      setRecovering(true);
      if (import.meta.env.DEV) console.debug('[apiBase] DEAD:', currentBase, '→ fetching tunnel.json');
      const fresh = await fetchTunnelFromGitHub();
      if (import.meta.env.DEV) console.debug('[apiBase] tunnel.json says:', fresh);
      if (fresh && fresh !== currentBase) {
        const from = currentBase;
        currentBase = fresh;
        lastVerifiedAt = Date.now();
        pushRecovery(from, fresh);
        console.info('[apiBase] SWITCHED:', from, '→', fresh);
        return fresh;
      }
      if (fresh && fresh === currentBase) {
        // GitHub에도 같은 URL — 터널 재시작 중일 수 있음. 검증만 갱신.
        lastVerifiedAt = 0; // 즉시 재시도 허용
        return currentBase;
      }
      // GitHub에서 못 받음 — 마지막 시도 시간만 갱신해 1분 스팸 방지
      lastVerifiedAt = Date.now();
      return currentBase;
    } finally {
      setRecovering(false);
      inflight = null;
    }
  })();

  return inflight;
}

/**
 * fetch 래퍼 — ensureBase 후 절대경로로 요청.
 * 통일된 진입점: 앱 전체의 API 호출이 이걸 거치게 된다.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = await ensureBase();
  return fetch(`${base}${path}`, init);
}

/** 현재 값을 동기적으로 읽기 (WS URL 계산 등) */
export function getApiBase(): string {
  return currentBase;
}

/** 테스트/수동 전환용 */
export function setApiBase(base: string) {
  currentBase = base;
  lastVerifiedAt = Date.now();
  useApiBaseStore.setState({ apiBase: base });
}

/** 수동 재검증 트리거 (예: WS 재연결 실패 시) */
export function invalidateApiBase() {
  lastVerifiedAt = 0;
}

/** WS 전용 베이스 (wss://...) */
export async function getWsBase(): Promise<string> {
  const base = await ensureBase();
  return baseToWs(base);
}

function baseToWs(base: string): string {
  return base.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
}
