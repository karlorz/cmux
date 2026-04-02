#!/usr/bin/env bash
# Start Chrome with remote debugging in detached mode.
# Usage: ./scripts/chrome-debug.sh [--dry-run] [--print-config] [--json] [--check-port] [--explain] [--launch-and-explain] [URL]
set -euo pipefail

DEBUG_PORT="${CHROME_DEBUG_PORT:-9222}"
DRY_RUN=0
PRINT_CONFIG=0
JSON_OUTPUT=0
CHECK_PORT_ONLY=0
EXPLAIN_ONLY=0
LAUNCH_AND_EXPLAIN=0
TARGET_URL="${CHROME_DEBUG_URL:-about:blank}"
TARGET_URL_SET=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="${ROOT_DIR}/logs/chrome-debug.log"

get_default_profile_dir() {
  if [[ "${OSTYPE:-}" == "darwin"* ]]; then
    printf '%s\n' "$HOME/Library/Application Support/cmux/chrome-debug-profile"
    return 0
  fi

  printf '%s\n' "${XDG_CONFIG_HOME:-$HOME/.config}/cmux/chrome-debug-profile"
}

PROFILE_DIR="${CHROME_DEBUG_PROFILE:-$(get_default_profile_dir)}"
PROFILE_MARKER="--user-data-dir=${PROFILE_DIR}"

log_info() {
  echo "[INFO] $*"
}

log_ok() {
  echo "[OK] $*"
}

log_error() {
  echo "[ERROR] $*" >&2
}

print_usage() {
  cat <<EOF
Usage: ./scripts/chrome-debug.sh [--dry-run] [--print-config] [--json] [URL]

Options:
  --dry-run       Print the resolved launch configuration without starting Chrome
  --print-config  Print the resolved launch configuration before continuing
  --json          Emit the resolved launch configuration as JSON
  --check-port    Report whether the debug port is free or already in use
  --explain       Print a short diagnosis and suggested next action without launching Chrome
  --launch-and-explain
                   Print the diagnosis first, then continue with the normal launch flow
  -h, --help      Show this help message
EOF
}

detect_chrome() {
  if [[ -n "${CHROME:-}" ]]; then
    if [[ -x "${CHROME}" ]]; then
      echo "${CHROME}"
      return 0
    fi
    if command -v "${CHROME}" >/dev/null 2>&1; then
      command -v "${CHROME}"
      return 0
    fi
  fi

  if [[ "${OSTYPE:-}" == "darwin"* ]]; then
    local mac_paths=(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    )
    local p
    for p in "${mac_paths[@]}"; do
      if [[ -x "${p}" ]]; then
        echo "${p}"
        return 0
      fi
    done

    p="$(ls -d "$HOME"/.cache/puppeteer/chrome/*/chrome-mac-*/Google\ Chrome\ for\ Testing.app/Contents/MacOS/Google\ Chrome\ for\ Testing 2>/dev/null | head -n 1 || true)"
    if [[ -n "${p}" && -x "${p}" ]]; then
      echo "${p}"
      return 0
    fi
  else
    local chrome_cmd
    for chrome_cmd in \
      "chromium-browser" \
      "chromium" \
      "google-chrome-unstable" \
      "google-chrome-stable" \
      "google-chrome"; do
      if command -v "${chrome_cmd}" >/dev/null 2>&1; then
        command -v "${chrome_cmd}"
        return 0
      fi
    done
  fi

  return 1
}

list_profile_pids() {
  ps -ax -o pid= -o command= | awk -v marker="$PROFILE_MARKER" 'index($0, marker) { print $1 }'
}

wait_for_profile_exit() {
  local attempts="${1:-20}"
  local delay_seconds="${2:-0.25}"
  local _
  for _ in $(seq 1 "$attempts"); do
    if [[ -z "$(list_profile_pids)" ]]; then
      return 0
    fi
    sleep "$delay_seconds"
  done

  return 1
}

