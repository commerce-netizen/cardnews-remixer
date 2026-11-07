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
  # 다음 실행부터는 최신 실행 스크립트를 쓰도록 스스로 갱신
  cp "$BASE/repo/scripts/hot/aside-run.sh" "$BASE/run.sh.new" && mv "$BASE/run.sh.new" "$BASE/run.sh" && chmod +x "$BASE/run.sh"
  pgrep -xq Aside || { open -ga Aside; sleep 30; }
  # 실패하면(Aside 먹통·인터넷 끊김 등) 기존 데이터는 그대로 두고, 15분 간격으로 최대 5번 다시 시도
  # caffeinate: 수집하는 동안 맥이 잠들지 않게
  ok=0
  for i in 1 2 3 4 5; do
    if caffeinate -i node "$BASE/repo/scripts/hot/aside-collect.mjs"; then ok=1; break; fi
    echo "다시 시도 ($i/5) — 15분 뒤"; sleep 900
  done
  [ $ok = 1 ] || echo "❌ 오늘 수집 실패 — 사이트에는 어제 데이터가 그대로 보여요"
} >> "$LOG" 2>&1
# 30일 지난 로그 정리
find "$BASE/logs" -name '*.log' -mtime +30 -delete
