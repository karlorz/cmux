import type { AgentCatalogEntry } from "../../agent-catalog";
import { OPENCODE_FREE_MODEL_IDS } from "./free-models.generated";

// Free models dynamically generated from opencode.ai
const OPENCODE_FREE_CATALOG: AgentCatalogEntry[] = OPENCODE_FREE_MODEL_IDS.map(
  (modelId) => ({
    name: `opencode/${modelId}`,
    displayName: modelId,
    vendor: "opencode" as const,
    requiredApiKeys: [],
    tier: "free" as const,
    tags: ["free"],
  })
);

// Paid models with specific provider API keys
const OPENCODE_PAID_CATALOG: AgentCatalogEntry[] = [
  {
    name: "opencode/grok-4-1-fast",
    displayName: "Grok 4.1 Fast",
    vendor: "opencode",
    requiredApiKeys: ["XAI_API_KEY"],
    tier: "paid",
  },
  {
    name: "opencode/grok-4-1-fast-non-reasoning",
    displayName: "Grok 4.1 Fast (Non-Reasoning)",
    vendor: "opencode",
    requiredApiKeys: ["XAI_API_KEY"],
    tier: "paid",
  },
  {
    name: "opencode/sonnet-4",
    displayName: "Sonnet 4",
    vendor: "opencode",
    requiredApiKeys: ["ANTHROPIC_API_KEY"],
    tier: "paid",
  },
  {
    name: "opencode/opus-4",
    displayName: "Opus 4",
    vendor: "opencode",
    requiredApiKeys: ["ANTHROPIC_API_KEY"],
    tier: "paid",
  },
  {
    name: "opencode/opus-4.1-20250805",
    displayName: "Opus 4.1 (20250805)",
    vendor: "opencode",
    requiredApiKeys: ["ANTHROPIC_API_KEY"],
    tier: "paid",
  },
  {
    name: "opencode/kimi-k2",
    displayName: "Kimi K2",
    vendor: "opencode",
    requiredApiKeys: ["OPENROUTER_API_KEY"],
    tier: "paid",
  },
  {
    name: "opencode/qwen3-coder",
    displayName: "Qwen3 Coder",
    vendor: "opencode",
    requiredApiKeys: ["ANTHROPIC_API_KEY"],
    tier: "paid",
  },
  {
    name: "opencode/glm-4.5",
    displayName: "GLM 4.5",
    vendor: "opencode",
    requiredApiKeys: ["OPENROUTER_API_KEY"],
    tier: "paid",
  },
  {
    name: "opencode/o3-pro",
    displayName: "o3-pro",
    vendor: "opencode",
    requiredApiKeys: ["OPENAI_API_KEY"],
    tier: "paid",
  },
  {
    name: "opencode/gpt-5",
    displayName: "GPT-5",
    vendor: "opencode",
    requiredApiKeys: ["OPENAI_API_KEY"],
    tier: "paid",
  },
  {
    name: "opencode/gpt-5-mini",
    displayName: "GPT-5 Mini",
    vendor: "opencode",
    requiredApiKeys: ["OPENAI_API_KEY"],
    tier: "paid",
  },
  {
    name: "opencode/gpt-5-nano",
    displayName: "GPT-5 Nano",
    vendor: "opencode",
    requiredApiKeys: ["OPENAI_API_KEY"],
    tier: "paid",
  },
  {
    name: "opencode/gpt-oss-120b",
    displayName: "GPT-OSS 120B",
    vendor: "opencode",
    requiredApiKeys: ["OPENROUTER_API_KEY"],
    tier: "paid",
  },
  {
    name: "opencode/gpt-oss-20b",
    displayName: "GPT-OSS 20B",
    vendor: "opencode",
    requiredApiKeys: ["OPENROUTER_API_KEY"],
    tier: "paid",
  },
];

// Set to track free model names for conditional exclusion
const OPENCODE_FREE_MODEL_NAME_SET = new Set(
  OPENCODE_FREE_CATALOG.map((entry) => entry.name)
);

export const OPENCODE_CATALOG: AgentCatalogEntry[] = [
  ...OPENCODE_FREE_CATALOG,
  ...OPENCODE_PAID_CATALOG.filter(
    // Exclude gpt-5-nano if it already exists in free models
    (entry) =>
      entry.name !== "opencode/gpt-5-nano" ||
      !OPENCODE_FREE_MODEL_NAME_SET.has("opencode/gpt-5-nano")
  ),
];