stop_profile_processes() {
  local pids
  pids="$(list_profile_pids)"
  if [[ -z "${pids}" ]]; then
    return 0
  fi

  log_info "Stopping existing Chrome instance for profile ${PROFILE_DIR}."
  echo "${pids}" | xargs kill 2>/dev/null || true

  if wait_for_profile_exit 20 0.25; then
    return 0
  fi

  pids="$(list_profile_pids)"
  if [[ -z "${pids}" ]]; then
    return 0
  fi

  log_info "Chrome did not exit after SIGTERM; sending SIGKILL to profile-specific processes."
  echo "${pids}" | xargs kill -9 2>/dev/null || true
  wait_for_profile_exit 20 0.25 || true
}

cleanup_profile_locks() {
  rm -f \
    "${PROFILE_DIR}/SingletonLock" \
    "${PROFILE_DIR}/SingletonSocket" \
    "${PROFILE_DIR}/SingletonCookie"
}

seed_profile_preferences() {
  local default_dir preferences_file
  default_dir="${PROFILE_DIR}/Default"
  preferences_file="${default_dir}/Preferences"

  mkdir -p "${default_dir}"
  if [[ -f "${preferences_file}" ]]; then
    return 0
  fi

  cat > "${preferences_file}" <<'PREFERENCES_EOF'
{
  "session": {
    "restore_on_startup": 5
  },
  "profile": {
    "exit_type": "Normal"
  },
  "browser": {
    "has_seen_welcome_page": true
  }
}
PREFERENCES_EOF
}

port_is_healthy() {
  curl -fs "http://127.0.0.1:${DEBUG_PORT}/json/version" >/dev/null 2>&1
}

resolve_port_status() {
  if port_is_healthy; then
    if [[ -n "$(list_profile_pids)" ]]; then
      printf '%s\n' "owned_by_profile"
    else
      printf '%s\n' "occupied_by_other"
    fi
  else
    printf '%s\n' "free"
  fi
}

emit_port_status() {
  local port_status
  port_status="$(resolve_port_status)"

  if [[ "${JSON_OUTPUT}" == "1" ]]; then
    DEBUG_PORT_JSON="${DEBUG_PORT}" \
    PORT_STATUS_JSON="${port_status}" \
    PROFILE_DIR_JSON="${PROFILE_DIR}" \
    python3 - <<'PY'
import json
import os

print(
    json.dumps(
        {
            "debugPort": int(os.environ["DEBUG_PORT_JSON"]),
            "status": os.environ["PORT_STATUS_JSON"],
            "profileDir": os.environ["PROFILE_DIR_JSON"],
        }
    )
)
PY
    return 0
  fi

  case "${port_status}" in
    free)
      log_ok "Port ${DEBUG_PORT} is free."
      ;;
    owned_by_profile)
      log_ok "Port ${DEBUG_PORT} is already serving DevTools for profile ${PROFILE_DIR}."
      ;;
    occupied_by_other)
      log_error "Port ${DEBUG_PORT} is serving DevTools for a different Chrome instance."
      ;;
  esac
}

emit_explanation() {
  local chrome_bin="$1"
  local port_status profile_exists preferences_exist next_action summary

  port_status="$(resolve_port_status)"
  if [[ -d "${PROFILE_DIR}" ]]; then
    profile_exists="yes"
  else
    profile_exists="no"
  fi

  if [[ -f "${PROFILE_DIR}/Default/Preferences" ]]; then
    preferences_exist="yes"
  else
    preferences_exist="no"
  fi

  case "${port_status}" in
    free)
      summary="Port ${DEBUG_PORT} is free; Chrome is not currently serving DevTools there."
      next_action="Run ./scripts/chrome-debug.sh to start the dedicated debug browser."
      ;;
    owned_by_profile)
      summary="Port ${DEBUG_PORT} is already owned by the dedicated cmux debug profile."
      next_action="Reuse the existing browser, or stop only that profile-specific Chrome if you need a clean restart."
      ;;
    occupied_by_other)
      summary="Port ${DEBUG_PORT} is occupied by a different DevTools-enabled Chrome instance."
      next_action="Stop the other Chrome debugger or set CHROME_DEBUG_PORT to another port before launching this script."
      ;;
  esac

  if [[ "${JSON_OUTPUT}" == "1" ]]; then
    CHROME_BIN_JSON="${chrome_bin}" \
    DEBUG_PORT_JSON="${DEBUG_PORT}" \
    PROFILE_DIR_JSON="${PROFILE_DIR}" \
    PORT_STATUS_JSON="${port_status}" \
    PROFILE_EXISTS_JSON="${profile_exists}" \
    PREFERENCES_EXIST_JSON="${preferences_exist}" \
    SUMMARY_JSON="${summary}" \
    NEXT_ACTION_JSON="${next_action}" \
    python3 - <<'PY'
