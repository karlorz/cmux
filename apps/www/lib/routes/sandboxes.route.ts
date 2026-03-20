import {
  getUserFromRequest,
} from "@/lib/utils/auth";
import { getConvex, getConvexAdmin, type ConvexAdminClient } from "@/lib/utils/get-convex";
import { generateGitHubInstallationToken } from "@/lib/utils/github-app-token";
import { selectGitIdentity } from "@/lib/utils/gitIdentity";
import { stackServerAppJs } from "@/lib/utils/stack";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { env } from "@/lib/utils/www-env";
import { api, internal } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { DEFAULT_MORPH_SNAPSHOT_ID } from "@/lib/utils/morph-defaults";
import { parseGithubRepoUrl } from "@cmux/shared/utils/parse-github-repo-url";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { MorphCloudClient } from "morphcloud";
import { getPveLxcClient, type PveLxcInstance } from "@/lib/utils/pve-lxc-client";
import {
  type SandboxInstance,
  wrapMorphInstance,
  wrapPveLxcInstance,
} from "@/lib/utils/sandbox-instance";
import {
  getInstanceById,
} from "./sandboxes/provider-dispatch";
import { getActiveSandboxProvider } from "@/lib/utils/sandbox-provider";
import { loadEnvironmentEnvVars } from "./sandboxes/environment";
import {
  configureGithubAccess,
  configureGitIdentity,
  fetchGitIdentityInputs,
} from "./sandboxes/git";
import type { HydrateRepoConfig } from "./sandboxes/hydration";
import { hydrateWorkspace } from "./sandboxes/hydration";
import { resolveTeamAndSnapshot } from "./sandboxes/snapshot";
import {
  allocateScriptIdentifiers,
  runMaintenanceAndDevScripts,
} from "./sandboxes/startDevAndMaintenanceScript";
import {
  encodeEnvContentForEnvctl,
  envctlLoadCommand,
} from "./utils/ensure-env-vars";
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

/**
 * Create a MorphCloudClient instance.
 * Throws if MORPH_API_KEY is not configured.
 */
function getMorphClient(): MorphCloudClient {
  if (!env.MORPH_API_KEY) {
    throw new Error("Morph API key not configured");
  }
  return new MorphCloudClient({ apiKey: env.MORPH_API_KEY });
}

/**
 * Get MorphCloudClient if configured, or null for PVE-only deployments.
 * Use with getInstanceById() which handles null Morph client for PVE instances.
 */
function getMorphClientOrNull(): MorphCloudClient | null {
  if (!env.MORPH_API_KEY) {
    return null;
  }
  return new MorphCloudClient({ apiKey: env.MORPH_API_KEY });
}

