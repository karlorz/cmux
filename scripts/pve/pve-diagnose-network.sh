#!/usr/bin/env bash
# pve-diagnose-network.sh - Capture full network state from a running PVE LXC container
# Usage: ./pve-diagnose-network.sh <vmid>
#
# Captures systemd-networkd config, drop-in files, DHCP leases, DNS resolution,
# and interface state via SSH+pct exec. Output goes to stdout for redirection.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/pve-api.sh"

usage() {
    cat << EOF
Usage: $(basename "$0") <vmid>

Captures full network diagnostic state from a running PVE LXC container.

Arguments:
  vmid    VMID of a running container to diagnose

Output:
  Structured diagnostic report to stdout. Redirect to logs/ for archival:
    $(basename "$0") 100 > ../../logs/network-diag-100.log

Examples:
  $(basename "$0") 100
  $(basename "$0") 100 | tee logs/diag.log
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || -z "${1:-}" ]]; then
    usage
    exit 0
fi

VMID="$1"
NODE=$(pve_get_default_node)
PVE_SSH_HOST="root@$(echo "${PVE_API_URL}" | sed -E 's|https?://([^:/]+).*|\1|')"

run_in_ct() {
    local cmd="$1"
    ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$PVE_SSH_HOST" \
        "pct exec ${VMID} -- bash -c '$cmd'" 2>/dev/null || echo "(command failed)"
}

echo "=========================================="
echo "Network Diagnostics - VMID ${VMID}"
echo "Node: ${NODE}"
echo "Date: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "=========================================="

echo ""
echo "--- /etc/systemd/network/ listing ---"
run_in_ct "ls -la /etc/systemd/network/ 2>/dev/null || echo '(directory not found)'"

echo ""
echo "--- /etc/systemd/network/eth0.network ---"
run_in_ct "cat /etc/systemd/network/eth0.network 2>/dev/null || echo '(file not found)'"

echo ""
echo "--- /etc/systemd/network/eth0.network.d/ listing ---"
run_in_ct "ls -la /etc/systemd/network/eth0.network.d/ 2>/dev/null || echo '(directory not found)'"

echo ""
echo "--- /etc/systemd/network/eth0.network.d/50-cmux-dhcp.conf ---"
run_in_ct "cat /etc/systemd/network/eth0.network.d/50-cmux-dhcp.conf 2>/dev/null || echo '(file not found)'"

echo ""
echo "--- networkctl status eth0 ---"
run_in_ct "networkctl status eth0 2>/dev/null || echo '(networkctl not available)'"

echo ""
echo "--- systemctl status systemd-networkd ---"
run_in_ct "systemctl status systemd-networkd --no-pager 2>/dev/null || echo '(service not found)'"

echo ""
echo "--- /etc/resolv.conf ---"
run_in_ct "cat /etc/resolv.conf 2>/dev/null || echo '(file not found)'"

echo ""
echo "--- resolvectl status (if available) ---"
run_in_ct "resolvectl status 2>/dev/null || echo '(resolvectl not available)'"

echo ""
echo "--- ip addr show eth0 ---"
run_in_ct "ip addr show eth0 2>/dev/null || echo '(interface not found)'"

echo ""
echo "--- DHCP lease files ---"
run_in_ct "ls -la /run/systemd/netif/leases/ 2>/dev/null || echo '(no lease directory)'"
run_in_ct "cat /run/systemd/netif/leases/* 2>/dev/null || echo '(no lease files)'"

echo ""
echo "--- Hostname ---"
run_in_ct "hostname 2>/dev/null || echo '(hostname command failed)'"

echo ""
echo "=========================================="
echo "Diagnostics complete"
echo "=========================================="
