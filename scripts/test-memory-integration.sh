#!/usr/bin/env bash
# Memory Protocol Integration Test Suite
# Runs S1, S2, S3, S4 validation tests in sequence with a single sandbox
#
# Usage:
#   ./scripts/test-memory-integration.sh                    # Run all tests
#   ./scripts/test-memory-integration.sh --provider pve-lxc # Use specific provider
#   ./scripts/test-memory-integration.sh --sandbox-id <id>  # Use existing sandbox
#   ./scripts/test-memory-integration.sh --quick            # Skip sandbox spawn, use existing
#
# Exit codes:
#   0 - All spikes pass
#   1 - One or more spikes failed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_FILE="${PROJECT_DIR}/logs/memory-integration-test.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Default values
PROVIDER="${SANDBOX_PROVIDER:-pve-lxc}"
SANDBOX_ID=""
QUICK_MODE=false
CLEANUP=true

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --provider|-p)
      PROVIDER="$2"
      shift 2
      ;;
    --sandbox-id|-s)
      SANDBOX_ID="$2"
      shift 2
      ;;
    --quick)
      QUICK_MODE=true
      shift
      ;;
    --no-cleanup)
      CLEANUP=false
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Runs S1-S4 memory protocol validation tests."
      echo ""
      echo "Options:"
      echo "  --provider, -p <provider>  Sandbox provider (pve-lxc, morph, e2b)"
      echo "  --sandbox-id, -s <id>      Use existing sandbox ID"
      echo "  --quick                    Skip sandbox spawn, requires --sandbox-id"
      echo "  --no-cleanup               Don't delete sandbox after tests"
      echo "  -h, --help                 Show this help"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Logging functions
log() {
  local level="$1"
  shift
  local timestamp
  timestamp="$(date -Iseconds)"
  echo "[${timestamp}] [${level}] $*" >> "${LOG_FILE}"
  case "${level}" in
    INFO) echo -e "${BLUE}[INFO]${NC} $*" ;;
    PASS) echo -e "${GREEN}[PASS]${NC} $*" ;;
    FAIL) echo -e "${RED}[FAIL]${NC} $*" ;;
    WARN) echo -e "${YELLOW}[WARN]${NC} $*" ;;
    SPIKE) echo -e "${CYAN}[SPIKE]${NC} $*" ;;
    *) echo "[$level] $*" ;;
  esac
}

info() { log INFO "$@"; }
pass() { log PASS "$@"; }
fail() { log FAIL "$@"; }
warn() { log WARN "$@"; }
spike() { log SPIKE "$@"; }

# Result tracking
declare -A SPIKE_RESULTS

