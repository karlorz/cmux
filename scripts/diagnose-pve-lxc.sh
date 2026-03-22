#!/usr/bin/env bash
# Diagnose PVE-LXC connectivity issues
#
# Usage:
#   ./scripts/diagnose-pve-lxc.sh <container-hostname>
#   ./scripts/diagnose-pve-lxc.sh pvelxc-d17879a1
#
# Checks:
#   1. Public proxy connectivity (alphasolves.com)
#   2. Tailnet connectivity (.tail715a6.ts.net)
#   3. cmux-execd port (39375)

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <container-hostname>"
  echo "Example: $0 pvelxc-d17879a1"
  exit 1
fi

HOSTNAME="$1"
EXEC_PORT=39375
PUBLIC_DOMAIN="${PVE_PUBLIC_DOMAIN:-alphasolves.com}"
TAILNET_DOMAIN="${PVE_TAILNET_DOMAIN:-tail715a6.ts.net}"

echo "Diagnosing PVE-LXC connectivity for: $HOSTNAME"
echo "=============================================="
echo ""

# Check 1: Public proxy
PUBLIC_URL="https://port-${EXEC_PORT}-${HOSTNAME}.${PUBLIC_DOMAIN}"
echo -n "1. Public proxy ($PUBLIC_URL)... "
if curl -sf --connect-timeout 5 "${PUBLIC_URL}/health" > /dev/null 2>&1; then
  echo -e "${GREEN}OK${NC}"
elif curl -sf --connect-timeout 5 "$PUBLIC_URL" > /dev/null 2>&1; then
  echo -e "${YELLOW}REACHABLE (no /health)${NC}"
else
  echo -e "${RED}FAILED${NC}"
  echo "   Try: curl -v $PUBLIC_URL"
fi

# Check 2: Tailnet
TAILNET_URL="http://${HOSTNAME}.${TAILNET_DOMAIN}:${EXEC_PORT}"
echo -n "2. Tailnet ($TAILNET_URL)... "
if curl -sf --connect-timeout 5 "${TAILNET_URL}/health" > /dev/null 2>&1; then
  echo -e "${GREEN}OK${NC}"
elif curl -sf --connect-timeout 5 "$TAILNET_URL" > /dev/null 2>&1; then
  echo -e "${YELLOW}REACHABLE (no /health)${NC}"
else
  echo -e "${RED}FAILED${NC}"
  echo "   Is tailscale running? Try: tailscale status"
fi

# Check 3: DNS resolution
echo -n "3. DNS resolution (tailnet)... "
if host "${HOSTNAME}.${TAILNET_DOMAIN}" > /dev/null 2>&1; then
  IP=$(host "${HOSTNAME}.${TAILNET_DOMAIN}" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  echo -e "${GREEN}OK${NC} ($IP)"
else
  echo -e "${RED}FAILED${NC}"
  echo "   Container may not be registered with tailscale"
fi

# Check 4: Direct port check (if IP available)
if [[ -n "${IP:-}" ]]; then
  echo -n "4. Direct TCP to ${IP}:${EXEC_PORT}... "
  if nc -z -w 5 "$IP" "$EXEC_PORT" 2>/dev/null; then
    echo -e "${GREEN}OK${NC}"
  else
    echo -e "${RED}FAILED${NC}"
    echo "   cmux-execd may not be running. Check: systemctl status cmux-execd"
  fi
fi

echo ""
echo "Common fixes:"
echo "  - Ensure cmux-execd is running in the container"
echo "  - Check Cloudflare Tunnel is routing to PVE host"
echo "  - Verify tailscale is connected on both ends"
echo "  - Check PVE firewall allows port $EXEC_PORT"
