import type { AgentCatalogEntry } from "../../agent-catalog";
import {
  ANTHROPIC_API_KEY,
  OPENAI_API_KEY,
  OPENROUTER_API_KEY,
  XAI_API_KEY,
} from "../../apiKeys";
import { OPENCODE_KNOWN_FREE } from "./free-models";

/**
 * OpenCode catalog - includes both free and paid models.
 *
 * Free model detection uses naming convention heuristics (see free-models.ts):
 * - Models ending with `-free` suffix are free
 * - Known exceptions in OPENCODE_KNOWN_FREE are free
 *
 * See: packages/convex/convex/modelDiscovery.ts for runtime discovery.
 */

// Free model catalog entries
const OPENCODE_FREE_CATALOG: AgentCatalogEntry[] = OPENCODE_KNOWN_FREE.map(
  (modelId) => ({
    name: `opencode/${modelId}`,
    displayName: modelId,
    vendor: "opencode" as const,
    requiredApiKeys: [],
    tier: "free" as const,
    tags: ["free"],
  })
);

// Paid model catalog entries (must match configs.ts OPENCODE_PAID_MODEL_SPECS)
const OPENCODE_PAID_CATALOG: AgentCatalogEntry[] = [
  // xAI/Grok models
  {
    name: "opencode/grok-4-1-fast",
    displayName: "Grok 4.1 Fast",
    vendor: "opencode",
    requiredApiKeys: [XAI_API_KEY.envVar],
    tier: "paid",
    tags: ["xai", "reasoning"],
  },
  {
    name: "opencode/grok-4-1-fast-non-reasoning",
    displayName: "Grok 4.1 Fast (Non-Reasoning)",
    vendor: "opencode",
    requiredApiKeys: [XAI_API_KEY.envVar],
    tier: "paid",
    tags: ["xai"],
  },
  // Anthropic models
  {
    name: "opencode/sonnet-4",
    displayName: "Sonnet 4",
    vendor: "opencode",
    requiredApiKeys: [ANTHROPIC_API_KEY.envVar],
    tier: "paid",
    tags: ["anthropic"],
  },
  {
    name: "opencode/opus-4",
    displayName: "Opus 4",
    vendor: "opencode",
    requiredApiKeys: [ANTHROPIC_API_KEY.envVar],
    tier: "paid",
    tags: ["anthropic", "reasoning"],
  },
  {
    name: "opencode/opus-4.1-20250805",
    displayName: "Opus 4.1",
    vendor: "opencode",
    requiredApiKeys: [ANTHROPIC_API_KEY.envVar],
    tier: "paid",
    tags: ["anthropic", "reasoning", "latest"],
  },
  // OpenRouter models (non-gpt-oss)
  {
    name: "opencode/kimi-k2",
    displayName: "Kimi K2",
    vendor: "opencode",
    requiredApiKeys: [OPENROUTER_API_KEY.envVar],
    tier: "paid",
    tags: ["openrouter", "moonshot"],
  },
  {
    name: "opencode/qwen3-coder",
    displayName: "Qwen3 Coder",
    vendor: "opencode",
    requiredApiKeys: [ANTHROPIC_API_KEY.envVar],
    tier: "paid",
    tags: ["qwen", "coding"],
  },
  {
    name: "opencode/glm-4.5",
    displayName: "GLM 4.5",
    vendor: "opencode",
    requiredApiKeys: [OPENROUTER_API_KEY.envVar],
    tier: "paid",
    tags: ["openrouter", "z-ai"],
  },
  // OpenAI models
  {
    name: "opencode/o3-pro",
    displayName: "o3-pro",
    vendor: "opencode",
    requiredApiKeys: [OPENAI_API_KEY.envVar],
    tier: "paid",
    tags: ["openai", "reasoning"],
  },
  {
    name: "opencode/gpt-5",
    displayName: "GPT-5",
    vendor: "opencode",
    requiredApiKeys: [OPENAI_API_KEY.envVar],
    tier: "paid",
    tags: ["openai", "latest"],
  },
  {
    name: "opencode/gpt-5-mini",
    displayName: "GPT-5 Mini",
    vendor: "opencode",
    requiredApiKeys: [OPENAI_API_KEY.envVar],
    tier: "paid",
    tags: ["openai"],
  },
  // OpenRouter models (gpt-oss)
  {
    name: "opencode/gpt-oss-120b",
    displayName: "GPT-OSS 120B",
    vendor: "opencode",
    requiredApiKeys: [OPENROUTER_API_KEY.envVar],
    tier: "paid",
    tags: ["openrouter", "openai"],
  },
  {
    name: "opencode/gpt-oss-20b",
    displayName: "GPT-OSS 20B",
    vendor: "opencode",
    requiredApiKeys: [OPENROUTER_API_KEY.envVar],
    tier: "paid",
    tags: ["openrouter", "openai"],
  },
];

// Combined catalog: Free models first, then paid models
// Note: gpt-5-nano is conditionally included in configs based on OPENCODE_KNOWN_FREE
// but the catalog includes all models; the conditional logic is handled at runtime
export const OPENCODE_CATALOG: AgentCatalogEntry[] = [
  ...OPENCODE_FREE_CATALOG,
  ...OPENCODE_PAID_CATALOG,
];
