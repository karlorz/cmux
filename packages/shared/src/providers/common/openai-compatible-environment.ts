/**
 * Shared environment builder for OpenAI-compatible CLI providers.
 *
 * This module consolidates the common patterns used by providers that:
 * - Use OpenAI-compatible API (OPENAI_BASE_URL, OPENAI_API_KEY, OPENAI_MODEL)
 * - Have a simple settings.json with selectedAuthType
 * - Use standard lifecycle hooks from provider-lifecycle-adapter.ts
 *
 * Currently used by: qwen, grok
 * Could potentially be used by: future OpenAI-compatible providers
 */

import type {
  EnvironmentContext,
  EnvironmentResult,
} from "./environment-result";
import {
  getMemoryStartupCommand,
  getMemorySeedFiles,
  getProjectContextFile,
} from "../../agent-memory-protocol";
import { buildGenericInstructionsContent } from "../../agent-instruction-pack";
import { getTaskSandboxWrapperFiles } from "./task-sandbox-wrappers";
import {
  buildStandardLifecycleHooks,
  type ProviderName,
} from "../../provider-lifecycle-adapter";

/**
 * Configuration for an OpenAI-compatible provider.
 */
export interface OpenAICompatibleProviderConfig {
  /** Provider identifier (e.g., "qwen", "grok") */
  provider: ProviderName;
  /** Config directory name without leading dot (e.g., "qwen" -> ~/.qwen) */
  configDir: string;
  /** Instructions file path (e.g., "/root/workspace/QWEN.md") */
  instructionsPath: string;
  /** Default API base URL (e.g., "https://api.x.ai/v1") */
  defaultBaseUrl: string | null;
  /** Default model name */
  defaultModel: string | null;
  /**
   * Optional API key mapping function.
   * Maps from ctx.apiKeys to the OPENAI_API_KEY env var.
   * Example: (ctx) => ctx.apiKeys?.XAI_API_KEY
   */
  getApiKey?: (ctx: EnvironmentContext) => string | undefined;
  /** Optional telemetry log prefix for cleanup command */
  telemetryPrefix?: string;
}

/**
 * Build environment for an OpenAI-compatible CLI provider.
 *
 * This function handles:
 * - Config directory creation
 * - Telemetry cleanup
 * - Standard lifecycle hooks (session start, stop, completion)
 * - Settings.json with selectedAuthType = "openai"
 * - Memory protocol integration
 * - GitHub Projects context injection
 * - Instructions file creation
 * - Shell wrappers for command blocking
 * - Provider override handling
 */
export async function buildOpenAICompatibleEnvironment(
  ctx: EnvironmentContext,
  config: OpenAICompatibleProviderConfig
): Promise<EnvironmentResult> {
  const { Buffer } = await import("node:buffer");

  const useHostConfig = ctx.useHostConfig ?? false;

  const files: EnvironmentResult["files"] = [];
  const env: Record<string, string> = {};
  const startupCommands: string[] = [];

  // 1. Create config directory
  startupCommands.push(`mkdir -p ~/.${config.configDir}`);

  // 2. Clean up telemetry files from previous runs
  const telemetryPrefix = config.telemetryPrefix ?? config.provider;
  startupCommands.push(
    `rm -f /tmp/${telemetryPrefix}-telemetry-*.log 2>/dev/null || true`
  );

  // 3. Build standard lifecycle hooks
  const lifecycleHooks = buildStandardLifecycleHooks(
    {
      provider: config.provider,
      taskRunId: ctx.taskRunId,
      includeMemorySync: true,
      createCompletionMarker: true,
    },
    Buffer.from.bind(Buffer)
  );
  files.push(...lifecycleHooks.files);
  startupCommands.push(...lifecycleHooks.startupCommands);

  // 4. Fire session start hook
  startupCommands.push(`/root/lifecycle/${config.provider}/session-start-hook.sh &`);

  // 5. Build settings.json
  type ProviderSettings = {
    selectedAuthType?: string;
    useExternalAuth?: boolean;
    [key: string]: unknown;
  };

  let settings: ProviderSettings = {};
  if (useHostConfig) {
    const { readFile } = await import("node:fs/promises");
    const { homedir } = await import("node:os");
    const { join } = await import("node:path");
    const configPath = join(homedir(), `.${config.configDir}`, "settings.json");
    try {
      const content = await readFile(configPath, "utf-8");
      try {
        const parsed = JSON.parse(content) as unknown;
        if (parsed && typeof parsed === "object") {
          settings = parsed as ProviderSettings;
        }
      } catch {
        // Ignore invalid JSON
      }
    } catch {
      // File might not exist
    }
  }

  // Force OpenAI-compatible auth
  settings.selectedAuthType = "openai";
  if (settings.useExternalAuth === undefined) {
    settings.useExternalAuth = false;
  }

  const settingsContent = JSON.stringify(settings, null, 2) + "\n";
  files.push({
    destinationPath: `$HOME/.${config.configDir}/settings.json`,
    contentBase64: Buffer.from(settingsContent).toString("base64"),
    mode: "644",
  });

  // 6. Set API key if provided via custom mapping
  if (config.getApiKey) {
    const apiKey = config.getApiKey(ctx);
    if (apiKey) {
      env.OPENAI_API_KEY = apiKey;
    }
  }

  // 7. Set default base URL and model
  if (config.defaultBaseUrl) {
    env.OPENAI_BASE_URL = config.defaultBaseUrl;
  }
  if (config.defaultModel) {
    env.OPENAI_MODEL = config.defaultModel;
  }

  // 8. Provider override takes precedence
  if (ctx.providerConfig?.isOverridden && ctx.providerConfig.baseUrl) {
    env.OPENAI_BASE_URL = ctx.providerConfig.baseUrl;
  }

  // 9. Memory protocol
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

  // 10. GitHub Projects context
  if (ctx.githubProjectContext) {
    files.push(
      getProjectContextFile({
        ...ctx.githubProjectContext,
        taskRunJwt: ctx.taskRunJwt,
        callbackUrl: ctx.callbackUrl,
      })
    );
  }

  // 11. Instructions file
  const instructionsContent = buildGenericInstructionsContent(
    {
      policyRules: ctx.policyRules,
      orchestrationRules: ctx.orchestrationRules,
      previousBehavior: ctx.previousBehavior,
      isOrchestrationHead: ctx.isOrchestrationHead,
    },
    "# cmux Project Instructions"
  );
  files.push({
    destinationPath: config.instructionsPath,
    contentBase64: Buffer.from(instructionsContent).toString("base64"),
    mode: "644",
  });

  // 12. Shell wrappers for dangerous command blocking
  const hasTaskRunJwt = ctx.taskRunJwt.trim().length > 0;
  if (hasTaskRunJwt && ctx.enableShellWrappers) {
    files.push(...getTaskSandboxWrapperFiles(Buffer));
  }

  return { files, env, startupCommands };
}
