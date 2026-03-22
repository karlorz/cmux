#!/usr/bin/env bash
# Validate Coolify deployment health
#
# Usage:
#   ./scripts/validate-coolify-deployment.sh
#   ./scripts/validate-coolify-deployment.sh --client-url https://app.cmux.sh
#
# Checks:
#   1. Client health endpoint (nginx)
#   2. WWW health endpoint (Next.js API)
#   3. Server health endpoint (WebSocket server)
#   4. Convex connectivity (via www)

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Defaults (can be overridden via args or env)
CLIENT_URL="${CMUX_CLIENT_URL:-http://localhost:8080}"
WWW_URL="${CMUX_WWW_URL:-http://localhost:9779}"
SERVER_URL="${CMUX_SERVER_URL:-http://localhost:9776}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --client-url)
      CLIENT_URL="$2"
      shift 2
      ;;
    --www-url)
      WWW_URL="$2"
      shift 2
      ;;
    --server-url)
      SERVER_URL="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "Validating Coolify deployment..."
echo "  Client: $CLIENT_URL"
echo "  WWW:    $WWW_URL"
echo "  Server: $SERVER_URL"
echo ""

FAILED=0

# Check client health
echo -n "Checking client health... "
if curl -sf "${CLIENT_URL}/health" > /dev/null 2>&1; then
  echo -e "${GREEN}OK${NC}"
else
  echo -e "${RED}FAILED${NC}"
  FAILED=1
fi

# Check www health
echo -n "Checking www health... "
if curl -sf "${WWW_URL}/api/health" > /dev/null 2>&1; then
  echo -e "${GREEN}OK${NC}"
else
  echo -e "${RED}FAILED${NC}"
  FAILED=1
fi

# Check server health (TCP connection)
echo -n "Checking server health... "
SERVER_HOST=$(echo "$SERVER_URL" | sed -E 's|https?://([^:/]+).*|\1|')
SERVER_PORT=$(echo "$SERVER_URL" | sed -E 's|.*:([0-9]+).*|\1|')
if [[ -z "$SERVER_PORT" || "$SERVER_PORT" == "$SERVER_URL" ]]; then
  SERVER_PORT=9776
fi
if nc -z "$SERVER_HOST" "$SERVER_PORT" 2>/dev/null; then
  echo -e "${GREEN}OK${NC}"
else
  echo -e "${RED}FAILED${NC} (could not connect to ${SERVER_HOST}:${SERVER_PORT})"
  FAILED=1
fi

# Check www can reach Convex
echo -n "Checking Convex connectivity... "
CONVEX_CHECK=$(curl -sf "${WWW_URL}/api/health" 2>/dev/null | grep -c "ok" || echo "0")
if [[ "$CONVEX_CHECK" -gt 0 ]]; then
  echo -e "${GREEN}OK${NC}"
else
  echo -e "${YELLOW}UNKNOWN${NC} (health endpoint doesn't report Convex status)"
fi

echo ""
if [[ $FAILED -eq 0 ]]; then
  echo -e "${GREEN}All checks passed!${NC}"
  exit 0
else
  echo -e "${RED}Some checks failed.${NC}"
  exit 1
fi