import json
import os

print(
    json.dumps(
        {
            "chromeBin": os.environ["CHROME_BIN_JSON"],
            "debugPort": int(os.environ["DEBUG_PORT_JSON"]),
            "profileDir": os.environ["PROFILE_DIR_JSON"],
            "portStatus": os.environ["PORT_STATUS_JSON"],
            "profileExists": os.environ["PROFILE_EXISTS_JSON"] == "yes",
            "preferencesExist": os.environ["PREFERENCES_EXIST_JSON"] == "yes",
            "summary": os.environ["SUMMARY_JSON"],
            "nextAction": os.environ["NEXT_ACTION_JSON"],
        }
    )
)
PY
    return 0
  fi

  cat <<EOF
Chrome binary : ${chrome_bin}
Debug port    : ${DEBUG_PORT}
Profile dir   : ${PROFILE_DIR}
Port status   : ${port_status}
Profile exists: ${profile_exists}
Prefs seeded  : ${preferences_exist}
Summary       : ${summary}
Next action   : ${next_action}
EOF
}

build_chrome_args() {
  CHROME_ARGS=(
    --remote-debugging-port="${DEBUG_PORT}"
    --remote-debugging-address=127.0.0.1
    --remote-allow-origins=*
    --user-data-dir="${PROFILE_DIR}"
    --no-first-run
    --no-default-browser-check
    --disable-session-crashed-bubble
    --disable-default-apps
    --disable-sync
    --disable-translate
    --disable-infobars
    --disable-features=ChromeWhatsNewUI,AutofillServerCommunication,AutomationControlled
    --start-maximized
    --window-position=0,0
    --window-size=1920,1080
    "${TARGET_URL}"
  )

  if [[ "${OSTYPE:-}" != "darwin"* ]]; then
    CHROME_ARGS=(
      --no-sandbox
      --disable-dev-shm-usage
      --disable-gpu
      --disable-software-rasterizer
      --password-store=basic
      "${CHROME_ARGS[@]}"
    )
  fi
}

