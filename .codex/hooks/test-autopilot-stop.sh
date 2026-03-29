#!/bin/bash
set -euo pipefail

unset AUTOPILOT_DELAY AUTOPILOT_IDLE_THRESHOLD AUTOPILOT_MAX_TURNS AUTOPILOT_MONITORING_THRESHOLD
unset CMUX_AUTOPILOT_DELAY CMUX_AUTOPILOT_IDLE_THRESHOLD CMUX_AUTOPILOT_MAX_TURNS CMUX_AUTOPILOT_MONITORING_THRESHOLD
unset AUTOPILOT_ENABLED AUTOPILOT_KEEP_RUNNING_DISABLED CMUX_AUTOPILOT_ENABLED CMUX_CODEX_HOOKS_ENABLED

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK="$SCRIPT_DIR/autopilot-stop.sh"
HOME_HOOK_INSTALLER="$PROJECT_DIR/scripts/install-codex-home-hooks.sh"
TEST_SESSION="codex-hook-test-$$"
STOP_FILE="/tmp/codex-test-stop-${TEST_SESSION}"
FAKE_BIN_DIR="/tmp/codex-hook-bin-${TEST_SESSION}"
FAKE_SLEEP_LOG="/tmp/codex-hook-sleep-${TEST_SESSION}.log"
HOME_HOOK_TEST_DIR="/tmp/codex-hook-home-${TEST_SESSION}"
HOME_HOOKS_FILE="${HOME_HOOK_TEST_DIR}/.codex/hooks.json"
CALLBACK_PORT_FILE="/tmp/codex-hook-callback-port-${TEST_SESSION}"
CALLBACK_BODY_FILE="/tmp/codex-hook-callback-body-${TEST_SESSION}.json"
CALLBACK_SERVER_PID=""
PASS=0
FAIL=0
CONDITIONAL_WAIT_TEXT="Only if you are blocked on external work and are about to poll status"

cleanup() {
  rm -f "$STOP_FILE"
  rm -f "/tmp/codex-autopilot-blocked-${TEST_SESSION}"
  rm -f "/tmp/codex-autopilot-completed-${TEST_SESSION}"
  rm -f "/tmp/codex-autopilot-idle-${TEST_SESSION}"
  rm -f "/tmp/codex-autopilot-pid-${TEST_SESSION}"
  rm -f "/tmp/codex-autopilot-state-${TEST_SESSION}"
  rm -f "/tmp/codex-autopilot-stop-${TEST_SESSION}"
  rm -f "/tmp/codex-autopilot-turns-${TEST_SESSION}"
  rm -f "/tmp/codex-autopilot-wrapup-${TEST_SESSION}"
  rm -f "$FAKE_SLEEP_LOG"
  rm -f "$CALLBACK_PORT_FILE"
  rm -f "$CALLBACK_BODY_FILE"
  rm -rf "$FAKE_BIN_DIR"
  rm -rf "$HOME_HOOK_TEST_DIR"
  if [ -n "$CALLBACK_SERVER_PID" ]; then
    kill "$CALLBACK_SERVER_PID" >/dev/null 2>&1 || true
    wait "$CALLBACK_SERVER_PID" 2>/dev/null || true
    CALLBACK_SERVER_PID=""
  fi
}
trap cleanup EXIT

assert_eq() {
  local desc="$1"
  local expected="$2"
  local actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc (expected: $expected, got: $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert() {
  local desc="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc"
    FAIL=$((FAIL + 1))
  fi
}

setup_fake_sleep() {
  mkdir -p "$FAKE_BIN_DIR"
  cat > "$FAKE_BIN_DIR/sleep" <<EOF
#!/bin/bash
set -euo pipefail
printf '%s\n' "\$1" >> "$FAKE_SLEEP_LOG"
exit 0
EOF
  chmod +x "$FAKE_BIN_DIR/sleep"
}

setup_fake_callback_server() {
  rm -f "$CALLBACK_PORT_FILE" "$CALLBACK_BODY_FILE"

  node - "$CALLBACK_PORT_FILE" "$CALLBACK_BODY_FILE" <<'EOF' &
const fs = require("node:fs");
const http = require("node:http");

const [portFile, bodyFile] = process.argv.slice(2);
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    fs.writeFileSync(bodyFile, body);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end('{"ok":true,"eventType":"session_stop_blocked"}');
    server.close(() => process.exit(0));
  });
});

