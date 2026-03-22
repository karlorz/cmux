#!/usr/bin/env bash
# Validate Coolify deployment health
#
# Usage:
#   ./scripts/validate-coolify-deployment.sh
#   ./scripts/validate-coolify-deployment.sh --client-url https://cmux.karldigi.dev --www-url https://cmux-www.karldigi.dev --server-url https://cmux-server.karldigi.dev
#
# Checks:
#   1. Client health endpoint (nginx)
#   2. WWW health endpoint (Next.js API)
#   3. Server API health endpoint
#   4. Server socket.io polling endpoint
#   5. Convex connectivity status visibility

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
CLIENT_BASE_URL="${CLIENT_URL%/}"
WWW_BASE_URL="${WWW_URL%/}"
SERVER_BASE_URL="${SERVER_URL%/}"

check_http_status() {
  local label="$1"
  local url="$2"

  echo -n "Checking ${label}... "
  if curl -fsS --max-time 10 -o /dev/null "$url" 2>/dev/null; then
    echo -e "${GREEN}OK${NC}"
  else
    echo -e "${RED}FAILED${NC} (${url})"
    FAILED=1
  fi
}

check_http_body() {
  local label="$1"
  local url="$2"
  local expected_fragment="$3"
  local response

  echo -n "Checking ${label}... "
  if response=$(curl -fsS --max-time 10 "$url" 2>/dev/null); then
    if [[ "$response" == *"$expected_fragment"* ]]; then
      echo -e "${GREEN}OK${NC}"
      return
    fi

    echo -e "${RED}FAILED${NC} (unexpected response from ${url})"
    FAILED=1
    return
  fi

  echo -e "${RED}FAILED${NC} (${url})"
  FAILED=1
}

# Check client health
check_http_status "client health" "${CLIENT_BASE_URL}/health"

# Check www health
check_http_body "www health" "${WWW_BASE_URL}/api/health" "\"status\":\"ok\""

# Check server HTTP API health
check_http_body "server API health" "${SERVER_BASE_URL}/api/health" "\"service\":\"apps-server\""

# Check server socket.io polling endpoint
check_http_status "server socket.io polling" "${SERVER_BASE_URL}/socket.io/?EIO=4&transport=polling"

# Check whether deployment health exposes Convex status
echo -n "Checking Convex connectivity... "
echo -e "${YELLOW}NOT VERIFIED${NC} (no public health endpoint reports Convex reachability yet)"

echo ""
if [[ $FAILED -eq 0 ]]; then
  echo -e "${GREEN}All checks passed!${NC}"
  exit 0
else
  echo -e "${RED}Some checks failed.${NC}"
  exit 1
fi
