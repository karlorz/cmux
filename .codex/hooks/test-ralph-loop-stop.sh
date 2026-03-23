#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_SCRIPT="$SCRIPT_DIR/ralph-loop-stop.sh"

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

WORKSPACE="$TMP_DIR/workspace"
mkdir -p "$WORKSPACE/.codex"

TESTS_TOTAL=$((TESTS_TOTAL + 1))
NO_STATE_OUTPUT="$(cd "$WORKSPACE" && printf '%s' "$(make_stop_payload "$WORKSPACE" "")" | bash "$HOOK_SCRIPT")"
if [[ -n "$NO_STATE_OUTPUT" ]]; then
  echo "FAIL: hook should emit nothing when no state exists" >&2
  echo "$NO_STATE_OUTPUT" >&2
  exit 1
fi
TESTS_PASSED=$((TESTS_PASSED + 1))

printf '%s\n' '{invalid-json' >"$WORKSPACE/.codex/ralph-loop-state.json"
INVALID_JSON_OUTPUT="$(printf '%s' "$(make_stop_payload "$WORKSPACE" "")" | bash "$HOOK_SCRIPT")"
assert_eq "$(jq -r '.systemMessage | contains("invalid JSON")' <<<"$INVALID_JSON_OUTPUT")" "true" "invalid state should emit a cancellation message"
assert_eq "$([[ -f "$WORKSPACE/.codex/ralph-loop-state.json" ]] && echo yes || echo no)" "no" "invalid state should be cleaned up"

cat >"$WORKSPACE/.codex/ralph-loop-state.json" <<'EOF'
{
  "active": true,
  "prompt": "Create smoke.txt with smoke",
  "iteration": 0,
  "max_iterations": 2,
  "completion_promise": "DONE",
  "completion_signal": "<promise>DONE</promise>",
  "created_at": "2026-03-22T00:00:00Z",
  "updated_at": "2026-03-22T00:00:00Z",
  "state_version": 1
}
EOF

FIRST_OUTPUT="$(cd "$TMP_DIR" && printf '%s' "$(make_stop_payload "$WORKSPACE" "draft one")" | bash "$HOOK_SCRIPT")"
assert_eq "$(jq -r '.decision' <<<"$FIRST_OUTPUT")" "block" "first stop should block even outside the workspace cwd"
assert_eq "$(jq -r '.iteration' "$WORKSPACE/.codex/ralph-loop-state.json")" "1" "iteration should increment after first block"

SECOND_OUTPUT="$(printf '%s' "$(make_stop_payload "$WORKSPACE" "<promise>DONE</promise>")" | bash "$HOOK_SCRIPT")"
assert_eq "$(jq -r '.systemMessage | contains("completion signal detected")' <<<"$SECOND_OUTPUT")" "true" "completion should allow the turn to finish"
assert_eq "$([[ -f "$WORKSPACE/.codex/ralph-loop-state.json" ]] && echo yes || echo no)" "no" "state file should be removed after completion"

cat >"$WORKSPACE/.codex/ralph-loop-state.json" <<'EOF'
{
  "active": true,
  "prompt": "Reach max iterations",
  "iteration": 0,
  "max_iterations": 1,
  "completion_promise": "DONE",
  "completion_signal": "<promise>DONE</promise>",
  "created_at": "2026-03-22T00:00:00Z",
  "updated_at": "2026-03-22T00:00:00Z",
  "state_version": 1
}
EOF

MAX_FIRST_OUTPUT="$(printf '%s' "$(make_stop_payload "$WORKSPACE" "draft")" | bash "$HOOK_SCRIPT")"
assert_eq "$(jq -r '.decision' <<<"$MAX_FIRST_OUTPUT")" "block" "first pass of max-iteration test should block"
MAX_SECOND_OUTPUT="$(printf '%s' "$(make_stop_payload "$WORKSPACE" "still working")" | bash "$HOOK_SCRIPT")"
assert_eq "$(jq -r '.systemMessage | contains("max iteration limit")' <<<"$MAX_SECOND_OUTPUT")" "true" "max iterations should allow the turn to finish"
assert_eq "$([[ -f "$WORKSPACE/.codex/ralph-loop-state.json" ]] && echo yes || echo no)" "no" "state file should be removed after max iteration exit"

echo "All assertions passed ($TESTS_PASSED/$TESTS_TOTAL)."
