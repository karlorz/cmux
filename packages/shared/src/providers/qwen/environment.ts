import type {
  EnvironmentContext,
  EnvironmentResult,
} from "../common/environment-result";
import {
  getMemoryStartupCommand,
  getMemorySeedFiles,
  getMemoryProtocolInstructions,
  getProjectContextFile,
  getPolicyRulesInstructions,
  getOrchestrationRulesInstructions,
  extractBehaviorRulesSection,
} from "../../agent-memory-protocol";
import { getTaskSandboxWrapperFiles } from "../common/task-sandbox-wrappers";

// Prepare Qwen CLI environment for OpenAI-compatible API key mode.
// We previously supported the Qwen OAuth device flow, but cmux now uses
// API keys via DashScope or OpenRouter configured in Settings.
async function makeQwenEnvironment(
  ctx: EnvironmentContext,
  defaultBaseUrl: string | null,
  defaultModel: string | null
): Promise<EnvironmentResult> {
  const { Buffer } = await import("node:buffer");

  // useHostConfig is safe for desktop/Electron apps where the host IS the user's machine.
  // For server deployments, this should be false to prevent credential leakage.
  const useHostConfig = ctx.useHostConfig ?? false;

  const files: EnvironmentResult["files"] = [];
  const env: Record<string, string> = {};
  const startupCommands: string[] = [];

  // Ensure .qwen directory exists
  startupCommands.push("mkdir -p ~/.qwen");
  startupCommands.push("mkdir -p /root/lifecycle/qwen");

  // Clean up any old Qwen telemetry files from previous runs
  // The actual telemetry path will be set by the agent spawner with the task ID
  startupCommands.push("rm -f /tmp/qwen-telemetry-*.log 2>/dev/null || true");

  // Session start hook - posts activity event when Qwen session begins
  const sessionStartHook = `#!/bin/bash
set -eu
LOG_FILE="/root/lifecycle/qwen-hook.log"
if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ]; then
  exit 0
fi
# Post session start activity event (non-blocking)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$(jq -n --arg trid "\${CMUX_TASK_RUN_ID:-}" \\
         '{taskRunId: $trid, type: "session_start", toolName: "qwen", summary: "Session started"}')" \\
    >> "\${LOG_FILE}" 2>&1 || true
) &
exit 0
`;
  files.push({
    destinationPath: "/root/lifecycle/qwen/session-start-hook.sh",
    contentBase64: Buffer.from(sessionStartHook).toString("base64"),
    mode: "755",
  });

  // Session completion hook - posts activity event when Qwen session ends
  const sessionCompleteHook = `#!/bin/bash
set -eu
LOG_FILE="/root/lifecycle/qwen-hook.log"
MARKER_DIR="/root/lifecycle"
GENERIC_MARKER="\${MARKER_DIR}/done.txt"

# Post session completion activity event (non-blocking)
if [ -n "\${CMUX_TASK_RUN_JWT:-}" ] && [ -n "\${CMUX_CALLBACK_URL:-}" ]; then
  (
    curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
      -H "Content-Type: application/json" \\
      -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
      -d "$(jq -n --arg trid "\${CMUX_TASK_RUN_ID:-}" \\
           '{taskRunId: $trid, type: "session_stop", toolName: "qwen", summary: "Session completed"}')" \\
      >> "\${LOG_FILE}" 2>&1 || true
  ) &
fi

# Sync memory files (best-effort)
/root/lifecycle/memory/sync.sh >> "\${LOG_FILE}" 2>&1 || true

# Create completion marker
touch "\${GENERIC_MARKER}"
echo "[CMUX] Qwen session complete" >> "\${LOG_FILE}"
`;
  files.push({
    destinationPath: "/root/lifecycle/qwen/session-complete-hook.sh",
    contentBase64: Buffer.from(sessionCompleteHook).toString("base64"),
    mode: "755",
  });

  // Error hook - surfaces errors to dashboard
  const errorHook = `#!/bin/bash
set -eu
LOG_FILE="/root/lifecycle/qwen-hook.log"
ERROR_MSG="\${1:-Unknown error}"
if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ]; then
  exit 0
fi
# Post error activity event (non-blocking)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$(jq -n --arg trid "\${CMUX_TASK_RUN_ID:-}" --arg msg "$ERROR_MSG" \\
         '{taskRunId: $trid, type: "error", toolName: "qwen", summary: $msg}')" \\
    >> "\${LOG_FILE}" 2>&1 || true
) &
exit 0
`;
  files.push({
    destinationPath: "/root/lifecycle/qwen/error-hook.sh",
    contentBase64: Buffer.from(errorHook).toString("base64"),
    mode: "755",
  });

  // Fire session start hook on sandbox initialization
  startupCommands.push("/root/lifecycle/qwen/session-start-hook.sh &");

  type QwenSettings = {
    selectedAuthType?: string;
    useExternalAuth?: boolean;
    [key: string]: unknown;
  };

  let settings: QwenSettings = {};
  if (useHostConfig) {
    const { readFile } = await import("node:fs/promises");
    const { homedir } = await import("node:os");
    const { join } = await import("node:path");
    // Merge/update ~/.qwen/settings.json with selectedAuthType = "openai"
    const qwenDir = join(homedir(), ".qwen");
    const settingsPath = join(qwenDir, "settings.json");
    try {
      const content = await readFile(settingsPath, "utf-8");
      try {
        const parsed = JSON.parse(content) as unknown;
        if (parsed && typeof parsed === "object") {
          settings = parsed as QwenSettings;
        }
      } catch {
        // Ignore invalid JSON and recreate with defaults
      }
    } catch {
      // File might not exist; we'll create it
    }
  }

  // Force OpenAI-compatible auth so the CLI doesn't ask interactively
  settings.selectedAuthType = "openai";
  // Ensure we don't try an external OAuth flow in ephemeral sandboxes
  if (settings.useExternalAuth === undefined) {
    settings.useExternalAuth = false;
  }

  const mergedContent = JSON.stringify(settings, null, 2) + "\n";
  files.push({
    destinationPath: "$HOME/.qwen/settings.json",
    contentBase64: Buffer.from(mergedContent).toString("base64"),
    mode: "644",
  });

  // Set sensible default base URL for the OpenAI-compatible API if none provided via settings
  if (defaultBaseUrl) env.OPENAI_BASE_URL = defaultBaseUrl;
  if (defaultModel) env.OPENAI_MODEL = defaultModel;

  // Provider override takes precedence over default base URL
  if (ctx.providerConfig?.isOverridden && ctx.providerConfig.baseUrl) {
    env.OPENAI_BASE_URL = ctx.providerConfig.baseUrl;
  }

  // Add agent memory protocol support
  startupCommands.push(getMemoryStartupCommand());
  files.push(...getMemorySeedFiles(ctx.taskRunId, ctx.previousKnowledge, ctx.previousMailbox, ctx.orchestrationOptions, ctx.previousBehavior));

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

  // Add QWEN.md with memory protocol instructions for the project
  const policyRulesSection = ctx.policyRules && ctx.policyRules.length > 0
    ? `\n${getPolicyRulesInstructions(ctx.policyRules)}\n`
    : "";
  const orchestrationRulesSection = ctx.orchestrationRules && ctx.orchestrationRules.length > 0
    ? `\n${getOrchestrationRulesInstructions(ctx.orchestrationRules, { isOrchestrationHead: ctx.isOrchestrationHead })}\n`
    : "";
  const behaviorRulesSection = ctx.previousBehavior
    ? `\n${extractBehaviorRulesSection(ctx.previousBehavior)}\n`
    : "";
  const qwenMdContent = `# cmux Project Instructions
${policyRulesSection}${orchestrationRulesSection}${behaviorRulesSection}
${getMemoryProtocolInstructions()}
`;
  files.push({
    destinationPath: "/root/workspace/QWEN.md",
    contentBase64: Buffer.from(qwenMdContent).toString("base64"),
    mode: "644",
  });

  // Block dangerous commands in task sandboxes (when enabled via settings)
  // Disabled by default - use permission deny rules or policy rules instead
  const hasTaskRunJwt = ctx.taskRunJwt.trim().length > 0;
  if (hasTaskRunJwt && ctx.enableShellWrappers) {
    files.push(...getTaskSandboxWrapperFiles(Buffer));
  }

  return { files, env, startupCommands };
}

// OpenAI-compatible mode without provider defaults.
// Base URL and model are supplied via env (Settings):
//  - DashScope: set OPENAI_API_KEY and (optionally) OPENAI_BASE_URL + OPENAI_MODEL
//  - OpenRouter: set OPENROUTER_API_KEY (server maps to OPENAI_API_KEY) and optional OPENAI_MODEL
export async function getQwenOpenRouterEnvironment(
  ctx: EnvironmentContext
): Promise<EnvironmentResult> {
  // Hardcode OpenRouter compatible endpoint and default Qwen model.
  return makeQwenEnvironment(
    ctx,
    "https://openrouter.ai/api/v1",
    "qwen/qwen3-coder:free"
  );
}

export async function getQwenModelStudioEnvironment(
  ctx: EnvironmentContext
): Promise<EnvironmentResult> {
  // Hardcode DashScope Intl (ModelStudio) endpoint and qwen3-coder-plus model.
  return makeQwenEnvironment(
    ctx,
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    "qwen3-coder-plus"
  );
}
