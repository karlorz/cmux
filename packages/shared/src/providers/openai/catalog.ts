import type { AgentCatalogEntry } from "../../agent-catalog";

/**
 * Codex Catalog - Flagship models only.
 *
 * This catalog contains only the recommended flagship models with full metadata.
 * Additional models (older versions, variants) are auto-discovered via the
 * OpenAI API discovery cron and stored in the database.
 *
 * Flagship selection criteria:
 * - Latest generation (GPT-5.4)
 * - Fast/low-cost option (GPT-5.4-mini)
 * - Legacy fast option for compatibility (GPT-5.1-codex-mini)
 */
export const CODEX_CATALOG: AgentCatalogEntry[] = [
  // GPT-5.4 - Latest flagship frontier model
  {
    name: "codex/gpt-5.4-xhigh",
    displayName: "GPT-5.4 (XHigh)",
    vendor: "openai",
    requiredApiKeys: ["OPENAI_API_KEY", "CODEX_AUTH_JSON"],
    tier: "paid",
    tags: ["latest", "recommended", "reasoning"],
    contextWindow: 256000,
    maxOutputTokens: 32000,
  },
  {
    name: "codex/gpt-5.4",
    displayName: "GPT-5.4",
    vendor: "openai",
    requiredApiKeys: ["OPENAI_API_KEY", "CODEX_AUTH_JSON"],
    tier: "paid",
    tags: ["latest"],
    contextWindow: 256000,
    maxOutputTokens: 32000,
  },
  // GPT-5.4-mini - Fast & low-cost option
  {
    name: "codex/gpt-5.4-mini",
    displayName: "GPT-5.4 Mini (Fast & Low-Cost)",
    vendor: "openai",
    requiredApiKeys: ["OPENAI_API_KEY", "CODEX_AUTH_JSON"],
    tier: "paid",
    tags: ["fast", "low-cost"],
    contextWindow: 128000,
    maxOutputTokens: 16000,
  },
  // GPT-5.1-codex-mini - Legacy fast option for compatibility
  {
    name: "codex/gpt-5.1-codex-mini",
    displayName: "GPT-5.1 Codex Mini",
    vendor: "openai",
    requiredApiKeys: ["OPENAI_API_KEY", "CODEX_AUTH_JSON"],
    tier: "paid",
    tags: ["fast", "legacy"],
  },
];
