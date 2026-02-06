import { api } from "@cmux/convex/api";
import {
  AGENT_CONFIGS,
  type CodexKeyPresence,
  type DockerStatus,
  type ProviderRequirementsContext,
  type ProviderStatus as SharedProviderStatus,
} from "@cmux/shared";
import { checkDockerStatus } from "@cmux/shared/providers/common/check-docker";
import { getConvex } from "./convexClient.js";
import { serverLogger } from "./fileLogger";

/**
 * Compute a fingerprint hash of the model registry.
 * This allows clients to detect version drift (client expects models server doesn't have).
 */
export function computeModelRegistryFingerprint(): string {
  const names = AGENT_CONFIGS.map((c) => c.name).sort();
  // Simple hash: join names and compute a short checksum
  const str = names.join("|");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `v1-${Math.abs(hash).toString(36)}`;
}

/**
 * Legacy Codex model patterns that have been removed from the registry.
 * Used to detect if a deployment is serving stale/old models.
 */
const LEGACY_CODEX_PATTERNS = [
  /^codex\/gpt-5$/,
  /^codex\/gpt-5-/,
  /^codex\/o3$/,
  /^codex\/o4-mini$/,
  /^codex\/gpt-4\.1$/,
  /^codex\/gpt-5-codex$/,
  /^codex\/gpt-5-codex-/,
];

/**
 * Check if any legacy Codex models are present in the registry.
 */
export function checkLegacyCodexPresent(): boolean {
  return AGENT_CONFIGS.some((c) =>
    LEGACY_CODEX_PATTERNS.some((pattern) => pattern.test(c.name))
  );
}

/**
 * Get server build ID from environment if available.
 */
export function getServerBuildId(): string | undefined {
  return (
    process.env.CMUX_BUILD_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ||
    process.env.GIT_COMMIT_SHA?.slice(0, 8) ||
    undefined
  );
}

type CheckAllProvidersStatusOptions = {
  teamSlugOrId?: string;
};

export async function checkAllProvidersStatus(
  options: CheckAllProvidersStatusOptions = {}
): Promise<{
  providers: SharedProviderStatus[];
  dockerStatus: DockerStatus;
}> {
  // Check Docker status
  const dockerStatus = await checkDockerStatus();

  let apiKeys: ProviderRequirementsContext["apiKeys"] = undefined;

  if (options.teamSlugOrId) {
    try {
      apiKeys = await getConvex().query(api.apiKeys.getAllForAgents, {
        teamSlugOrId: options.teamSlugOrId,
      });
    } catch (error) {
      console.warn(
        `Failed to load API keys for team ${options.teamSlugOrId}:`,
        error
      );
    }
  }

  // Check each provider's specific requirements
  const providerChecks = await Promise.all(
    AGENT_CONFIGS.map(async (agent) => {
      // Use the agent's checkRequirements function if available
      const missingRequirements = agent.checkRequirements
        ? await agent.checkRequirements({
            apiKeys,
            teamSlugOrId: options.teamSlugOrId,
          })
        : [];

      return {
        name: agent.name,
        isAvailable: missingRequirements.length === 0,
        missingRequirements:
          missingRequirements.length > 0 ? missingRequirements : undefined,
      };
    })
  );

  return {
    providers: providerChecks,
    dockerStatus,
  };
}

/**
 * Web-mode variant of checkAllProvidersStatus.
 * Only checks if required API keys are present in Convex - does not check
 * local files, keychains, or Docker status (which don't exist in web deployments).
 */
export async function checkAllProvidersStatusWebMode(options: {
  teamSlugOrId: string;
}): Promise<{
  providers: SharedProviderStatus[];
  dockerStatus: DockerStatus;
  codexKeyPresence: CodexKeyPresence;
}> {
  // In web mode, Docker is managed by cloud provider - always report as ready
  const dockerStatus: DockerStatus = { isRunning: true, version: "web-mode" };

  let apiKeys: Record<string, string> = {};

  try {
    apiKeys =
      (await getConvex().query(api.apiKeys.getAllForAgents, {
        teamSlugOrId: options.teamSlugOrId,
      })) ?? {};
  } catch (error) {
    console.warn(
      `Failed to load API keys for team ${options.teamSlugOrId}:`,
      error
    );
  }

  // Compute codex key presence for diagnostics
  const codexKeyPresence: CodexKeyPresence = {
    hasOpenaiApiKey: Boolean(
      apiKeys.OPENAI_API_KEY && apiKeys.OPENAI_API_KEY.trim() !== ""
    ),
    hasCodexAuthJson: Boolean(
      apiKeys.CODEX_AUTH_JSON && apiKeys.CODEX_AUTH_JSON.trim() !== ""
    ),
  };

  // Check each agent's required API keys (skip local file checks)
  const providerChecks = AGENT_CONFIGS.map((agent) => {
    const missingRequirements: string[] = [];

    // Check if required API keys are present
    if (agent.apiKeys && agent.apiKeys.length > 0) {
      // Special handling for Claude agents: CLAUDE_CODE_OAUTH_TOKEN OR ANTHROPIC_API_KEY
      // (OAuth token is preferred, but API key works too)
      const isClaudeAgent = agent.name.startsWith("claude/");
      // Special handling for Codex agents: CODEX_AUTH_JSON OR OPENAI_API_KEY
      // (auth.json with OAuth tokens is preferred, but API key works too)
      const isCodexAgent = agent.name.startsWith("codex/");

      if (isClaudeAgent) {
        // Claude agents always available in web mode due to Vertex AI fallback
        // (server-side VERTEX_PRIVATE_KEY handles auth when user key is missing)
      } else if (isCodexAgent) {
        if (!codexKeyPresence.hasCodexAuthJson && !codexKeyPresence.hasOpenaiApiKey) {
          serverLogger.debug(
            "[providerStatus:web] Codex requirements missing",
            {
              teamSlugOrId: options.teamSlugOrId,
              agent: agent.name,
              hasCodexAuthJson: codexKeyPresence.hasCodexAuthJson,
              hasOpenaiApiKey: codexKeyPresence.hasOpenaiApiKey,
            }
          );
          missingRequirements.push("Codex Auth JSON or OpenAI API Key");
        }
      } else {
        // For other agents, check all required keys
        for (const keyConfig of agent.apiKeys) {
          const keyValue = apiKeys[keyConfig.envVar];
          if (!keyValue || keyValue.trim() === "") {
            missingRequirements.push(keyConfig.displayName);
          }
        }
      }
    }

    return {
      name: agent.name,
      isAvailable: missingRequirements.length === 0,
      missingRequirements:
        missingRequirements.length > 0 ? missingRequirements : undefined,
    };
  });

  return {
    providers: providerChecks,
    dockerStatus,
    codexKeyPresence,
  };
}
