#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALLER="$PROJECT_DIR/scripts/install-codex-home-hooks.sh"

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

TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/cmux-codex-home-hooks-test-XXXXXX")"
HOME_DIR="$TEST_DIR/home"
HOOKS_FILE="$HOME_DIR/.codex/hooks.json"
DISPATCH_FILE="$HOME_DIR/.codex/hooks/cmux-stop-dispatch.sh"
CONFIG_FILE="$HOME_DIR/.codex/config.toml"

cleanup() {
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT

mkdir -p "$HOME_DIR/.codex"
cat >"$CONFIG_FILE" <<'EOF'
notify = ["/tmp/notify.sh"]

[profiles.default]
color = "blue"
EOF

cat >"$HOME_DIR/.bashrc" <<'EOF'
[ -f /root/lifecycle/codex-shell-helpers.sh ] && . /root/lifecycle/codex-shell-helpers.sh
export PATH="/usr/local/bin:$PATH"
EOF

cat >"$HOME_DIR/.zshrc" <<'EOF'
[ -f /root/lifecycle/codex-shell-helpers.sh ] && . /root/lifecycle/codex-shell-helpers.sh
export EDITOR=vim
EOF

echo "=== codex home hook install smoke test ==="

bash "$INSTALLER" --home "$HOME_DIR" >/dev/null
bash "$INSTALLER" --home "$HOME_DIR" >/dev/null

assert_file_exists "managed hooks.json exists" "$HOOKS_FILE"
assert_file_exists "managed dispatcher script exists" "$DISPATCH_FILE"
assert_contains \
  "hooks.json points to the managed home dispatcher" \
  "$HOOKS_FILE" \
  'cmux-stop-dispatch.sh'
assert_contains \
  "config.toml keeps unrelated config" \
  "$CONFIG_FILE" \
  'color = "blue"'
assert_contains \
  "config.toml enables codex_hooks" \
  "$CONFIG_FILE" \
  'codex_hooks = true'
assert_not_contains \
  "bashrc no longer sources stale helper overrides" \
  "$HOME_DIR/.bashrc" \
  'codex-shell-helpers.sh'
assert_not_contains \
  "zshrc no longer sources stale helper overrides" \
  "$HOME_DIR/.zshrc" \
  'codex-shell-helpers.sh'

TOTAL=$((TOTAL + 1))
CODEX_HOOKS_COUNT="$(grep -c '^codex_hooks = true$' "$CONFIG_FILE" || true)"
if [[ "$CODEX_HOOKS_COUNT" = "1" ]]; then
  echo "  PASS: installer is idempotent for codex_hooks"
  PASS=$((PASS + 1))
else
  echo "  FAIL: installer is idempotent for codex_hooks"
  FAIL=$((FAIL + 1))
fi

echo
echo "Passed: $PASS/$TOTAL"

if [[ "$FAIL" -ne 0 ]]; then
  exit 1
fi
