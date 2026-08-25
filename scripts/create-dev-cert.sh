#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="$ROOT_DIR/.cert"
KEY_FILE="$CERT_DIR/panio-dev.key"
CERT_FILE="$CERT_DIR/panio-dev.crt"

if [[ -f "$KEY_FILE" && -f "$CERT_FILE" ]]; then
  echo "HTTPS 证书已存在：$CERT_FILE"
  exit 0
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "缺少 openssl，无法生成本地 HTTPS 证书。" >&2
  exit 1
fi

mkdir -p "$CERT_DIR"
default_interface="$(route get default 2>/dev/null | awk '/interface:/{print $2}' || true)"
default_ip=""
if [[ -n "$default_interface" ]]; then
  default_ip="$(ipconfig getifaddr "$default_interface" 2>/dev/null || true)"
fi

subject_alt_names="DNS:localhost,IP:127.0.0.1"
if [[ -n "$default_ip" ]]; then
  subject_alt_names="$subject_alt_names,IP:$default_ip"
fi

openssl req \
  -x509 \
  -newkey rsa:2048 \
  -sha256 \
  -days 825 \
  -nodes \
  -keyout "$KEY_FILE" \
  -out "$CERT_FILE" \
  -subj "/CN=Panio Local Dev" \
  -addext "subjectAltName=$subject_alt_names" >/dev/null 2>&1

echo "已生成 HTTPS 证书：$CERT_FILE"
echo "局域网设备若要使用麦克风，需要信任该证书或使用浏览器允许的安全来源。"
