#!/bin/bash
# AIGGLE 터널 URL 자동 업데이트 스크립트
# 터널이 재시작되면 새 URL을 감지해서 Vercel + GitHub 환경변수를 업데이트
#
# 사용법: 
#   VERCEL_TOKEN=xxx GH_TOKEN=xxx ./tunnel-watcher.sh
#   또는 ~/.hermes/.env 에 토큰이 있으면 자동 로드

TUNNEL_LOG="${TUNNEL_LOG:-/tmp/tunnel_app.log}"
VERCEL_PROJECT="aiggle-web"
GH_REPO="buildersconsulting2026/aiggle-web"
CURRENT_URL=""

# 토큰 로드 (환경변수 > .env 파일)
if [ -z "$VERCEL_TOKEN" ]; then
  for f ~/.hermes/.env .env; do
    [ -f "$f" ] && source <(grep -E '^VERCEL_TOKEN=' "$f" 2>/dev/null)
  done
fi
if [ -z "$GH_TOKEN" ]; then
  for f ~/.hermes/.env .env; do
    [ -f "$f" ] && source <(grep -E '^GH_TOKEN=' "$f" 2>/dev/null)
  done
fi

if [ -z "$VERCEL_TOKEN" ] || [ -z "$GH_TOKEN" ]; then
  echo "❌ VERCEL_TOKEN 또는 GH_TOKEN 환경변수가 필요합니다."
  echo "   VERCEL_TOKEN=xxx GH_TOKEN=xxx ./tunnel-watcher.sh"
  exit 1
fi

update_vercel() {
  local url="$1"
  echo "[$(date '+%H:%M:%S')] Vercel 환경변수 업데이트: $url"
  
  ENV_ID=$(curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v9/projects/$VERCEL_PROJECT/env" | \
    python3 -c "import json,sys; [print(e['id']) for e in json.load(sys.stdin).get('envs',[]) if e.get('key')=='VITE_API_BASE']" 2>/dev/null)
  
  if [ -n "$ENV_ID" ]; then
    curl -s -X PATCH \
      -H "Authorization: Bearer $VERCEL_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"value\":\"$url\",\"type\":\"plain\",\"target\":[\"production\",\"preview\",\"development\"]}" \
      "https://api.vercel.com/v9/projects/$VERCEL_PROJECT/env/$ENV_ID" > /dev/null
  fi
  
  # 재배포 트리거
  DEPLOY_ID=$(curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v6/deployments?app=$VERCEL_PROJECT&limit=1&target=production" | \
    python3 -c "import json,sys; d=json.load(sys.stdin); print(d['deployments'][0]['uid'])" 2>/dev/null)
  
  if [ -n "$DEPLOY_ID" ]; then
    curl -s -X POST \
      -H "Authorization: Bearer $VERCEL_TOKEN" \
      "https://api.vercel.com/v13/deployments/$DEPLOY_ID/redployments" > /dev/null 2>&1
  fi
  
  echo "[$(date '+%H:%M:%S')] Vercel 업데이트 완료"
}

update_github() {
  local url="$1"
  echo "[$(date '+%H:%M:%S')] GitHub 변수 업데이트: $url"
  curl -s -X DELETE \
    -H "Authorization: token $GH_TOKEN" \
    "https://api.github.com/repos/$GH_REPO/actions/variables/VITE_API_BASE" > /dev/null 2>&1
  curl -s -X POST \
    -H "Authorization: token $GH_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"VITE_API_BASE\",\"value\":\"$url\"}" \
    "https://api.github.com/repos/$GH_REPO/actions/variables" > /dev/null
  echo "[$(date '+%H:%M:%S')] GitHub 업데이트 완료"
}

echo "[시작] AIGGLE 터널 URL 감시 시작"
echo "[시작] 로그: $TUNNEL_LOG"

while true; do
  NEW_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | tail -1)
  
  if [ -n "$NEW_URL" ] && [ "$NEW_URL" != "$CURRENT_URL" ]; then
    echo ""
    echo "[$(date '+%H:%M:%S')] 🔄 터널 URL 변경 감지!"
    echo "  이전: $CURRENT_URL"
    echo "  새: $NEW_URL"
    
    CURRENT_URL="$NEW_URL"
    
    update_vercel "$NEW_URL"
    update_github "$NEW_URL"
    
    echo "[$(date '+%H:%M:%S')] ✅ 모든 업데이트 완료: $NEW_URL"
    echo ""
  fi
  
  sleep 10
done
