/**
 * Sandboxes Route Helpers
 *
 * Shared utilities, schemas, and client functions for sandbox routes.
 */

import {
  getAccessTokenFromRequest,
  getUserFromRequest,
} from "@/lib/utils/auth";
import { getConvex, getConvexAdmin, type ConvexAdminClient } from "@/lib/utils/get-convex";
import { generateGitHubInstallationToken } from "@/lib/utils/github-app-token";
import { selectGitIdentity } from "@/lib/utils/gitIdentity";
import { stackServerAppJs } from "@/lib/utils/stack";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { env } from "@/lib/utils/www-env";
import { api, internal } from "@cmux/convex/api";
import type { Doc, Id } from "@cmux/convex/dataModel";
import { DEFAULT_MORPH_SNAPSHOT_ID } from "@/lib/utils/morph-defaults";
import { RESERVED_CMUX_PORT_SET } from "@cmux/shared/utils/reserved-cmux-ports";
import { parseGithubRepoUrl } from "@cmux/shared/utils/parse-github-repo-url";
import { z } from "@hono/zod-openapi";
import { MorphCloudClient, type Instance as MorphInstance } from "morphcloud";
import { getPveLxcClient, type PveLxcInstance } from "@/lib/utils/pve-lxc-client";
import {
  type SandboxInstance,
  wrapMorphInstance,
  wrapPveLxcInstance,
} from "@/lib/utils/sandbox-instance";
import {
  isPveLxcInstanceId,
  getInstanceById,
  tryGetInstanceById,
  getInstanceTeamId,
} from "../sandboxes/provider-dispatch";
import { getActiveSandboxProvider } from "@/lib/utils/sandbox-provider";
import { loadEnvironmentEnvVars } from "../sandboxes/environment";
import {
  configureGithubAccess,
  configureGitIdentity,
  fetchGitIdentityInputs,
  getFreshGitHubToken,
  verifyGitHubRepoAccess,
} from "../sandboxes/git";
import type { HydrateRepoConfig } from "../sandboxes/hydration";
import { hydrateWorkspace } from "../sandboxes/hydration";
import { maskSensitive } from "../sandboxes/shell";
import { resolveTeamAndSnapshot } from "../sandboxes/snapshot";
import {
  allocateScriptIdentifiers,
  runMaintenanceAndDevScripts,
} from "../sandboxes/startDevAndMaintenanceScript";
import {
  encodeEnvContentForEnvctl,
  envctlLoadCommand,
} from "../utils/ensure-env-vars";
import type { McpServerConfig } from "@cmux/shared";
import { AGENT_CONFIGS, type EnvironmentResult } from "@cmux/shared/agentConfig";
import { getClaudeEnvironment } from "@cmux/shared/providers/anthropic/environment";
import { createApplyClaudeApiKeys } from "@cmux/shared/providers/anthropic/configs";
import {
  getOpenAIEnvironment,
  applyCodexApiKeys,
} from "@cmux/shared/providers/openai/environment";
import { getOpencodeEnvironment } from "@cmux/shared/providers/opencode/environment";
import {
  getProviderIdFromAgentName,
  getProviderRegistry,
  type ProviderOverride,
  type ResolvedProvider,
} from "@cmux/shared/provider-registry";

