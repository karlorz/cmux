import type { AgentConfig } from "../../agentConfig";
import { ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN } from "../../apiKeys";
import {
  ANTHROPIC_MODEL_HAIKU_45,
  ANTHROPIC_MODEL_OPUS_45,
} from "../../utils/anthropic";
import {
  checkClaudeRequirements,
  checkClaudeSonnetRequirements,
} from "./check-requirements";
import { startClaudeCompletionDetector } from "./completion-detector";
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
 * 3. AWS Bedrock (platform-provided) - fallback to platform credentials
 *
 * Claude Code with Bedrock requires the model to be set via the ANTHROPIC_MODEL
 * environment variable (not via --model CLI flag).
 */
function createApplyClaudeApiKeys(
  bedrockModelId: string,
): NonNullable<AgentConfig["applyApiKeys"]> {
  return async (keys) => {
    // Base env vars to unset (prevent conflicts)
    const unsetEnv = [...CLAUDE_KEY_ENV_VARS_TO_UNSET];

    const oauthToken = keys.CLAUDE_CODE_OAUTH_TOKEN;
    const anthropicKey = keys.ANTHROPIC_API_KEY;

    // Priority 1: OAuth token (user pays via their subscription)
    if (oauthToken && oauthToken.trim().length > 0) {
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

    // Priority 2: User-provided Anthropic API key
    if (anthropicKey && anthropicKey.trim().length > 0) {
      return {
        env: {
          ANTHROPIC_API_KEY: anthropicKey,
        },
        unsetEnv,
      };
    }

    // Priority 3: AWS Bedrock with platform-provided credentials (fallback)
    const env: Record<string, string> = {
      // Enable AWS Bedrock mode in Claude Code
      CLAUDE_CODE_USE_BEDROCK: "1",
      // Claude Code requires ANTHROPIC_MODEL env var for Bedrock
      ANTHROPIC_MODEL: bedrockModelId,
    };

    // AWS Bedrock credentials are injected by agentSpawner from server environment
    if (keys.AWS_BEARER_TOKEN_BEDROCK) {
      env.AWS_BEARER_TOKEN_BEDROCK = keys.AWS_BEARER_TOKEN_BEDROCK;
    }
    if (keys.AWS_REGION) {
      env.AWS_REGION = keys.AWS_REGION;
    }

    return {
      env,
      unsetEnv,
    };
  };
}

/**
 * Apply API keys for Claude Sonnet - NO Bedrock fallback.
 *
 * Sonnet 4.5 is not available on AWS Bedrock, so this function only supports:
 * 1. OAuth token (user-provided)
 * 2. Anthropic API key (user-provided)
 *
 * If neither is provided, returns empty env (will fail at runtime).
 */
const applyClaudeApiKeysNoBedrockFallback: NonNullable<
  AgentConfig["applyApiKeys"]
> = async (keys) => {
  const unsetEnv = [...CLAUDE_KEY_ENV_VARS_TO_UNSET];
  const env: Record<string, string> = {};

  const oauthToken = keys.CLAUDE_CODE_OAUTH_TOKEN;
  const anthropicKey = keys.ANTHROPIC_API_KEY;

  // Priority 1: OAuth token (user pays via their subscription)
  if (oauthToken && oauthToken.trim().length > 0) {
    if (!unsetEnv.includes("ANTHROPIC_API_KEY")) {
      unsetEnv.push("ANTHROPIC_API_KEY");
    }
    env.CLAUDE_CODE_OAUTH_TOKEN = oauthToken;
    return { env, unsetEnv };
  }

  // Priority 2: User-provided Anthropic API key
  if (anthropicKey && anthropicKey.trim().length > 0) {
    env.ANTHROPIC_API_KEY = anthropicKey;
    return { env, unsetEnv };
  }

  // No Bedrock fallback - Sonnet 4.5 is not available on Bedrock
  // Return empty env; checkRequirements should have caught this
  return { env, unsetEnv };
};

export const CLAUDE_OPUS_4_5_CONFIG: AgentConfig = {
  name: "claude/opus-4.5",
  command: "bunx",
  args: [
    "@anthropic-ai/claude-code@latest",
    "--allow-dangerously-skip-permissions",
    "--dangerously-skip-permissions",
    "--ide",
    "$PROMPT",
  ],
  environment: getClaudeEnvironment,
  checkRequirements: checkClaudeRequirements,
  // User-configurable: OAuth token (preferred) or API key; falls back to Bedrock
  apiKeys: [CLAUDE_CODE_OAUTH_TOKEN, ANTHROPIC_API_KEY],
  applyApiKeys: createApplyClaudeApiKeys(ANTHROPIC_MODEL_OPUS_45),
  completionDetector: startClaudeCompletionDetector,
};

export const CLAUDE_SONNET_4_5_CONFIG: AgentConfig = {
  name: "claude/sonnet-4.5",
  command: "bunx",
  args: [
    "@anthropic-ai/claude-code@latest",
    "--allow-dangerously-skip-permissions",
    "--dangerously-skip-permissions",
    "--ide",
    "$PROMPT",
  ],
  environment: getClaudeEnvironment,
  // Sonnet uses special check - requires OAuth or API key (no Bedrock fallback)
  checkRequirements: checkClaudeSonnetRequirements,
  // User-configurable: OAuth token (preferred) or API key; NO Bedrock fallback
  apiKeys: [CLAUDE_CODE_OAUTH_TOKEN, ANTHROPIC_API_KEY],
  applyApiKeys: applyClaudeApiKeysNoBedrockFallback,
  completionDetector: startClaudeCompletionDetector,
};

export const CLAUDE_HAIKU_4_5_CONFIG: AgentConfig = {
  name: "claude/haiku-4.5",
  command: "bunx",
  args: [
    "@anthropic-ai/claude-code@latest",
    "--allow-dangerously-skip-permissions",
    "--dangerously-skip-permissions",
    "--ide",
    "$PROMPT",
  ],
  environment: getClaudeEnvironment,
  checkRequirements: checkClaudeRequirements,
  // User-configurable: OAuth token (preferred) or API key; falls back to Bedrock
  apiKeys: [CLAUDE_CODE_OAUTH_TOKEN, ANTHROPIC_API_KEY],
  applyApiKeys: createApplyClaudeApiKeys(ANTHROPIC_MODEL_HAIKU_45),
  completionDetector: startClaudeCompletionDetector,
};