function concatConfigBlocks(
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

// Provider dispatch helpers imported from ./sandboxes/provider-dispatch

/**
 * Wait for the VSCode server to be ready by polling the service URL.
 * This prevents "upstream connect error" when the iframe loads before the server is ready.
 */
async function waitForVSCodeReady(
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
async function waitForWorkerReady(
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
function getSandboxStartErrorMessage(error: unknown): string {
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
async function writeFilesToSandbox(
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
async function applyEnvironmentResult(
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
 * Set up provider auth (Claude + Codex) on a sandbox instance.
 * Fetches API keys, provider overrides, and workspace settings from Convex,
 * then applies full environment setup for both Claude and Codex CLIs.
 *
 * This is non-fatal: failures are logged but do not block sandbox creation.
 */
function mapProviderOverrides(
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

type EnvironmentProviderConfig = NonNullable<
  Pick<
    Parameters<NonNullable<(typeof AGENT_CONFIGS)[number]["environment"]>>[0],
    "providerConfig"
  >["providerConfig"]
>;

function buildProviderConfig(
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

function buildOpenAiProviderConfig(
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

async function getSandboxAgentConfigs(
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

async function getSandboxMcpConfigs(
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

function getEnvironmentOverridesForAgent(
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
        workspaceSettings: {
          bypassAnthropicProxy:
            options.workspaceSettings?.bypassAnthropicProxy ?? !options.taskRunJwt,
        },
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
    case "openrouter":
      return {
        mcpServerConfigs: options.mcpConfigs.opencode,
      };
    case "gemini":
      return {
        mcpServerConfigs: options.mcpConfigs.gemini,
      };
    default:
      return {
        mcpServerConfigs: [],
      };
  }
}

async function setupProviderAuth(
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

// NOTE: CmuxInstanceMetadata, VerifyInstanceOwnershipResult, verifyInstanceOwnership moved to sandboxes-routes/_helpers.ts

export const sandboxesRouter = new OpenAPIHono();

const StartSandboxBody = z
  .object({
    teamSlugOrId: z.string(),
    environmentId: z.string().optional(),
    snapshotId: z.string().optional(),
    ttlSeconds: z
      .number()
      .optional()
      .default(60 * 60),
    metadata: z.record(z.string(), z.string()).optional(),
    taskRunId: z.string().optional(),
    taskRunJwt: z.string().optional(),
    isCloudWorkspace: z.boolean().optional(),
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

const StartSandboxResponse = z
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

// NOTE: UpdateSandboxEnvBody/UpdateSandboxEnvResponse moved to sandboxes-routes/_helpers.ts

// Start a new sandbox (currently Morph-backed)
sandboxesRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/sandboxes/start",
    tags: ["Sandboxes"],
    summary: "Start a sandbox environment",
    request: {
      body: {
        content: {
          "application/json": {
            schema: StartSandboxBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: StartSandboxResponse,
          },
        },
        description: "Sandbox started successfully",
      },
      401: { description: "Unauthorized" },
      500: { description: "Failed to start sandbox" },
    },
  }),
  async (c) => {
    // Support both Stack Auth (web/CLI) and JWT authentication (agent spawning)
    const user = await getUserFromRequest(c.req.raw);
    let accessToken: string | null = null;
    let isJwtAuth = false;
    let _jwtPayload: { taskRunId: string; teamId: string; userId: string } | null = null;

    if (user) {
      // Stack Auth flow - use user's access token
      const authJson = await user.getAuthJson();
      accessToken = authJson.accessToken || null;
    }

    // Fall back to JWT auth if Stack Auth not available
    if (!accessToken) {
      const { extractTaskRunJwtFromRequest, verifyTaskRunJwt } = await import("@/lib/utils/jwt-task-run");
      const jwtToken = extractTaskRunJwtFromRequest(c.req.raw);
      if (jwtToken) {
        const payload = await verifyTaskRunJwt(jwtToken);
        if (payload) {
          isJwtAuth = true;
          _jwtPayload = payload;
          console.log("[sandboxes.start] Using JWT auth", {
            taskRunId: payload.taskRunId,
            teamId: payload.teamId,
          });
        }
      }
    }

    if (!accessToken && !isJwtAuth) {
      return c.text("Unauthorized", 401);
    }

    const githubAccessTokenPromise = (async () => {
      if (user) {
        const githubAccount = await user.getConnectedAccount("github");
        if (!githubAccount) {
          return {
            githubAccessTokenError: "GitHub account not found",
            githubAccessToken: null,
          } as const;
        }
        const { accessToken: githubAccessToken } =
          await githubAccount.getAccessToken();
        if (!githubAccessToken) {
          return {
            githubAccessTokenError: "GitHub access token not found",
            githubAccessToken: null,
          } as const;
        }

        return { githubAccessTokenError: null, githubAccessToken } as const;
      }

      // JWT auth path - look up GitHub token from Convex via team/user
      // For now, return null - sub-agents don't need GitHub write access
      return {
        githubAccessTokenError: "JWT auth - GitHub token not available",
        githubAccessToken: null,
      } as const;
    })();

    const body = c.req.valid("json");
    try {
      console.log("[sandboxes.start] incoming", {
        teamSlugOrId: body.teamSlugOrId,
        hasEnvId: Boolean(body.environmentId),
        hasSnapshotId: Boolean(body.snapshotId),
        repoUrl: body.repoUrl,
        branch: body.branch,
        authMethod: isJwtAuth ? "jwt" : "stack-auth",
      });
    } catch {
      /* noop */
    }

    try {
      // For JWT auth, use admin client; for Stack Auth, use user's access token
      // The admin client has same query/mutation interface, just cast for type compatibility
      // Keep raw admin client reference for internal queries (preserves `any` types)
      let rawAdminClient: ConvexAdminClient | null = null;
      const convex = isJwtAuth
        ? (() => {
            const admin = getConvexAdmin();
            if (!admin) {
              throw new Error("Admin client not available for JWT auth");
            }
            rawAdminClient = admin;
            // Cast admin client to match expected interface (same query/mutation methods)
            return admin as unknown as ReturnType<typeof getConvex>;
          })()
        : getConvex({ accessToken: accessToken! });

      // For JWT auth, we need to verify team exists and get team info via admin client
      // The JWT already contains teamId which we trust after verification
      let preVerifiedTeam: { uuid: string; slug: string | null; displayName: string | null; name: string | null } | undefined;
      if (isJwtAuth && _jwtPayload && rawAdminClient) {
        // Fetch team info using admin client (internal query)
        // The teamSlugOrId from body should match JWT's teamId for security
        // Use raw admin client which has `any` types to avoid TS errors with internal queries
        const teamInfo = await rawAdminClient.query(internal.teams.getBySlugOrIdInternal, {
          slugOrId: body.teamSlugOrId,
        }) as { teamId: string; slug: string | null; displayName: string | null; name: string | null; profileImageUrl: string | null } | null;
        if (!teamInfo) {
          console.error("[sandboxes.start] Team not found for JWT auth", {
            teamSlugOrId: body.teamSlugOrId,
            jwtTeamId: _jwtPayload.teamId,
          });
          return c.text("Team not found", 404);
        }
        // Verify the team matches what's in the JWT
        if (teamInfo.teamId !== _jwtPayload.teamId) {
          console.error("[sandboxes.start] Team mismatch with JWT", {
            requestTeamId: teamInfo.teamId,
            jwtTeamId: _jwtPayload.teamId,
          });
          return c.text("Forbidden: Team mismatch", 403);
        }
        preVerifiedTeam = {
          uuid: teamInfo.teamId,
          slug: teamInfo.slug,
          displayName: teamInfo.displayName,
          name: teamInfo.name,
        };
        console.log("[sandboxes.start] JWT auth team verified", {
          teamId: preVerifiedTeam.uuid,
          slug: preVerifiedTeam.slug,
        });
      }

      const {
        team,
        provider,
        resolvedSnapshotId,
        resolvedTemplateVmid,
        environmentDataVaultKey,
        environmentMaintenanceScript,
        environmentDevScript,
        environmentSelectedRepos,
      } = await resolveTeamAndSnapshot({
        req: c.req.raw,
        convex,
        teamSlugOrId: body.teamSlugOrId,
        environmentId: body.environmentId,
        snapshotId: body.snapshotId,
        preVerifiedTeam,
      });

      const environmentEnvVarsPromise = environmentDataVaultKey
        ? loadEnvironmentEnvVars(environmentDataVaultKey)
        : Promise.resolve<string | null>(null);

      // Use body.repoUrl if provided, otherwise fall back to first selectedRepo from environment
      const repoUrl = body.repoUrl ?? environmentSelectedRepos?.[0] ?? null;
      if (!body.repoUrl && environmentSelectedRepos?.[0]) {
        console.log(`[sandboxes.start] Using environment selectedRepo: ${repoUrl}`);
      }
      // Parse repo URL once if provided
      const parsedRepoUrl = repoUrl ? parseGithubRepoUrl(repoUrl) : null;

      const workspaceConfigRepoInputs = body.environmentId
        ? environmentSelectedRepos ?? []
        : parsedRepoUrl
          ? [parsedRepoUrl.fullName]
          : [];
      const workspaceConfigRepos = Array.from(
        new Set(
          workspaceConfigRepoInputs.flatMap((repoInput) => {
            const parsedRepo = parseGithubRepoUrl(repoInput);
            if (!parsedRepo) {
              console.warn(
                `[sandboxes.start] Skipping invalid workspace config repo "${repoInput}"`,
              );
              return [];
            }
            return [parsedRepo.fullName];
          }),
        ),
      );

      const workspaceConfigs = await Promise.all(
        workspaceConfigRepos.map(async (projectFullName) => {
          try {
            const config = await convex.query(api.workspaceConfigs.get, {
              teamSlugOrId: body.teamSlugOrId,
              projectFullName,
            });
            if (!config) {
              return null;
            }
            const envVarsContent = config.dataVaultKey
              ? await loadEnvironmentEnvVars(config.dataVaultKey)
              : null;
            console.log(`[sandboxes.start] Loaded workspace config for ${projectFullName}`, {
              hasMaintenanceScript: Boolean(config.maintenanceScript),
              hasEnvVars: Boolean(envVarsContent),
            });
            return {
              projectFullName,
              maintenanceScript: config.maintenanceScript ?? undefined,
              envVarsContent: envVarsContent ?? undefined,
            };
          } catch (error) {
            console.error(
              `[sandboxes.start] Failed to load workspace config for ${projectFullName}`,
              error,
            );
            return null;
          }
        }),
      );
      const loadedWorkspaceConfigs = workspaceConfigs.flatMap((config) =>
        config ? [config] : [],
      );
      const workspaceMaintenanceScript = concatConfigBlocks(
        loadedWorkspaceConfigs.map((config) => config.maintenanceScript),
        "\n\n",
      );
      const workspaceEnvVarsContent = concatConfigBlocks(
        loadedWorkspaceConfigs.map((config) => config.envVarsContent),
        "\n",
      );

      const maintenanceScript = concatConfigBlocks(
        [workspaceMaintenanceScript, environmentMaintenanceScript],
        "\n\n",
      );
      const devScript = environmentDevScript ?? null;

      const isCloudWorkspace =
        body.isCloudWorkspace !== undefined
          ? body.isCloudWorkspace
          : !body.taskRunId;

      const scriptIdentifiers =
        maintenanceScript || devScript
          ? allocateScriptIdentifiers()
          : null;

      const gitIdentityPromise = githubAccessTokenPromise.then(
        ({ githubAccessToken }) => {
          if (!githubAccessToken) {
            throw new Error("GitHub access token not found");
          }
          return fetchGitIdentityInputs(convex, githubAccessToken);
        },
      );

      // Start the sandbox using the appropriate provider
      let instance: SandboxInstance | null = null;
      let rawPveLxcInstance: PveLxcInstance | null = null;
      let usedWarmPool = false;
      let warmPoolRepoUrl: string | undefined;
      let warmPoolBranch: string | undefined;

      if (provider === "pve-lxc") {
        // Proxmox VE LXC provider
        console.log(`[sandboxes.start] Starting PVE LXC sandbox with snapshot ${resolvedSnapshotId}`);
        const pveClient = getPveLxcClient();
        rawPveLxcInstance = await pveClient.instances.start({
          snapshotId: resolvedSnapshotId,
          templateVmid: resolvedTemplateVmid,
          ttlSeconds: body.ttlSeconds ?? 60 * 60,
          ttlAction: "pause",
          metadata: {
            app: "cmux",
            teamId: team.uuid,
            userId: user?.id ?? _jwtPayload?.userId ?? "unknown",
            ...(body.environmentId ? { environmentId: body.environmentId } : {}),
            ...(body.metadata || {}),
          },
        });
        instance = wrapPveLxcInstance(rawPveLxcInstance);
        console.log(`[sandboxes.start] PVE LXC sandbox started: ${instance.id}`);
      } else {
        // Morph provider (default)
        const client = getMorphClient();

        if (!body.environmentId) {
          try {
            const claimed = await convex.mutation(api.warmPool.claimInstance, {
              teamId: team.uuid,
              repoUrl: repoUrl ?? undefined,
              branch: body.branch ?? undefined,
              taskRunId: body.taskRunId || "",
            });

            if (claimed) {
              console.log(
                `[sandboxes.start] Claimed warm pool instance ${claimed.instanceId}`,
              );
              let claimedMorphInstance = await client.instances.get({
                instanceId: claimed.instanceId,
              });
              if (claimedMorphInstance.networking.httpServices.length === 0) {
                claimedMorphInstance = await client.instances.get({
                  instanceId: claimed.instanceId,
                });
              }

              const claimedWrapped = wrapMorphInstance(claimedMorphInstance);
              const claimedExposed = claimedWrapped.networking.httpServices;
              const claimedVscodeService = claimedExposed.find(
                (service) => service.port === 39378,
              );
              const claimedWorkerService = claimedExposed.find(
                (service) => service.port === 39377,
              );
              if (claimedVscodeService && claimedWorkerService) {
                instance = claimedWrapped;
                usedWarmPool = true;
                warmPoolRepoUrl = claimed.repoUrl;
                warmPoolBranch = claimed.branch;
                void (async () => {
                  await instance.setWakeOn(true, true);
                })();
              } else {
                console.warn(
                  `[sandboxes.start] Warm pool instance ${claimed.instanceId} missing services, falling back to on-demand start`,
                );
              }
            }
          } catch (error) {
            console.error(
              "[sandboxes.start] Warm pool claim failed, falling back to on-demand start",
              error,
            );
          }
        }

        if (!usedWarmPool) {
          const morphInstance = await client.instances.start({
            snapshotId: resolvedSnapshotId,
            ttlSeconds: body.ttlSeconds ?? 60 * 60,
            ttlAction: "pause",
            metadata: {
              app: "cmux",
              teamId: team.uuid,
              ...(body.environmentId ? { environmentId: body.environmentId } : {}),
              ...(body.metadata || {}),
            },
          });
          instance = wrapMorphInstance(morphInstance);
          void (async () => {
            await instance.setWakeOn(true, true);
          })();
        }
      }

      if (!instance) {
        return c.text("Failed to start sandbox instance", 500);
      }

      // Record sandbox creation in Convex for activity tracking
      // This enables the maintenance cron to properly track and garbage collect instances
      try {
        await convex.mutation(api.sandboxInstances.recordCreate, {
          instanceId: instance.id,
          provider: provider === "pve-lxc" ? "pve-lxc" : "morph",
          vmid: rawPveLxcInstance?.vmid,
          hostname: rawPveLxcInstance?.networking.hostname,
          snapshotId: resolvedSnapshotId,
          snapshotProvider: provider === "pve-lxc" ? "pve-lxc" : "morph",
          templateVmid: resolvedTemplateVmid,
          teamSlugOrId: body.teamSlugOrId,
          isCloudWorkspace,
        });
        console.log(`[sandboxes.start] Recorded instance creation for ${instance.id}`);
      } catch (error) {
        // Non-fatal: instance is created, but activity tracking may not work
        console.error(
          "[sandboxes.start] Failed to record instance creation (non-fatal):",
          error,
        );
      }

      // SDK bug: instances.start() returns empty httpServices array
      // Re-fetch instance to get the actual networking data
      let refreshedInstance: SandboxInstance = instance;
      if (instance.networking.httpServices.length === 0) {
        refreshedInstance = await getInstanceById(instance.id, getMorphClientOrNull());
      }

      const exposed = refreshedInstance.networking.httpServices;
      const vscodeService = exposed.find((service) => service.port === 39378);
      // PVE-LXC uses port 39376 for Node.js worker (Go worker uses 39377)
      // Morph uses port 39377 for Node.js worker
      const workerPort = provider === "pve-lxc" ? 39376 : 39377;
      const workerService = exposed.find((service) => service.port === workerPort);
      const vncService = exposed.find((service) => service.port === 39380);
      const xtermService = exposed.find((service) => service.port === 39383);
      if (!vscodeService || !workerService) {
        await instance.stop().catch((stopError) => {
          console.error(`[sandboxes.start] Failed to stop instance ${instance.id}:`, stopError);
        });
        return c.text("VSCode or worker service not found", 500);
      }

      // Wait for VSCode server to be ready before persisting URL
      // This prevents "upstream connect error" when the frontend loads the iframe
      // before the OpenVSCode server is actually listening
      const vscodeReady = await waitForVSCodeReady(vscodeService.url);
      if (!vscodeReady) {
        console.warn(
          `[sandboxes.start] VSCode server did not become ready within timeout for ${instance.id}, proceeding anyway`,
        );
      } else {
        console.log(
          `[sandboxes.start] VSCode server ready for ${instance.id}`,
        );
      }

      // Wait for Worker socket server to be ready before returning
      // This prevents "Worker socket not available" errors when the agent spawner
      // tries to connect before the worker service is actually listening
      const workerReady = await waitForWorkerReady(workerService.url);
      if (!workerReady) {
        console.warn(
          `[sandboxes.start] Worker server did not become ready within timeout for ${instance.id}, proceeding anyway`,
        );
      } else {
        console.log(
          `[sandboxes.start] Worker server ready for ${instance.id}`,
        );
      }

      // Persist VSCode URLs to Convex once the server is ready
      // Status is "starting" to indicate hydration is still in progress
      let vscodePersisted = false;
      if (body.taskRunId) {
        try {
          await convex.mutation(api.taskRuns.updateVSCodeInstance, {
            teamSlugOrId: body.teamSlugOrId,
            id: body.taskRunId as Id<"taskRuns">,
            vscode: {
              provider: provider === "pve-lxc" ? "pve-lxc" : "morph",
              containerName: instance.id,
              status: "starting",
              url: vscodeService.url,
              workspaceUrl: `${vscodeService.url}/?folder=/root/workspace`,
              vncUrl: vncService?.url,
              xtermUrl: xtermService?.url,
              startedAt: Date.now(),
            },
          });
          vscodePersisted = true;
          console.log(
            `[sandboxes.start] Persisted VSCode info for ${body.taskRunId}`,
          );
        } catch (error) {
          console.error(
            "[sandboxes.start] Failed to persist VSCode info (non-fatal):",
            error,
          );
        }

        // Store environment repos as discovered repos for git diff
        // This allows the git diff UI to work immediately without waiting for discovery
        if (environmentSelectedRepos && environmentSelectedRepos.length > 0) {
          try {
            await convex.mutation(api.taskRuns.updateDiscoveredRepos, {
              teamSlugOrId: body.teamSlugOrId,
              runId: body.taskRunId as Id<"taskRuns">,
              discoveredRepos: environmentSelectedRepos,
            });
            console.log(
              `[sandboxes.start] Stored discovered repos for ${body.taskRunId}:`,
              environmentSelectedRepos
            );
          } catch (error) {
            console.error(
              "[sandboxes.start] Failed to store discovered repos (non-fatal):",
              error,
            );
          }
        }
      }

      // Get environment variables from the environment if configured
      const environmentEnvVarsContent = await environmentEnvVarsPromise;

      // Prepare environment variables including task JWT if present
      // Workspace config env vars are the base layer, environment vars override later.
      let envVarsToApply =
        concatConfigBlocks(
          [workspaceEnvVarsContent, environmentEnvVarsContent],
          "\n",
        ) ?? "";

      // Add CMUX task-related env vars if present
      if (body.taskRunId) {
        envVarsToApply += `\nCMUX_TASK_RUN_ID="${body.taskRunId}"`;
      }
      if (body.taskRunJwt) {
        envVarsToApply += `\nCMUX_TASK_RUN_JWT="${body.taskRunJwt}"`;
        // Also add the JWT secret so the worker can verify tokens for image uploads
        // Only add if the secret is configured to avoid injecting "undefined" as a literal value
        if (env.CMUX_TASK_RUN_JWT_SECRET) {
          envVarsToApply += `\nCMUX_TASK_RUN_JWT_SECRET="${env.CMUX_TASK_RUN_JWT_SECRET}"`;
        } else {
          console.warn(
            "[sandboxes.start] CMUX_TASK_RUN_JWT_SECRET not configured, image uploads will not work",
          );
        }
      }

      // Apply all environment variables if any
      if (envVarsToApply.trim().length > 0) {
        try {
          const encodedEnv = encodeEnvContentForEnvctl(envVarsToApply);
          const loadRes = await instance.exec(envctlLoadCommand(encodedEnv));
          if (loadRes.exit_code === 0) {
            console.log(
              `[sandboxes.start] Applied environment variables via envctl`,
              {
                hasEnvironmentVars: Boolean(environmentEnvVarsContent),
                hasWorkspaceVars: Boolean(workspaceEnvVarsContent),
                hasTaskRunId: Boolean(body.taskRunId),
                hasTaskRunJwt: Boolean(body.taskRunJwt),
              },
            );
          } else {
            console.error(
              `[sandboxes.start] Env var bootstrap failed exit=${loadRes.exit_code} stderr=${(loadRes.stderr || "").slice(0, 200)}`,
            );
          }
        } catch (error) {
          console.error(
            "[sandboxes.start] Failed to apply environment variables",
            error,
          );
        }
      }

      // Fetch user API keys early so they're available for provider auth and agent startup
      const userApiKeysPromise = convex
        .query(api.apiKeys.getAllForAgents, {
          teamSlugOrId: body.teamSlugOrId,
        })
        .catch((err: unknown) => {
          console.error(
            "[sandboxes.start] Failed to fetch API keys (non-fatal):",
            err,
          );
          return {} as Record<string, string>;
        });

      // Set up provider auth (Claude + Codex) so CLIs work out of the box
      // This runs for all sandbox starts (web UI cloud workspace, task create, devsh)
      const providerAuthPromise = (async () => {
        try {
          const callbackUrl =
            env.NEXT_PUBLIC_CONVEX_URL || "http://localhost:9779";
          const [previousKnowledge, previousMailbox] = await Promise.all([
            convex
              .query(api.agentMemoryQueries.getLatestTeamKnowledge, {
                teamSlugOrId: body.teamSlugOrId,
              })
              .catch((err: unknown) => {
                console.error(
                  "[sandboxes.start] Failed to fetch previous team knowledge (non-fatal):",
                  err,
                );
                return null;
              }),
            convex
              .query(api.agentMemoryQueries.getLatestTeamMailbox, {
                teamSlugOrId: body.teamSlugOrId,
              })
              .catch((err: unknown) => {
                console.error(
                  "[sandboxes.start] Failed to fetch previous team mailbox (non-fatal):",
                  err,
                );
                return null;
              }),
          ]);
          const result = await setupProviderAuth(instance, convex, {
            teamSlugOrId: body.teamSlugOrId,
            projectFullName: parsedRepoUrl?.fullName,
            taskRunId: body.taskRunId || undefined,
            taskRunJwt: body.taskRunJwt || undefined,
            callbackUrl,
            previousKnowledge,
            previousMailbox,
            agentName: body.agentName,
          });
          if (result.providers.length > 0) {
            console.log(
              `[sandboxes.start] Provider auth configured: ${result.providers.join(", ")}`,
            );
          }
        } catch (error) {
          console.error(
            "[sandboxes.start] Provider auth setup failed (non-fatal):",
            error,
          );
        }
      })();

      const configureGitIdentityTask = gitIdentityPromise
        .then(([who, gh]) => {
          const { name, email } = selectGitIdentity(who, gh);
          return configureGitIdentity(instance, { name, email });
        })
        .catch((error) => {
          console.log(
            `[sandboxes.start] Failed to configure git identity; continuing...`,
            error,
          );
        });

      const { githubAccessToken, githubAccessTokenError } =
        await githubAccessTokenPromise;
      // For JWT auth without repo URL, GitHub credentials are not required
      // The sub-agent sandbox will have the workspace pre-configured by the head agent
      const needsGitHubToken = parsedRepoUrl != null;
      if (githubAccessTokenError && needsGitHubToken) {
        console.error(
          `[sandboxes.start] GitHub access token error: ${githubAccessTokenError}`,
        );
        return c.text("Failed to resolve GitHub credentials", 401);
      }
      if (githubAccessTokenError) {
        console.log(
          `[sandboxes.start] GitHub access token not available (${githubAccessTokenError}), but no repo URL specified - continuing`,
        );
      }

      // Try to use GitHub App installation token for better permission scope.
      // The user's OAuth token from Stack Auth may not have 'repo' scope needed for private repos.
      let gitAuthToken = githubAccessToken;
      if (parsedRepoUrl) {
        try {
          // Look up GitHub App installation for the repo's owner
          const connections = await convex.query(api.github.listProviderConnections, {
            teamSlugOrId: body.teamSlugOrId,
          });
          const targetConnection = connections.find(
            (co: { isActive?: boolean; accountLogin?: string | null }) =>
              co.isActive &&
              co.accountLogin?.toLowerCase() === parsedRepoUrl.owner.toLowerCase()
          );
          if (targetConnection) {
            console.log(
              `[sandboxes.start] Found GitHub App installation ${targetConnection.installationId} for ${parsedRepoUrl.owner}`
            );
            const appToken = await generateGitHubInstallationToken({
              installationId: targetConnection.installationId,
              repositories: [parsedRepoUrl.fullName],
              permissions: {
                contents: "write",
                metadata: "read",
                // Required for pushing workflow files (.github/workflows/*)
                // Without this, pushes containing workflow files are rejected
                workflows: "write",
                // Required for auto-PR creation via gh pr create
                pull_requests: "write",
              },
            });
            gitAuthToken = appToken;
            console.log(
              `[sandboxes.start] Using GitHub App token for git authentication`
            );
          } else {
            console.log(
              `[sandboxes.start] No GitHub App installation found for ${parsedRepoUrl.owner}, using user OAuth token`
            );
          }
        } catch (error) {
          console.error(
            `[sandboxes.start] Failed to get GitHub App token, falling back to user OAuth:`,
            error
          );
        }
      }

      // Configure GitHub access only if we have a token
      // For JWT auth without repo URL, GitHub token may not be available
      if (gitAuthToken) {
        await configureGithubAccess(instance, gitAuthToken);
      } else {
        console.log(`[sandboxes.start] Skipping GitHub access configuration - no token available`);
      }

      // Only skip hydration if both repo URL and branch match the warm pool instance
      // This ensures we don't use wrong branch when user prewarmed with different branch
      const requestedBranch = body.branch ?? undefined;
      const skipHydration =
        usedWarmPool &&
        typeof repoUrl === "string" &&
        repoUrl.length > 0 &&
        warmPoolRepoUrl === repoUrl &&
        warmPoolBranch === requestedBranch;
      if (skipHydration) {
        console.log(
          `[sandboxes.start] Skipping hydration - repo and branch already cloned in warm pool instance ${instance.id}`,
        );
      } else {
        let repoConfig: HydrateRepoConfig | undefined;
        if (repoUrl) {
          console.log(`[sandboxes.start] Hydrating repo for ${instance.id}`);
          if (!parsedRepoUrl) {
            return c.text("Unsupported repo URL; expected GitHub URL", 400);
          }
          console.log(`[sandboxes.start] Parsed owner/repo: ${parsedRepoUrl.fullName}`);

          // Use authenticated URL for cloning when token available (required for private repos)
          const authenticatedGitUrl = gitAuthToken
            ? `https://x-access-token:${gitAuthToken}@github.com/${parsedRepoUrl.owner}/${parsedRepoUrl.repo}.git`
            : parsedRepoUrl.gitUrl;
          const maskedGitUrl = gitAuthToken
            ? `https://x-access-token:***@github.com/${parsedRepoUrl.owner}/${parsedRepoUrl.repo}.git`
            : parsedRepoUrl.gitUrl;

          repoConfig = {
            owner: parsedRepoUrl.owner,
            name: parsedRepoUrl.repo,
            repoFull: parsedRepoUrl.fullName,
            cloneUrl: authenticatedGitUrl,
            maskedCloneUrl: maskedGitUrl,
            depth: Math.max(1, Math.floor(body.depth ?? 1)),
            baseBranch: body.branch || "main",
            newBranch: body.newBranch ?? "",
          };
        }

        try {
          await hydrateWorkspace({
            instance,
            repo: repoConfig,
          });
        } catch (error) {
          console.error(`[sandboxes.start] Hydration failed:`, error);
          await instance.stop().catch((stopError) => {
            console.error(`[sandboxes.start] Failed to stop instance ${instance.id} after hydration failure:`, stopError);
          });
          return c.text("Failed to hydrate sandbox", 500);
        }
      }

      // Capture starting commit SHA for diff baseline (after hydration, before agent runs)
      if (body.taskRunId) {
        console.log(
          "[sandboxes.start] Capturing starting commit SHA for taskRunId:",
          body.taskRunId,
        );
        try {
          const execResult = await instance.exec(
            "git -C /root/workspace rev-parse HEAD",
          );
          console.log("[sandboxes.start] git rev-parse HEAD result:", {
            exit_code: execResult.exit_code,
            stdout: execResult.stdout?.substring(0, 50),
          });
          if (execResult.exit_code === 0 && execResult.stdout) {
            const startingCommitSha = execResult.stdout.trim();
            console.log(
              "[sandboxes.start] Starting commit SHA:",
              startingCommitSha,
              "length:",
              startingCommitSha.length,
            );
            if (startingCommitSha.length === 40) {
              console.log(
                "[sandboxes.start] Saving startingCommitSha to Convex:",
                startingCommitSha,
              );
              void convex
                .mutation(api.taskRuns.updateStartingCommitSha, {
                  teamSlugOrId: body.teamSlugOrId,
                  id: body.taskRunId as Id<"taskRuns">,
                  startingCommitSha,
                })
                .catch((error) => {
                  console.error(
                    "[sandboxes.start] Failed to update starting commit SHA:",
                    error,
                  );
                });
            }
          }
        } catch (error) {
          console.error(
            "[sandboxes.start] Failed to capture starting commit SHA:",
            error,
          );
        }
      }

      // Update status to "running" after hydration completes
      if (body.taskRunId && vscodePersisted) {
        void convex
          .mutation(api.taskRuns.updateVSCodeStatus, {
            teamSlugOrId: body.teamSlugOrId,
            id: body.taskRunId as Id<"taskRuns">,
            status: "running",
          })
          .catch((error) => {
            console.error(
              "[sandboxes.start] Failed to update VSCode status to running:",
              error,
            );
          });
      }

      // Populate projectFullName and baseBranch on the task for crown evaluation refresh.
      // This ensures GitHub diff info is available when retrying crown evaluation.
      if (body.taskRunId && parsedRepoUrl) {
        void (async () => {
          try {
            const taskRun = await convex.query(api.taskRuns.get, {
              teamSlugOrId: body.teamSlugOrId,
              id: body.taskRunId as Id<"taskRuns">,
            });
            if (taskRun) {
              await convex.mutation(api.tasks.setProjectAndBranch, {
                teamSlugOrId: body.teamSlugOrId,
                id: taskRun.taskId,
                projectFullName: parsedRepoUrl.fullName,
                baseBranch: body.branch ?? "main",
              });
            }
          } catch (error) {
            console.error(
              "[sandboxes.start] Failed to set project and branch info:",
              error,
            );
          }
        })();
      }

      if (maintenanceScript || devScript) {
        (async () => {
          await runMaintenanceAndDevScripts({
            instance,
            maintenanceScript: maintenanceScript || undefined,
            devScript: devScript || undefined,
            identifiers: scriptIdentifiers ?? undefined,
            convexUrl: env.NEXT_PUBLIC_CONVEX_URL,
            taskRunJwt: body.taskRunJwt || undefined,
            isCloudWorkspace,
          });
        })().catch((error) => {
          console.error(
            "[sandboxes.start] Background script execution failed:",
            error,
          );
        });
      }

      await configureGitIdentityTask;

      // If agent name and prompt are provided, start the agent in the sandbox
      // This is used by CLI task creation to spawn agents without the desktop app
      if (body.agentName && body.prompt) {
        // Ensure provider auth is complete before starting the agent
        await providerAuthPromise;

        const agentConfig = AGENT_CONFIGS.find(
          (a) => a.name === body.agentName
        );
        if (agentConfig) {
          console.log(
            `[sandboxes.start] Starting agent ${body.agentName} with prompt`
          );

          // Get agent environment setup (files, env vars, startup commands)
          if (agentConfig.environment) {
            try {
              const callbackUrl = env.NEXT_PUBLIC_CONVEX_URL || "http://localhost:9779";
              const [resolvedApiKeys, previousKnowledge, previousMailbox] = await Promise.all([
                userApiKeysPromise,
                convex
                  .query(api.agentMemoryQueries.getLatestTeamKnowledge, {
                    teamSlugOrId: body.teamSlugOrId,
                  })
                  .catch((err: unknown) => {
                    console.error(
                      "[sandboxes.start] Failed to fetch previous team knowledge for agent environment (non-fatal):",
                      err,
                    );
                    return null;
                  }),
                convex
                  .query(api.agentMemoryQueries.getLatestTeamMailbox, {
                    teamSlugOrId: body.teamSlugOrId,
                  })
                  .catch((err: unknown) => {
                    console.error(
                      "[sandboxes.start] Failed to fetch previous team mailbox for agent environment (non-fatal):",
                      err,
                    );
                    return null;
                  }),
              ]);
              const [workspaceSettings, providerOverrides, mcpConfigs] =
                await Promise.all([
                  convex
                    .query(api.workspaceSettings.get, {
                      teamSlugOrId: body.teamSlugOrId,
                    })
                    .catch((err: unknown) => {
                      console.error(
                        "[sandboxes.start] Failed to fetch workspace settings for agent environment (non-fatal):",
                        err,
                      );
                      return null;
                    }),
                  convex
                    .query(api.providerOverrides.getForTeam, {
                      teamSlugOrId: body.teamSlugOrId,
                    })
                    .catch((err: unknown) => {
                      console.error(
                        "[sandboxes.start] Failed to fetch provider overrides for agent environment (non-fatal):",
                        err,
                      );
                      return [];
                    }),
                  getSandboxMcpConfigs(convex, {
                    teamSlugOrId: body.teamSlugOrId,
                    projectFullName: parsedRepoUrl?.fullName,
                    logPrefix: "sandboxes.start",
                  }),
                ]);
              const registry = getProviderRegistry();
              const overrideMapped = mapProviderOverrides(providerOverrides);
              const resolvedProvider = registry.resolveForAgent(
                body.agentName,
                overrideMapped,
              );
              const envOverrides = getEnvironmentOverridesForAgent(body.agentName, {
                mcpConfigs,
                workspaceSettings,
                taskRunJwt: body.taskRunJwt,
                resolvedProvider,
                openAiBaseUrl: resolvedApiKeys.OPENAI_BASE_URL,
              });
              console.log("[sandboxes.start] Agent environment overrides", {
                agentName: body.agentName,
                mcpServerConfigCount: envOverrides.mcpServerConfigs?.length ?? 0,
                hasWorkspaceSettings: !!envOverrides.workspaceSettings,
                hasProviderConfig: !!envOverrides.providerConfig,
              });
              const envResult = await agentConfig.environment({
                taskRunId: body.taskRunId || "",
                taskRunJwt: body.taskRunJwt || "",
                agentName: body.agentName,
                prompt: body.prompt,
                apiKeys: resolvedApiKeys,
                callbackUrl,
                previousKnowledge: previousKnowledge ?? undefined,
                previousMailbox: previousMailbox ?? undefined,
                ...envOverrides,
              });

              await applyEnvironmentResult(
                instance,
                envResult,
                "sandboxes.start:agent-env",
              );
            } catch (envError) {
              console.error(
                `[sandboxes.start] Failed to set up agent environment:`,
                envError
              );
              // Continue anyway - the agent might still work
            }
          }

          // Start the agent via worker HTTP API for proper PTY/terminal integration
          const agentCmd = [agentConfig.command, ...agentConfig.args].join(" ");
          const terminalId = `agent-${body.taskRunId || "cli"}`;

          try {
            // Call worker HTTP API to create terminal
            const createTerminalResponse = await fetch(
              `${workerService.url}/api/create-terminal`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  terminalId,
                  taskRunId: body.taskRunId,
                  taskRunJwt: body.taskRunJwt,
                  agentName: agentConfig.name,
                  prompt: body.prompt,
                  ptyCommand: agentCmd,
                  cwd: "/root/workspace",
                  env: {},
                  startupCommands: [],
                  postStartCommands: [],
                  convexUrl: env.NEXT_PUBLIC_CONVEX_URL,
                }),
                signal: AbortSignal.timeout(30000),
              }
            );

            if (createTerminalResponse.ok) {
              const result = await createTerminalResponse.json();
              console.log(
                `[sandboxes.start] Started agent terminal via worker API: ${terminalId}`,
                result
              );
            } else {
              const errorText = await createTerminalResponse.text();
              console.error(
                `[sandboxes.start] Failed to create agent terminal: ${createTerminalResponse.status} ${errorText}`
              );
              // Fall back to tmux if worker API fails
              const fallbackCmd = `tmux new-session -d -s '${terminalId}' -c /root/workspace 'source /etc/profile 2>/dev/null || true; ${agentCmd}'`;
              await instance.exec(fallbackCmd);
              console.log(
                `[sandboxes.start] Fell back to tmux for agent: ${terminalId}`
              );
            }
          } catch (startError) {
            console.error(
              `[sandboxes.start] Failed to start agent via worker API:`,
              startError
            );
            // Fall back to tmux
            try {
              const fallbackCmd = `tmux new-session -d -s '${terminalId}' -c /root/workspace 'source /etc/profile 2>/dev/null || true; ${agentCmd}'`;
              await instance.exec(fallbackCmd);
              console.log(
                `[sandboxes.start] Fell back to tmux for agent: ${terminalId}`
              );
            } catch (fallbackError) {
              console.error(
                `[sandboxes.start] Tmux fallback also failed:`,
                fallbackError
              );
            }
          }
        } else {
          console.warn(
            `[sandboxes.start] Unknown agent: ${body.agentName}, skipping agent startup`
          );
        }
      }

      // Ensure provider auth completes before returning
      await providerAuthPromise;

      return c.json({
        instanceId: instance.id,
        vscodeUrl: vscodeService.url,
        workerUrl: workerService.url,
        vncUrl: vncService?.url,
        xtermUrl: xtermService?.url,
        provider: provider === "pve-lxc" ? "pve-lxc" : "morph",
        vscodePersisted,
      });
    } catch (error) {
      if (error instanceof HTTPException) {
        const message =
          typeof error.message === "string" && error.message.length > 0
            ? error.message
            : "Request failed";
        return c.text(message, error.status);
      }
      console.error("Failed to start sandbox:", error);
      // Provide a more descriptive error message without leaking sensitive details
      const errorMessage = getSandboxStartErrorMessage(error);
      return c.text(errorMessage, 500);
    }
  },
);

// NOTE: /sandboxes/{id}/setup-providers moved to sandboxes-routes/config.route.ts

// Prewarm a Morph sandbox instance for faster task startup.
const PrewarmSandboxBody = z
  .object({
    teamSlugOrId: z.string(),
    repoUrl: z.string().optional(),
    branch: z.string().optional(),
  })
  .openapi("PrewarmSandboxBody");

const PrewarmSandboxResponse = z
  .object({
    id: z.string(),
    alreadyExists: z.boolean(),
  })
  .openapi("PrewarmSandboxResponse");

sandboxesRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/sandboxes/prewarm",
    tags: ["Sandboxes"],
    summary: "Prewarm a sandbox instance for a repo",
    description:
      "Creates a Morph instance in the background with the repo already cloned. " +
      "Call this when the user starts typing a task description for faster startup.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: PrewarmSandboxBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: PrewarmSandboxResponse,
          },
        },
        description: "Prewarm entry created (provisioning in background)",
      },
      401: { description: "Unauthorized" },
      500: { description: "Failed to create prewarm entry" },
    },
  }),
  async (c) => {
    const user = await stackServerAppJs.getUser({ tokenStore: c.req.raw });
    if (!user) {
      return c.text("Unauthorized", 401);
    }
    const { accessToken } = await user.getAuthJson();
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    // Check sandbox provider - prewarming is only supported for Morph
    const providerConfig = getActiveSandboxProvider();
    if (providerConfig.provider !== "morph") {
      // Return a no-op response for non-Morph providers
      // The client will just start a fresh sandbox when needed
      return c.json({ id: "", alreadyExists: true });
    }

    const body = c.req.valid("json");

    try {
      const convex = getConvex({ accessToken });

      const team = await verifyTeamAccess({
        req: c.req.raw,
        teamSlugOrId: body.teamSlugOrId,
      });

      const snapshotId = DEFAULT_MORPH_SNAPSHOT_ID;
      const result = await convex.mutation(api.warmPool.createPrewarmEntry, {
        teamId: team.uuid,
        userId: user.id,
        snapshotId,
        repoUrl: body.repoUrl,
        branch: body.branch,
      });

      if (result.alreadyExists) {
        return c.json({ id: result.id, alreadyExists: true });
      }

      const githubAccountPromise = user.getConnectedAccount("github");
      const prewarmEntryId = result.id;
      void (async () => {
        try {
          const client = getMorphClient();

          let morphInstance = await client.instances.start({
            snapshotId,
            ttlSeconds: 3600,
            ttlAction: "pause",
            metadata: {
              app: "cmux-warm-pool",
              teamId: team.uuid,
              userId: user.id,
            },
          });

          if (morphInstance.networking.httpServices.length === 0) {
            morphInstance = await client.instances.get({
              instanceId: morphInstance.id,
            });
          }

          const instance = wrapMorphInstance(morphInstance);
          void (async () => {
            await instance.setWakeOn(true, true);
          })();

          const exposed = instance.networking.httpServices;
          const vscodeService = exposed.find((service) => service.port === 39378);
          const workerService = exposed.find((service) => service.port === 39377);
          if (!vscodeService || !workerService) {
            throw new Error(
              `VSCode or worker service not found on instance ${instance.id}`,
            );
          }

          await waitForVSCodeReady(vscodeService.url, { timeoutMs: 30_000 });

          const githubAccount = await githubAccountPromise;
          if (githubAccount) {
            const { accessToken: githubAccessToken } =
              await githubAccount.getAccessToken();
            if (githubAccessToken) {
              await configureGithubAccess(instance, githubAccessToken);
            }
          }

          if (body.repoUrl) {
            const parsedRepo = parseGithubRepoUrl(body.repoUrl);
            if (parsedRepo) {
              await hydrateWorkspace({
                instance,
                repo: {
                  owner: parsedRepo.owner,
                  name: parsedRepo.repo,
                  repoFull: parsedRepo.fullName,
                  cloneUrl: parsedRepo.gitUrl,
                  maskedCloneUrl: parsedRepo.gitUrl,
                  depth: 1,
                  baseBranch: body.branch || "main",
                  newBranch: "",
                },
              });
            }
          }

          await convex.mutation(api.warmPool.markInstanceReady, {
            id: prewarmEntryId,
            instanceId: instance.id,
            vscodeUrl: vscodeService.url,
            workerUrl: workerService.url,
          });
        } catch (error) {
          console.error("[sandboxes.prewarm] Background provisioning failed:", error);
          try {
            await convex.mutation(api.warmPool.markInstanceFailed, {
              id: prewarmEntryId,
              errorMessage:
                error instanceof Error ? error.message : String(error),
            });
          } catch (markError) {
            console.error(
              "[sandboxes.prewarm] Failed to mark entry as failed:",
              markError,
            );
          }
        }
      })();

      return c.json({ id: result.id, alreadyExists: false });
    } catch (error) {
      console.error("[sandboxes.prewarm] Failed:", error);
      return c.text("Failed to create prewarm entry", 500);
    }
  },
);

// NOTE: /sandboxes/{id}/refresh-github-auth moved to sandboxes-routes/config.route.ts
// NOTE: /sandboxes/{id}/env moved to sandboxes-routes/config.route.ts
// NOTE: /sandboxes/{id}/run-scripts moved to sandboxes-routes/config.route.ts
// NOTE: /sandboxes/{id}/stop moved to sandboxes-routes/lifecycle.route.ts
// NOTE: /sandboxes/{id}/status moved to sandboxes-routes/lifecycle.route.ts
// NOTE: /sandboxes/{id}/publish-devcontainer moved to sandboxes-routes/features.route.ts
// NOTE: /sandboxes/{id}/ssh moved to sandboxes-routes/features.route.ts
// NOTE: /sandboxes/{id}/resume moved to sandboxes-routes/lifecycle.route.ts
// NOTE: /sandboxes/{id}/discover-repos moved to sandboxes-routes/features.route.ts
// NOTE: /sandboxes/{id}/live-diff moved to sandboxes-routes/features.route.ts