// Re-export commonly used imports for route files
export {
  getAccessTokenFromRequest,
  getUserFromRequest,
  getConvex,
  getConvexAdmin,
  verifyTeamAccess,
  env,
  api,
  internal,
  z,
  isPveLxcInstanceId,
  getInstanceById,
  tryGetInstanceById,
  getInstanceTeamId,
  getActiveSandboxProvider,
  loadEnvironmentEnvVars,
  configureGithubAccess,
  configureGitIdentity,
  fetchGitIdentityInputs,
  getFreshGitHubToken,
  verifyGitHubRepoAccess,
  hydrateWorkspace,
  resolveTeamAndSnapshot,
  allocateScriptIdentifiers,
  runMaintenanceAndDevScripts,
  encodeEnvContentForEnvctl,
  envctlLoadCommand,
  AGENT_CONFIGS,
  getClaudeEnvironment,
  createApplyClaudeApiKeys,
  getOpenAIEnvironment,
  applyCodexApiKeys,
  getOpencodeEnvironment,
  getProviderIdFromAgentName,
  getProviderRegistry,
  DEFAULT_MORPH_SNAPSHOT_ID,
  RESERVED_CMUX_PORT_SET,
  parseGithubRepoUrl,
  generateGitHubInstallationToken,
  selectGitIdentity,
  stackServerAppJs,
  wrapMorphInstance,
  wrapPveLxcInstance,
  getPveLxcClient,
  maskSensitive,
};

export type {
  Doc,
  Id,
  ConvexAdminClient,
  SandboxInstance,
  PveLxcInstance,
  HydrateRepoConfig,
  McpServerConfig,
  EnvironmentResult,
  ProviderOverride,
  ResolvedProvider,
  MorphInstance,
};

export { MorphCloudClient };

// ============================================================================
// Client Functions
// ============================================================================

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

// ============================================================================
// Utility Functions
// ============================================================================

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
  // Proxmox/PVE API specific errors
  if (message.includes("pve api network error") || message.includes("check pve_api_url")) {
    return `${baseMessage}: PVE API not reachable (check Cloudflare Tunnel or firewall)`;
  }
  if (message.includes("no available server") || message.includes("503")) {
    return `${baseMessage}: sandbox provider returned 503 (service unavailable)`;
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

// ============================================================================
// Provider Configuration Functions
// ============================================================================

/**
 * Map provider overrides from Convex format to shared format.
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
        workspaceSettings: options.workspaceSettings ?? undefined,
        providerConfig: buildOpenAiProviderConfig(
          options.resolvedProvider,
          options.openAiBaseUrl,
        ),
      };
    case "gemini":
      return {
        mcpServerConfigs: options.mcpConfigs.gemini,
        workspaceSettings: options.workspaceSettings ?? undefined,
        providerConfig: buildProviderConfig(options.resolvedProvider),
      };
    default:
      return {
        mcpServerConfigs: options.mcpConfigs.opencode,
        workspaceSettings: options.workspaceSettings ?? undefined,
        providerConfig: buildProviderConfig(options.resolvedProvider),
      };
  }
}

// ============================================================================
// Schemas
// ============================================================================

export const StartSandboxBody = z
  .object({
    teamSlugOrId: z.string(),
    snapshotId: z.string().optional(),
    environmentId: z.string().optional(),
    projectSlugOrId: z.string().optional(),
    sessionId: z.string().optional(),
    vscodePersisted: z.boolean().optional(),
    ttlSeconds: z
      .number()
      .optional()
      .default(60 * 60),
    metadata: z.record(z.string(), z.string()).optional(),
    taskRunId: z.string().optional(),
    taskRunJwt: z.string().optional(),
    isCloudWorkspace: z.boolean().optional(),
    /** Mark as orchestration head agent (can spawn sub-agents, gets full capabilities) */
    isOrchestrationHead: z.boolean().optional(),
    // Optional hydration parameters to clone a repo into the sandbox on start
    repoUrl: z.string().optional(),
    branch: z.string().optional(),
    newBranch: z.string().optional(),
    depth: z.number().optional().default(1),
    // Agent parameters for CLI task creation - triggers agent startup after sandbox is ready
    agentName: z.string().optional(),
    prompt: z.string().optional(),
  })
  .openapi("StartSandboxBody");

export const StartSandboxResponse = z
  .object({
    instanceId: z.string(),
    vscodeUrl: z.string(),
    workerUrl: z.string(),
    vncUrl: z.string().optional(),
    xtermUrl: z.string().optional(),
    provider: z.enum(["morph", "pve-lxc"]).default("morph"),
    vscodePersisted: z.boolean().optional(),
  })
  .openapi("StartSandboxResponse");

