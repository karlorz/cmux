/**
 * Custom Codex Models - Models not in app-server but available via API
 *
 * Codex CLI accepts ANY model name and passes it to the provider.
 * Whether a model works depends on the backend, not the CLI.
 *
 * Add models here that:
 * 1. Are not returned by `codex app-server model/list`
 * 2. Are available via OpenAI API or custom proxy
 * 3. Need to appear in the cmux UI model picker
 *
 * These models are merged with the auto-generated catalog.
 * Custom models with matching names override generated ones.
 *
 * Verified: Codex CLI v0.116+ accepts custom model names like gpt-5.4-mini
 * and routes them to the configured model_provider.
 */

import type { CodexModelEntry } from "./catalog.generated";

/**
 * Custom models available via API but not in Codex app-server.
 *
 * These models have been tested to work with Codex CLI.
 * The CLI accepts them and routes to the configured provider.
 */
export const CODEX_CUSTOM_MODELS: CodexModelEntry[] = [
  // GPT-5.4 Mini - Fast & low-cost option
  // Available via OpenAI API, not in Codex app-server model/list
  // Tested working with Codex CLI v0.116+ via cmux-proxy
  {
    name: "codex/gpt-5.4-mini",
    displayName: "GPT-5.4 Mini",
    description: "Fast & low-cost GPT-5.4 variant. Not in Codex picker but works via API.",
    vendor: "openai",
    requiredApiKeys: ["OPENAI_API_KEY", "CODEX_AUTH_JSON"],
    tier: "paid",
    tags: ["fast", "low-cost", "custom"],
    hidden: false,
    isDefault: false,
    defaultVariant: "medium",
    variants: [
      {
        id: "medium",
        displayName: "Medium",
        description: "Balanced reasoning for everyday tasks",
      },
      {
        id: "high",
        displayName: "High",
        description: "Greater reasoning depth",
      },
    ],
    inputModalities: ["text", "image"],
  },
  // GPT-5 Nano - Ultra-fast, lowest cost
  // May be available via some providers
  {
    name: "codex/gpt-5-nano",
    displayName: "GPT-5 Nano",
    description: "Ultra-fast, lowest cost. Availability depends on provider.",
    vendor: "openai",
    requiredApiKeys: ["OPENAI_API_KEY", "CODEX_AUTH_JSON"],
    tier: "paid",
    tags: ["ultra-fast", "lowest-cost", "custom", "experimental"],
    hidden: false,
    isDefault: false,
    defaultVariant: "medium",
    variants: [
      {
        id: "medium",
        displayName: "Medium",
        description: "Standard reasoning",
      },
    ],
    inputModalities: ["text"],
  },
];

/**
 * Get custom model by name
 */
export function getCustomCodexModel(name: string): CodexModelEntry | undefined {
  return CODEX_CUSTOM_MODELS.find(
    (m) => m.name === name || m.name === `codex/${name}`
  );
}

/**
 * Check if a model is custom (not from app-server)
 */
export function isCustomCodexModel(name: string): boolean {
  return CODEX_CUSTOM_MODELS.some(
    (m) => m.name === name || m.name === `codex/${name}`
  );
}
