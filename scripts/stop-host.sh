#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/.panio-dev.pid"
API_PID_FILE="$ROOT_DIR/.panio-api.pid"
PROTOCOL_FILE="$ROOT_DIR/.panio-dev.protocol"

if [[ ! -f "$PID_FILE" && ! -f "$API_PID_FILE" ]]; then
  echo "练琴簿当前没有运行记录。"
  exit 0
fi

server_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
api_pid="$(cat "$API_PID_FILE" 2>/dev/null || true)"

for pid in "$server_pid" "$api_pid"; do
  if [[ -z "$pid" ]] || ! kill -0 "$pid" 2>/dev/null; then
    continue
  fi
  child_pids="$(pgrep -P "$pid" 2>/dev/null || true)"
  if [[ -n "$child_pids" ]]; then
    kill $child_pids 2>/dev/null || true
  fi
  kill "$pid" 2>/dev/null || true
done

for _ in {1..20}; do
  running=0
  for pid in "$server_pid" "$api_pid"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      running=1
    fi
  done
  if [[ "$running" == "0" ]]; then
    break
  fi
  sleep 0.25
done

for pid in "$server_pid" "$api_pid"; do
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    echo "进程仍未退出，发送强制终止信号：PID $pid" >&2
    kill -KILL "$pid" 2>/dev/null || true
  fi
done

rm -f "$PID_FILE" "$API_PID_FILE"
rm -f "$PROTOCOL_FILE"
echo "练琴簿已停止。"