server.listen(0, "127.0.0.1", () => {
  fs.writeFileSync(portFile, String(server.address().port));
});

setTimeout(() => {
  server.close(() => process.exit(0));
}, 5000);
EOF
  CALLBACK_SERVER_PID=$!

  local _=""
  for _ in $(seq 1 50); do
    if [ -s "$CALLBACK_PORT_FILE" ]; then
      return 0
    fi
    sleep 0.1
  done

  echo "failed to start fake callback server" >&2
  return 1
}

sleep_log_line_count() {
  if [ -f "$FAKE_SLEEP_LOG" ]; then
    wc -l < "$FAKE_SLEEP_LOG" | tr -d '[:space:]'
  else
    echo "0"
  fi
}

sleep_log_match_count() {
  local seconds="$1"
  if [ -f "$FAKE_SLEEP_LOG" ]; then
    grep -c "^${seconds}\$" "$FAKE_SLEEP_LOG" || true
  else
    echo "0"
  fi
}

reason_text() {
  jq -r '.reason' <<<"$1"
}

assert_reason_not_contains() {
  local desc="$1"
  local output="$2"
  local pattern="$3"
  if grep -Fq "$pattern" <<<"$(reason_text "$output")"; then
    echo "  FAIL: $desc"
    FAIL=$((FAIL + 1))
  else
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  fi
}

run_enabled_hook() {
  local input_json="$1"
  shift

  echo "$input_json" | env \
    CMUX_AUTOPILOT_ENABLED=1 \
    AUTOPILOT_KEEP_RUNNING_DISABLED=0 \
    AUTOPILOT_ENABLED=1 \
    AUTOPILOT_DELAY=0 \
    AUTOPILOT_MONITORING_THRESHOLD=999999 \
    "$@" \
    bash "$HOOK" | awk '/"decision"/ { print; exit }'
}

run_hidden_sleep_monitoring_hook() {
  local input_json="$1"
  shift

  run_enabled_hook \
    "$input_json" \
    AUTOPILOT_MAX_TURNS=30 \
    AUTOPILOT_MONITORING_THRESHOLD=1 \
    AUTOPILOT_MONITORING_PHASE1_OFFSET=1 \
    AUTOPILOT_MONITORING_PHASE1_WAIT=1 \
    AUTOPILOT_MONITORING_PHASE2_WAIT=2 \
    AUTOPILOT_IDLE_THRESHOLD=999 \
    PATH="$FAKE_BIN_DIR:$PATH" \
    "$@"
}

echo "=== Codex autopilot hook smoke test ==="

mkdir -p "$HOME_HOOK_TEST_DIR"
bash "$HOME_HOOK_INSTALLER" --home "$HOME_HOOK_TEST_DIR" >/dev/null

assert "Codex Stop hook timeout allows hidden monitoring sleeps" jq -e '
  .hooks.Stop[0].hooks[0].timeout >= 75
' "$HOME_HOOKS_FILE"

cleanup
touch "$STOP_FILE"

FIRST_OUTPUT=$(run_enabled_hook \
  "{\"session_id\":\"${TEST_SESSION}\"}" \
  AUTOPILOT_MAX_TURNS=20 \
  AUTOPILOT_STOP_FILE="$STOP_FILE")

assert "First stop request blocks for inline wrapup" jq -e '.decision == "block"' <<<"$FIRST_OUTPUT"
assert "Wrapup marker created" test -f "/tmp/codex-autopilot-wrapup-${TEST_SESSION}"
assert "Pid marker created on block" test -f "/tmp/codex-autopilot-pid-${TEST_SESSION}"

SECOND_OUTPUT=$(run_enabled_hook \
  "{\"session_id\":\"${TEST_SESSION}\"}" \
  AUTOPILOT_MAX_TURNS=20 \
  AUTOPILOT_STOP_FILE="$STOP_FILE" || true)

