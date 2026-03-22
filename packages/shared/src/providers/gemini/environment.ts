import type {
  EnvironmentContext,
  EnvironmentResult,
} from "../common/environment-result";
import { getGeminiTelemetryPath } from "./telemetry";
import {
  getMemoryStartupCommand,
  getMemorySeedFiles,
  getProjectContextFile,
  getCrossToolSymlinkCommands,
} from "../../agent-memory-protocol";
import { buildGeminiMdContent } from "../../agent-instruction-pack";
import { buildGeminiMcpServers } from "../../mcp-injection";
import { getTaskSandboxWrapperFiles } from "../common/task-sandbox-wrappers";

type GeminiModelSettings = {
  skipNextSpeakerCheck?: boolean;
  [key: string]: unknown;
};

type GeminiTelemetrySettings = {
  outfile?: string;
  target?: string;
  otlpEndpoint?: string;
  logPrompts?: boolean;
  [key: string]: unknown;
};

type GeminiSettings = {
  selectedAuthType?: string;
  model?: GeminiModelSettings;
  telemetry?: GeminiTelemetrySettings;
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
};

export async function getGeminiEnvironment(
  ctx: EnvironmentContext
): Promise<EnvironmentResult> {
  // These must be lazy since configs are imported into the browser
  const { Buffer } = await import("node:buffer");

  // useHostConfig is safe for desktop/Electron apps where the host IS the user's machine.
  // For server deployments, this should be false to prevent credential leakage.
  const useHostConfig = ctx.useHostConfig ?? false;

  let homeDir: string | undefined;
  let readFile:
    | ((path: string, encoding: "utf-8") => Promise<string>)
    | undefined;
  let statFn:
    | ((path: string) => Promise<{ isDirectory(): boolean }>)
    | undefined;
  let joinFn: ((...paths: string[]) => string) | undefined;
  let geminiDir: string | undefined;
  if (useHostConfig) {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    readFile = fs.readFile;
    statFn = fs.stat;
    joinFn = path.join;
    homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
    geminiDir = path.join(homeDir, ".gemini");
  }

  const files: EnvironmentResult["files"] = [];
  const env: Record<string, string> = {};
  const startupCommands: string[] = [];
  const telemetryOutfile = getGeminiTelemetryPath(ctx.taskRunId);

  // Ensure .gemini directory exists
  startupCommands.push("mkdir -p ~/.gemini");
  startupCommands.push("mkdir -p ~/.gemini/commands");
  startupCommands.push("mkdir -p /root/lifecycle/gemini");

  // Clean up any old Gemini telemetry files from previous runs
  // The actual telemetry path will be set by the agent spawner with the task ID
  startupCommands.push("rm -f /tmp/gemini-telemetry-*.log 2>/dev/null || true");

  // Session start hook - posts activity event when Gemini session begins
  const sessionStartHook = `#!/bin/bash
set -eu
LOG_FILE="/root/lifecycle/gemini-hook.log"
if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ]; then
  exit 0
fi
# Post session start activity event (non-blocking)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$(jq -n --arg trid "\${CMUX_TASK_RUN_ID:-}" \\
         '{taskRunId: $trid, type: "session_start", toolName: "gemini", summary: "Session started"}')" \\
    >> "\${LOG_FILE}" 2>&1 || true
) &
exit 0
`;
  files.push({
    destinationPath: "/root/lifecycle/gemini/session-start-hook.sh",
    contentBase64: Buffer.from(sessionStartHook).toString("base64"),
    mode: "755",
  });

  // Session completion hook - posts activity event when Gemini session ends
  const sessionCompleteHook = `#!/bin/bash
set -eu
LOG_FILE="/root/lifecycle/gemini-hook.log"
MARKER_DIR="/root/lifecycle"
GENERIC_MARKER="\${MARKER_DIR}/done.txt"

# Post session completion activity event (non-blocking)
if [ -n "\${CMUX_TASK_RUN_JWT:-}" ] && [ -n "\${CMUX_CALLBACK_URL:-}" ]; then
  (
    curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
      -H "Content-Type: application/json" \\
      -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
      -d "$(jq -n --arg trid "\${CMUX_TASK_RUN_ID:-}" \\
           '{taskRunId: $trid, type: "session_stop", toolName: "gemini", summary: "Session completed"}')" \\
      >> "\${LOG_FILE}" 2>&1 || true
  ) &
fi

# Sync memory files (best-effort)
/root/lifecycle/memory/sync.sh >> "\${LOG_FILE}" 2>&1 || true

# Create completion marker
touch "\${GENERIC_MARKER}"
echo "[CMUX] Gemini session complete" >> "\${LOG_FILE}"
`;
  files.push({
    destinationPath: "/root/lifecycle/gemini/session-complete-hook.sh",
    contentBase64: Buffer.from(sessionCompleteHook).toString("base64"),
    mode: "755",
  });

  // Error hook - surfaces errors to dashboard
  const errorHook = `#!/bin/bash
set -eu
LOG_FILE="/root/lifecycle/gemini-hook.log"
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
         '{taskRunId: $trid, type: "error", toolName: "gemini", summary: $msg}')" \\
    >> "\${LOG_FILE}" 2>&1 || true
) &
exit 0
`;
  files.push({
    destinationPath: "/root/lifecycle/gemini/error-hook.sh",
    contentBase64: Buffer.from(errorHook).toString("base64"),
    mode: "755",
  });

  // Fire session start hook on sandbox initialization
  startupCommands.push("/root/lifecycle/gemini/session-start-hook.sh &");

  // Helper function to safely copy file from host (only when useHostConfig is true)
  async function copyFile(
    filename: string,
    destinationPath: string,
    mode: string = "644"
  ) {
    if (!useHostConfig || !readFile || !geminiDir || !joinFn) return false;
    try {
      const content = await readFile(joinFn(geminiDir, filename), "utf-8");
      files.push({
        destinationPath,
        contentBase64: Buffer.from(content).toString("base64"),
        mode,
      });
      return true;
    } catch (error) {
      // Only log if it's not a "file not found" error
      if (
        error instanceof Error &&
        "code" in error &&
        error.code !== "ENOENT"
      ) {
        console.warn(`Failed to read ${filename}:`, error);
      }
      return false;
    }
  }

  // 1. Settings file (required) — ensure selectedAuthType is set
  try {
    let settingsContent: string | undefined;
    if (useHostConfig && readFile && geminiDir && joinFn) {
      const settingsPath = joinFn(geminiDir, "settings.json");
      try {
        settingsContent = await readFile(settingsPath, "utf-8");
      } catch (error) {
        // If missing, we'll create a new one
        const isNodeErr = (err: unknown): err is { code?: string } =>
          typeof err === "object" && err !== null && "code" in err;
        if (
          !(error instanceof Error && isNodeErr(error) && error.code === "ENOENT")
        ) {
          console.warn("Failed to read settings.json:", error);
        }
      }
    }

    let settings: GeminiSettings = {};
    if (settingsContent) {
      try {
        const parsed = JSON.parse(settingsContent) as unknown;
        if (parsed && typeof parsed === "object") {
          settings = parsed as GeminiSettings;
        }
      } catch (e) {
        console.warn(
          "Invalid JSON in settings.json; recreating with defaults.",
          e
        );
      }
    }

    // Force the desired auth type
    settings.selectedAuthType = "gemini-api-key";

    // Ensure telemetry is routed to our per-task logfile.
    const telemetrySettings =
      settings.telemetry && typeof settings.telemetry === "object"
        ? (settings.telemetry as GeminiTelemetrySettings)
        : {};
    settings.telemetry = {
      ...telemetrySettings,
      outfile: telemetryOutfile,
      target: "local",
      otlpEndpoint: "",
      logPrompts: true,
    };

    // Force skipNextSpeakerCheck=false so completion events are emitted.
    const modelSettings =
      settings.model && typeof settings.model === "object"
        ? (settings.model as GeminiModelSettings)
        : {};
    settings.model = {
      ...modelSettings,
      skipNextSpeakerCheck: false,
    };

    const existingMcpServers =
      settings.mcpServers &&
      typeof settings.mcpServers === "object" &&
      !Array.isArray(settings.mcpServers)
        ? settings.mcpServers
        : {};
    settings.mcpServers = {
      ...existingMcpServers,
      ...buildGeminiMcpServers(ctx.mcpServerConfigs ?? []),
    };

    const mergedContent = JSON.stringify(settings, null, 2) + "\n";
    files.push({
      destinationPath: "$HOME/.gemini/settings.json",
      contentBase64: Buffer.from(mergedContent).toString("base64"),
      mode: "644",
    });
  } catch (e) {
    console.warn("Unexpected error preparing settings.json:", e);
  }

  // 2. OAuth tokens (if exists)
  await copyFile("oauth_creds.json", "$HOME/.gemini/oauth_creds.json", "600");
  await copyFile(
    "mcp-oauth-tokens.json",
    "$HOME/.gemini/mcp-oauth-tokens.json",
    "600"
  );

  // 3. Google account authentication
  await copyFile(
    "google_accounts.json",
    "$HOME/.gemini/google_accounts.json",
    "600"
  );
  await copyFile("google_account_id", "$HOME/.gemini/google_account_id");

  // 4. Installation and user IDs
  await copyFile("installation_id", "$HOME/.gemini/installation_id");
  await copyFile("user_id", "$HOME/.gemini/user_id");

  // 5. Check for .env files (host only)
  if (useHostConfig && readFile && homeDir && joinFn) {
    const envPaths = [joinFn(homeDir, ".gemini", ".env"), joinFn(homeDir, ".env")];

    for (const envPath of envPaths) {
      try {
        const content = await readFile(envPath, "utf-8");
        const filename =
          envPath === joinFn(homeDir, ".gemini", ".env") ? ".gemini/.env" : ".env";
        files.push({
          destinationPath: `$HOME/${filename}`,
          contentBase64: Buffer.from(content).toString("base64"),
          mode: "600",
        });
        break; // Use first found .env file
      } catch {
        // Continue to next path
      }
    }
  }

  // 6. Check for commands directory (host only)
  if (useHostConfig && statFn && geminiDir && joinFn) {
    try {
      const commandsDir = joinFn(geminiDir, "commands");
      const stats = await statFn(commandsDir);
      if (stats.isDirectory()) {
        // Create commands directory in destination
        startupCommands.push("mkdir -p ~/.gemini/commands");
      }
    } catch {
      // Commands directory doesn't exist
    }
  }

  // Add agent memory protocol support
  startupCommands.push(getMemoryStartupCommand());
  files.push(...getMemorySeedFiles(ctx.taskRunId, ctx.previousKnowledge, ctx.previousMailbox, ctx.orchestrationOptions, ctx.previousBehavior));

  // Create cross-tool symlinks for shared instructions
  // If Claude's CLAUDE.md exists, link it to ~/.gemini/GEMINI.md
  // This allows all tools to share the same instructions at user-level paths
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

  // Add GEMINI.md with memory protocol instructions as fallback
  // This is created at user-level ~/.gemini/GEMINI.md (not in workspace)
  // If Claude's CLAUDE.md exists, the symlink from getCrossToolSymlinkCommands()
  // will override this file, ensuring all tools share the same instructions
  // Uses shared instruction pack builder for consistent assembly across providers
  const geminiMdContent = buildGeminiMdContent({
    policyRules: ctx.policyRules,
    orchestrationRules: ctx.orchestrationRules,
    previousBehavior: ctx.previousBehavior,
    isOrchestrationHead: ctx.isOrchestrationHead,
  });
  files.push({
    destinationPath: "$HOME/.gemini/GEMINI.md",
    contentBase64: Buffer.from(geminiMdContent).toString("base64"),
    mode: "644",
  });

  // Block dangerous commands in task sandboxes (when enabled via settings)
  // Disabled by default - use permission deny rules or policy rules instead
  const hasTaskRunJwt = ctx.taskRunJwt.trim().length > 0;
  if (hasTaskRunJwt && ctx.enableShellWrappers) {
    files.push(...getTaskSandboxWrapperFiles(Buffer));
  }

  return { files, env, startupCommands };}

