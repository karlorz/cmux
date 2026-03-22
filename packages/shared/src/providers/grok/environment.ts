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

async function makeGrokEnvironment(
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

  startupCommands.push("mkdir -p ~/.grok");
  startupCommands.push("mkdir -p /root/lifecycle/grok");
  startupCommands.push("rm -f /tmp/grok-telemetry-*.log 2>/dev/null || true");

  // Session start hook - posts activity event when Grok session begins
  const sessionStartHook = `#!/bin/bash
set -eu
LOG_FILE="/root/lifecycle/grok-hook.log"
if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ]; then
  exit 0
fi
# Post session start activity event (non-blocking)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$(jq -n --arg trid "\${CMUX_TASK_RUN_ID:-}" \\
         '{taskRunId: $trid, type: "session_start", toolName: "grok", summary: "Session started"}')" \\
    >> "\${LOG_FILE}" 2>&1 || true
) &
exit 0
`;
  files.push({
    destinationPath: "/root/lifecycle/grok/session-start-hook.sh",
    contentBase64: Buffer.from(sessionStartHook).toString("base64"),
    mode: "755",
  });

  // Session completion hook - posts activity event when Grok session ends
  const sessionCompleteHook = `#!/bin/bash
set -eu
LOG_FILE="/root/lifecycle/grok-hook.log"
MARKER_DIR="/root/lifecycle"
GENERIC_MARKER="\${MARKER_DIR}/done.txt"

# Post session completion activity event (non-blocking)
if [ -n "\${CMUX_TASK_RUN_JWT:-}" ] && [ -n "\${CMUX_CALLBACK_URL:-}" ]; then
  (
    curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
      -H "Content-Type: application/json" \\
      -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
      -d "$(jq -n --arg trid "\${CMUX_TASK_RUN_ID:-}" \\
           '{taskRunId: $trid, type: "session_stop", toolName: "grok", summary: "Session completed"}')" \\
      >> "\${LOG_FILE}" 2>&1 || true
  ) &
fi

# Sync memory files (best-effort)
/root/lifecycle/memory/sync.sh >> "\${LOG_FILE}" 2>&1 || true

# Create completion marker
touch "\${GENERIC_MARKER}"
echo "[CMUX] Grok session complete" >> "\${LOG_FILE}"
`;
  files.push({
    destinationPath: "/root/lifecycle/grok/session-complete-hook.sh",
    contentBase64: Buffer.from(sessionCompleteHook).toString("base64"),
    mode: "755",
  });

  // Error hook - surfaces errors to dashboard
  const errorHook = `#!/bin/bash
set -eu
LOG_FILE="/root/lifecycle/grok-hook.log"
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
         '{taskRunId: $trid, type: "error", toolName: "grok", summary: $msg}')" \\
    >> "\${LOG_FILE}" 2>&1 || true
) &
exit 0
`;
  files.push({
    destinationPath: "/root/lifecycle/grok/error-hook.sh",
    contentBase64: Buffer.from(errorHook).toString("base64"),
    mode: "755",
  });

  // Fire session start hook on sandbox initialization
  startupCommands.push("/root/lifecycle/grok/session-start-hook.sh &");

  type GrokSettings = {
    selectedAuthType?: string;
    useExternalAuth?: boolean;
    [key: string]: unknown;
  };

  let settings: GrokSettings = {};
  if (useHostConfig) {
    const { readFile } = await import("node:fs/promises");
    const { homedir } = await import("node:os");
    const { join } = await import("node:path");
    const grokDir = join(homedir(), ".grok");
    const settingsPath = join(grokDir, "settings.json");
    try {
      const content = await readFile(settingsPath, "utf-8");
      try {
        const parsed = JSON.parse(content) as unknown;
        if (parsed && typeof parsed === "object") {
          settings = parsed as GrokSettings;
        }
      } catch {
        // Ignore invalid JSON and recreate with defaults
      }
    } catch {
      // File might not exist; we'll create it
    }
  }

  settings.selectedAuthType = "openai";
  if (settings.useExternalAuth === undefined) {
    settings.useExternalAuth = false;
  }

  const mergedContent = JSON.stringify(settings, null, 2) + "\n";
  files.push({
    destinationPath: "$HOME/.grok/settings.json",
    contentBase64: Buffer.from(mergedContent).toString("base64"),
    mode: "644",
  });

  if (ctx.apiKeys?.XAI_API_KEY) {
    env.OPENAI_API_KEY = ctx.apiKeys.XAI_API_KEY;
  }
  if (defaultBaseUrl) env.OPENAI_BASE_URL = defaultBaseUrl;
  if (defaultModel) env.OPENAI_MODEL = defaultModel;

  if (ctx.providerConfig?.isOverridden && ctx.providerConfig.baseUrl) {
    env.OPENAI_BASE_URL = ctx.providerConfig.baseUrl;
  }

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

  if (ctx.githubProjectContext) {
    files.push(
      getProjectContextFile({
        ...ctx.githubProjectContext,
        taskRunJwt: ctx.taskRunJwt,
        callbackUrl: ctx.callbackUrl,
      })
    );
  }

  const policyRulesSection = ctx.policyRules && ctx.policyRules.length > 0
    ? `\n${getPolicyRulesInstructions(ctx.policyRules)}\n`
    : "";
  const orchestrationRulesSection = ctx.orchestrationRules && ctx.orchestrationRules.length > 0
    ? `\n${getOrchestrationRulesInstructions(ctx.orchestrationRules, { isOrchestrationHead: ctx.isOrchestrationHead })}\n`
    : "";
  const behaviorRulesSection = ctx.previousBehavior
    ? `\n${extractBehaviorRulesSection(ctx.previousBehavior)}\n`
    : "";
  const grokMdContent = `# cmux Project Instructions
${policyRulesSection}${orchestrationRulesSection}${behaviorRulesSection}
${getMemoryProtocolInstructions()}
`;
  files.push({
    destinationPath: "/root/workspace/GROK.md",
    contentBase64: Buffer.from(grokMdContent).toString("base64"),
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

export async function getGrokEnvironment(
  ctx: EnvironmentContext
): Promise<EnvironmentResult> {
  return makeGrokEnvironment(ctx, "https://api.x.ai/v1", "grok-code-fast-1");
}
