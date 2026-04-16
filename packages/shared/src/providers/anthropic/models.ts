export type ClaudeModelFamily = "opus" | "sonnet" | "haiku" | "custom";

export const CLAUDE_DEFAULT_MODEL_ENV_VARS = {
  opus: {
    model: "ANTHROPIC_DEFAULT_OPUS_MODEL",
    name: "ANTHROPIC_DEFAULT_OPUS_MODEL_NAME",
    description: "ANTHROPIC_DEFAULT_OPUS_MODEL_DESCRIPTION",
    supportedCapabilities: "ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES",
  },
  sonnet: {
    model: "ANTHROPIC_DEFAULT_SONNET_MODEL",
    name: "ANTHROPIC_DEFAULT_SONNET_MODEL_NAME",
    description: "ANTHROPIC_DEFAULT_SONNET_MODEL_DESCRIPTION",
    supportedCapabilities: "ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES",
  },
  haiku: {
    model: "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    name: "ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME",
    description: "ANTHROPIC_DEFAULT_HAIKU_MODEL_DESCRIPTION",
    supportedCapabilities: "ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES",
  },
} as const;

export const CLAUDE_ROUTING_ENV_VARS = [
  ...Object.values(CLAUDE_DEFAULT_MODEL_ENV_VARS).flatMap((envVars) => [
    envVars.model,
    envVars.name,
    envVars.description,
    envVars.supportedCapabilities,
  ]),
  "ANTHROPIC_CUSTOM_MODEL_OPTION",
  "ANTHROPIC_CUSTOM_MODEL_OPTION_NAME",
  "ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION",
  "ANTHROPIC_CUSTOM_MODEL_OPTION_SUPPORTED_CAPABILITIES",
  "CLAUDE_CODE_SUBAGENT_MODEL",
] as const;

export interface ClaudeModelSpec {
  nameSuffix: string;
  family: ClaudeModelFamily;
  nativeModelId: string;
  cliModel?: string;
}

export const CLAUDE_MODEL_SPECS: ClaudeModelSpec[] = [
  {
    nameSuffix: "opus-4.6",
    family: "opus",
    nativeModelId: "claude-opus-4-6",
  },
  {
    nameSuffix: "sonnet-4.6",
    family: "sonnet",
    nativeModelId: "claude-sonnet-4-6",
  },
  {
    nameSuffix: "opus-4.5",
    family: "opus",
    nativeModelId: "claude-opus-4-5-20251101",
  },
  {
    nameSuffix: "sonnet-4.5",
    family: "sonnet",
    nativeModelId: "claude-sonnet-4-5-20250929",
  },
  {
    nameSuffix: "haiku-4.5",
    family: "haiku",
    nativeModelId: "claude-haiku-4-5-20251001",
  },
  {
    nameSuffix: "gpt-5.1-codex-mini",
    family: "custom",
    nativeModelId: "gpt-5.1-codex-mini",
    cliModel: "gpt-5.1-codex-mini",
  },
];

export function getClaudeModelSpecByAgentName(
  agentName: string | undefined,
): ClaudeModelSpec | undefined {
  if (!agentName?.startsWith("claude/")) {
    return undefined;
  }

  return CLAUDE_MODEL_SPECS.find(
    (spec) => agentName === `claude/${spec.nameSuffix}`,
  );
}

export function getClaudeModelFamily(
  agentName: string | undefined,
): ClaudeModelFamily | undefined {
  return getClaudeModelSpecByAgentName(agentName)?.family;
}

export function getClaudeNativeModelId(
  agentName: string | undefined,
): string | undefined {
  return getClaudeModelSpecByAgentName(agentName)?.nativeModelId;
}
