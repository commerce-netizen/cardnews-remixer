#!/bin/zsh
# 이 맥에 '매일 아침 6시 인기 카드뉴스 수집'을 설치 (다시 실행해도 안전)
# 끄기: launchctl bootout gui/$(id -u)/com.cardnews.hot-collect && rm ~/Library/LaunchAgents/com.cardnews.hot-collect.plist
set -e
BASE="$HOME/.cardnews-hot"
mkdir -p "$BASE/logs" "$HOME/Library/LaunchAgents"
[ -d "$BASE/repo/.git" ] || git clone -q https://github.com/commerce-netizen/cardnews-remixer.git "$BASE/repo"
cp "$(dirname "$0")/aside-run.sh" "$BASE/run.sh" && chmod +x "$BASE/run.sh"
PLIST="$HOME/Library/LaunchAgents/com.cardnews.hot-collect.plist"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.cardnews.hot-collect</string>
  <key>ProgramArguments</key><array><string>/bin/zsh</string><string>$BASE/run.sh</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>6</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$BASE/logs/launchd.out</string>
  <key>StandardErrorPath</key><string>$BASE/logs/launchd.err</string>
</dict></plist>
PL
launchctl bootout gui/$(id -u)/com.cardnews.hot-collect 2>/dev/null || true
launchctl bootstrap gui/$(id -u) "$PLIST"
echo "설치 완료: 매일 06:00 실행 (맥이 잠자고 있었으면 깨어날 때 실행). 로그: $BASE/logs/"
