export type ClaudeModelFamily = "opus" | "sonnet" | "haiku";

export const CLAUDE_DEFAULT_MODEL_ENV_VARS = {
  opus: {
    model: "ANTHROPIC_DEFAULT_OPUS_MODEL",
    name: "ANTHROPIC_DEFAULT_OPUS_MODEL_NAME",
    description: "ANTHROPIC_DEFAULT_OPUS_MODEL_DESCRIPTION",
    supportedCapabilities:
      "ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES",
  },
  sonnet: {
    model: "ANTHROPIC_DEFAULT_SONNET_MODEL",
    name: "ANTHROPIC_DEFAULT_SONNET_MODEL_NAME",
    description: "ANTHROPIC_DEFAULT_SONNET_MODEL_DESCRIPTION",
    supportedCapabilities:
      "ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES",
  },
  haiku: {
    model: "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    name: "ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME",
    description: "ANTHROPIC_DEFAULT_HAIKU_MODEL_DESCRIPTION",
    supportedCapabilities:
      "ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES",
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
  family?: ClaudeModelFamily;
  launchModel: string;
  nativeModelId: string;
  requiresCustomEndpoint?: boolean;
  customModelOptionName?: string;
  customModelOptionDescription?: string;
  customModelOptionSupportedCapabilities?: string[];
}

const CUSTOM_CLAUDE_MODEL_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export const CLAUDE_MODEL_SPECS: ClaudeModelSpec[] = [
  {
    nameSuffix: "opus-4.7",
    family: "opus",
    launchModel: "opus",
    nativeModelId: "claude-opus-4-7",
  },
  {
    nameSuffix: "opus-4.6",
    family: "opus",
    launchModel: "opus",
    nativeModelId: "claude-opus-4-6",
  },
  {
    nameSuffix: "sonnet-4.6",
    family: "sonnet",
    launchModel: "sonnet",
    nativeModelId: "claude-sonnet-4-6",
  },
  {
    nameSuffix: "opus-4.5",
    family: "opus",
    launchModel: "opus",
    nativeModelId: "claude-opus-4-5-20251101",
  },
  {
    nameSuffix: "sonnet-4.5",
    family: "sonnet",
    launchModel: "sonnet",
    nativeModelId: "claude-sonnet-4-5-20250929",
  },
  {
    nameSuffix: "haiku-4.5",
    family: "haiku",
    launchModel: "haiku",
    nativeModelId: "claude-haiku-4-5-20251001",
  },
];

function getDynamicCustomClaudeModelSpec(
  agentName: string,
): ClaudeModelSpec | undefined {
  if (!agentName.startsWith("claude/")) {
    return undefined;
  }

  const customModelId = agentName.slice("claude/".length).trim();
  if (!customModelId) {
    return undefined;
  }

  if (
    CLAUDE_MODEL_SPECS.some((spec) => customModelId === spec.nameSuffix) ||
    !CUSTOM_CLAUDE_MODEL_ID_REGEX.test(customModelId)
  ) {
    return undefined;
  }

  return {
    nameSuffix: customModelId,
    launchModel: customModelId,
    nativeModelId: customModelId,
    requiresCustomEndpoint: true,
    customModelOptionName: customModelId,
    customModelOptionDescription:
      "Claude Code via an Anthropic-compatible custom endpoint.",
  };
}

const CLAUDE_MODEL_SPEC_MAP = new Map<string, ClaudeModelSpec>(
  CLAUDE_MODEL_SPECS.map((spec) => [`claude/${spec.nameSuffix}`, spec]),
);

export function getClaudeModelSpecByAgentName(
  agentName: string | undefined,
): ClaudeModelSpec | undefined {
  if (!agentName?.startsWith("claude/")) {
    return undefined;
  }

  return CLAUDE_MODEL_SPEC_MAP.get(agentName) ?? getDynamicCustomClaudeModelSpec(agentName);
}

export function getClaudeModelFamily(
  agentName: string | undefined,
): ClaudeModelFamily | undefined {
  return getClaudeModelSpecByAgentName(agentName)?.family;
}

export function getClaudeLaunchModel(
  agentName: string | undefined,
): string | undefined {
  return getClaudeModelSpecByAgentName(agentName)?.launchModel;
}

export function getClaudeNativeModelId(
  agentName: string | undefined,
): string | undefined {
  return getClaudeModelSpecByAgentName(agentName)?.nativeModelId;
}

export function requiresAnthropicCustomEndpoint(
  agentName: string | undefined,
): boolean {
  return (
    getClaudeModelSpecByAgentName(agentName)?.requiresCustomEndpoint === true
  );
}

export function hasAnthropicCustomEndpointConfigured(options?: {
  apiKeys?: Record<string, string | undefined>;
  bypassAnthropicProxy?: boolean;
  providerOverrides?: Array<{
    providerId: string;
    enabled: boolean;
    baseUrl?: string;
    apiFormat?: string;
  }>;
}): boolean {
  const userCustomBaseUrl = options?.apiKeys?.ANTHROPIC_BASE_URL?.trim();
  if (options?.bypassAnthropicProxy && userCustomBaseUrl) {
    return true;
  }

  return (
    options?.providerOverrides?.some(
      (override) =>
        override.providerId === "anthropic" &&
        override.enabled &&
        Boolean(override.baseUrl?.trim()) &&
        (override.apiFormat === undefined ||
          override.apiFormat === "anthropic"),
    ) ?? false
  );
}
