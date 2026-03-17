import type { AuthFile } from "../../worker-schemas";

/**
 * Shell wrapper scripts that block dangerous commands inside cmux task sandboxes.
 *
 * These are injected as /usr/local/bin/gh and /usr/local/bin/git so they take
 * precedence over the real binaries at /usr/bin/gh and /usr/bin/git. The
 * wrappers only intercept when CMUX_TASK_RUN_JWT is set; otherwise they pass
 * through to the real binary.
 *
 * IMPORTANT: Shell wrappers are DISABLED by default. They can be enabled via
 * the `enableShellWrappers` setting in workspace settings. The preferred
 * approach is to use permission deny rules (for Claude Code) or policy rules
 * (for all agents) instead of shell wrappers.
 *
 * Shell wrappers are a defense-in-depth option for agents that:
 * 1. Don't support native permissions.deny (Gemini, Amp, Grok, Qwen, Cursor)
 * 2. Where policy rule instructions might not be followed reliably
 *
 * Note: Claude and OpenCode use native deny rules; Codex has its own wrapper
 * scripts maintained inline.
 */

const GH_WRAPPER = `#!/usr/bin/env sh
set -eu

# Wrapper to block dangerous gh commands in cmux task sandboxes.
# Find the real gh binary (this wrapper is at /usr/local/bin/gh, so skip that)
REAL_GH=""
for p in /usr/bin/gh /opt/homebrew/bin/gh; do
  if [ -x "$p" ]; then
    REAL_GH="$p"
    break
  fi
done
if [ -z "$REAL_GH" ]; then
  echo "ERROR: gh not found in /usr/bin or /opt/homebrew/bin" >&2
  exit 1
fi

if [ -n "\${CMUX_TASK_RUN_JWT:-}" ]; then
  case "\${1:-}:\${2:-}" in
    pr:create)
      echo "ERROR: gh pr create is blocked in cmux sandboxes." >&2
      echo "The cmux crown workflow handles PR creation automatically." >&2
      exit 1
      ;;
    pr:merge)
      echo "ERROR: gh pr merge is blocked in cmux sandboxes." >&2
      echo "PR merging requires explicit user approval." >&2
      exit 1
      ;;
    pr:close)
      echo "ERROR: gh pr close is blocked in cmux sandboxes." >&2
      echo "PR lifecycle is managed by the cmux platform." >&2
      exit 1
      ;;
    workflow:run)
      echo "ERROR: gh workflow run is blocked in cmux sandboxes." >&2
      echo "Infrastructure workflows must be triggered by a human." >&2
      exit 1
      ;;
  esac
fi

exec "$REAL_GH" "$@"
`;

const GIT_WRAPPER = `#!/usr/bin/env sh
set -eu

# Find the real git binary (this wrapper is at /usr/local/bin/git, so skip that)
REAL_GIT=""
for p in /usr/bin/git /opt/homebrew/bin/git; do
  if [ -x "$p" ]; then
    REAL_GIT="$p"
    break
  fi
done
if [ -z "$REAL_GIT" ]; then
  echo "ERROR: git not found in /usr/bin or /opt/homebrew/bin" >&2
  exit 1
fi

if [ -n "\${CMUX_TASK_RUN_JWT:-}" ]; then
  case "\${1:-}" in
    push)
      for arg in "$@"; do
        case "$arg" in
          --force|--force-with-lease|-f)
            echo "ERROR: git force push is blocked in cmux sandboxes." >&2
            echo "Force pushing destroys history and breaks PR workflows." >&2
            exit 1
            ;;
        esac
      done
      ;;
  esac
fi

exec "$REAL_GIT" "$@"
`;

/**
 * Returns file entries for gh and git wrapper scripts that block dangerous
 * commands in task sandboxes.  Only call this when `ctx.taskRunJwt` is non-empty.
 */
export function getTaskSandboxWrapperFiles(
  Buffer: typeof globalThis.Buffer,
): AuthFile[] {
  return [
    {
      destinationPath: "/usr/local/bin/gh",
      contentBase64: Buffer.from(GH_WRAPPER).toString("base64"),
      mode: "755",
    },
    {
      destinationPath: "/usr/local/bin/git",
      contentBase64: Buffer.from(GIT_WRAPPER).toString("base64"),
      mode: "755",
    },
  ];
}
