#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="/var/log/cmux-sandbox"
mkdir -p "${LOG_DIR}"

start_dockerd() {
  if pgrep -x dockerd >/dev/null 2>&1; then
    return
  fi

  echo "starting dockerd (Docker-in-Docker)"
  dockerd --host=unix:///var/run/docker.sock --storage-driver=overlay2 \
    --iptables=false >"${LOG_DIR}/dockerd.out" 2>&1 &
}

start_buildkitd() {
  if pgrep -x buildkitd >/dev/null 2>&1; then
    return
  fi

  echo "starting buildkitd"
  buildkitd >"${LOG_DIR}/buildkitd.out" 2>&1 &
}

start_dockerd
start_buildkitd

echo "enabling ip forwarding"
echo 1 > /proc/sys/net/ipv4/ip_forward

echo "setting up nat for cmux sandboxes"
iptables -t nat -C POSTROUTING -s 10.201.0.0/16 -j MASQUERADE 2>/dev/null || \
  iptables -t nat -A POSTROUTING -s 10.201.0.0/16 -j MASQUERADE

if command -v docker >/dev/null 2>&1; then
  for _ in $(seq 1 20); do
    if docker info >/dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done
fi

exec "$@"
