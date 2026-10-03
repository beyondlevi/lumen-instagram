#!/bin/sh
# Starts (or restarts) the bridge and a Cloudflare quick tunnel in front of it,
# both in the background, and prints the tunnel's https:// address.
#
#   bridge/scripts/start.sh          # reads bridge/.env (BRIDGE_KEY, IG_* settings)
#
# Logs: bridge/data/bridge.log and bridge/data/tunnel.log. The address changes
# each time the tunnel starts; it is also written to bridge/data/tunnel-url.txt.
set -eu
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
mkdir -p data
chmod 700 data
set -a
. ./.env
set +a
port="${BRIDGE_PORT:-8787}"

pkill -f "lumen_ig_bridge" 2>/dev/null || true
pkill -f "cloudflared tunnel --no-autoupdate --url http://127.0.0.1:$port" 2>/dev/null || true
sleep 1

nohup .venv/bin/python -m lumen_ig_bridge >> data/bridge.log 2>&1 < /dev/null &
for _ in $(seq 1 30); do
  curl -fsS "http://127.0.0.1:$port/v1/health" > /dev/null 2>&1 && break
  sleep 1
done
curl -fsS "http://127.0.0.1:$port/v1/health" > /dev/null || { echo "the bridge did not start: see data/bridge.log" >&2; exit 1; }

: > data/tunnel.log
nohup cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$port" >> data/tunnel.log 2>&1 < /dev/null &
for _ in $(seq 1 60); do
  url=$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' data/tunnel.log | head -1 || true)
  [ -n "$url" ] && break
  sleep 1
done
[ -n "${url:-}" ] || { echo "the tunnel did not start: see data/tunnel.log" >&2; exit 1; }
echo "$url" > data/tunnel-url.txt
echo "$url"
