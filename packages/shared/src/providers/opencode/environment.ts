import type {
  EnvironmentContext,
  EnvironmentResult,
} from "../common/environment-result";

// Opencode HTTP API configuration
export const OPENCODE_HTTP_HOST = "127.0.0.1";
export const OPENCODE_HTTP_PORT = 4096;

async function buildOpencodeEnvironment(
  ctx: EnvironmentContext,
  opts: { skipAuth: boolean; xaiApiKey?: boolean }
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
      const props = event?.properties ?? {};
      const statusType =
        props.status?.type ??
        props.status ??
        event?.status?.type ??
        event?.status;
      const isIdle =
        event.type === "session.idle" ||
        (event.type === "session.status" && statusType === "idle");
      if (isIdle) {
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

  // Pass XAI_API_KEY if requested and available
  if (opts.xaiApiKey && ctx.apiKeys?.XAI_API_KEY) {
    env.XAI_API_KEY = ctx.apiKeys.XAI_API_KEY;
  }

  // Add post-start commands to poll the session endpoint and submit the prompt
  const baseUrl = `http://${OPENCODE_HTTP_HOST}:${OPENCODE_HTTP_PORT}`;
  const promptBase64 = Buffer.from(ctx.prompt).toString("base64");

  const postStartScript = `#!/bin/bash
set -euo pipefail

LOG="/root/lifecycle/opencode-post-start.log"
BASE_URL="${baseUrl}"
PROMPT_BASE64="${promptBase64}"

log() {
  echo "[$(date -Iseconds)] $*" >> "$LOG"
}

wait_for_session() {
  for i in $(seq 1 60); do
    if curl -sf "\${BASE_URL}/session" >> "$LOG" 2>&1; then
      log "OpenCode session ready after \${i} attempts"
      return 0
    fi
    sleep 1
  done
  log "OpenCode session not ready after 60 attempts"
  return 1
}

append_prompt() {
  local prompt json
  prompt=$(echo "\${PROMPT_BASE64}" | base64 -d)
  json=$(printf '%s' "$prompt" | jq -Rs '{text: .}')
  for j in $(seq 1 3); do
    if curl -sf -X POST "\${BASE_URL}/tui/append-prompt" -H "Content-Type: application/json" -d "$json" >> "$LOG" 2>&1; then
      log "append-prompt succeeded on attempt \${j}"
      return 0
    fi
    sleep 1
  done
  log "append-prompt failed after 3 attempts"
  return 1
}

submit_prompt() {
  for j in $(seq 1 3); do
    if curl -sf -X POST "\${BASE_URL}/tui/submit-prompt" >> "$LOG" 2>&1; then
      log "submit-prompt succeeded on attempt \${j}"
      return 0
    fi
    sleep 1
  done
  log "submit-prompt failed after 3 attempts"
  return 1
}

log "Post-start script begin"
if ! wait_for_session; then
  log "Aborting post-start because session never became ready"
  exit 1
fi

prompt=$(echo "\${PROMPT_BASE64}" | base64 -d)
expected_fragment=$(printf '%s' "$prompt" | tr '\n\t' '  ' | sed -E 's/[[:space:]]+/ /g' | sed -E 's/^ +| +$//g' | cut -c1-64)
if [ -z "$expected_fragment" ]; then
  log "Prompt is empty after decode; skipping auto-submit"
  log "Post-start script end"
  exit 0
fi

log "Expected title fragment: \${expected_fragment}"
sleep 2

sent=0

for attempt in $(seq 1 12); do
  if [ "\${sent}" -eq 0 ]; then
    log "Prompt send attempt \${attempt}"
    if append_prompt && submit_prompt; then
      sent=1
      log "Prompt submitted"
    else
      log "Prompt send failed; will retry"
    fi
  else
    log "Prompt already submitted; waiting for title update (attempt \${attempt})"
  fi
  sleep 2
  title=$(curl -sf "\${BASE_URL}/session" | jq -r '.title // ""' 2>>"$LOG" || true)
  log "Session title after attempt \${attempt}: \${title}"
  if [ -n "$title" ] && printf '%s' "$title" | grep -Fq "$expected_fragment"; then
    log "Session title matched expected fragment"
    break
  fi
  sleep 5
done
log "Post-start script end"
`;

  files.push({
    destinationPath: "/root/lifecycle/opencode/post-start.sh",
    contentBase64: Buffer.from(postStartScript).toString("base64"),
    mode: "755",
  });

  // Run post-start script in background so prompt always gets delivered even if worker postStart fails
  startupCommands.push(
    "nohup /root/lifecycle/opencode/post-start.sh >/root/lifecycle/opencode-post-start.log 2>&1 &"
  );

  return { files, env, startupCommands, postStartCommands: [] };
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

export async function getOpencodeEnvironmentWithXai(
  ctx: EnvironmentContext
): Promise<EnvironmentResult> {
  return buildOpencodeEnvironment(ctx, { skipAuth: false, xaiApiKey: true });
}
