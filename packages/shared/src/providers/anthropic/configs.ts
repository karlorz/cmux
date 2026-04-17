import type { AgentConfig, EnvironmentResult } from "../../agentConfig";
import { ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN } from "../../apiKeys";
import { createCheckClaudeRequirements } from "./check-requirements";
import { startClaudeCompletionDetector } from "./completion-detector";
import { CLAUDE_MODEL_SPECS, getClaudeModelSpecByAgentName } from "./models";
import {
  CLAUDE_KEY_ENV_VARS_TO_UNSET,
  getClaudeEnvironment,
} from "./environment";

/**
 * Create applyApiKeys function for Claude agents.
 *
 * Priority:
 * 1. OAuth token (user-provided) - uses user's Claude subscription
 * 2. Anthropic API key (user-provided) - uses user's API key
 *    - If user explicitly provides the placeholder key 'sk_placeholder_cmux_anthropic_api_key',
 *      the request will be routed to platform Bedrock proxy
 * 3. No fallback - users must provide credentials to use Claude agents
 */
export function createApplyClaudeApiKeys(): NonNullable<
  AgentConfig["applyApiKeys"]
> {
  return createApplyClaudeApiKeysWithOptions();
}

export function createApplyClaudeApiKeysWithOptions(options?: {
  allowOAuth?: boolean;
}): NonNullable<AgentConfig["applyApiKeys"]> {
  const allowOAuth = options?.allowOAuth ?? true;

  return async (keys): Promise<Partial<EnvironmentResult>> => {
    // Base env vars to unset (prevent conflicts)
    const unsetEnv = [...CLAUDE_KEY_ENV_VARS_TO_UNSET];

    const oauthToken = keys.CLAUDE_CODE_OAUTH_TOKEN;
    const anthropicKey = keys.ANTHROPIC_API_KEY;

    // Priority 1: OAuth token (user pays via their subscription)
    if (allowOAuth && oauthToken && oauthToken.trim().length > 0) {
      // Ensure ANTHROPIC_API_KEY is in the unset list
      if (!unsetEnv.includes("ANTHROPIC_API_KEY")) {
        unsetEnv.push("ANTHROPIC_API_KEY");
      }
      return {
        env: {
          CLAUDE_CODE_OAUTH_TOKEN: oauthToken,
        },
        unsetEnv,
      };
    }

    // Priority 2: User-provided Anthropic API key (includes explicit placeholder key for platform credits)
    if (anthropicKey && anthropicKey.trim().length > 0) {
      return {
        env: {
          ANTHROPIC_API_KEY: anthropicKey,
        },
        unsetEnv,
      };
    }

    // No credentials provided - return empty env (will fail requirements check)
    return {
      env: {},
      unsetEnv,
    };
  };
}

function createClaudeConfig(nameSuffix: string): AgentConfig {
  const spec = getClaudeModelSpecByAgentName(`claude/${nameSuffix}`);
  if (!spec) {
    throw new Error(`Unknown Claude model family for ${nameSuffix}`);
  }

  const allowOAuth = !spec.requiresCustomEndpoint;
  const apiKeys = allowOAuth
    ? [CLAUDE_CODE_OAUTH_TOKEN, ANTHROPIC_API_KEY]
    : [ANTHROPIC_API_KEY];

  return {
    name: `claude/${nameSuffix}`,
    command: "claude",
    args: [
      "--allow-dangerously-skip-permissions",
      "--dangerously-skip-permissions",
      "--model",
      spec.launchModel,
      "--ide",
      "$PROMPT",
    ],
    environment: getClaudeEnvironment,
    checkRequirements: createCheckClaudeRequirements({ allowOAuth }),
    apiKeys,
    applyApiKeys: createApplyClaudeApiKeysWithOptions({ allowOAuth }),
    completionDetector: startClaudeCompletionDetector,
  };
}

export const CLAUDE_AGENT_CONFIGS: AgentConfig[] = CLAUDE_MODEL_SPECS.map(
  (spec) => createClaudeConfig(spec.nameSuffix),
);