export const UpdateSandboxEnvBody = z
  .object({
    teamSlugOrId: z.string(),
    envVarsContent: z.string(),
  })
  .openapi("UpdateSandboxEnvBody");

export const UpdateSandboxEnvResponse = z
  .object({
    applied: z.literal(true),
  })
  .openapi("UpdateSandboxEnvResponse");

export const SandboxIdParam = z.object({
  id: z.string().openapi({ description: "Sandbox instance ID" }),
});

export const TeamQueryParam = z.object({
  teamSlugOrId: z.string().openapi({ description: "Team slug or ID" }),
});

// ============================================================================
// Provider Auth Setup
// ============================================================================

/**
 * Set up provider auth (Claude + Codex + OpenCode) on a sandbox instance.
 * Fetches API keys, provider overrides, and workspace settings from Convex,
 * then applies full environment setup for all supported CLIs.
 *
 * This is non-fatal: failures are logged but do not block sandbox creation.
 */
export async function setupProviderAuth(
  instance: SandboxInstance,
  convex: ReturnType<typeof getConvex>,
  options: {
    teamSlugOrId: string;
    projectFullName?: string;
    taskRunId?: string;
    taskRunJwt?: string;
    callbackUrl: string;
    previousKnowledge?: string | null;
    previousMailbox?: string | null;
    agentName?: string;
    /** When true, this is a head agent (cloud workspace) - skip deny rules */
    isOrchestrationHead?: boolean;
  },
): Promise<{ providers: string[] }> {
  const configuredProviders: string[] = [];

  // Fetch API keys, provider overrides, workspace settings, MCP configs, agent configs, and permission deny rules in parallel
  const [apiKeys, providerOverrides, workspaceSettings, mcpConfigs, agentConfigs, permissionDenyRules] = await Promise.all([
    convex.query(api.apiKeys.getAllForAgents, {
      teamSlugOrId: options.teamSlugOrId,
    }),
    convex
      .query(api.providerOverrides.getForTeam, {
        teamSlugOrId: options.teamSlugOrId,
      })
      .catch((err: unknown) => {
        console.error(
          "[setupProviderAuth] Failed to fetch provider overrides",
          err,
        );
        return [];
      }),
    convex
      .query(api.workspaceSettings.get, {
        teamSlugOrId: options.teamSlugOrId,
      })
      .catch((err: unknown) => {
        console.error(
          "[setupProviderAuth] Failed to fetch workspace settings",
          err,
        );
        return null;
      }),
    getSandboxMcpConfigs(convex, {
      teamSlugOrId: options.teamSlugOrId,
      projectFullName: options.projectFullName,
      logPrefix: "setupProviderAuth",
    }),
    getSandboxAgentConfigs(convex, {
      teamSlugOrId: options.teamSlugOrId,
      projectFullName: options.projectFullName,
      logPrefix: "setupProviderAuth",
    }),
    // Fetch permission deny rules for task sandboxes
    // Skip for head agents (they need full capabilities) - determined by isOrchestrationHead flag
    options.isOrchestrationHead
      ? Promise.resolve([])
      : convex
          .query(api.permissionDenyRules.getForSandbox, {
            teamSlugOrId: options.teamSlugOrId,
            context: "task_sandbox",
            projectFullName: options.projectFullName,
          })
          .catch((err: unknown) => {
            console.error(
              "[setupProviderAuth] Failed to fetch permission deny rules, using defaults",
              err,
            );
            return [] as string[];
          }),
  ]);

  const mcpConfigCounts = {
    claude: mcpConfigs.claude.length,
    codex: mcpConfigs.codex.length,
    gemini: mcpConfigs.gemini.length,
    opencode: mcpConfigs.opencode.length,
  };
  if (Object.values(mcpConfigCounts).some((count) => count > 0)) {
    console.log("[setupProviderAuth] Loaded MCP configs", mcpConfigCounts);
  }

  // Resolve provider overrides into the shape expected by environment functions
  const registry = getProviderRegistry();
  const overrideMapped = mapProviderOverrides(providerOverrides);

  // Shell wrappers disabled by default - must be explicitly enabled in workspace settings
  const enableShellWrappers = workspaceSettings?.enableShellWrappers ?? false;

  // --- Claude (Anthropic) auth ---
  try {
    const hasClaudeKeys =
      apiKeys.ANTHROPIC_API_KEY || apiKeys.CLAUDE_CODE_OAUTH_TOKEN;
    if (hasClaudeKeys) {
      const resolvedClaude = registry.resolveForAgent(
        "claude/opus-4.6",
        overrideMapped,
      );

      // Run full environment setup (hooks, memory, MCP, settings.json)
      // If no taskRunJwt, bypass proxy to avoid empty x-cmux-token header failures
      const shouldBypassProxy =
        workspaceSettings?.bypassAnthropicProxy ?? !options.taskRunJwt;
      const claudeEnvResult = await getClaudeEnvironment({
        taskRunId: options.taskRunId || "",
        taskRunJwt: options.taskRunJwt || "",
        agentName: options.agentName,
        prompt: "",
        apiKeys,
        mcpServerConfigs: mcpConfigs.claude,
        callbackUrl: options.callbackUrl,
        previousKnowledge: options.previousKnowledge ?? undefined,
        previousMailbox: options.previousMailbox ?? undefined,
        workspaceSettings: {
          bypassAnthropicProxy: shouldBypassProxy,
        },
        providerConfig: resolvedClaude?.isOverridden
          ? {
              baseUrl: resolvedClaude.baseUrl,
              customHeaders: resolvedClaude.customHeaders,
              apiFormat: resolvedClaude.apiFormat,
              isOverridden: true,
            }
          : undefined,
        agentConfigs,
        // Permission deny rules from Convex - head agents skip these
        isOrchestrationHead: options.isOrchestrationHead,
        permissionDenyRules,
        enableShellWrappers,
        orchestrationEnv: options.isOrchestrationHead
          ? {
              CMUX_CALLBACK_URL: options.callbackUrl,
            }
          : undefined,
      });

      await applyEnvironmentResult(
        instance,
        claudeEnvResult,
        "setupProviderAuth:claude",
      );

      // Also apply API keys (OAuth token or API key injection)
      const applyClaudeKeys = createApplyClaudeApiKeys();
      const claudeKeysResult = await applyClaudeKeys(apiKeys);
      await applyEnvironmentResult(
        instance,
        claudeKeysResult,
        "setupProviderAuth:claude-keys",
      );

      configuredProviders.push("claude");
      console.log("[setupProviderAuth] Claude provider auth configured");
    }
  } catch (error) {
    console.error("[setupProviderAuth] Failed to set up Claude auth:", error);
  }

  // --- Codex (OpenAI) auth ---
  try {
    const hasCodexKeys = apiKeys.OPENAI_API_KEY || apiKeys.CODEX_AUTH_JSON;
    if (hasCodexKeys) {
      const resolvedOpenAI = registry.resolveForAgent(
        "codex/gpt-5.2-codex-xhigh",
        overrideMapped,
      );

      // Build provider config from providerOverrides OR apiKeys.OPENAI_BASE_URL fallback
      // Settings UI saves base URLs to apiKeys table, so check both sources
      const openaiProviderConfig = buildOpenAiProviderConfig(
        resolvedOpenAI,
        apiKeys.OPENAI_BASE_URL,
      );

      // Run full environment setup (notify hooks, config.toml, memory, MCP)
      const codexEnvResult = await getOpenAIEnvironment({
        taskRunId: options.taskRunId || "",
        taskRunJwt: options.taskRunJwt || "",
        agentName: options.agentName,
        prompt: "",
        apiKeys,
        mcpServerConfigs: mcpConfigs.codex,
        callbackUrl: options.callbackUrl,
        previousKnowledge: options.previousKnowledge ?? undefined,
        previousMailbox: options.previousMailbox ?? undefined,
        providerConfig: openaiProviderConfig,
        agentConfigs,
        enableShellWrappers,
      });

      await applyEnvironmentResult(
        instance,
        codexEnvResult,
        "setupProviderAuth:codex",
      );

      // Also apply API keys (auth.json or env var injection)
      const codexKeysResult = applyCodexApiKeys(apiKeys);
      await applyEnvironmentResult(
        instance,
        codexKeysResult,
        "setupProviderAuth:codex-keys",
      );

      configuredProviders.push("codex");
      console.log("[setupProviderAuth] Codex provider auth configured");
    }
  } catch (error) {
    console.error("[setupProviderAuth] Failed to set up Codex auth:", error);
  }

  // --- OpenCode auth ---
  try {
    const hasOpencodeKeys =
      apiKeys.XAI_API_KEY ||
      apiKeys.ANTHROPIC_API_KEY ||
      apiKeys.OPENAI_API_KEY ||
      apiKeys.OPENROUTER_API_KEY;
    if (hasOpencodeKeys) {
      const opencodeEnvResult = await getOpencodeEnvironment({
        taskRunId: options.taskRunId || "",
        taskRunJwt: options.taskRunJwt || "",
        agentName: options.agentName,
        prompt: "",
        apiKeys,
        mcpServerConfigs: mcpConfigs.opencode,
        callbackUrl: options.callbackUrl,
        previousKnowledge: options.previousKnowledge ?? undefined,
        previousMailbox: options.previousMailbox ?? undefined,
        enableShellWrappers,
      });

      await applyEnvironmentResult(
        instance,
        opencodeEnvResult,
        "setupProviderAuth:opencode",
      );

      configuredProviders.push("opencode");
      console.log("[setupProviderAuth] OpenCode provider auth configured");
    }
  } catch (error) {
    console.error("[setupProviderAuth] Failed to set up OpenCode auth:", error);
  }

  return { providers: configuredProviders };
}

