import type {
  EnvironmentContext,
  EnvironmentResult,
} from "../common/environment-result";
import {
  getMemoryStartupCommand,
  getMemorySeedFiles,
  getProjectContextFile,
  getCrossToolSymlinkCommands,
} from "../../agent-memory-protocol";
import { buildCodexInstructionsContent } from "../../agent-instruction-pack";
import { buildMergedCodexConfigToml } from "../../mcp-preview";
export { stripFilteredConfigKeys } from "../../mcp-preview";
import { getTaskSandboxWrapperFiles } from "../common/task-sandbox-wrappers";

/**
 * Apply API keys for OpenAI Codex.
 *
 * Priority order:
 * 1. CODEX_AUTH_JSON - If provided, inject as ~/.codex/auth.json
 * 2. OPENAI_API_KEY - Fallback if no auth.json, synthesize ~/.codex/auth.json
 *
 * When CODEX_AUTH_JSON is provided, OPENAI_API_KEY is ignored since auth.json
 * is already the highest-priority auth source for Codex CLI.
 */
export function applyCodexApiKeys(
  keys: Record<string, string>
): Partial<EnvironmentResult> {
  const files: EnvironmentResult["files"] = [];
  const env: Record<string, string> = {};

  const authJson = keys.CODEX_AUTH_JSON;
  if (authJson) {
    // Validate that it's valid JSON before injecting
    try {
      JSON.parse(authJson);
      files.push({
        destinationPath: "$HOME/.codex/auth.json",
        contentBase64: Buffer.from(authJson).toString("base64"),
        mode: "600",
      });
      // Don't inject OPENAI_API_KEY when auth.json is provided
      return { files, env };
    } catch {
      console.warn("CODEX_AUTH_JSON is not valid JSON, skipping injection");
    }
  }

  // Fallback: synthesize auth.json from OPENAI_API_KEY.
  // Codex 0.111.0 accepts API-key auth from auth.json, but env-only OPENAI_API_KEY
  // is not sufficient for requests against either the default OpenAI provider or
  // custom providers that require OpenAI auth.
  //
  // Keep the env vars as secondary compatibility signals for downstream tooling.
  const openaiKey = keys.OPENAI_API_KEY;
  if (openaiKey) {
    const apiKeyAuthJson = JSON.stringify(
      {
        auth_mode: "apikey",
        OPENAI_API_KEY: openaiKey,
      },
      null,
      2
    );
    files.push({
      destinationPath: "$HOME/.codex/auth.json",
      contentBase64: Buffer.from(apiKeyAuthJson).toString("base64"),
      mode: "600",
    });
    env.OPENAI_API_KEY = openaiKey;
    env.CODEX_API_KEY = openaiKey;
  }

  return { files, env };
}

const CODEX_AUTOPILOT_TURN_SUMMARY_LINE =
  "End every turn with: Progress, Commands run, Files changed, Next.";
const CODEX_AUTOPILOT_CONTINUE_LINE =
  "Continue from where you left off. Do not ask whether to continue.";

// Custom provider name for cmux-managed proxy endpoints
const CMUX_CUSTOM_PROVIDER_NAME = "cmux-proxy";
export const CODEX_HOME_HOOK_DISPATCH_PATH = "$HOME/.codex/hooks/cmux-stop-dispatch.sh";

/**
 * Generate the model_provider top-level key for custom provider.
 */
function generateCustomProviderKey(): string {
  return `model_provider = "${CMUX_CUSTOM_PROVIDER_NAME}"`;
}

/**
 * Generate the [model_providers.cmux-proxy] section for custom provider.
 * This section must appear AFTER all top-level keys in TOML.
 *
 * @param baseUrl - The custom API base URL
 * @returns TOML string with [model_providers.cmux-proxy] section
 */
function generateCustomProviderSection(baseUrl: string): string {
  return `[model_providers.${CMUX_CUSTOM_PROVIDER_NAME}]
name = "cmux Proxy"
base_url = "${baseUrl}"
wire_api = "responses"
requires_openai_auth = true
`;
}

