import type { ModelVariant } from "../../agent-catalog";

export type ClaudeModelFamily = "opus" | "sonnet" | "haiku";

export interface ClaudeModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion?: number;
  cacheWritePerMillion?: number;
}

export interface ClaudeCuratedModelManifestEntry {
  agentName: `claude/${string}`;
  nameSuffix: string;
  displayName: string;
  family: ClaudeModelFamily;
  launchModel: string;
  nativeModelId: string;
  /**
   * Runtime effort support (Claude CLI invocation / environment validation).
   */
  supportsEffort: boolean;
  /**
   * Catalog effort support (UI variants); defaults to supportsEffort when omitted.
   */
  catalogSupportsEffort?: boolean;
  tags: string[];
  contextWindow: number;
  maxOutputTokens: number;
  pricing: ClaudeModelPricing;
  bedrockBaseModelId: string;
  bedrockInferenceProfile: "us" | "global";
  bedrockAliases: string[];
  contextWindowAliases?: string[];
  recommended?: boolean;
}

export const CLAUDE_EFFORT_VARIANTS: ModelVariant[] = [
  {
    id: "low",
    displayName: "Low",
    description: "Lower thinking effort for faster responses",
  },
  {
    id: "medium",
    displayName: "Medium",
    description: "Balanced thinking effort for everyday work",
  },
  {
    id: "high",
    displayName: "High",
    description: "Higher thinking effort for complex tasks",
  },
  {
    id: "max",
    displayName: "Max",
    description: "Maximum thinking effort",
  },
];

export const CLAUDE_DEFAULT_EFFORT_VARIANT = "medium";

export const CLAUDE_CURATED_MODELS: ClaudeCuratedModelManifestEntry[] = [
  {
    agentName: "claude/opus-4.7",
    nameSuffix: "opus-4.7",
    displayName: "Opus 4.7",
    family: "opus",
    launchModel: "opus",
    nativeModelId: "claude-opus-4-7",
    supportsEffort: true,
    tags: ["latest", "recommended", "reasoning"],
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    pricing: {
      inputPerMillion: 15,
      outputPerMillion: 75,
      cacheReadPerMillion: 1.5,
      cacheWritePerMillion: 18.75,
    },
    bedrockBaseModelId: "anthropic.claude-opus-4-7",
    bedrockInferenceProfile: "global",
    bedrockAliases: ["claude-opus-4-7", "claude-4-7-opus"],
    recommended: true,
  },
  {
    agentName: "claude/opus-4.6",
    nameSuffix: "opus-4.6",
    displayName: "Opus 4.6",
    family: "opus",
    launchModel: "opus",
    nativeModelId: "claude-opus-4-6",
    supportsEffort: true,
    tags: ["reasoning"],
    contextWindow: 1_000_000,
    maxOutputTokens: 32_000,
    pricing: {
      inputPerMillion: 15,
      outputPerMillion: 75,
      cacheReadPerMillion: 1.5,
      cacheWritePerMillion: 18.75,
    },
    bedrockBaseModelId: "anthropic.claude-opus-4-6-v1",
    bedrockInferenceProfile: "global",
    bedrockAliases: ["claude-opus-4-6", "claude-4-6-opus"],
  },
  {
    agentName: "claude/sonnet-4.6",
    nameSuffix: "sonnet-4.6",
    displayName: "Sonnet 4.6",
    family: "sonnet",
    launchModel: "sonnet",
    nativeModelId: "claude-sonnet-4-6",
    // Preserve existing runtime behavior: effort selection is restricted to Opus.
    supportsEffort: false,
    // Preserve existing catalog behavior: Sonnet 4.6 still shows effort variants in UI.
    catalogSupportsEffort: true,
    tags: ["latest", "reasoning"],
    contextWindow: 1_000_000,
    maxOutputTokens: 32_000,
    pricing: {
      inputPerMillion: 3,
      outputPerMillion: 15,
      cacheReadPerMillion: 0.3,
      cacheWritePerMillion: 3.75,
    },
    bedrockBaseModelId: "anthropic.claude-sonnet-4-6",
    bedrockInferenceProfile: "us",
    bedrockAliases: ["claude-sonnet-4-6", "claude-4-6-sonnet"],
  },
  {
    agentName: "claude/opus-4.5",
    nameSuffix: "opus-4.5",
    displayName: "Opus 4.5",
    family: "opus",
    launchModel: "opus",
    nativeModelId: "claude-opus-4-5-20251101",
    supportsEffort: false,
    tags: ["reasoning"],
    contextWindow: 200_000,
    maxOutputTokens: 16_000,
    pricing: {
      inputPerMillion: 15,
      outputPerMillion: 75,
      cacheReadPerMillion: 1.5,
      cacheWritePerMillion: 18.75,
    },
    bedrockBaseModelId: "anthropic.claude-opus-4-5-20251101-v1:0",
    bedrockInferenceProfile: "global",
    bedrockAliases: [
      "claude-opus-4-5-20251101",
      "claude-opus-4-5",
      "claude-4-5-opus",
    ],
  },
  {
    agentName: "claude/sonnet-4.5",
    nameSuffix: "sonnet-4.5",
    displayName: "Sonnet 4.5",
    family: "sonnet",
    launchModel: "sonnet",
    nativeModelId: "claude-sonnet-4-5-20250929",
    supportsEffort: false,
    tags: ["reasoning"],
    contextWindow: 200_000,
    maxOutputTokens: 16_000,
    pricing: {
      inputPerMillion: 3,
      outputPerMillion: 15,
      cacheReadPerMillion: 0.3,
      cacheWritePerMillion: 3.75,
    },
    bedrockBaseModelId: "anthropic.claude-sonnet-4-5-20250929-v1:0",
    bedrockInferenceProfile: "us",
    bedrockAliases: [
      "claude-sonnet-4-5-20250929",
      "claude-sonnet-4-5",
      "claude-4-5-sonnet",
    ],
    // Keep backward compatibility for older tracking data in usage analytics.
    contextWindowAliases: ["claude-sonnet-4-5-20250514"],
  },
  {
    agentName: "claude/haiku-4.5",
    nameSuffix: "haiku-4.5",
    displayName: "Haiku 4.5",
    family: "haiku",
    launchModel: "haiku",
    nativeModelId: "claude-haiku-4-5-20251001",
    supportsEffort: false,
    tags: ["fast"],
    contextWindow: 200_000,
    maxOutputTokens: 8_000,
    pricing: {
      inputPerMillion: 0.8,
      outputPerMillion: 4,
      cacheReadPerMillion: 0.08,
      cacheWritePerMillion: 1,
    },
    bedrockBaseModelId: "anthropic.claude-haiku-4-5-20251001-v1:0",
    bedrockInferenceProfile: "us",
    bedrockAliases: [
      "claude-haiku-4-5-20251001",
      "claude-haiku-4-5",
      "claude-4-5-haiku",
    ],
  },
];

