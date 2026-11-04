#!/bin/zsh
# 매일 아침 launchd 가 실행: 최신 코드 받기 → Aside 켜기 → 인기 카드뉴스 수집·업로드
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin"
BASE="$HOME/.cardnews-hot"
mkdir -p "$BASE/logs"
LOG="$BASE/logs/$(date +%Y-%m-%d).log"
{
  echo "===== $(date '+%F %T') ====="
  [ -d "$BASE/repo/.git" ] || git clone -q https://github.com/commerce-netizen/cardnews-remixer.git "$BASE/repo"
  git -C "$BASE/repo" fetch -q origin
  # main 에 Aside 수집기가 들어가 있으면 main, 아직 머지 전이면 작업 브랜치 코드 사용
  if git -C "$BASE/repo" cat-file -e origin/main:scripts/hot/aside-collect.mjs 2>/dev/null; then REF=origin/main; else REF=origin/feat/aside-collector; fi
  git -C "$BASE/repo" checkout -q --detach "$REF"
  [ -f "$BASE/sharp/node_modules/sharp/lib/index.js" ] || npm i --prefix "$BASE/sharp" sharp@0.34.5 --silent
  pgrep -xq Aside || { open -ga Aside; sleep 20; }
  for i in 1 2; do
    node "$BASE/repo/scripts/hot/aside-collect.mjs" && break
    echo "다시 시도 ($i)"; sleep 60
  done
} >> "$LOG" 2>&1
# 30일 지난 로그 정리
find "$BASE/logs" -name '*.log' -mtime +30 -delete
