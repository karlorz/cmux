#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'EOF'
install-codex-home-hooks.sh

Install or refresh the managed Codex home Stop hook used by cmux Ralph Loop
and Codex autopilot.

Usage:
  scripts/install-codex-home-hooks.sh [--home /absolute/path]
EOF
}

HOME_DIR="${HOME:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --home)
      HOME_DIR="${2:-}"
      shift 2
      ;;
    -h|--help)
      print_help
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$HOME_DIR" ]]; then
  echo "HOME is not set and --home was not provided" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CODEX_DIR="${HOME_DIR}/.codex"
HOOKS_DIR="${CODEX_DIR}/hooks"
HOOKS_FILE="${CODEX_DIR}/hooks.json"
CONFIG_FILE="${CODEX_DIR}/config.toml"
DISPATCH_SOURCE="${REPO_ROOT}/.codex/hooks/cmux-stop-dispatch.sh"
DISPATCH_TARGET="${HOOKS_DIR}/cmux-stop-dispatch.sh"
SESSION_START_SOURCE="${REPO_ROOT}/.codex/hooks/managed-session-start.sh"
SESSION_START_TARGET="${HOOKS_DIR}/managed-session-start.sh"

mkdir -p "$HOOKS_DIR"
cp "$DISPATCH_SOURCE" "$DISPATCH_TARGET"
chmod 755 "$DISPATCH_TARGET"
cp "$SESSION_START_SOURCE" "$SESSION_START_TARGET"
chmod 755 "$SESSION_START_TARGET"

cat >"$HOOKS_FILE" <<'EOF'
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          {
            "type": "command",
            "command": "sh -c 'exec \"$HOME/.codex/hooks/managed-session-start.sh\"'",
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "sh -c 'exec \"$HOME/.codex/hooks/cmux-stop-dispatch.sh\"'",
            "timeout": 75
          }
        ]
      }
    ]
  }
}
EOF

tmp_config="$(mktemp)"
if [[ -f "$CONFIG_FILE" ]]; then
  cp "$CONFIG_FILE" "$tmp_config"
else
  : >"$tmp_config"
fi

awk '
  BEGIN {
    in_features = 0
    saw_features = 0
    wrote_codex_hooks = 0
    total_lines = 0
  }
  {
    total_lines += 1
  }
  /^\[features\][[:space:]]*$/ {
    if (in_features && !wrote_codex_hooks) {
      print "codex_hooks = true"
      wrote_codex_hooks = 1
    }
    saw_features = 1
    in_features = 1
    print
    next
  }
  in_features && /^\[/ {
    if (!wrote_codex_hooks) {
      print "codex_hooks = true"
      wrote_codex_hooks = 1
    }
    in_features = 0
  }
  in_features && /^[[:space:]]*codex_hooks[[:space:]]*=/ {
    if (!wrote_codex_hooks) {
      print "codex_hooks = true"
      wrote_codex_hooks = 1
    }
    next
  }
  {
    print
  }
  END {
    if (in_features && !wrote_codex_hooks) {
      print "codex_hooks = true"
      wrote_codex_hooks = 1
    }
    if (!saw_features) {
      if (total_lines > 0) {
        print ""
      }
      print "[features]"
      print "codex_hooks = true"
    }
  }
' "$tmp_config" >"$CONFIG_FILE"
rm -f "$tmp_config"

remove_lines_with_pattern() {
  local file_path="$1"
  local pattern="$2"
  local tmp_file=""

  if [[ ! -f "$file_path" ]]; then
    return 0
  fi

  tmp_file="$(mktemp)"
  grep -Fv "$pattern" "$file_path" >"$tmp_file" || true
  mv "$tmp_file" "$file_path"
}

remove_lines_with_pattern "${HOME_DIR}/.bashrc" "codex-shell-helpers.sh"
remove_lines_with_pattern "${HOME_DIR}/.zshrc" "codex-shell-helpers.sh"

echo "Installed managed Codex home hooks into ${CODEX_DIR}"