print_config() {
  local chrome_bin="${1:-<unresolved>}"
  if [[ "${JSON_OUTPUT}" == "1" ]]; then
    local launch_args_payload
    launch_args_payload="$(printf '%s\x1f' "${CHROME_ARGS[@]}")"
    CHROME_BIN_JSON="${chrome_bin}" \
    DEBUG_PORT_JSON="${DEBUG_PORT}" \
    PROFILE_DIR_JSON="${PROFILE_DIR}" \
    LOG_FILE_JSON="${LOG_FILE}" \
    TARGET_URL_JSON="${TARGET_URL}" \
    LAUNCH_ARGS_JSON_SOURCE="${launch_args_payload}" \
    python3 - <<'PY'
import json
import os

launch_args = [
    arg for arg in os.environ["LAUNCH_ARGS_JSON_SOURCE"].split("\x1f") if arg
]
print(
    json.dumps(
        {
            "chromeBin": os.environ["CHROME_BIN_JSON"],
            "debugPort": int(os.environ["DEBUG_PORT_JSON"]),
            "profileDir": os.environ["PROFILE_DIR_JSON"],
            "logFile": os.environ["LOG_FILE_JSON"],
            "targetUrl": os.environ["TARGET_URL_JSON"],
            "launchArgs": launch_args,
        }
    )
)
PY
    return 0
  fi

  cat <<EOF
CHROME_BIN=${chrome_bin}
DEBUG_PORT=${DEBUG_PORT}
PROFILE_DIR=${PROFILE_DIR}
LOG_FILE=${LOG_FILE}
TARGET_URL=${TARGET_URL}
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      ;;
    --print-config)
      PRINT_CONFIG=1
      ;;
    --json)
      JSON_OUTPUT=1
      ;;
    --check-port)
      CHECK_PORT_ONLY=1
      ;;
    --explain)
      EXPLAIN_ONLY=1
      ;;
    --launch-and-explain)
      LAUNCH_AND_EXPLAIN=1
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    --)
      shift
      if [[ $# -gt 0 ]]; then
        TARGET_URL="$1"
        shift
      fi
      if [[ $# -gt 0 ]]; then
        log_error "Unexpected extra arguments: $*"
        print_usage
        exit 1
      fi
      break
      ;;
    -*)
      log_error "Unknown option: $1"
      print_usage
      exit 1
      ;;
    *)
      if [[ "${TARGET_URL_SET}" == "1" ]]; then
        log_error "Unexpected extra argument: $1"
        print_usage
        exit 1
      fi
      TARGET_URL="$1"
      TARGET_URL_SET=1
      ;;
  esac
  shift
done

CHROME_BIN="$(detect_chrome || true)"
if [[ -z "${CHROME_BIN}" || ! -x "${CHROME_BIN}" ]]; then
  log_error "Chrome/Chromium binary not found."
  log_error "Set CHROME to a valid binary path if it is installed in a custom location."
  exit 1
fi

build_chrome_args

if [[ "${CHECK_PORT_ONLY}" == "1" ]]; then
  emit_port_status
  exit 0
fi

if [[ "${EXPLAIN_ONLY}" == "1" ]]; then
  emit_explanation "${CHROME_BIN}"
  exit 0
fi

if [[ "${LAUNCH_AND_EXPLAIN}" == "1" ]]; then
  emit_explanation "${CHROME_BIN}"
fi

if [[ "${PRINT_CONFIG}" == "1" || "${DRY_RUN}" == "1" ]]; then
  print_config "${CHROME_BIN}"
fi

if [[ "${DRY_RUN}" == "1" ]]; then
  if [[ "${JSON_OUTPUT}" != "1" ]]; then
    log_ok "Dry-run only; Chrome was not started."
  fi
  exit 0
fi

if port_is_healthy; then
  if [[ -n "$(list_profile_pids)" ]]; then
    log_ok "Found existing debug Chrome instance on port ${DEBUG_PORT}; reusing profile ${PROFILE_DIR}."
    exit 0
  fi

  log_error "Port ${DEBUG_PORT} is already serving DevTools for a different Chrome instance."
  log_error "Stop the other debugger Chrome or set CHROME_DEBUG_PORT to a different port."
  exit 1
fi

mkdir -p "$(dirname "${LOG_FILE}")" "${PROFILE_DIR}"
stop_profile_processes
cleanup_profile_locks
seed_profile_preferences

log_info "Starting Chrome in detached mode."
log_info "Chrome: ${CHROME_BIN}"
log_info "Port: ${DEBUG_PORT}"
log_info "Profile: ${PROFILE_DIR}"
log_info "URL: ${TARGET_URL}"
log_info "Log file: ${LOG_FILE}"

if command -v setsid >/dev/null 2>&1; then
  setsid nohup "${CHROME_BIN}" "${CHROME_ARGS[@]}" < /dev/null > "${LOG_FILE}" 2>&1 &
else
  nohup "${CHROME_BIN}" "${CHROME_ARGS[@]}" < /dev/null > "${LOG_FILE}" 2>&1 &
fi

printf '[INFO] Waiting for debugger on port %s' "${DEBUG_PORT}"
for _ in {1..60}; do
  if port_is_healthy; then
    sleep 1
    if port_is_healthy; then
      echo
      log_ok "Chrome is listening on port ${DEBUG_PORT}."
      exit 0
    fi
  fi
  printf '.'
  sleep 0.5
done

echo
log_error "Chrome started but port ${DEBUG_PORT} is not responsive."
log_error "Check logs at ${LOG_FILE}"
exit 1
