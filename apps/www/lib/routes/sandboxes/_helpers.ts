/**
 * Shared helpers for sandbox routes.
 * Extracted from sandboxes.route.ts to reduce file size and improve maintainability.
 */

import { env } from "@/lib/utils/www-env";
import { MorphCloudClient } from "morphcloud";
import type { SandboxInstance } from "@/lib/utils/sandbox-instance";
import type { EnvironmentResult, McpServerConfig } from "@cmux/shared";
import { AGENT_CONFIGS } from "@cmux/shared/agentConfig";
import {
  getProviderIdFromAgentName,
  type ProviderOverride,
  type ResolvedProvider,
} from "@cmux/shared/provider-registry";
import { encodeEnvContentForEnvctl, envctlLoadCommand } from "../utils/ensure-env-vars";
import { getConvex } from "@/lib/utils/get-convex";
import { api } from "@cmux/convex/api";

/**
 * Create a MorphCloudClient instance.
 * Throws if MORPH_API_KEY is not configured.
 */
export function getMorphClient(): MorphCloudClient {
  if (!env.MORPH_API_KEY) {
    throw new Error("Morph API key not configured");
  }
  return new MorphCloudClient({ apiKey: env.MORPH_API_KEY });
}

/**
 * Get MorphCloudClient if configured, or null for PVE-only deployments.
 * Use with getInstanceById() which handles null Morph client for PVE instances.
 */
export function getMorphClientOrNull(): MorphCloudClient | null {
  if (!env.MORPH_API_KEY) {
    return null;
  }
  return new MorphCloudClient({ apiKey: env.MORPH_API_KEY });
}

/**
 * Concatenate config blocks with a separator, filtering out empty blocks.
 */
export function concatConfigBlocks(
  blocks: Array<string | null | undefined>,
  separator: string,
): string | null {
  const normalizedBlocks = blocks
    .map((block) => block?.trim())
    .filter((block): block is string => Boolean(block && block.length > 0));
  if (normalizedBlocks.length === 0) {
    return null;
  }
  return normalizedBlocks.join(separator);
}

/**
 * Wait for the VSCode server to be ready by polling the service URL.
 * This prevents "upstream connect error" when the iframe loads before the server is ready.
 */
export async function waitForVSCodeReady(
  vscodeUrl: string,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<boolean> {
  // PVE-LXC containers need more time for services to start after clone
  const { timeoutMs = 45_000, intervalMs = 500 } = options;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      // Use a simple HEAD request to check if the server is responding
      const response = await fetch(vscodeUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(3_000),
      });
      // OpenVSCode server returns 200 for the root path when ready
      if (response.ok || response.status === 302 || response.status === 301) {
        return true;
      }
    } catch {
      // Connection refused or timeout - server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return false;
}

/**
 * Wait for the Worker socket server to be ready by polling the socket.io endpoint.
 * This prevents "Worker socket not available" errors when the agent spawner tries to connect
 * before the worker service is actually listening.
 */