assert "Second stop request allows stop" test -z "$SECOND_OUTPUT"
assert "Wrapup marker removed after allow" test ! -f "/tmp/codex-autopilot-wrapup-${TEST_SESSION}"
assert "Pid marker removed after allow" test ! -f "/tmp/codex-autopilot-pid-${TEST_SESSION}"

cleanup
echo "0" > "/tmp/codex-autopilot-turns-${TEST_SESSION}"

MAX_TURN_OUTPUT=$(run_enabled_hook \
  "{\"session_id\":\"${TEST_SESSION}\"}" \
  AUTOPILOT_MAX_TURNS=1)

assert "Max turns triggers final wrapup block" jq -e '.decision == "block"' <<<"$MAX_TURN_OUTPUT"
assert "Max-turn wrapup marker created" grep -q "max-turns" "/tmp/codex-autopilot-wrapup-${TEST_SESSION}"

MAX_TURN_ALLOW=$(run_enabled_hook \
  "{\"session_id\":\"${TEST_SESSION}\"}" \
  AUTOPILOT_MAX_TURNS=1 || true)

assert "Follow-up stop after max-turn wrapup allows stop" test -z "$MAX_TURN_ALLOW"

cleanup
echo "0" > "/tmp/codex-autopilot-turns-${TEST_SESSION}"

ALIAS_PRECEDENCE_OUTPUT=$(run_enabled_hook \
  "{\"session_id\":\"${TEST_SESSION}\"}" \
  AUTOPILOT_MAX_TURNS=1 \
  CMUX_AUTOPILOT_MAX_TURNS=20)

assert "Generic AUTOPILOT_MAX_TURNS overrides CMUX_AUTOPILOT_MAX_TURNS" jq -e '.decision == "block"' <<<"$ALIAS_PRECEDENCE_OUTPUT"
assert "Generic alias max-turn wrapup marker created" grep -q "max-turns" "/tmp/codex-autopilot-wrapup-${TEST_SESSION}"

cleanup
echo "0" > "/tmp/codex-autopilot-turns-${TEST_SESSION}"

LEGACY_CLAUDE_ALIAS_OUTPUT=$(run_enabled_hook \
  "{\"session_id\":\"${TEST_SESSION}\"}" \
  CLAUDE_AUTOPILOT_MAX_TURNS=1)

assert "Legacy CLAUDE_AUTOPILOT_MAX_TURNS still works for Codex when enabled" jq -e '.decision == "block"' <<<"$LEGACY_CLAUDE_ALIAS_OUTPUT"
assert "Legacy CLAUDE alias creates max-turn wrapup marker" grep -q "max-turns" "/tmp/codex-autopilot-wrapup-${TEST_SESSION}"

cleanup

# Pre-seed turn count to 1 to simulate a repeated Stop event on the same session
echo "1" > "/tmp/codex-autopilot-turns-${TEST_SESSION}"

STOP_ACTIVE_OUTPUT=$(run_enabled_hook \
  "{\"session_id\":\"${TEST_SESSION}\",\"stop_hook_active\":true}" \
  AUTOPILOT_MAX_TURNS=99999)

assert "Codex repeated stop with stop_hook_active=true still blocks" jq -e '.decision == "block"' <<<"$STOP_ACTIVE_OUTPUT"
assert "Repeated codex stop recreates blocked flag" test -f "/tmp/codex-autopilot-blocked-${TEST_SESSION}"
assert "Repeated codex stop increments turn counter to 2" grep -q '^2$' "/tmp/codex-autopilot-turns-${TEST_SESSION}"

cleanup

# Test stop_hook_active=true on turn 1 should also block
STOP_ACTIVE_TURN1_OUTPUT=$(run_enabled_hook \
  "{\"session_id\":\"${TEST_SESSION}\",\"stop_hook_active\":true}" \
  AUTOPILOT_MAX_TURNS=99999)

assert "Codex stop_hook_active=true on turn 1 still blocks" jq -e '.decision == "block"' <<<"$STOP_ACTIVE_TURN1_OUTPUT"

