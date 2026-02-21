/**
 * Agent Catalog - Pure metadata for UI display, separated from execution config.
 *
 * This module provides lightweight agent metadata that can be safely imported
 * by client-side code without pulling in Node-dependent execution logic.
 *
 * For server-side execution configuration (commands, args, environment functions),
 * see agentConfig.ts.
 */

export type AgentVendor =
  | "anthropic"
  | "openai"
  | "google"
  | "opencode"
  | "qwen"
  | "cursor"
  | "amp"
  | "xai"
  | "openrouter";

export type ModelTier = "free" | "paid";

export interface AgentCatalogEntry {
  /** Stable ID matching AgentConfig.name, e.g. "claude/opus-4.6" */
  name: string;
  /** Human-readable label, e.g. "Opus 4.6" */
  displayName: string;
  /** Vendor for grouping & logo selection */
  vendor: AgentVendor;
  /** Environment variable names required for this agent */
  requiredApiKeys: string[];
  /** Pricing tier */
  tier: ModelTier;
  /** Whether this agent is disabled in the UI */
  disabled?: boolean;
  /** Reason shown in tooltip when disabled */
  disabledReason?: string;
  /** Optional tags for filtering, e.g. ["reasoning", "free"] */
  tags?: string[];
}

// Import per-provider catalogs
import { AMP_CATALOG } from "./providers/amp/catalog";
import { CLAUDE_CATALOG } from "./providers/anthropic/catalog";
import { CURSOR_CATALOG } from "./providers/cursor/catalog";
import { GEMINI_CATALOG } from "./providers/gemini/catalog";
import { CODEX_CATALOG } from "./providers/openai/catalog";
import { OPENCODE_CATALOG } from "./providers/opencode/catalog";
import { QWEN_CATALOG } from "./providers/qwen/catalog";

/**
 * Aggregated catalog of all agent entries.
 * Order matches AGENT_CONFIGS in agentConfig.ts for consistent UI display.
 */
export const AGENT_CATALOG: AgentCatalogEntry[] = [
  ...CLAUDE_CATALOG,
  ...CODEX_CATALOG,
  ...AMP_CATALOG,
  ...OPENCODE_CATALOG,
  ...GEMINI_CATALOG,
  ...QWEN_CATALOG,
  ...CURSOR_CATALOG,
];

// Re-export individual catalogs for granular imports
export {
  AMP_CATALOG,
  CLAUDE_CATALOG,
  CODEX_CATALOG,
  CURSOR_CATALOG,
  GEMINI_CATALOG,
  OPENCODE_CATALOG,
  QWEN_CATALOG,
};
