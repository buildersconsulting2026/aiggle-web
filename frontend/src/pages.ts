import { getApiBase } from './lib/apiBase';

export type PageKey = 'dashboard' | 'transcribe' | 'meetings' | 'logs' | 'painpoints' | 'roadmap';

// embedPath는 렌더 시점에 현재 API 베이스로 계산한다 (터널 교체 대응)
export const PAGES: Record<PageKey, { label: string; icon: string; embedPath?: string; native?: boolean }> = {
  dashboard:   { label: '대시보드',    icon: '🏠' },
  transcribe:  { label: '전사',        icon: '🎙️', embedPath: `/meetings/` },
  meetings:    { label: '회의록',      icon: '📋', native: true },
  logs:        { label: '업무일지',    icon: '📝', embedPath: `/meetings/logs` },
  painpoints:  { label: '페인포인트',  icon: '🔥', embedPath: `/meetings/painpoints` },
  roadmap:     { label: 'PM 로드맵',   icon: '🗺️', embedPath: `/meetings/roadmap` },
};

/** 렌더 시점 현재 베이스로 embedPath 완성 */
export function embedUrl(key: PageKey): string | null {
  const p = PAGES[key];
  if (!p?.embedPath) return null;
  return `${getApiBase()}${p.embedPath}`;
}