# Cleanup function
cleanup() {
  if [[ "${CLEANUP}" == true ]] && [[ -n "${SANDBOX_ID}" ]] && [[ "${QUICK_MODE}" == false ]]; then
    info "Cleaning up sandbox ${SANDBOX_ID}..."
    devsh delete "${SANDBOX_ID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# Run a spike test
run_spike() {
  local spike_name="$1"
  local script_name="$2"
  local script_path="${SCRIPT_DIR}/${script_name}"

  spike "=== Running ${spike_name} ==="

  if [[ ! -x "${script_path}" ]]; then
    fail "${spike_name}: Script not found or not executable: ${script_path}"
    SPIKE_RESULTS["${spike_name}"]="FAIL"
    return 1
  fi

  local start_time
  start_time="$(date +%s)"

  local result=0
  if [[ -n "${SANDBOX_ID}" ]]; then
    "${script_path}" --provider "${PROVIDER}" --sandbox-id "${SANDBOX_ID}" --skip-spawn --no-cleanup || result=$?
  else
    "${script_path}" --provider "${PROVIDER}" --no-cleanup || result=$?
  fi

  local end_time
  end_time="$(date +%s)"
  local duration=$((end_time - start_time))

  if [[ ${result} -eq 0 ]]; then
    pass "${spike_name}: PASSED (${duration}s)"
    SPIKE_RESULTS["${spike_name}"]="PASS"
  else
    fail "${spike_name}: FAILED (${duration}s)"
    SPIKE_RESULTS["${spike_name}"]="FAIL"
  fi

  return ${result}
}

# Main
main() {
  mkdir -p "$(dirname "${LOG_FILE}")"
  echo "=== Memory Protocol Integration Tests ===" > "${LOG_FILE}"
  echo "Started at: $(date -Iseconds)" >> "${LOG_FILE}"
  echo "Provider: ${PROVIDER}" >> "${LOG_FILE}"

  echo ""
  echo -e "${CYAN}========================================${NC}"
  echo -e "${CYAN}  Memory Protocol Integration Tests${NC}"
  echo -e "${CYAN}========================================${NC}"
  echo ""
  info "Provider: ${PROVIDER}"
  info "Log file: ${LOG_FILE}"
  echo ""

  # Build devsh if needed
  if ! command -v devsh >/dev/null 2>&1; then
    info "Building devsh..."
    (cd "${PROJECT_DIR}" && make install-devsh-dev) || {
      fail "Failed to build devsh"
      exit 1
    }
    export PATH="$HOME/.local/bin:$PATH"
  fi

  # Spawn shared sandbox if not in quick mode
  if [[ "${QUICK_MODE}" == false ]] && [[ -z "${SANDBOX_ID}" ]]; then
    info "Spawning shared sandbox (provider: ${PROVIDER})..."
    local output
    output="$(devsh start -p "${PROVIDER}" 2>&1)" || {
      fail "Failed to spawn sandbox"
      echo "${output}"
      exit 1
    }

    SANDBOX_ID="$(echo "${output}" | grep -oE 'pvelxc-[a-z0-9]+|morphvm_[a-z0-9]+|cmux-[0-9]+|sandbox_[a-z0-9]+' | head -n 1 || true)"
    if [[ -z "${SANDBOX_ID}" ]]; then
      fail "Could not parse sandbox ID from output"
      echo "${output}"
      exit 1
    fi

    info "Sandbox created: ${SANDBOX_ID}"
    echo "Sandbox ID: ${SANDBOX_ID}" >> "${LOG_FILE}"

    info "Waiting for sandbox to be ready..."
    sleep 30
  elif [[ -z "${SANDBOX_ID}" ]]; then
    fail "Quick mode requires --sandbox-id"
    exit 1
  else
    info "Using existing sandbox: ${SANDBOX_ID}"
  fi

  # Run all spikes
  local total_failures=0

  echo ""
  run_spike "S1 (Memory Protocol)" "test-memory-protocol.sh" || total_failures=$((total_failures + 1))
  echo ""
  run_spike "S2 (Two-Agent Coordination)" "test-two-agent-coordination.sh" || total_failures=$((total_failures + 1))
  echo ""
  run_spike "S3 (Memory Sync Latency)" "test-memory-sync-latency.sh" || total_failures=$((total_failures + 1))
  echo ""
  run_spike "S4 (MCP Server)" "test-mcp-server.sh" || total_failures=$((total_failures + 1))

  # Summary
  echo ""
  echo -e "${CYAN}========================================${NC}"
  echo -e "${CYAN}  Integration Test Summary${NC}"
  echo -e "${CYAN}========================================${NC}"
  echo ""

  local passed=0
  local failed=0

  for spike in "S1 (Memory Protocol)" "S2 (Two-Agent Coordination)" "S3 (Memory Sync Latency)" "S4 (MCP Server)"; do
    local result="${SPIKE_RESULTS["${spike}"]:-SKIP}"
    case "${result}" in
      PASS)
        echo -e "  ${GREEN}[PASS]${NC} ${spike}"
        passed=$((passed + 1))
        ;;
      FAIL)
        echo -e "  ${RED}[FAIL]${NC} ${spike}"
        failed=$((failed + 1))
        ;;
      *)
        echo -e "  ${YELLOW}[SKIP]${NC} ${spike}"
        ;;
    esac
  done

  echo ""
  echo -e "  ${GREEN}Passed: ${passed}${NC}"
  echo -e "  ${RED}Failed: ${failed}${NC}"
  echo ""

  # Log summary
  echo "" >> "${LOG_FILE}"
  echo "=== Summary ===" >> "${LOG_FILE}"
  echo "Passed: ${passed}" >> "${LOG_FILE}"
  echo "Failed: ${failed}" >> "${LOG_FILE}"
  echo "Completed at: $(date -Iseconds)" >> "${LOG_FILE}"

  if [[ ${total_failures} -gt 0 ]]; then
    fail "Integration tests completed with ${total_failures} spike(s) failing"
    exit 1
  fi

  pass "All integration tests passed"
  exit 0
}

main "$@"
