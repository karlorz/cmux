#!/bin/bash
# Test bubblewrap functionality inside PVE-LXC container
# Usage: ./scripts/test-pve-bubblewrap.sh <vmid>
#
# This script verifies that bubblewrap works correctly inside a PVE-LXC
# container, which is required for Codex CLI's workspace-write sandbox mode.
#
# Prerequisites:
# - Run from PVE host with pct command available
# - Container must be running
# - Container must have bubblewrap installed

set -euo pipefail

VMID="${1:-}"

if [ -z "$VMID" ]; then
    echo "Usage: $0 <vmid>"
    echo ""
    echo "Tests bubblewrap functionality inside a PVE-LXC container."
    echo "Run this from the PVE host after creating a container from the cmux template."
    exit 1
fi

# Check if running on PVE host
if ! command -v pct &>/dev/null; then
    echo "Error: pct command not found. This script must be run on the PVE host."
    exit 1
fi

# Check container exists and is running
STATUS=$(pct status "$VMID" 2>/dev/null | awk '{print $2}' || echo "not found")
if [ "$STATUS" = "not found" ]; then
    echo "Error: Container $VMID not found"
    exit 1
fi

if [ "$STATUS" != "running" ]; then
    echo "Error: Container $VMID is not running (status: $STATUS)"
    echo "Start it with: pct start $VMID"
    exit 1
fi

echo "Testing bubblewrap inside container $VMID..."
echo ""

# Test 1: Basic bwrap
echo -n "[1/4] Basic bwrap... "
if pct exec "$VMID" -- bwrap --ro-bind /usr /usr --proc /proc --dev /dev echo "OK" 2>/dev/null; then
    echo "PASS"
else
    echo "FAIL"
    echo "    Basic bubblewrap failed. Container may need kernel.unprivileged_userns_clone=1"
    exit 1
fi

# Test 2: With PID namespace (like Codex uses)
echo -n "[2/4] With PID namespace (--unshare-pid)... "
if pct exec "$VMID" -- bwrap --ro-bind /usr /usr --proc /proc --dev /dev --unshare-pid echo "OK" 2>/dev/null; then
    echo "PASS"
else
    echo "FAIL"
    echo "    PID namespace unshare failed. Check LXC nesting config."
    exit 1
fi

# Test 3: With network namespace
echo -n "[3/4] With network namespace (--unshare-net)... "
if pct exec "$VMID" -- bwrap --ro-bind /usr /usr --proc /proc --dev /dev --unshare-pid --unshare-net echo "OK" 2>/dev/null; then
    echo "PASS"
else
    echo "FAIL"
    echo "    Network namespace unshare failed."
    exit 1
fi

# Test 4: Full isolation (similar to Codex workspace-write mode)
echo -n "[4/4] Full isolation (workspace-write equivalent)... "
if pct exec "$VMID" -- bwrap \
    --ro-bind /usr /usr \
    --ro-bind /lib /lib \
    --ro-bind /lib64 /lib64 \
    --symlink /usr/bin /bin \
    --symlink /usr/sbin /sbin \
    --proc /proc \
    --dev /dev \
    --tmpfs /tmp \
    --unshare-pid \
    --unshare-net \
    --unshare-uts \
    echo "OK" 2>/dev/null; then
    echo "PASS"
else
    echo "FAIL"
    echo "    Full isolation failed. Bubblewrap may have limited functionality."
    exit 1
fi

echo ""
echo "All bubblewrap tests passed!"
echo ""
echo "Container $VMID supports Codex CLI workspace-write mode."
echo "To enable it, set: CODEX_SANDBOX_MODE=workspace-write"
echo ""
echo "Marker file check:"
if pct exec "$VMID" -- test -f /opt/cmux/.bubblewrap-supported 2>/dev/null; then
    echo "  /opt/cmux/.bubblewrap-supported exists (created during template setup)"
else
    echo "  /opt/cmux/.bubblewrap-supported not found (may be from older template)"
fi
