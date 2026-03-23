import type {
  EnvironmentContext,
  EnvironmentResult,
} from "../common/environment-result";
import {
  getMemoryStartupCommand,
  getMemorySeedFiles,
  getProjectContextFile,
} from "../../agent-memory-protocol";
import { buildGenericInstructionsContent } from "../../agent-instruction-pack";
import { getTaskSandboxWrapperFiles } from "../common/task-sandbox-wrappers";
import { buildStandardLifecycleHooks } from "../../provider-lifecycle-adapter";

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
  startupCommands.push("rm -f /tmp/grok-telemetry-*.log 2>/dev/null || true");

  // Build standard lifecycle hooks using shared adapter
  const lifecycleHooks = buildStandardLifecycleHooks(
    {
      provider: "grok",
      taskRunId: ctx.taskRunId,
      includeMemorySync: true,
      createCompletionMarker: true,
    },
    Buffer.from.bind(Buffer)
  );
  files.push(...lifecycleHooks.files);
  startupCommands.push(...lifecycleHooks.startupCommands);

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

  const grokMdContent = buildGenericInstructionsContent({
    policyRules: ctx.policyRules,
    orchestrationRules: ctx.orchestrationRules,
    previousBehavior: ctx.previousBehavior,
    isOrchestrationHead: ctx.isOrchestrationHead,
  }, "# cmux Project Instructions");
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
