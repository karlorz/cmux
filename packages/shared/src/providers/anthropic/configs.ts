import type { AgentConfig } from "../../agentConfig";
import { CLAUDE_CODE_OAUTH_TOKEN } from "../../apiKeys";
import { checkClaudeRequirements } from "./check-requirements";
import { startClaudeCompletionDetector } from "./completion-detector";
import {
  CLAUDE_KEY_ENV_VARS_TO_UNSET,
  getClaudeEnvironment,
} from "./environment";

// Bedrock model IDs from environment variables
const BEDROCK_MODEL_SONNET_45 = "anthropic.claude-sonnet-4-5-20250929-v1:0";
const BEDROCK_MODEL_OPUS_45 = "global.anthropic.claude-opus-4-5-20251101-v1:0";
const BEDROCK_MODEL_HAIKU_45 = "us.anthropic.claude-haiku-4-5-20251001-v1:0";

/**
 * Apply API keys for Claude agents.
 *
 * Priority:
 * 1. If CLAUDE_CODE_OAUTH_TOKEN is set, use it (user pays via their subscription)
 * 2. Otherwise, use AWS Bedrock with platform-provided credentials
 *
 * The OAuth token is preferred because it uses the user's own Claude subscription.
 * AWS Bedrock credentials are injected by agentSpawner from the server environment.
 */
const applyClaudeApiKeys: NonNullable<AgentConfig["applyApiKeys"]> = async (
  keys,
) => {
  const oauthToken = keys.CLAUDE_CODE_OAUTH_TOKEN;

  // Always unset Anthropic-specific env vars to prevent conflicts
  const unsetEnv = [...CLAUDE_KEY_ENV_VARS_TO_UNSET];

  // If OAuth token is set, use it (user pays via their subscription)
  if (oauthToken && oauthToken.trim().length > 0) {
    return {
      env: {
        CLAUDE_CODE_OAUTH_TOKEN: oauthToken,
      },
      unsetEnv,
    };
  }

  // No OAuth token - use AWS Bedrock (credentials injected by agentSpawner)
  const env: Record<string, string> = {
    // Enable AWS Bedrock mode in Claude Code
    CLAUDE_CODE_USE_BEDROCK: "1",
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

export const CLAUDE_OPUS_4_5_CONFIG: AgentConfig = {
  name: "claude/opus-4.5",
  command: "bunx",
  args: [
    "@anthropic-ai/claude-code@latest",
    "--model",
    BEDROCK_MODEL_OPUS_45,
    "--allow-dangerously-skip-permissions",
    "--dangerously-skip-permissions",
    "--ide",
    "$PROMPT",
  ],
  environment: getClaudeEnvironment,
  checkRequirements: checkClaudeRequirements,
  // Only OAuth token is user-configurable; Bedrock credentials are platform-provided
  apiKeys: [CLAUDE_CODE_OAUTH_TOKEN],
  applyApiKeys: applyClaudeApiKeys,
  completionDetector: startClaudeCompletionDetector,
};

export const CLAUDE_SONNET_4_5_CONFIG: AgentConfig = {
  name: "claude/sonnet-4.5",
  command: "bunx",
  args: [
    "@anthropic-ai/claude-code@latest",
    "--model",
    BEDROCK_MODEL_SONNET_45,
    "--allow-dangerously-skip-permissions",
    "--dangerously-skip-permissions",
    "--ide",
    "$PROMPT",
  ],
  environment: getClaudeEnvironment,
  checkRequirements: checkClaudeRequirements,
  // Only OAuth token is user-configurable; Bedrock credentials are platform-provided
  apiKeys: [CLAUDE_CODE_OAUTH_TOKEN],
  applyApiKeys: applyClaudeApiKeys,
  completionDetector: startClaudeCompletionDetector,
};

export const CLAUDE_HAIKU_4_5_CONFIG: AgentConfig = {
  name: "claude/haiku-4.5",
  command: "bunx",
  args: [
    "@anthropic-ai/claude-code@latest",
    "--model",
    BEDROCK_MODEL_HAIKU_45,
    "--allow-dangerously-skip-permissions",
    "--dangerously-skip-permissions",
    "--ide",
    "$PROMPT",
  ],
  environment: getClaudeEnvironment,
  checkRequirements: checkClaudeRequirements,
  // Only OAuth token is user-configurable; Bedrock credentials are platform-provided
  apiKeys: [CLAUDE_CODE_OAUTH_TOKEN],
  applyApiKeys: applyClaudeApiKeys,
  completionDetector: startClaudeCompletionDetector,
};