/**
 * Strip existing model_provider and [model_providers.cmux-proxy] from TOML.
 * Allows clean replacement when custom provider config changes.
 */
function stripCustomProviderConfig(toml: string): string {
  let result = toml;
  // Strip model_provider = "cmux-proxy" line
  result = result.replace(/^model_provider\s*=\s*["']?cmux-proxy["']?\s*$/gm, "");
  // Strip [model_providers.cmux-proxy] section
  result = result.replace(
    /\n?\[model_providers\.cmux-proxy\][\s\S]*?(?=\n\[|$)/g,
    ""
  );
  return result.replace(/\n{3,}/g, "\n\n").trim();
}

export async function getOpenAIEnvironment(
  ctx: EnvironmentContext
): Promise<EnvironmentResult> {
  // These must be lazy since configs are imported into the browser
  const { Buffer } = await import("node:buffer");

  const files: EnvironmentResult["files"] = [];
  const env: Record<string, string> = {};
  const startupCommands: string[] = [];
  const hasTaskRunJwt = !!ctx.taskRunJwt?.trim();

  // useHostConfig is safe for desktop/Electron apps where the host IS the user's machine.
  // For server deployments, this should be false to prevent credential leakage.
  const useHostConfig = ctx.useHostConfig ?? false;

  // Get home directory only if we need to read host config
  let homeDir: string | undefined;
  let readFile: ((path: string, encoding: "utf-8") => Promise<string>) | undefined;
  if (useHostConfig) {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    readFile = fs.readFile;
    homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
  }

  // Ensure .codex directory exists
  startupCommands.push("mkdir -p ~/.codex");
  startupCommands.push("mkdir -p ~/.codex/hooks");
  // Ensure notify sink starts clean for this run; write JSONL under /root/lifecycle
  startupCommands.push("mkdir -p /root/lifecycle");
  // Clear stale session state from prior runs to prevent cross-run resume bugs
  startupCommands.push(
    "rm -f /root/workspace/.cmux/tmp/codex-turns.jsonl /root/workspace/codex-turns.jsonl /root/workspace/logs/codex-turns.jsonl /tmp/codex-turns.jsonl /tmp/cmux/codex-turns.jsonl /root/lifecycle/codex-turns.jsonl /root/lifecycle/codex-session-id.txt /root/lifecycle/codex-done.txt || true"
  );

  // Add a small notify handler script that appends the payload to JSONL and marks completion
  // Note: crown/complete is called by the worker after the completion detector resolves,
  // NOT here. The notify hook fires on every turn, not just task completion.
  // Memory sync runs on every turn (idempotent upsert captures intermediate progress).
  const notifyScript = `#!/usr/bin/env sh
set -eu
echo "$1" >> /root/lifecycle/codex-turns.jsonl
# Extract thread id from Codex payload and persist for explicit resume.
# Prefer jq for valid JSON; fall back to regex when payload contains multiline text.
THREAD_ID=$(printf '%s' "$1" | jq -r '.thread_id // ."thread-id" // empty' 2>/dev/null || true)
if [ -z "$THREAD_ID" ]; then
  THREAD_ID=$(printf '%s' "$1" | grep -oE '"thread-id":"[^"]+"|"thread_id":"[^"]+"' | head -1 | cut -d'"' -f4 || true)
fi
if [ -n "$THREAD_ID" ]; then
  echo "$THREAD_ID" > /root/lifecycle/codex-session-id.txt
fi
# Post activity event to dashboard (best-effort, non-blocking)
if [ -n "\${CMUX_TASK_RUN_JWT:-}" ] && [ -n "\${CMUX_CALLBACK_URL:-}" ] && [ -n "\${CMUX_TASK_RUN_ID:-}" ]; then
  (
    # Extract a summary from the Codex turn payload
    SUMMARY=$(printf '%s' "$1" | jq -r '
      if .type == "function_call" then "Tool: " + (.name // "unknown")
      elif .type == "message" then "Codex turn"
      else .type // "Codex activity"
      end' 2>/dev/null || echo "Codex turn")
    TYPE="tool_call"
    if printf '%s' "$SUMMARY" | grep -qi "edit\\|write\\|patch"; then TYPE="file_edit"; fi
    if printf '%s' "$SUMMARY" | grep -qi "shell\\|exec\\|bash\\|command"; then TYPE="bash_command"; fi
    curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
      -H "Content-Type: application/json" \\
      -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
      -d "$(jq -n --arg trid "\${CMUX_TASK_RUN_ID}" --arg type "$TYPE" --arg summary "$SUMMARY" \\
           '{taskRunId: $trid, type: $type, toolName: "codex", summary: $summary}')" \\
      >> /root/lifecycle/activity-hook.log 2>&1 || true
  ) &
fi
# Sync memory files to Convex (best-effort, idempotent upsert)
/root/lifecycle/memory/sync.sh >> /root/lifecycle/memory-sync.log 2>&1 || true
touch /root/lifecycle/codex-done.txt /root/lifecycle/done.txt
`;
  files.push({
    destinationPath: "/root/lifecycle/codex-notify.sh",
    contentBase64: Buffer.from(notifyScript).toString("base64"),
    mode: "755",
  });

  const resumeScript = `#!/usr/bin/env sh
set -eu
SESSION_ID_FILE="/root/lifecycle/codex-session-id.txt"

if [ -f "$SESSION_ID_FILE" ]; then
  THREAD_ID="$(cat "$SESSION_ID_FILE")"
  if [ -n "$THREAD_ID" ]; then
    exec codex resume "$THREAD_ID"
  fi
fi

echo "No session to resume"
exit 1
`;
  files.push({
    destinationPath: "/root/lifecycle/codex-resume.sh",
    contentBase64: Buffer.from(resumeScript).toString("base64"),
    mode: "755",
  });

  // Install a managed home-level Stop hook so Ralph Loop can arm mid-session
  // from workspace state without relying on temp CODEX_HOME wrappers.
  const codexStopDispatchScript = `#!/usr/bin/env bash
set -euo pipefail

emit_allow() {
  jq -nc '{decision: "allow"}'
}

trimmed_non_empty() {
  local value="$1"
  [[ -n "\${value//[[:space:]]/}" ]]
}

resolve_workspace_root() {
  local candidate="$1"

  if ! trimmed_non_empty "$candidate" || [[ ! -d "$candidate" ]]; then
    candidate="$(pwd)"
  fi

  git -C "$candidate" rev-parse --show-toplevel 2>/dev/null || printf '%s\\n' "$candidate"
}

route_to_workspace_hook() {
  local workspace_root="$1"
  local relative_hook_path="$2"
  local hook_path="\${workspace_root}/\${relative_hook_path}"

  if [[ ! -f "$hook_path" ]]; then
    emit_allow
    return 0
  fi

  printf '%s' "$HOOK_INPUT" | bash "$hook_path"
}

HOOK_INPUT="$(cat)"
HOOK_CWD="$(jq -r '.cwd // empty' <<<"$HOOK_INPUT" 2>/dev/null || true)"
WORKSPACE_ROOT="$(resolve_workspace_root "$HOOK_CWD")"
RALPH_STATE_FILE="\${WORKSPACE_ROOT}/.codex/ralph-loop-state.json"

if [[ -f "$RALPH_STATE_FILE" ]]; then
  route_to_workspace_hook "$WORKSPACE_ROOT" ".codex/hooks/ralph-loop-stop.sh"
  exit 0
fi

if [[ "\${CMUX_AUTOPILOT_ENABLED:-0}" = "1" ]] || [[ "\${CMUX_CODEX_HOOKS_ENABLED:-0}" = "1" ]]; then
  route_to_workspace_hook "$WORKSPACE_ROOT" ".codex/hooks/autopilot-stop.sh"
  exit 0
fi

emit_allow
`;
  files.push({
    destinationPath: CODEX_HOME_HOOK_DISPATCH_PATH,
    contentBase64: Buffer.from(codexStopDispatchScript).toString("base64"),
    mode: "755",
  });

  const codexHooksConfig = {
    hooks: {
      Stop: [
        {
          hooks: [
            {
              type: "command",
              command: `sh -c 'exec "$HOME/.codex/hooks/cmux-stop-dispatch.sh"'`,
              timeout: 75,
            },
          ],
        },
      ],
    },
  };
  files.push({
    destinationPath: "$HOME/.codex/hooks.json",
    contentBase64: Buffer.from(JSON.stringify(codexHooksConfig, null, 2)).toString("base64"),
    mode: "644",
  });

  startupCommands.push(
    `if [ -f ~/.bashrc ]; then tmp="$(mktemp)"; grep -Fv 'codex-shell-helpers.sh' ~/.bashrc > "$tmp" || true; mv "$tmp" ~/.bashrc; fi`
  );
  startupCommands.push(
    `if [ -f ~/.zshrc ]; then tmp="$(mktemp)"; grep -Fv 'codex-shell-helpers.sh' ~/.zshrc > "$tmp" || true; mv "$tmp" ~/.zshrc; fi`
  );

  // Block dangerous commands in task sandboxes (when enabled via settings)
  // Disabled by default - use permission deny rules or policy rules instead
  if (hasTaskRunJwt && ctx.enableShellWrappers) {
    files.push(...getTaskSandboxWrapperFiles(Buffer));
  }

  // Autopilot wrapper script for unattended OpenAI Codex sessions.
  // Sends heartbeats/status updates and runs Codex in a loop until timeout.
  const autopilotScript = `#!/usr/bin/env sh
set -eu

# Configuration from environment variables
CMUX_AUTOPILOT_MINUTES="\${CMUX_AUTOPILOT_MINUTES:-30}"
CMUX_AUTOPILOT_TURN_MINUTES="\${CMUX_AUTOPILOT_TURN_MINUTES:-5}"
CMUX_AUTOPILOT_WRAPUP_MINUTES="\${CMUX_AUTOPILOT_WRAPUP_MINUTES:-3}"
CMUX_CALLBACK_URL="\${CMUX_CALLBACK_URL:-}"
CMUX_TASK_RUN_JWT="\${CMUX_TASK_RUN_JWT:-}"
CMUX_PROMPT="\${CMUX_PROMPT:-}"
CODEX_RUNNER="codex"

# Derived values
START_EPOCH=\$(date +%s)
DEADLINE_EPOCH=\$((START_EPOCH + (CMUX_AUTOPILOT_MINUTES * 60)))
WRAPUP_THRESHOLD=\$((CMUX_AUTOPILOT_WRAPUP_MINUTES * 60))
LOG_DIR="/root/lifecycle/autopilot"
STOP_FILE="/root/lifecycle/autopilot-stop"

mkdir -p "\$LOG_DIR"

log() {
  echo "[\$(date '+%Y-%m-%d %H:%M:%S')] \$*" | tee -a "\$LOG_DIR/run.log"
}

send_heartbeat() {
  if [ -n "\$CMUX_CALLBACK_URL" ] && [ -n "\$CMUX_TASK_RUN_JWT" ]; then
    curl -sS -X POST "\$CMUX_CALLBACK_URL/api/autopilot/heartbeat" \\
      -H "Content-Type: application/json" \\
      -H "Authorization: Bearer \$CMUX_TASK_RUN_JWT" \\
      -d '{}' >> "\$LOG_DIR/heartbeat.log" 2>&1 || true
  fi
}

update_status() {
  local status="\$1"
  if [ -n "\$CMUX_CALLBACK_URL" ] && [ -n "\$CMUX_TASK_RUN_JWT" ]; then
    curl -sS -X POST "\$CMUX_CALLBACK_URL/api/autopilot/status" \\
      -H "Content-Type: application/json" \\
      -H "Authorization: Bearer \$CMUX_TASK_RUN_JWT" \\
      -d "{\\"status\\":\\"\$status\\"}" >> "\$LOG_DIR/status.log" 2>&1 || true
  fi
}

# Start heartbeat loop in background
(
  while true; do
    sleep 30
    send_heartbeat
  done
) &
HEARTBEAT_PID=\$!

AUTOPILOT_COMPLETED=0

cleanup() {
  kill \$HEARTBEAT_PID 2>/dev/null || true
  # Only set stopped if we didn't complete normally
  if [ "\$AUTOPILOT_COMPLETED" -eq 0 ]; then
    update_status "stopped"
  fi
}
trap cleanup EXIT

log "Autopilot starting"
log "  Duration: \$CMUX_AUTOPILOT_MINUTES minutes"
log "  Turn: \$CMUX_AUTOPILOT_TURN_MINUTES minutes"
log "  Wrap-up: \$CMUX_AUTOPILOT_WRAPUP_MINUTES minutes"
log "  Deadline: \$DEADLINE_EPOCH"

update_status "running"
send_heartbeat

ITER=0
DID_WRAPUP=0

while true; do
  NOW_EPOCH=\$(date +%s)
  if [ "\$NOW_EPOCH" -ge "\$DEADLINE_EPOCH" ]; then
    log "Deadline reached"
    break
  fi

  ITER=\$((ITER + 1))
  TIME_LEFT=\$((DEADLINE_EPOCH - NOW_EPOCH))

  # Check for stop file
  if [ -f "\$STOP_FILE" ]; then
    log "Stop file detected, initiating wrap-up"
  fi

  # Build prompt based on turn
  if [ "\$DID_WRAPUP" -eq 0 ] && { [ "\$TIME_LEFT" -le "\$WRAPUP_THRESHOLD" ] || [ -f "\$STOP_FILE" ]; }; then
    log "Turn \$ITER: wrap-up (time_left=\${TIME_LEFT}s)"
    update_status "wrap-up"
    PROMPT="Final turn (wrap up). Time left: \${TIME_LEFT}s. Stop starting large new work. Stabilize and write a summary.
${CODEX_AUTOPILOT_TURN_SUMMARY_LINE}"
    DID_WRAPUP=1
  elif [ "\$ITER" -eq 1 ]; then
    log "Turn \$ITER: start"
    PROMPT="\$CMUX_PROMPT

You are running in unattended autopilot mode. Do not ask for confirmation.
Timebox: \$CMUX_AUTOPILOT_TURN_MINUTES minutes per turn.
${CODEX_AUTOPILOT_TURN_SUMMARY_LINE}"
  else
    log "Turn \$ITER: continue (time_left=\${TIME_LEFT}s)"
    PROMPT="Autopilot continuation. Time left: \${TIME_LEFT}s. Timebox: \$CMUX_AUTOPILOT_TURN_MINUTES minutes.
${CODEX_AUTOPILOT_CONTINUE_LINE}
${CODEX_AUTOPILOT_TURN_SUMMARY_LINE}"
  fi

  # Run Codex
  TURN_FILE="\$LOG_DIR/turn-\$(printf '%03d' \$ITER).log"
  log "Running codex (turn \$ITER)..."

  # Check if there's a session to resume
  SESSION_FILE="/root/lifecycle/codex-session-id.txt"
  CODEX_EXIT=0
  if [ "\$ITER" -gt 1 ] && [ -f "\$SESSION_FILE" ]; then
    THREAD_ID=\$(cat "\$SESSION_FILE")
    if [ -n "\$THREAD_ID" ]; then
      log "Resuming session: \$THREAD_ID"
      CMUX_AUTOPILOT_ENABLED=1 CMUX_CODEX_HOOKS_ENABLED=1 "\$CODEX_RUNNER" exec resume --last "\$PROMPT" 2>&1 | tee -a "\$TURN_FILE" || CODEX_EXIT=\$?
    else
      CMUX_AUTOPILOT_ENABLED=1 CMUX_CODEX_HOOKS_ENABLED=1 "\$CODEX_RUNNER" exec "\$PROMPT" 2>&1 | tee -a "\$TURN_FILE" || CODEX_EXIT=\$?
    fi
  else
    CMUX_AUTOPILOT_ENABLED=1 CMUX_CODEX_HOOKS_ENABLED=1 "\$CODEX_RUNNER" exec "\$PROMPT" 2>&1 | tee -a "\$TURN_FILE" || CODEX_EXIT=\$?
  fi

  # Report errors to dashboard
  if [ "\$CODEX_EXIT" -ne 0 ] && [ -n "\$CMUX_CALLBACK_URL" ] && [ -n "\$CMUX_TASK_RUN_JWT" ] && [ -n "\${CMUX_TASK_RUN_ID:-}" ]; then
    ERROR_MSG="Codex exited with code \$CODEX_EXIT (turn \$ITER)"
    # Try to extract last error line from turn log
    LAST_ERR=\$(tail -5 "\$TURN_FILE" 2>/dev/null | grep -i "error\\|fail\\|exception" | tail -1 || true)
    if [ -n "\$LAST_ERR" ]; then
      ERROR_MSG="\$ERROR_MSG: \$LAST_ERR"
    fi
    curl -s -X POST "\$CMUX_CALLBACK_URL/api/task-run/activity" \\
      -H "Content-Type: application/json" \\
      -H "x-cmux-token: \$CMUX_TASK_RUN_JWT" \\
      -d "\$(jq -n --arg trid "\$CMUX_TASK_RUN_ID" --arg summary "Error: \$ERROR_MSG" \\
           '{taskRunId: \$trid, type: "error", toolName: "codex", summary: \$summary}')" \\
      >> /root/lifecycle/activity-hook.log 2>&1 || true
    log "Error reported: \$ERROR_MSG"
  fi

  send_heartbeat

  if [ "\$DID_WRAPUP" -eq 1 ]; then
    log "Wrap-up complete"
    break
  fi

  # Brief pause between turns
  sleep 2
done

AUTOPILOT_COMPLETED=1
update_status "completed"
log "Autopilot completed after \$ITER turns"
`;
  files.push({
    destinationPath: "/root/lifecycle/codex-autopilot.sh",
    contentBase64: Buffer.from(autopilotScript).toString("base64"),
    mode: "755",
  });

  // Copy auth.json from host .codex directory (desktop mode only)
  // For server mode, auth.json is injected separately via applyCodexApiKeys()
  // using credentials from the user's data vault (CODEX_AUTH_JSON or OPENAI_API_KEY).
  if (useHostConfig && readFile && homeDir) {
    try {
      const authContent = await readFile(`${homeDir}/.codex/auth.json`, "utf-8");
      files.push({
        destinationPath: "$HOME/.codex/auth.json",
        contentBase64: Buffer.from(authContent).toString("base64"),
        mode: "600",
      });
    } catch (error) {
      console.warn("Failed to read .codex/auth.json:", error);
    }
  }

  // Apply provider override if present (custom proxy like AnyRouter)
  // For Codex CLI, we need BOTH:
  // 1. OPENAI_BASE_URL env var (for compatibility and other tools)
  // 2. model_provider config in config.toml (required by Codex CLI for custom providers)
  //
  // IMPORTANT: Only use custom provider for API key auth, NOT OAuth.
  // OAuth tokens work directly with official OpenAI API and don't need proxy routing.
  // We detect OAuth by the presence of CODEX_AUTH_JSON (pre-configured auth.json).
  //
  // Also skip custom provider if baseUrl is the default OpenAI URL - this happens when
  // user clears their team's base URL setting but the override record still exists.
  const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
  const isOAuthMode = !!ctx.apiKeys?.CODEX_AUTH_JSON;
  const isDefaultOpenAIUrl = ctx.providerConfig?.baseUrl === DEFAULT_OPENAI_BASE_URL;
  const customProviderConfig = !isOAuthMode &&
    !isDefaultOpenAIUrl &&
    ctx.providerConfig?.isOverridden &&
    ctx.providerConfig.baseUrl
    ? ctx.providerConfig.baseUrl
    : null;
  if (customProviderConfig) {
    env.OPENAI_BASE_URL = customProviderConfig;
  }

  // Copy instructions.md from host and append memory protocol instructions (desktop mode)
  // For server mode, only include memory protocol instructions to avoid leaking host-specific content
  // Uses shared instruction pack builder for consistent assembly across providers
  let hostInstructionsContent = "";
  if (useHostConfig && readFile && homeDir) {
    try {
      hostInstructionsContent = await readFile(
        `${homeDir}/.codex/instructions.md`,
        "utf-8"
      );
    } catch (error) {
      // File doesn't exist, start with empty content
      console.warn("Failed to read .codex/instructions.md:", error);
    }
  }
  const fullInstructions = buildCodexInstructionsContent(
    {
      policyRules: ctx.policyRules,
      orchestrationRules: ctx.orchestrationRules,
      previousBehavior: ctx.previousBehavior,
      isOrchestrationHead: ctx.isOrchestrationHead,
    },
    hostInstructionsContent
  );
  files.push({
    destinationPath: "$HOME/.codex/instructions.md",
    contentBase64: Buffer.from(fullInstructions).toString("base64"),
    mode: "644",
  });

  // Build config.toml - merge with host config in desktop mode, or generate clean in server mode
  let hostConfigToml = "";
  if (useHostConfig && readFile && homeDir) {
    try {
      hostConfigToml = await readFile(`${homeDir}/.codex/config.toml`, "utf-8");
    } catch (_error) {
      hostConfigToml = "";
    }
  }

  const codexMcpConfigs = ctx.mcpServerConfigs ?? [];

  // Merge user custom config with host config
  // User config (from Convex) takes precedence over host config
  const userConfigToml = ctx.agentConfigs?.codex ?? "";
  const mergedHostConfig = userConfigToml
    ? `${hostConfigToml}\n\n${userConfigToml}`
    : hostConfigToml;

  // Pass orchestration env vars for MCP server passthrough (spawn_agent needs JWT)
  let toml = buildMergedCodexConfigToml({
    hostConfigText: mergedHostConfig,
    mcpServerConfigs: codexMcpConfigs,
    agentName: ctx.agentName,
    orchestrationEnv: ctx.isOrchestrationHead
      ? {
          CMUX_TASK_RUN_JWT: ctx.taskRunJwt,
          CMUX_SERVER_URL: ctx.orchestrationEnv?.CMUX_SERVER_URL,
          CMUX_API_BASE_URL: ctx.orchestrationEnv?.CMUX_API_BASE_URL,
          CMUX_IS_ORCHESTRATION_HEAD: "1",
          CMUX_ORCHESTRATION_ID: ctx.orchestrationOptions?.orchestrationId,
        }
      : undefined,
  });

  // Inject custom provider config if user has a custom base URL
  // TOML requires: top-level keys first, then sections
  // So we put model_provider= at the TOP and [model_providers.xxx] at the END
  if (customProviderConfig) {
    toml = stripCustomProviderConfig(toml);
    // Add model_provider key at the very top (before other top-level keys)
    toml = `${generateCustomProviderKey()}\n${toml}`;
    // Add [model_providers.cmux-proxy] section at the very end (after all other sections)
    toml = `${toml.trimEnd()}\n\n${generateCustomProviderSection(customProviderConfig)}`;
  }

  files.push({
    destinationPath: `$HOME/.codex/config.toml`,
    contentBase64: Buffer.from(toml).toString("base64"),
    mode: "644",
  });

  // Add agent memory protocol support
  startupCommands.push(getMemoryStartupCommand());
  files.push(
    ...getMemorySeedFiles(
      ctx.taskRunId,
      ctx.previousKnowledge,
      ctx.previousMailbox,
      ctx.orchestrationOptions,
      ctx.previousBehavior
    )
  );

  // Create cross-tool symlinks for shared instructions
  // If Claude's CLAUDE.md exists, link it to ~/.codex/AGENTS.md
  // This allows all tools to share the same instructions
  startupCommands.push(...getCrossToolSymlinkCommands());

  // Inject GitHub Projects context if task is linked to a project item (Phase 5)
  if (ctx.githubProjectContext) {
    files.push(
      getProjectContextFile({
        ...ctx.githubProjectContext,
        taskRunJwt: ctx.taskRunJwt,
        callbackUrl: ctx.callbackUrl,
      }),
    );
  }

  return { files, env, startupCommands };
}
