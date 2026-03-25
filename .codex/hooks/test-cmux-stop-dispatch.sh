#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DISPATCH_SCRIPT="$SCRIPT_DIR/cmux-stop-dispatch.sh"
RALPH_STOP_SCRIPT="$SCRIPT_DIR/ralph-loop-stop.sh"

TESTS_PASSED=0
TESTS_TOTAL=0

assert_eq() {
  local actual="$1"
  local expected="$2"
  local message="$3"
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if [[ "$actual" != "$expected" ]]; then
    echo "FAIL: $message" >&2
    echo "  expected: $expected" >&2
    echo "  actual:   $actual" >&2
    exit 1
  fi
  TESTS_PASSED=$((TESTS_PASSED + 1))
}

make_stop_payload() {
  jq -nc \
    --arg cwd "$1" \
    --arg last_assistant_message "$2" \
    '{
      session_id: "session-test",
      turn_id: "turn-test",
      transcript_path: null,
      cwd: $cwd,
      hook_event_name: "Stop",
      model: "gpt-5.4",
      permission_mode: "default",
      stop_hook_active: false,
      last_assistant_message: $last_assistant_message
    }'
}

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

HOME_DIR="$TMP_DIR/home"
WORKSPACE="$TMP_DIR/workspace"
mkdir -p "$WORKSPACE/.codex/hooks" "$HOME_DIR/.codex/hooks"

cp "$RALPH_STOP_SCRIPT" "$WORKSPACE/.codex/hooks/ralph-loop-stop.sh"

cat >"$WORKSPACE/.codex/hooks/autopilot-stop.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
jq -nc '{decision: "block", reason: "autopilot continuation"}'
EOF
chmod +x "$WORKSPACE/.codex/hooks/autopilot-stop.sh"

NO_STATE_OUTPUT="$(cd "$WORKSPACE" && printf '%s' "$(make_stop_payload "$WORKSPACE" "")" | env -u CMUX_AUTOPILOT_ENABLED -u CMUX_CODEX_HOOKS_ENABLED bash "$DISPATCH_SCRIPT")"
assert_eq "$(jq -c . <<<"$NO_STATE_OUTPUT")" "{}" "dispatcher should emit an empty JSON object when Ralph and autopilot are inactive"

cat >"$WORKSPACE/.codex/ralph-loop-state.json" <<'EOF'
{
  "active": true,
  "prompt": "Create smoke.txt with smoke",
  "iteration": 0,
  "max_iterations": 2,
  "completion_promise": "DONE",
  "completion_signal": "<promise>DONE</promise>",
  "created_at": "2026-03-23T00:00:00Z",
  "updated_at": "2026-03-23T00:00:00Z",
  "state_version": 1
}
EOF

FIRST_OUTPUT="$(cd "$TMP_DIR" && printf '%s' "$(make_stop_payload "$WORKSPACE" "draft one")" | env -u CMUX_AUTOPILOT_ENABLED -u CMUX_CODEX_HOOKS_ENABLED bash "$DISPATCH_SCRIPT")"
assert_eq "$(jq -r '.decision' <<<"$FIRST_OUTPUT")" "block" "dispatcher should route Ralph state to the Ralph stop hook"
assert_eq "$(jq -r '.iteration' "$WORKSPACE/.codex/ralph-loop-state.json")" "1" "dispatcher should preserve Ralph iteration updates"

COMPLETION_OUTPUT="$(printf '%s' "$(make_stop_payload "$WORKSPACE" "<promise>DONE</promise>")" | env -u CMUX_AUTOPILOT_ENABLED -u CMUX_CODEX_HOOKS_ENABLED bash "$DISPATCH_SCRIPT")"
assert_eq "$(jq -r '.systemMessage | contains("completion signal detected")' <<<"$COMPLETION_OUTPUT")" "true" "dispatcher should allow when Ralph emits the completion signal"
assert_eq "$([[ -f "$WORKSPACE/.codex/ralph-loop-state.json" ]] && echo yes || echo no)" "no" "dispatcher should let Ralph clean up state after completion"