export async function waitForWorkerReady(
  workerUrl: string,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<boolean> {
  // PVE-LXC containers need more time for services to start after clone
  const { timeoutMs = 45_000, intervalMs = 500 } = options;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      // Worker service uses socket.io - check if the HTTP endpoint responds
      // Socket.io exposes a polling transport at /socket.io/?EIO=4&transport=polling
      const response = await fetch(`${workerUrl}/socket.io/?EIO=4&transport=polling`, {
        method: "GET",
        signal: AbortSignal.timeout(3_000),
      });
      // Socket.io returns 200 with polling data when ready
      if (response.ok) {
        return true;
      }
    } catch {
      // Connection refused or timeout - server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return false;
}

/**
 * Extract a safe, descriptive error message from sandbox start errors.
 * Avoids leaking sensitive information like API keys, tokens, or internal paths.
 */
export function getSandboxStartErrorMessage(error: unknown): string {
  const baseMessage = "Failed to start sandbox";

  if (!(error instanceof Error)) {
    return baseMessage;
  }

  const message = error.message.toLowerCase();

  // Check for common error patterns and provide helpful context
  // Network/connectivity issues
  if (message.includes("timeout") || message.includes("timed out")) {
    return `${baseMessage}: request timed out while provisioning instance`;
  }
  if (message.includes("econnrefused") || message.includes("connection refused")) {
    return `${baseMessage}: could not connect to sandbox provider`;
  }
  if (message.includes("enotfound") || message.includes("getaddrinfo")) {
    return `${baseMessage}: could not resolve sandbox provider address`;
  }
  if (message.includes("network") || message.includes("socket")) {
    return `${baseMessage}: network error while provisioning instance`;
  }

  // Quota/resource issues (common with cloud providers)
  if (message.includes("quota") || message.includes("limit") || message.includes("exceeded")) {
    return `${baseMessage}: resource quota exceeded`;
  }
  if (message.includes("capacity") || message.includes("unavailable")) {
    return `${baseMessage}: sandbox provider capacity unavailable`;
  }

  // Snapshot issues
  if (message.includes("snapshot") && (message.includes("not found") || message.includes("invalid"))) {
    return `${baseMessage}: snapshot not found or invalid`;
  }

  // Authentication/authorization (without revealing details)
  if (message.includes("unauthorized") || message.includes("401")) {
    return `${baseMessage}: authentication failed with sandbox provider`;
  }
  if (message.includes("forbidden") || message.includes("403")) {
    return `${baseMessage}: access denied by sandbox provider`;
  }

  // Rate limiting
  if (message.includes("rate limit") || message.includes("429") || message.includes("too many")) {
    return `${baseMessage}: rate limited by sandbox provider`;
  }

  // Instance startup issues
  if (message.includes("instance") && message.includes("start")) {
    return `${baseMessage}: instance failed to start`;
  }

  // If error message is reasonably safe (no obvious secrets patterns), include part of it
  const sensitivePatterns = [
    /api[_-]?key/i,
    /token/i,
    /secret/i,
    /password/i,
    /credential/i,
    /bearer/i,
    /authorization/i,
    /sk[_-][a-z0-9]/i,
    /pk[_-][a-z0-9]/i,
  ];

  const hasSensitiveContent = sensitivePatterns.some((pattern) =>
    pattern.test(error.message)
  );

  if (!hasSensitiveContent && error.message.length < 200) {
    // Sanitize the message: remove potential file paths and URLs
    const sanitized = error.message
      .replace(/\/[^\s]+/g, "[path]") // Replace file paths
      .replace(/https?:\/\/[^\s]+/g, "[url]") // Replace URLs
      .trim();

    if (sanitized.length > 0 && sanitized !== "[path]" && sanitized !== "[url]") {
      return `${baseMessage}: ${sanitized}`;
    }
  }

  return baseMessage;
}

/**
 * Write auth files to a sandbox instance.
 * Decodes base64 content, shell-escapes it, and writes with proper permissions.
 */
export async function writeFilesToSandbox(
  instance: SandboxInstance,
  files: EnvironmentResult["files"],
): Promise<void> {
  for (const file of files) {
    const destPath = file.destinationPath.replace("$HOME", "/root");
    const content = Buffer.from(file.contentBase64, "base64").toString("utf-8");
    // Only escape single quotes for shell - backslashes are literal in single-quoted strings
    const escapedContent = content.replace(/'/g, "'\\''");
    const dirPath = destPath.substring(0, destPath.lastIndexOf("/"));
    await instance.exec(`mkdir -p '${dirPath}'`);
    await instance.exec(`printf '%s' '${escapedContent}' > '${destPath}'`);
    if (file.mode) {
      await instance.exec(`chmod ${file.mode} '${destPath}'`);
    }
  }
}

/**
 * Apply environment result (files, env vars, startup commands) to a sandbox.
 */
export async function applyEnvironmentResult(
  instance: SandboxInstance,
  envResult: Partial<EnvironmentResult>,
  label: string,
): Promise<void> {
  // Write files
  if (envResult.files && envResult.files.length > 0) {
    await writeFilesToSandbox(instance, envResult.files);
    console.log(`[${label}] Wrote ${envResult.files.length} auth files`);
  }

  // Apply environment variables
  if (envResult.env && Object.keys(envResult.env).length > 0) {
    const envContent = Object.entries(envResult.env)
      .map(([k, v]) => `${k}="${v}"`)
      .join("\n");
    const encodedEnv = encodeEnvContentForEnvctl(envContent);
    await instance.exec(envctlLoadCommand(encodedEnv));
    console.log(
      `[${label}] Applied ${Object.keys(envResult.env).length} env vars`,
    );
  }

  // Unset env vars
  if (envResult.unsetEnv && envResult.unsetEnv.length > 0) {
    for (const varName of envResult.unsetEnv) {
      await instance.exec(`envctl unset ${varName} 2>/dev/null || true`);
    }
  }

  // Run startup commands
  if (
    "startupCommands" in envResult &&
    envResult.startupCommands &&
    envResult.startupCommands.length > 0
  ) {
    for (const cmd of envResult.startupCommands) {
      await instance.exec(cmd);
    }
  }
}

/**
 * Map provider overrides from Convex format to shared type.
 */
export function mapProviderOverrides(
  providerOverrides: Array<{
    teamId: string;
    providerId: string;
    baseUrl?: string;
    apiFormat?: ProviderOverride["apiFormat"];
    apiKeyEnvVar?: string;
    customHeaders?: Record<string, string>;
    fallbacks?: ProviderOverride["fallbacks"];
    enabled: boolean;
  }>,
): ProviderOverride[] {
  return providerOverrides.map((override): ProviderOverride => ({
    teamId: String(override.teamId),
    providerId: override.providerId,
    baseUrl: override.baseUrl,
    apiFormat: override.apiFormat,
    apiKeyEnvVar: override.apiKeyEnvVar,
    customHeaders: override.customHeaders,
    fallbacks: override.fallbacks,
    enabled: override.enabled,
  }));
}

export type EnvironmentProviderConfig = NonNullable<
  Pick<
    Parameters<NonNullable<(typeof AGENT_CONFIGS)[number]["environment"]>>[0],
    "providerConfig"
  >["providerConfig"]
>;

export function buildProviderConfig(
  resolvedProvider: ResolvedProvider | undefined,
): EnvironmentProviderConfig | undefined {
  if (!resolvedProvider?.isOverridden) {
    return undefined;
  }

  return {
    baseUrl: resolvedProvider.baseUrl,
    customHeaders: resolvedProvider.customHeaders,
    apiFormat: resolvedProvider.apiFormat,
    isOverridden: true,
  };
}

export function buildOpenAiProviderConfig(
  resolvedProvider: ResolvedProvider | undefined,
  openAiBaseUrl: string | undefined,
): EnvironmentProviderConfig | undefined {
  return (
    buildProviderConfig(resolvedProvider) ??
    (openAiBaseUrl
      ? {
          baseUrl: openAiBaseUrl,
          isOverridden: true,
        }
      : undefined)
  );
}

export async function getSandboxAgentConfigs(
  convex: ReturnType<typeof getConvex>,
  options: {
    teamSlugOrId: string;
    projectFullName?: string;
    logPrefix: string;
  },
): Promise<{
  claude?: string;
  codex?: string;
}> {
  const getAgentConfig = (agentType: "claude" | "codex") =>
    convex
      .query(api.agentConfigs.getForSandbox, {
        teamSlugOrId: options.teamSlugOrId,
        agentType,
        ...(options.projectFullName
          ? { projectFullName: options.projectFullName }
          : {}),
      })
      .catch((err: unknown) => {
        console.error(
          `[${options.logPrefix}] Failed to fetch ${agentType} agent config`,
          err,
        );
        return null;
      });

  const [claudeConfig, codexConfig] = await Promise.all([
    getAgentConfig("claude"),
    getAgentConfig("codex"),
  ]);

  return {
    ...(claudeConfig ? { claude: claudeConfig } : {}),
    ...(codexConfig ? { codex: codexConfig } : {}),
  };
}

export async function getSandboxMcpConfigs(
  convex: ReturnType<typeof getConvex>,
  options: {
    teamSlugOrId: string;
    projectFullName?: string;
    logPrefix: string;
  },
): Promise<{
  claude: McpServerConfig[];
  codex: McpServerConfig[];
  gemini: McpServerConfig[];
  opencode: McpServerConfig[];
}> {
  const getMcpConfigs = (
    agentType: "claude" | "codex" | "gemini" | "opencode",
  ) =>
    convex
      .query(api.mcpServerConfigs.getForSandbox, {
        teamSlugOrId: options.teamSlugOrId,
        agentType,
        ...(options.projectFullName
          ? { projectFullName: options.projectFullName }
          : {}),
      })
      .catch((err: unknown) => {
        console.error(
          `[${options.logPrefix}] Failed to fetch ${agentType} MCP configs`,
          err,
        );
        return [];
      });

  const [claude, codex, gemini, opencode] = await Promise.all([
    getMcpConfigs("claude"),
    getMcpConfigs("codex"),
    getMcpConfigs("gemini"),
    getMcpConfigs("opencode"),
  ]);

  return { claude, codex, gemini, opencode };
}

export function getEnvironmentOverridesForAgent(
  agentName: string,
  options: {
    mcpConfigs: {
      claude: McpServerConfig[];
      codex: McpServerConfig[];
      gemini: McpServerConfig[];
      opencode: McpServerConfig[];
    };
    workspaceSettings: {
      bypassAnthropicProxy?: boolean;
    } | null;
    taskRunJwt?: string;
    resolvedProvider: ResolvedProvider | undefined;
    openAiBaseUrl?: string;
  },
): Pick<
  Parameters<NonNullable<(typeof AGENT_CONFIGS)[number]["environment"]>>[0],
  "mcpServerConfigs" | "workspaceSettings" | "providerConfig"
> {
  const providerId = getProviderIdFromAgentName(agentName);

  switch (providerId) {
    case "anthropic":
      return {
        mcpServerConfigs: options.mcpConfigs.claude,
        workspaceSettings: options.workspaceSettings ?? undefined,
        providerConfig: buildProviderConfig(options.resolvedProvider),
      };
    case "openai":
      return {
        mcpServerConfigs: options.mcpConfigs.codex,
        providerConfig: buildOpenAiProviderConfig(
          options.resolvedProvider,
          options.openAiBaseUrl,
        ),
      };
    case "google":
      return {
        mcpServerConfigs: options.mcpConfigs.gemini,
        providerConfig: buildProviderConfig(options.resolvedProvider),
      };
    case "opencode":
      return {
        mcpServerConfigs: options.mcpConfigs.opencode,
        providerConfig: buildProviderConfig(options.resolvedProvider),
      };
    default:
      return {};
  }
}
