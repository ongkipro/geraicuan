#!/usr/bin/env bash
# Starts (or confirms) a headless Chrome with CDP remote debugging for the
# scripts in this directory. Idempotent: does nothing if something is already
# answering on the port.
set -uo pipefail
PORT="${CDP_PORT:-9411}"
PROFILE="${UI_AUDIT_CHROME_PROFILE:-/tmp/geraicuan-ui-audit-chrome-profile}"

if curl -s "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
  echo "CDP already reachable on ${PORT}"
  exit 0
fi

CHROME="${CHROME_BIN:-}"
if [ -z "$CHROME" ]; then
  for candidate in /opt/google/chrome/chrome google-chrome google-chrome-stable chromium chromium-browser; do
    if command -v "$candidate" >/dev/null 2>&1 || [ -x "$candidate" ]; then CHROME="$candidate"; break; fi
  done
fi
if [ -z "$CHROME" ]; then
  echo "No Chrome/Chromium binary found. Set CHROME_BIN to its path." >&2
  exit 1
fi

mkdir -p "$PROFILE"
setsid nohup "$CHROME" \
  --headless=new --no-first-run --no-default-browser-check --disable-gpu \
  --remote-debugging-address=127.0.0.1 --remote-debugging-port="$PORT" \
  --user-data-dir="$PROFILE" about:blank \
  > /tmp/geraicuan-ui-audit-chrome.log 2>&1 < /dev/null &
disown

for _ in $(seq 1 30); do
  if curl -s "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
    echo "CDP reachable on ${PORT}"
    exit 0
  fi
  sleep 0.5
done
echo "Chrome did not become reachable on ${PORT}; see /tmp/geraicuan-ui-audit-chrome.log" >&2
exit 1