export const CLAUDE_MANIFEST_BY_AGENT_NAME = new Map(
  CLAUDE_CURATED_MODELS.map((entry) => [entry.agentName, entry]),
);

export const CLAUDE_MANIFEST_BY_NATIVE_MODEL_ID = new Map(
  CLAUDE_CURATED_MODELS.map((entry) => [entry.nativeModelId, entry]),
);

export const CLAUDE_EFFORT_AGENT_NAMES = new Set(
  CLAUDE_CURATED_MODELS.filter((entry) => entry.supportsEffort).map(
    (entry) => entry.agentName,
  ),
);

export const CLAUDE_EFFORT_NATIVE_MODEL_IDS = new Set(
  CLAUDE_CURATED_MODELS.filter((entry) => entry.supportsEffort).map(
    (entry) => entry.nativeModelId,
  ),
);

const recommendedModel =
  CLAUDE_CURATED_MODELS.find((entry) => entry.recommended) ??
  CLAUDE_CURATED_MODELS[0];

if (!recommendedModel) {
  throw new Error("Claude manifest must define at least one curated model");
}

export const DEFAULT_CLAUDE_AGENT_NAME = recommendedModel.agentName;
export const DEFAULT_CLAUDE_NATIVE_MODEL_ID = recommendedModel.nativeModelId;

export function getClaudeManifestByAgentName(
  agentName: string | undefined,
): ClaudeCuratedModelManifestEntry | undefined {
  if (!agentName) {
    return undefined;
  }
  return CLAUDE_MANIFEST_BY_AGENT_NAME.get(
    agentName as ClaudeCuratedModelManifestEntry["agentName"],
  );
}

const CLAUDE_CONTEXT_WINDOWS_BY_MODEL_ID = new Map<string, number>(
  CLAUDE_CURATED_MODELS.flatMap((entry) => [
    [entry.nativeModelId, entry.contextWindow],
    ...entry.bedrockAliases.map((alias) => [alias, entry.contextWindow] as const),
    ...(entry.contextWindowAliases ?? []).map((alias) => [
      alias,
      entry.contextWindow,
    ] as const),
  ]),
);

export function getClaudeContextWindowByModelId(
  modelId: string | undefined,
): number | undefined {
  if (!modelId) {
    return undefined;
  }
  return CLAUDE_CONTEXT_WINDOWS_BY_MODEL_ID.get(modelId);
}
