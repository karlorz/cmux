#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CODEX_LAUNCHER="$PROJECT_DIR/scripts/codex-home-launch.sh"
CODEX_SHELL_HELPERS="$PROJECT_DIR/.codex/codex-shell-helpers.sh"
AUTOPILOT_HOOKS_TEMPLATE="$PROJECT_DIR/.codex/autopilot-hooks.json"
RALPH_HOOKS_TEMPLATE="$PROJECT_DIR/.codex/ralph-loop-hooks.json"

PASS=0
FAIL=0
TOTAL=0

assert_contains() {
  local desc="$1"
  local file="$2"
  local pattern="$3"
  TOTAL=$((TOTAL + 1))
  if grep -Fq -- "$pattern" "$file"; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc"
    FAIL=$((FAIL + 1))
  fi
}

assert_not_contains() {
  local desc="$1"
  local file="$2"
  local pattern="$3"
  TOTAL=$((TOTAL + 1))
  if grep -Fq -- "$pattern" "$file"; then
    echo "  FAIL: $desc"
    FAIL=$((FAIL + 1))
  else
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  fi
}

assert_file_exists() {
  local desc="$1"
  local path="$2"
  TOTAL=$((TOTAL + 1))
  if [[ -f "$path" ]]; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc"
    FAIL=$((FAIL + 1))
  fi
}

TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/cmux-codex-launch-test-XXXXXX")"
OUTPUT_FILE="$TEST_DIR/output.log"
FAKE_HOME="$TEST_DIR/home"
FAKE_BIN="$TEST_DIR/bin"
RALPH_STATE_FILE="$TEST_DIR/ralph-loop-state.json"

cleanup() {
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT

mkdir -p "$FAKE_HOME/.codex" "$FAKE_BIN"
printf '%s\n' 'auth-token' > "$FAKE_HOME/.codex/auth.json"
mkdir -p "$FAKE_HOME/.codex/worktrees" "$FAKE_HOME/.codex/sessions"
printf '%s\n' 'stale-worktree' > "$FAKE_HOME/.codex/worktrees/marker.txt"
printf '%s\n' 'stale-session' > "$FAKE_HOME/.codex/sessions/marker.txt"
printf '%s\n' 'old-history' > "$FAKE_HOME/.codex/history.jsonl"
cat >"$FAKE_HOME/.codex/hooks.json" <<'EOF'
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo home hook"
          }
        ]
      }
    ]
  }
}
EOF

cat >"$FAKE_BIN/codex" <<'EOF'
#!/usr/bin/env sh
set -eu
ACTIVE_HOME="${CODEX_HOME:-$HOME/.codex}"
printf 'code_home=%s\n' "${CODEX_HOME:-}" > "$CMUX_TEST_OUTPUT"
printf 'active_home=%s\n' "$ACTIVE_HOME" >> "$CMUX_TEST_OUTPUT"
if [ -f "$ACTIVE_HOME/hooks.json" ]; then
  printf 'hooks=present\n' >> "$CMUX_TEST_OUTPUT"
  cat "$ACTIVE_HOME/hooks.json" >> "$CMUX_TEST_OUTPUT"
else
  printf 'hooks=absent\n' >> "$CMUX_TEST_OUTPUT"
fi
if [ -L "$ACTIVE_HOME/auth.json" ]; then
  printf 'auth=symlink\n' >> "$CMUX_TEST_OUTPUT"
elif [ -f "$ACTIVE_HOME/auth.json" ]; then
  printf 'auth=file\n' >> "$CMUX_TEST_OUTPUT"
else
  printf 'auth=missing\n' >> "$CMUX_TEST_OUTPUT"
fi
if [ -e "$ACTIVE_HOME/worktrees" ]; then
  printf 'worktrees=present\n' >> "$CMUX_TEST_OUTPUT"
else
  printf 'worktrees=absent\n' >> "$CMUX_TEST_OUTPUT"
