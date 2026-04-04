#!/usr/bin/env bash
set -euo pipefail

# Smoke test for the local Claude plugin-development lane.
#
# This script is intentionally lightweight:
# - it uses `selftest-local` plus `run-local --dry-run`
# - it does not require a real Claude session
# - it can validate DEVSH_CLAUDE_BIN / CMUX_CLAUDE_BIN override behavior
# - it checks that local plugin/settings/MCP flags are accepted and surfaced
#
# Usage:
#   DEVSH_BIN=/path/to/devsh ./scripts/smoke-local-claude-plugin-dev.sh
#   CLAUDE_BIN=/path/to/custom/claude DEVSH_BIN=devsh ./scripts/smoke-local-claude-plugin-dev.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

DEVSH_BIN="${DEVSH_BIN:-devsh}"
KEEP_TMP="${KEEP_TMP:-0}"

TMP_DIR="$(mktemp -d)"
WORKSPACE="$TMP_DIR/workspace"
PLUGIN_DIR="$WORKSPACE/my-plugin"
CLAUDE_DIR="$WORKSPACE/.claude"
SETTINGS_PATH="$CLAUDE_DIR/settings.local.json"
MCP_PATH="$CLAUDE_DIR/mcp.local.json"
FAKE_CLAUDE="$TMP_DIR/claude-fake"

cleanup() {
  if [[ "$KEEP_TMP" != "1" ]]; then
    rm -rf "$TMP_DIR"
  else
    echo "[info] Preserved temp directory: $TMP_DIR"
  fi
}
trap cleanup EXIT

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[error] Required command not found: $1" >&2
    exit 1
  fi
}

resolve_devsh_bin() {
  if [[ -x "$DEVSH_BIN" ]]; then
    echo "$DEVSH_BIN"
    return
  fi
  if command -v "$DEVSH_BIN" >/dev/null 2>&1; then
    command -v "$DEVSH_BIN"
    return
  fi
  echo "[error] DEVSH_BIN '$DEVSH_BIN' is not executable and was not found in PATH" >&2
  exit 1
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  if ! grep -Fq -- "$needle" <<<"$haystack"; then
    echo "[error] Expected output to contain: $needle" >&2
    exit 1
  fi
}

DEVSH_BIN_RESOLVED="$(resolve_devsh_bin)"

mkdir -p "$PLUGIN_DIR" "$CLAUDE_DIR"
cat > "$PLUGIN_DIR/README.md" <<'EOF'
# Test Plugin
EOF
cat > "$SETTINGS_PATH" <<'EOF'
{
  "permissions": {
    "allow": ["Read"]
  }
}
EOF
cat > "$MCP_PATH" <<'EOF'
{
  "mcpServers": {}
}
EOF
cat > "$WORKSPACE/CLAUDE.md" <<'EOF'
# Smoke Test Workspace
EOF

if [[ -z "${CLAUDE_BIN:-}" ]]; then
  cat > "$FAKE_CLAUDE" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-}" == "--version" ]]; then
  echo "claude-fake 0.0.1"
  exit 0
fi
echo "claude-fake invoked: $*" >&2
exit 0
EOF
  chmod +x "$FAKE_CLAUDE"
  CLAUDE_BIN="$FAKE_CLAUDE"
fi

echo "[info] Using devsh binary: $DEVSH_BIN_RESOLVED"
echo "[info] Using Claude binary override: $CLAUDE_BIN"
echo "[info] Temp workspace: $WORKSPACE"

RUN_LOCAL_HELP="$("$DEVSH_BIN_RESOLVED" orchestrate run-local --help 2>&1 || true)"
SELFTEST_HELP="$("$DEVSH_BIN_RESOLVED" orchestrate selftest-local --help 2>&1 || true)"

assert_contains "$RUN_LOCAL_HELP" "--plugin-dir"
assert_contains "$RUN_LOCAL_HELP" "--settings"
assert_contains "$RUN_LOCAL_HELP" "--mcp-config"
assert_contains "$SELFTEST_HELP" "--agent"

echo "[info] Help surface checks passed"

SELFTEST_OUTPUT="$(
  DEVSH_CLAUDE_BIN="$CLAUDE_BIN" \
  ANTHROPIC_API_KEY="smoke-test-key" \
  "$DEVSH_BIN_RESOLVED" orchestrate selftest-local --agent claude --workspace "$WORKSPACE" --verbose 2>&1
)"

assert_contains "$SELFTEST_OUTPUT" "claude-fake"
assert_contains "$SELFTEST_OUTPUT" "All preflight checks passed"

echo "[info] selftest-local override check passed"

DRY_RUN_OUTPUT="$(
  DEVSH_CLAUDE_BIN="$CLAUDE_BIN" \
  "$DEVSH_BIN_RESOLVED" orchestrate run-local \
    --agent claude/opus-4.6 \
    --dry-run \
    --workspace "$WORKSPACE" \
    --plugin-dir "$PLUGIN_DIR" \
    --settings "$SETTINGS_PATH" \
    --setting-sources project,local \
    --mcp-config "$MCP_PATH" \
    --allowed-tools Read,Write \
    "Validate the plugin command flow" 2>&1
)"

assert_contains "$DRY_RUN_OUTPUT" "--plugin-dir"
assert_contains "$DRY_RUN_OUTPUT" "$PLUGIN_DIR"
assert_contains "$DRY_RUN_OUTPUT" "--settings"
assert_contains "$DRY_RUN_OUTPUT" "$SETTINGS_PATH"
assert_contains "$DRY_RUN_OUTPUT" "--setting-sources"
assert_contains "$DRY_RUN_OUTPUT" "project,local"
assert_contains "$DRY_RUN_OUTPUT" "--mcp-config"
assert_contains "$DRY_RUN_OUTPUT" "$MCP_PATH"
assert_contains "$DRY_RUN_OUTPUT" "--allowed-tools"
assert_contains "$DRY_RUN_OUTPUT" "Read,Write"

echo "[ok] Local Claude plugin-dev smoke path passed"
