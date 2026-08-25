#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/.panio-dev.pid"
API_PID_FILE="$ROOT_DIR/.panio-api.pid"
PROTOCOL_FILE="$ROOT_DIR/.panio-dev.protocol"
LOG_FILE="$ROOT_DIR/.panio-dev.log"
API_LOG_FILE="$ROOT_DIR/.panio-api.log"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-5175}"
API_PORT="${API_PORT:-4173}"
PROTOCOL="http"

if [[ "${PANIO_DEV_HTTPS:-0}" == "1" ]]; then
  PROTOCOL="https"
  bash "$ROOT_DIR/scripts/create-dev-cert.sh"
fi

print_urls() {
  echo "本机地址：$PROTOCOL://127.0.0.1:$PORT/"

  default_interface="$(route get default 2>/dev/null | awk '/interface:/{print $2}' || true)"
  default_ip=""
  if [[ -n "$default_interface" ]]; then
    default_ip="$(ipconfig getifaddr "$default_interface" 2>/dev/null || true)"
  fi

  if [[ -n "$default_ip" ]]; then
    echo "局域网地址：$PROTOCOL://$default_ip:$PORT/  （优先使用）"
  fi

  ip_lines="$(ifconfig | awk '/^[a-z0-9]+:/{iface=$1; sub(":","",iface)} /inet / && $2 !~ /^127\./ {print iface, $2}' || true)"
  while read -r interface ip_address; do
    if [[ -z "$ip_address" || "$ip_address" == "$default_ip" ]]; then
      continue
    fi
    case "$interface" in
      lo*|utun*|awdl*|llw*|bridge*)
        continue
        ;;
    esac
    echo "其他地址：$PROTOCOL://$ip_address:$PORT/"
  done <<< "$ip_lines"
  return 0
}

if [[ -f "$PID_FILE" ]]; then
  existing_pid="$(cat "$PID_FILE")"
  if kill -0 "$existing_pid" 2>/dev/null; then
    existing_protocol="$(cat "$PROTOCOL_FILE" 2>/dev/null || echo "http")"
    echo "练琴簿已在运行：PID $existing_pid"
    case "$existing_protocol:$PROTOCOL" in
      "$PROTOCOL:$PROTOCOL") ;;
      *) echo "当前服务使用 $existing_protocol；如需切换到 $PROTOCOL，请先执行 npm run stop:host" ;;
    esac
    PROTOCOL="$existing_protocol"
    print_urls
    exit 0
  fi
  rm -f "$PID_FILE"
  rm -f "$PROTOCOL_FILE"
fi

cd "$ROOT_DIR"
nohup env HOST=127.0.0.1 PORT="$API_PORT" PANIO_API_ONLY=1 npm run serve >"$API_LOG_FILE" 2>&1 &
api_pid=$!
echo "$api_pid" >"$API_PID_FILE"

nohup npm run dev -- --host "$HOST" --port "$PORT" --strictPort >"$LOG_FILE" 2>&1 &
server_pid=$!
echo "$server_pid" >"$PID_FILE"
echo "$PROTOCOL" >"$PROTOCOL_FILE"

sleep 1
if ! kill -0 "$server_pid" 2>/dev/null || ! kill -0 "$api_pid" 2>/dev/null; then
  kill "$server_pid" "$api_pid" 2>/dev/null || true
  rm -f "$PID_FILE"
  rm -f "$API_PID_FILE"
  rm -f "$PROTOCOL_FILE"
  echo "启动失败，请查看日志：$LOG_FILE 和 $API_LOG_FILE" >&2
  exit 1
fi

echo "练琴簿已启动：前端 PID $server_pid, 后端 PID $api_pid"
print_urls
echo "前端日志：$LOG_FILE"
echo "后端日志：$API_LOG_FILE"