rm -f "$WORKSPACE/.codex/hooks/ralph-loop-stop.sh"
cat >"$HOME_DIR/.codex/hooks/ralph-loop-stop.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
jq -nc '{decision: "block", reason: "home ralph continuation"}'
EOF
chmod +x "$HOME_DIR/.codex/hooks/ralph-loop-stop.sh"

cat >"$WORKSPACE/.codex/ralph-loop-state.json" <<'EOF'
{
  "active": true,
  "prompt": "Fallback to home Ralph hook",
  "iteration": 0,
  "max_iterations": 2,
  "completion_promise": "DONE",
  "completion_signal": "<promise>DONE</promise>",
  "created_at": "2026-03-23T00:00:00Z",
  "updated_at": "2026-03-23T00:00:00Z",
  "state_version": 1
}
EOF

HOME_FALLBACK_OUTPUT="$(printf '%s' "$(make_stop_payload "$WORKSPACE" "draft one")" | HOME="$HOME_DIR" env -u CMUX_AUTOPILOT_ENABLED -u CMUX_CODEX_HOOKS_ENABLED bash "$DISPATCH_SCRIPT")"
assert_eq "$(jq -r '.decision' <<<"$HOME_FALLBACK_OUTPUT")" "block" "dispatcher should fall back to the home Ralph hook when the workspace hook is absent"
assert_eq "$(jq -r '.reason' <<<"$HOME_FALLBACK_OUTPUT")" "home ralph continuation" "dispatcher should preserve the home Ralph hook output"
rm -f "$WORKSPACE/.codex/ralph-loop-state.json"
cp "$RALPH_STOP_SCRIPT" "$WORKSPACE/.codex/hooks/ralph-loop-stop.sh"

AUTOPILOT_OUTPUT="$(printf '%s' "$(make_stop_payload "$WORKSPACE" "")" | CMUX_AUTOPILOT_ENABLED=1 bash "$DISPATCH_SCRIPT")"
assert_eq "$(jq -r '.decision' <<<"$AUTOPILOT_OUTPUT")" "block" "dispatcher should route autopilot-enabled sessions to the autopilot hook"
assert_eq "$(jq -r '.reason' <<<"$AUTOPILOT_OUTPUT")" "autopilot continuation" "dispatcher should preserve autopilot hook output"

cat >"$WORKSPACE/.codex/ralph-loop-state.json" <<'EOF'
{
  "active": true,
  "prompt": "Reach max iterations",
  "iteration": 0,
  "max_iterations": 1,
  "completion_promise": "DONE",
  "completion_signal": "<promise>DONE</promise>",
  "created_at": "2026-03-23T00:00:00Z",
  "updated_at": "2026-03-23T00:00:00Z",
  "state_version": 1
}
EOF

MAX_FIRST_OUTPUT="$(printf '%s' "$(make_stop_payload "$WORKSPACE" "draft")" | env -u CMUX_AUTOPILOT_ENABLED -u CMUX_CODEX_HOOKS_ENABLED bash "$DISPATCH_SCRIPT")"
assert_eq "$(jq -r '.decision' <<<"$MAX_FIRST_OUTPUT")" "block" "dispatcher should allow Ralph to consume the first max-iteration turn"
MAX_SECOND_OUTPUT="$(printf '%s' "$(make_stop_payload "$WORKSPACE" "still working")" | env -u CMUX_AUTOPILOT_ENABLED -u CMUX_CODEX_HOOKS_ENABLED bash "$DISPATCH_SCRIPT")"
assert_eq "$(jq -r '.systemMessage | contains("max iteration limit")' <<<"$MAX_SECOND_OUTPUT")" "true" "dispatcher should allow once Ralph reaches its max iteration limit"
assert_eq "$([[ -f "$WORKSPACE/.codex/ralph-loop-state.json" ]] && echo yes || echo no)" "no" "dispatcher should let Ralph clean up state after max-iteration exit"

echo "All assertions passed ($TESTS_PASSED/$TESTS_TOTAL)."