cleanup

DISABLED_BY_DEFAULT_OUTPUT=$(echo "{\"session_id\":\"${TEST_SESSION}\"}" | \
  env -u AUTOPILOT_KEEP_RUNNING_DISABLED -u CMUX_AUTOPILOT_ENABLED \
    AUTOPILOT_ENABLED=1 \
    AUTOPILOT_DELAY=0 \
    bash "$HOOK" | awk '/"decision"/ { print; exit }' || true)

assert "Unset AUTOPILOT_KEEP_RUNNING_DISABLED disables Codex autopilot" test -z "$DISABLED_BY_DEFAULT_OUTPUT"
assert "Disabled-by-default run does not create blocked flag" test ! -f "/tmp/codex-autopilot-blocked-${TEST_SESSION}"

STALE_LOGIN_ENV_OUTPUT=$(echo "{\"session_id\":\"${TEST_SESSION}\"}" | \
  env -u CMUX_AUTOPILOT_ENABLED \
    AUTOPILOT_KEEP_RUNNING_DISABLED=0 \
    AUTOPILOT_ENABLED=1 \
    AUTOPILOT_DELAY=0 \
    bash "$HOOK" | awk '/"decision"/ { print; exit }' || true)

assert "Stale generic AUTOPILOT_KEEP_RUNNING_DISABLED=0 does not enable Codex autopilot without CMUX_AUTOPILOT_ENABLED=1" test -z "$STALE_LOGIN_ENV_OUTPUT"
assert "Stale generic enable does not create blocked flag" test ! -f "/tmp/codex-autopilot-blocked-${TEST_SESSION}"

cleanup
CODEX_HOOKS_ONLY_OUTPUT=$(echo "{\"session_id\":\"${TEST_SESSION}\"}" | \
  env -u AUTOPILOT_KEEP_RUNNING_DISABLED -u CMUX_AUTOPILOT_ENABLED \
    CMUX_CODEX_HOOKS_ENABLED=1 \
    AUTOPILOT_ENABLED=1 \
    AUTOPILOT_DELAY=0 \
    bash "$HOOK" | awk '/"decision"/ { print; exit }')

assert "CMUX_CODEX_HOOKS_ENABLED also enables Codex autopilot" jq -e '.decision == "block"' <<<"$CODEX_HOOKS_ONLY_OUTPUT"
assert "CMUX_CODEX_HOOKS_ENABLED creates blocked flag" test -f "/tmp/codex-autopilot-blocked-${TEST_SESSION}"

cleanup
CODEX_HOOKS_OVERRIDE_OUTPUT=$(echo "{\"session_id\":\"${TEST_SESSION}\"}" | \
  env -u CMUX_AUTOPILOT_ENABLED \
    AUTOPILOT_KEEP_RUNNING_DISABLED=1 \
    CMUX_CODEX_HOOKS_ENABLED=1 \
    AUTOPILOT_ENABLED=1 \
    AUTOPILOT_DELAY=0 \
    bash "$HOOK" | awk '/"decision"/ { print; exit }')

assert "CMUX_CODEX_HOOKS_ENABLED overrides inherited disable flag" jq -e '.decision == "block"' <<<"$CODEX_HOOKS_OVERRIDE_OUTPUT"
assert "Codex-scoped enable still creates blocked flag when generic disable is inherited" test -f "/tmp/codex-autopilot-blocked-${TEST_SESSION}"

cleanup
setup_fake_callback_server
CALLBACK_PORT="$(cat "$CALLBACK_PORT_FILE")"
CALLBACK_OUTPUT=$(echo "{\"session_id\":\"${TEST_SESSION}\"}" | \
  env -u CMUX_AUTOPILOT_ENABLED \
    AUTOPILOT_KEEP_RUNNING_DISABLED=1 \
    CMUX_CODEX_HOOKS_ENABLED=1 \
    AUTOPILOT_ENABLED=1 \
    AUTOPILOT_DELAY=0 \
    AUTOPILOT_MONITORING_THRESHOLD=999999 \
    CMUX_CALLBACK_URL="http://127.0.0.1:${CALLBACK_PORT}" \
    CMUX_TASK_RUN_JWT="test-jwt" \
    bash "$HOOK")
