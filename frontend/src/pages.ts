export type PageKey = 'dashboard' | 'transcribe' | 'meetings' | 'logs' | 'painpoints' | 'roadmap';

export const PAGES: Record<PageKey, { label: string; icon: string; embedPath?: string; native?: boolean }> = {
  dashboard:   { label: '대시보드',    icon: '🏠' },
  transcribe:  { label: '전사',        icon: '🎙️', embedPath: '/meetings/' },
  meetings:    { label: '회의록',      icon: '📋', native: true },
  logs:        { label: '업무일지',    icon: '📝', embedPath: '/meetings/logs' },
  painpoints:  { label: '페인포인트',  icon: '🔥', embedPath: '/meetings/painpoints' },
  roadmap:     { label: 'PM 로드맵',   icon: '🗺️', embedPath: '/meetings/roadmap' },
};
