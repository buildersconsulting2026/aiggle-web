#!/bin/bash
# AIGGLE 터널 + 백엔드 재시작 스크립트
# 사용법: ~/AIGGLE/aiggle-web/start-tunnel.sh
#
# 이 스크립트는:
# 1. 기존 터널 종료
# 2. 새 Quick Tunnel 시작
# 3. tunnel-watcher.sh가 자동으로 URL 변경 감지 → Vercel/GitHub 업데이트

TUNNEL_LOG="/tmp/tunnel_app.log"
CLOUDFLARED=~/bin/cloudflared

echo "=== AIGGLE 터널 재시작 ==="

# 1. 기존 터널 프로세스 종료
echo "[1/3] 기존 터널 종료 중..."
pkill -f "cloudflared tunnel --url http://localhost:8000" 2>/dev/null
sleep 2

# 2. 로그 파일 초기화
> "$TUNNEL_LOG"

# 3. 새 터널 시작
echo "[2/3] 새 터널 시작 중..."
nohup $CLOUDFLARED tunnel --url http://localhost:8000 > "$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!
echo "  터널 PID: $TUNNEL_PID"

# 4. URL 할당 대기
echo "[3/3] URL 할당 대기 중..."
for i in $(seq 1 20); do
  sleep 2
  URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | tail -1)
  if [ -n "$URL" ]; then
    echo ""
    echo "✅ 터널 활성화: $URL"
    echo "✅ 로컬 백엔드: http://localhost:8000"
    echo ""
    echo "tunnel-watcher.sh가 실행 중이면 Vercel/GitHub가 자동 업데이트됩니다."
    exit 0
  fi
  echo -n "."
done

echo ""
echo "❌ 터널 URL 할당 실패. 로그 확인: $TUNNEL_LOG"
exit 1
