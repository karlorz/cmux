import type { AuthFile } from "../../worker-schemas";

/**
 * Shell wrapper scripts that block dangerous commands inside cmux task sandboxes.
 *
 * These are injected as /usr/local/bin/gh and /usr/local/bin/git so they take
 * precedence over the real binaries at /usr/bin/gh and /usr/bin/git. The
 * wrappers only intercept when CMUX_TASK_RUN_JWT is set; otherwise they pass
 * through to the real binary.
 *
 * Use this for providers that don't support native permissions.deny (Gemini,
 * Amp, Grok, Qwen, Cursor). Claude and OpenCode use native deny rules instead;
 * Codex already has its own wrapper scripts that are maintained inline.
 */

const GH_WRAPPER = `#!/usr/bin/env sh
set -eu

# Wrapper to block dangerous gh commands in cmux task sandboxes.
REAL_GH="/usr/bin/gh"

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

REAL_GIT="/usr/bin/git"

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
