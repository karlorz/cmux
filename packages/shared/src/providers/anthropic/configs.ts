import type { AgentConfig } from "../../agentConfig";
import { checkClaudeRequirements } from "./check-requirements";
import { startClaudeCompletionDetector } from "./completion-detector";
import {
  CLAUDE_KEY_ENV_VARS_TO_UNSET,
  getClaudeEnvironment,
} from "./environment";

// Bedrock model IDs from environment variables (with fallback defaults)
const BEDROCK_MODEL_SONNET_45 =
  process.env.ANTHROPIC_MODEL_SONNET_45 ?? "anthropic.claude-sonnet-4-5-20250929-v1:0";
const BEDROCK_MODEL_OPUS_45 =
  process.env.ANTHROPIC_MODEL_OPUS_45 ?? "global.anthropic.claude-opus-4-5-20251101-v1:0";
const BEDROCK_MODEL_HAIKU_45 =
  process.env.ANTHROPIC_MODEL_HAIKU_45 ?? "us.anthropic.claude-haiku-4-5-20251001-v1:0";

/**
 * Apply API keys for Claude agents.
 *
 * When ENABLE_OAUTH_TOKEN is true:
 * 1. If CLAUDE_CODE_OAUTH_TOKEN is set, use it (user pays via their subscription)
 * 2. Otherwise, use AWS Bedrock with platform-provided credentials
 *
 * When ENABLE_OAUTH_TOKEN is false:
 * - Always use AWS Bedrock with platform-provided credentials
 */
const applyClaudeApiKeys: NonNullable<AgentConfig["applyApiKeys"]> = async (
  keys,
) => {
  // Always unset Anthropic-specific env vars to prevent conflicts
  const unsetEnv = [...CLAUDE_KEY_ENV_VARS_TO_UNSET];

  // Use AWS Bedrock (credentials injected by agentSpawner)
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
  // No user-configurable API keys; Bedrock credentials are platform-provided
  apiKeys: [],
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
  // No user-configurable API keys; Bedrock credentials are platform-provided
  apiKeys: [],
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
  // No user-configurable API keys; Bedrock credentials are platform-provided
  apiKeys: [],
  applyApiKeys: applyClaudeApiKeys,
  completionDetector: startClaudeCompletionDetector,
};
