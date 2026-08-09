# AIGGLE Web — 핸드오프

> 최종 업데이트: 2026-08-09 (지엘엠)

## 현재 상태

### 인프라
- **GitHub repo**: buildersconsulting2026/aiggle-web (public)
- **GitHub Pages**: https://buildersconsulting2026.github.io/aiggle-web/ (배포 중)
- **백엔드**: FastAPI (localhost:8000) → Cloudflare 터널로 외부 노출
- **whisper-serve**: localhost:3000 → Cloudflare 터널로 외부 노출
- **도메인 연결**: 미완료 (Vercel 배포 시도 중 — 아래 참조)

### 프론트엔드 배포 구조
- React + Vite + TypeScript + Zustand
- 빌드 시 `VITE_API_BASE` 환경변수로 백엔드 URL 주입
- GitHub Actions 워크플로우 (`.github/workflows/deploy.yml`)가 자동 배포
- 프론트엔드 코드는 상대경로(`/api`, `/ws`) 대신 환경변수 기반 절대경로 사용

### 도메인 연결 (진행 중)
- 목표: `www.buildersconsulting.co.kr` → AIGGLE 웹앱
- 현재 `www`는 Vercel(builderstax-web 프로젝트)을 가리키 중
- **블로커**: Vercel GitHub Integration이 설치되지 않아 새 repo 연결 불가
  - 해결 방법: Vercel 대시보드에서 GitHub App 설치 후 aiggle-web repo 권한 추가
  - 또는 cafe24 DNS에서 www CNAME을 buildersconsulting2026.github.io로 변경

---

## 개발 요구사항 (TODO)

### 🔐 로그인 인증 (우선순위: 높음)
**배경**: repo가 public이고 URL도 공개되어 있어 누구나 접근 가능.

**요구사항**:
- [ ] 로그인 화면 구현 (이름 입력 → 세션/토큰 발급)
- [ ] 인증되지 않은 사용자는 로그인 페이지로 리다이렉트
- [ ] 백엔드 API에 인증 미들웨어 추가
- [ ] 기존 LoginScreen.tsx 컴포넌트 확장 가능 (현재는 단순 이름만 입력)

**참고**: 현재 LoginScreen.tsx에 기본 로그인 UI가 있으나, 실제 인증 로직(비밀번호/토큰/세션 만료)은 없음. 백엔드 main.py에 users 테이블은 있으나 인증 게이트가 없음.

---

## 구조

```
aiggle-web/
├── .github/workflows/deploy.yml   # GitHub Pages 자동 배포
├── .gitignore                     # node_modules, venv, data, dist 제외
├── CNAME                          # 커스텀 도메인 (현재 www.buildersconsulting.co.kr)
├── backend/
│   ├── main.py                    # FastAPI (채팅, WebSocket, Discord 동기화, whisper 프록시)
│   ├── migrate_v2.py
│   ├── requirements.txt
│   └── seed.py
├── frontend/
│   ├── .env.production            # VITE_API_BASE (터널 URL)
│   ├── public/CNAME               # 빌드 시 dist로 복사
│   ├── src/
│   │   ├── stores/chatStore.ts    # Zustand (API_BASE 환경변수 사용)
│   │   ├── pages.ts               # 사이드바 탭 정의 (embedPath도 API_BASE 사용)
│   │   ├── components/            # LoginScreen, ChatMain, Sidebar, MeetingsPage 등
│   │   └── styles/global.css
│   └── vite.config.ts             # /api, /ws 프록시 (개발용)
└── data/                          # SQLite DB (git 제외)
```

## 환경 변수
| 변수 | 위치 | 값 |
|------|------|-----|
| VITE_API_BASE | GitHub repo variable | https://growing-mods-incomplete-officer.trycloudflare.com |
| VITE_API_BASE | frontend/.env.production | 동일 (fallback) |
| WHISPER_SERVE_URL | 백엔드 환경변수 | http://localhost:3000 (기본값) |

## 터널 URL 변경 시 대응
1. GitHub repo variable 업데이트: Settings → Secrets and variables → Actions → Variables → VITE_API_BASE
2. frontend/.env.production 파일 수정
3. main 브랜치에 push (자동 재배포)

## 계정 정보
- GitHub: buildersconsulting2026
- Vercel: buildersconsulting2026@gmail.com
