#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/.panio-dev.pid"
PROTOCOL_FILE="$ROOT_DIR/.panio-dev.protocol"
PORT="${PORT:-5175}"
PROTOCOL="${PROTOCOL:-$(cat "$PROTOCOL_FILE" 2>/dev/null || echo http)}"

echo "== 进程 =="
if [[ -f "$PID_FILE" ]]; then
  server_pid="$(cat "$PID_FILE")"
  if ps -p "$server_pid" >/dev/null 2>&1; then
    ps -p "$server_pid" -o pid=,ppid=,command=
  else
    echo "PID 文件存在，但进程已不存在：$server_pid"
  fi
else
  echo "没有 PID 文件。"
fi

echo
echo "== 监听 =="
lsof -nP -iTCP:"$PORT" -sTCP:LISTEN || true

echo
echo "== 地址 =="
default_interface="$(route get default 2>/dev/null | awk '/interface:/{print $2}' || true)"
if [[ -n "$default_interface" ]]; then
  default_ip="$(ipconfig getifaddr "$default_interface" 2>/dev/null || true)"
  if [[ -n "$default_ip" ]]; then
    echo "优先局域网地址：$PROTOCOL://$default_ip:$PORT/"
  fi
fi
ifconfig | awk '/^[a-z0-9]+:/{iface=$1; sub(":","",iface)} /inet / && $2 !~ /^127\./ {print iface, $2}' |
while read -r interface ip_address; do
  echo "$interface: $PROTOCOL://$ip_address:$PORT/"
done

echo
echo "== 本机访问自测 =="
printf "127.0.0.1: "
curl -k -fsS -o /dev/null -w "%{http_code}\n" "$PROTOCOL://127.0.0.1:$PORT/" || true
if [[ -n "${default_ip:-}" ]]; then
  printf "%s: " "$default_ip"
  curl -k -fsS --connect-timeout 2 -o /dev/null -w "%{http_code}\n" "$PROTOCOL://$default_ip:$PORT/" || true
fi

echo
echo "如果本机访问成功但其他设备打不开，请检查："
echo "1. 其他设备是否连接同一个 Wi-Fi。"
echo "2. 不要使用 utun/VPN 地址，优先使用 en0 对应的地址。"
echo "3. macOS 防火墙是否拦截 node/npm 的入站连接。"
echo "4. 路由器是否开启 AP 隔离/访客网络隔离。"
echo "5. 麦克风只能在 localhost 或可信 HTTPS 下使用，普通 http://局域网IP 不会触发授权。"
