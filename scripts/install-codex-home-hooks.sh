#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'EOF'
install-codex-home-hooks.sh

Install or refresh the managed Codex home Stop and SessionStart hooks used by
Codex autopilot, with optional repo-local overrides when a workspace provides
its own `.codex/hooks/*.sh` wrappers.

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
HOME_AUTOPILOT_STOP_SOURCE="${REPO_ROOT}/.codex/hooks/home-autopilot-stop.sh"
HOME_AUTOPILOT_STOP_TARGET="${HOOKS_DIR}/autopilot-stop.sh"
HOME_SESSION_START_SOURCE="${REPO_ROOT}/.codex/hooks/home-session-start.sh"
HOME_SESSION_START_TARGET="${HOOKS_DIR}/session-start.sh"

mkdir -p "$HOOKS_DIR"

install_script() {
  local source_path="$1"
  local target_path="$2"

  cp "$source_path" "$target_path"
  chmod 755 "$target_path"
}

install_templated_script() {
  local source_path="$1"
  local target_path="$2"
  local escaped_repo_root="$REPO_ROOT"

  escaped_repo_root="${escaped_repo_root//\\/\\\\}"
  escaped_repo_root="${escaped_repo_root//&/\\&}"
  escaped_repo_root="${escaped_repo_root//|/\\|}"

  sed "s|__CMUX_SHARED_REPO_ROOT__|$escaped_repo_root|g" "$source_path" >"$target_path"
  chmod 755 "$target_path"
}

install_script "$DISPATCH_SOURCE" "$DISPATCH_TARGET"
install_script "$SESSION_START_SOURCE" "$SESSION_START_TARGET"
install_templated_script "$HOME_AUTOPILOT_STOP_SOURCE" "$HOME_AUTOPILOT_STOP_TARGET"
install_templated_script "$HOME_SESSION_START_SOURCE" "$HOME_SESSION_START_TARGET"

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
