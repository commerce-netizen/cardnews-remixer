#!/bin/zsh
# 매일 아침 launchd 가 실행: 최신 코드 받기 → Aside 켜기 → 인기 카드뉴스 수집·업로드
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin"
BASE="$HOME/.cardnews-hot"
mkdir -p "$BASE/logs"
LOG="$BASE/logs/$(date +%Y-%m-%d).log"
{
  echo "===== $(date '+%F %T') ====="
  if [ -d "$BASE/repo/.git" ]; then git -C "$BASE/repo" pull -q --ff-only; else git clone -q https://github.com/commerce-netizen/cardnews-remixer.git "$BASE/repo"; fi
  [ -f "$BASE/sharp/node_modules/sharp/lib/index.js" ] || npm i --prefix "$BASE/sharp" sharp@0.34.5 --silent
  pgrep -xq Aside || { open -ga Aside; sleep 20; }
  for i in 1 2; do
    node "$BASE/repo/scripts/hot/aside-collect.mjs" && break
    echo "다시 시도 ($i)"; sleep 60
  done
} >> "$LOG" 2>&1
# 30일 지난 로그 정리
find "$BASE/logs" -name '*.log' -mtime +30 -delete
