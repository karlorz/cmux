import type {
  EnvironmentContext,
  EnvironmentResult,
} from "../common/environment-result";

async function buildOpencodeEnvironment(
  _ctx: EnvironmentContext,
  opts: { skipAuth: boolean }
): Promise<EnvironmentResult> {
  // These must be lazy since configs are imported into the browser
  const { readFile } = await import("node:fs/promises");
  const { homedir } = await import("node:os");
  const { Buffer } = await import("node:buffer");
  const files: EnvironmentResult["files"] = [];
  const env: Record<string, string> = {};
  const startupCommands: string[] = [];

  // Ensure .local/share/opencode directory exists
  startupCommands.push("mkdir -p ~/.local/share/opencode");
  // Ensure OpenCode plugin directory exists
  startupCommands.push("mkdir -p ~/.config/opencode/plugin");
  // Ensure lifecycle directories exist for completion hooks
  startupCommands.push("mkdir -p /root/lifecycle");
  startupCommands.push("mkdir -p /root/lifecycle/opencode");
  startupCommands.push("rm -f /root/lifecycle/opencode-complete-* 2>/dev/null || true");

  // Create a script file that will submit the prompt to OpenCode
  const promptSubmissionScript = `#!/bin/bash
set -euo pipefail

LOG_FILE="/root/lifecycle/opencode-prompt-submission.log"
mkdir -p /root/lifecycle

echo "[CMUX] Starting OpenCode prompt submission script" | tee -a "\${LOG_FILE}"

# Wait for OpenCode server to be ready (max 30 seconds)
for i in {1..30}; do
  if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4096/ 2>/dev/null | grep -q "^[0-9]"; then
    echo "[CMUX] OpenCode server is ready on port 4096" | tee -a "\${LOG_FILE}"
    break
  fi
  echo "[CMUX] Waiting for OpenCode server to start... (attempt \$i/30)" | tee -a "\${LOG_FILE}"
  sleep 1
done

# Submit the prompt via curl
if [ -n "\${CMUX_PROMPT:-}" ]; then
  echo "[CMUX] Submitting prompt to OpenCode server..." | tee -a "\${LOG_FILE}"

  # Properly escape the prompt for JSON
  ESCAPED_PROMPT=\$(echo "\$CMUX_PROMPT" | python3 -c 'import sys, json; print(json.dumps(sys.stdin.read().strip()))')

  RESPONSE=\$(curl -sS -X POST http://127.0.0.1:4096/tui/submit-prompt \\
    -H "Content-Type: application/json" \\
    -d "{\\"prompt\\": \${ESCAPED_PROMPT}}" 2>&1) || {
      echo "[CMUX] Warning: Failed to submit prompt to OpenCode server: \$RESPONSE" | tee -a "\${LOG_FILE}"
      exit 1
    }

  echo "[CMUX] Prompt submitted successfully. Response: \$RESPONSE" | tee -a "\${LOG_FILE}"
else
  echo "[CMUX] No prompt to submit (CMUX_PROMPT is empty)" | tee -a "\${LOG_FILE}"
fi
`;

  files.push({
    destinationPath: "/root/lifecycle/opencode/submit-prompt.sh",
    contentBase64: Buffer.from(promptSubmissionScript).toString("base64"),
    mode: "755",
  });

  // Add startup command to run the prompt submission script in the background
  startupCommands.push("nohup /root/lifecycle/opencode/submit-prompt.sh > /dev/null 2>&1 &");

  // Copy auth.json unless explicitly skipped (grok-code doesn't need it)
  if (!opts.skipAuth) {
    try {
      const authContent = await readFile(
        `${homedir()}/.local/share/opencode/auth.json`,
        "utf-8"
      );
      files.push({
        destinationPath: "$HOME/.local/share/opencode/auth.json",
        contentBase64: Buffer.from(authContent).toString("base64"),
        mode: "600",
      });
    } catch (error) {
      console.warn("Failed to read opencode auth.json:", error);
    }
  }
  // Install OpenCode lifecycle completion hook script
  const completionHook = `#!/bin/bash
set -euo pipefail

MARKER_DIR="/root/lifecycle"
TASK_ID="\${CMUX_TASK_RUN_ID:-unknown}"
MARKER_FILE="\${MARKER_DIR}/opencode-complete-\${TASK_ID}"
GENERIC_MARKER="\${MARKER_DIR}/done.txt"
LOG_FILE="/root/lifecycle/opencode-hook.log"

mkdir -p "\${MARKER_DIR}"

if command -v date >/dev/null 2>&1; then
  date +%s > "\${MARKER_FILE}"
else
  printf '%s\n' "completed" > "\${MARKER_FILE}"
fi

touch "\${GENERIC_MARKER}"

echo "[CMUX] OpenCode session complete for task \${TASK_ID}" >> "\${LOG_FILE}"
ls -la "\${MARKER_FILE}" >> "\${LOG_FILE}" 2>&1
`;

  files.push({
    destinationPath: "/root/lifecycle/opencode/session-complete-hook.sh",
    contentBase64: Buffer.from(completionHook).toString("base64"),
    mode: "755",
  });

  // Install OpenCode Notification plugin to invoke completion hook
  const pluginContent = `\
export const NotificationPlugin = async ({ project: _project, client: _client, $, directory: _directory, worktree: _worktree }) => {
  return {
    event: async ({ event }) => {
      // Send notification on session completion
      if (event.type === "session.idle") {
        try {
          await $\`/root/lifecycle/opencode/session-complete-hook.sh\`
        } catch (primaryError) {
          try {
            await $\`bash -lc "/root/lifecycle/opencode/session-complete-hook.sh"\`
          } catch (fallbackError) {
            console.error("[CMUX] Failed to run OpenCode completion hook", primaryError, fallbackError);
          }
        }
      }
    },
  }
}
`;

  files.push({
    destinationPath: "$HOME/.config/opencode/plugin/notification.js",
    contentBase64: Buffer.from(pluginContent).toString("base64"),
    mode: "644",
  });

  return { files, env, startupCommands };
}

export async function getOpencodeEnvironment(
  ctx: EnvironmentContext
): Promise<EnvironmentResult> {
  return buildOpencodeEnvironment(ctx, { skipAuth: false });
}

export async function getOpencodeEnvironmentSkipAuth(
  ctx: EnvironmentContext
): Promise<EnvironmentResult> {
  return buildOpencodeEnvironment(ctx, { skipAuth: true });
}