// ============================================================================
// Instance Ownership Verification
// ============================================================================

/**
 * Cmux instance metadata stored in Morph instance.metadata
 */
export interface CmuxInstanceMetadata {
  app?: string;
  userId?: string;
  teamId?: string;
}

/**
 * Result of instance ownership verification
 */
export type VerifyInstanceOwnershipResult =
  | { authorized: true; instanceId: string }
  | { authorized: false; status: 403 | 404; message: string };

/**
 * Verify that a user owns or has team access to a Morph instance.
 * Checks instance metadata for cmux app prefix and user/team ownership.
 */
export async function verifyInstanceOwnership(
  morphClient: MorphCloudClient,
  instanceId: string,
  userId: string,
  checkTeamMembership: () => Promise<{ teamId: string }[]>
): Promise<VerifyInstanceOwnershipResult> {
  let instance;
  try {
    instance = await morphClient.instances.get({ instanceId });
  } catch {
    return { authorized: false, status: 404, message: "Instance not found" };
  }

  const meta = instance.metadata as CmuxInstanceMetadata | undefined;

  // Verify the instance belongs to cmux (accepts cmux, cmux-dev, cmux-preview, etc.)
  if (!meta?.app?.startsWith("cmux")) {
    return { authorized: false, status: 404, message: "Instance not found" };
  }

  // Check direct ownership
  const isOwner = meta.userId === userId;
  if (isOwner) {
    return { authorized: true, instanceId };
  }

  // Check team membership if instance has a teamId
  if (meta.teamId) {
    try {
      const memberships = await checkTeamMembership();
      const isTeamMember = memberships.some((m) => m.teamId === meta.teamId);
      if (isTeamMember) {
        return { authorized: true, instanceId };
      }
    } catch {
      // Failed to check team membership - continue to deny
    }
  }

  return {
    authorized: false,
    status: 403,
    message: "Forbidden - not authorized to access this instance",
  };
}