wait "$CALLBACK_SERVER_PID" 2>/dev/null || true
CALLBACK_SERVER_PID=""

assert "Callback-enabled hook still returns a block decision" jq -e '.decision == "block"' <<<"$CALLBACK_OUTPUT"
assert_eq "Callback-enabled hook returns only one JSON line" "1" "$(printf '%s\n' "$CALLBACK_OUTPUT" | wc -l | tr -d '[:space:]')"
assert "Callback-enabled hook output excludes callback response JSON" sh -c 'printf "%s\n" "$1" | grep -Fq "\"eventType\":\"session_stop_blocked\"" && exit 1 || exit 0' _ "$CALLBACK_OUTPUT"
assert "Callback-enabled hook still posts the session event in background" test -s "$CALLBACK_BODY_FILE"

cleanup
INPUT_JSON="{\"session_id\":\"${TEST_SESSION}\",\"stop_hook_active\":false}"
setup_fake_sleep

DEFAULT_THRESHOLD_OUTPUT=$(echo "$INPUT_JSON" | env \
  CMUX_AUTOPILOT_ENABLED=1 \
  AUTOPILOT_KEEP_RUNNING_DISABLED=0 \
  AUTOPILOT_ENABLED=1 \
  AUTOPILOT_DELAY=0 \
  AUTOPILOT_MAX_TURNS=30 \
  AUTOPILOT_IDLE_THRESHOLD=999 \
  PATH="$FAKE_BIN_DIR:$PATH" \
  bash "$HOOK")

assert_reason_not_contains "Codex first-hook monitoring omits prompt sleep guidance" "$DEFAULT_THRESHOLD_OUTPUT" "sleep 30"
assert_reason_not_contains "Codex first-hook monitoring omits conditional wait text" "$DEFAULT_THRESHOLD_OUTPUT" "$CONDITIONAL_WAIT_TEXT"
assert_eq "Codex default threshold triggers hidden 30s sleep on turn 1" "1" "$(sleep_log_match_count 30)"
assert_eq "Codex default threshold logs one hidden sleep total" "1" "$(sleep_log_line_count)"

cleanup
INPUT_JSON="{\"session_id\":\"${TEST_SESSION}\",\"stop_hook_active\":false}"
setup_fake_sleep

WORK_PHASE_OUTPUT=$(run_hidden_sleep_monitoring_hook "$INPUT_JSON")

assert_reason_not_contains "Codex turn 1 work phase has no wait instruction" "$WORK_PHASE_OUTPUT" "sleep"
assert_eq "Codex turn 1 work phase does not trigger hidden sleep" "0" "$(sleep_log_line_count)"

PHASE1_OUTPUT=$(run_hidden_sleep_monitoring_hook "$INPUT_JSON")

assert_reason_not_contains "Codex monitoring phase 1 omits prompt sleep guidance" "$PHASE1_OUTPUT" "sleep 1"
assert_reason_not_contains "Codex monitoring phase 1 omits conditional wait text" "$PHASE1_OUTPUT" "$CONDITIONAL_WAIT_TEXT"
assert_eq "Codex monitoring phase 1 triggers one hidden sleep" "1" "$(sleep_log_match_count 1)"
assert_eq "Codex monitoring phase 1 logs one hidden sleep total" "1" "$(sleep_log_line_count)"

PHASE2_OUTPUT=$(run_hidden_sleep_monitoring_hook "$INPUT_JSON")

assert_reason_not_contains "Codex monitoring phase 2 omits prompt sleep guidance" "$PHASE2_OUTPUT" "sleep 2"
assert_reason_not_contains "Codex monitoring phase 2 omits conditional wait text" "$PHASE2_OUTPUT" "$CONDITIONAL_WAIT_TEXT"
assert_eq "Codex monitoring phase 2 triggers one hidden 2s sleep" "1" "$(sleep_log_match_count 2)"
assert_eq "Codex monitoring phases log two hidden sleeps total" "2" "$(sleep_log_line_count)"

echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
