#!/bin/bash
# ─────────────────────────────────────────────────────────────
# tunnel-keeper.sh — AIGGLE Quick Tunnel 감시·자동복구·URL 발행
#
# 역할:
#   1. cloudflared Quick Tunnel이 죽었는지 10초마다 감시
#   2. 죽었으면 재시작 (자동 업데이트로 죽어도 커버)
#   3. URL이 바뀌었으면 develop 브랜치의 tunnel.json에 커밋·푸시
#      → 프론트(apiBase.ts)가 이 파일을 읽어 자동 전환
#   4. GitHub Actions 변수(VITE_API_BASE)도 함께 갱신 (Pages용)
#
# 참고:
#   - Vercel은 프론트가 런타임에 GitHub에서 URL을 받아오므로
#     재배포가 필요 없어짐 (tunnel.json 방식)
#   - GitHub raw는 5분 캐시 → 프론트는 캐시 무시 쿼리로 회피
# ─────────────────────────────────────────────────────────────

set -u

TUNNEL_LOG="/tmp/tunnel_app.log"
CLOUDFLARED="$HOME/bin/cloudflared"
REPO_DIR="$HOME/AIGGLE/aiggle-web"
TUNNEL_JSON="$REPO_DIR/tunnel.json"
STATE_FILE="/tmp/tunnel_keeper_state"
REPO_URL="https://github.com/buildersconsulting2026/aiggle-web"
POLL_SEC=10
URL_REGEX='https://[a-z0-9-]+\.trycloudflare\.com'

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$TUNNEL_LOG.keeper"; }

# ─── 토큰 로드 (git remote에 이미 PAT 내장) ───
get_pat() {
  git -C "$REPO_DIR" remote get-url origin 2>/dev/null \
    | sed 's/.*:\/\/\([^@]*\)@.*/\1/'
}

# ─── 현재 터널 URL 추출 ───
# 주의: BSD grep은 BRE에서 +를 리터럴로 취급 → -E(ERE) 사용
current_url() {
  grep -E -o "$URL_REGEX" "$TUNNEL_LOG" 2>/dev/null | tail -1
}

# ─── 터널 살아있는지 확인 ───
# 주의: 터널이 죽어도 Cloudflare 엣지가 530을 응답하며 curl exit=0이 됨
#       → 반드시 HTTP 상태코드가 200인지 봐야 함
tunnel_alive() {
  local url code
  url=$(current_url)
  [ -z "$url" ] && return 1
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "${url}/api/rooms" 2>/dev/null)
  [ "$code" = "200" ]
}

# ─── 새 터널 시작 ───
start_tunnel() {
  log "새 터널 시작"
  pkill -f "cloudflared tunnel --url" 2>/dev/null
  sleep 2
  : > "$TUNNEL_LOG"
  # launchd/nohup 환경 문제 대비: setsid로 완전 분리 + 출력 리다이렉션
  "$CLOUDFLARED" tunnel --url http://localhost:8000 >> "$TUNNEL_LOG" 2>&1 &
  disown
  # 백그라운드 cloudflared가 살아남았는지 확인
  sleep 3
  if ! pgrep -f "cloudflared tunnel --url" >/dev/null 2>&1; then
    log "❌ cloudflared가 시작 직후 사망 — 로그 확인 필요"
    return 1
  fi
  # URL 할당 대기 (최대 40초)
  local i url
  for i in $(seq 1 20); do
    sleep 2
    url=$(current_url)
    if [ -n "$url" ]; then
      log "터널 활성화: $url"
      return 0
    fi
  done
  log "❌ URL 할당 실패"
  return 1
}

# ─── tunnel.json 발행 (develop 브랜치 커밋) ───
publish_url() {
  local url="$1" pat old
  old=$(cat "$TUNNEL_JSON" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('url',''))" 2>/dev/null)
  if [ "$old" = "$url" ]; then
    log "URL 변경 없음 ($url) — 발행 생략"
    return 0
  fi

  # tunnel.json 갱신
  printf '{\n  "url": "%s",\n  "updated_at": "%s"\n}\n' \
    "$url" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$TUNNEL_JSON"

  # git 커밋 (develop)
  if git -C "$REPO_DIR" rev-parse --verify develop >/dev/null 2>&1; then
    local branch
    branch=$(git -C "$REPO_DIR" branch --show-current)
    if [ "$branch" != "develop" ]; then
      git -C "$REPO_DIR" checkout develop >> /dev/null 2>&1
    fi
    git -C "$REPO_DIR" add tunnel.json
    git -C "$REPO_DIR" -c user.name="tunnel-keeper" -c user.email="keeper@aiggle.local" \
      commit -m "chore(tunnel): update tunnel URL [skip ci]" >> /dev/null 2>&1
    if ! git -C "$REPO_DIR" push origin develop >> /dev/null 2>&1; then
      # 원격이 앞서 있으면 리베이스 후 재시도
      git -C "$REPO_DIR" pull --rebase origin develop >> /dev/null 2>&1
      git -C "$REPO_DIR" push origin develop >> /dev/null 2>&1
    fi
    if [ "$branch" != "develop" ] && [ -n "$branch" ]; then
      git -C "$REPO_DIR" checkout "$branch" >> /dev/null 2>&1
    fi
    log "tunnel.json 발행 완료 → $url"
  else
    log "⚠️ develop 브랜치 없음 — tunnel.json 로컬만 갱신"
  fi

  # GitHub Actions 변수 갱신 (Pages 빌드용)
  pat=$(get_pat)
  if [ -n "$pat" ]; then
    curl -s -X PATCH \
      "https://api.github.com/repos/buildersconsulting2026/aiggle-web/actions/variables/VITE_API_BASE" \
      -H "Authorization: token $pat" \
      -H "Accept: application/vnd.github+json" \
      -d "{\"value\": \"$url\"}" > /dev/null 2>&1 \
      && log "GitHub Actions 변수 갱신 완료"
  fi
}

# ─── 메인 루프 ───
mkdir -p "$(dirname "$TUNNEL_LOG")"
log "tunnel-keeper 시작 (PID $$)"

while true; do
  if ! tunnel_alive; then
    log "터널 다운 감지 → 재시작"
    if start_tunnel; then
      publish_url "$(current_url)"
    fi
  else
    # 살아있어도 URL이 발행돼 있는지 주기 확인 (로그 로테이션 등 대비)
    url=$(current_url)
    published=$(cat "$TUNNEL_JSON" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('url',''))" 2>/dev/null)
    if [ -n "$url" ] && [ "$published" != "$url" ]; then
      log "발행된 URL과 실제 URL 불일치 → 재발행"
      publish_url "$url"
    fi
  fi
  sleep "$POLL_SEC"
done