fi
if [ -e "$ACTIVE_HOME/sessions" ]; then
  printf 'sessions=present\n' >> "$CMUX_TEST_OUTPUT"
else
  printf 'sessions=absent\n' >> "$CMUX_TEST_OUTPUT"
fi
if [ -e "$ACTIVE_HOME/history.jsonl" ]; then
  printf 'history=present\n' >> "$CMUX_TEST_OUTPUT"
else
  printf 'history=absent\n' >> "$CMUX_TEST_OUTPUT"
fi
printf 'argv=%s\n' "$*" >> "$CMUX_TEST_OUTPUT"
EOF
chmod +x "$FAKE_BIN/codex"

run_helper() {
  env \
    HOME="$FAKE_HOME" \
    PATH="$FAKE_BIN:$PATH" \
    CMUX_TEST_OUTPUT="$OUTPUT_FILE" \
    CMUX_AUTOPILOT_ENABLED=0 \
    CMUX_CODEX_HOOKS_ENABLED=0 \
    "$@" \
    bash -c "source \"$CODEX_SHELL_HELPERS\"; cd \"$PROJECT_DIR\"; codex --version"
}

echo "=== codex-home-launch smoke test ==="

assert_file_exists "repo-local Codex launcher exists" "$CODEX_LAUNCHER"
assert_file_exists "repo-local Codex shell helpers exist" "$CODEX_SHELL_HELPERS"
assert_file_exists "autopilot hooks template exists" "$AUTOPILOT_HOOKS_TEMPLATE"
assert_file_exists "ralph loop hooks template exists" "$RALPH_HOOKS_TEMPLATE"

run_helper
assert_contains \
  "ordinary repo-local codex suppresses inherited home hooks" \
  "$OUTPUT_FILE" \
  "hooks=absent"
assert_contains \
  "ordinary repo-local codex stages auth via symlinked temp CODEX_HOME" \
  "$OUTPUT_FILE" \
  "auth=symlink"
assert_contains \
  "ordinary repo-local codex does not expose stale Codex worktrees" \
  "$OUTPUT_FILE" \
  "worktrees=absent"
assert_contains \
  "ordinary repo-local codex does not expose persisted Codex sessions" \
  "$OUTPUT_FILE" \
  "sessions=absent"
assert_contains \
  "ordinary repo-local codex does not expose persisted Codex history" \
  "$OUTPUT_FILE" \
  "history=absent"
assert_not_contains \
  "ordinary repo-local codex does not copy home hook payloads" \
  "$OUTPUT_FILE" \
  "home hook"

run_helper CMUX_AUTOPILOT_ENABLED=1
assert_contains \
  "autopilot-enabled repo-local codex stages hooks template" \
  "$OUTPUT_FILE" \
  "Checking autopilot continuation"
assert_contains \
  "autopilot-enabled repo-local codex still uses temp CODEX_HOME" \
  "$OUTPUT_FILE" \
  "auth=symlink"

cat >"$RALPH_STATE_FILE" <<'EOF'
{"active":true}
EOF
run_helper CMUX_CODEX_RALPH_STATE_FILE="$RALPH_STATE_FILE"
assert_contains \
  "ralph-loop state activates the repo-local ralph hook template" \
  "$OUTPUT_FILE" \
  "running ralph loop stop hook"
assert_contains \
  "ralph-loop state does not require enabling autopilot hooks" \
  "$OUTPUT_FILE" \
  "auth=symlink"
rm -f "$RALPH_STATE_FILE"

run_helper CMUX_CODEX_USE_HOME_HOOKS=1
assert_contains \
  "explicit home-hook bypass keeps the original home hooks active" \
  "$OUTPUT_FILE" \
  "home hook"
assert_not_contains \
  "explicit home-hook bypass does not stage a temp CODEX_HOME" \
  "$OUTPUT_FILE" \
  "code_home=/"

echo
echo "Passed: $PASS/$TOTAL"

if [[ "$FAIL" -ne 0 ]]; then
  exit 1
fi
