import type { AgentCatalogEntry } from "../../agent-catalog";
import {
  CODEX_CATALOG_GENERATED,
  CODEX_VISIBLE_MODELS,
  getDefaultCodexModel,
  getCodexModel,
} from "./catalog.generated";

/**
 * Codex Catalog - Auto-generated from codex app-server.
 *
 * Run `bun run scripts/sync-codex-models.ts` to update the generated catalog.
 *
 * Exports visible models by default for the main UI. Use CODEX_CATALOG_ALL
 * to include hidden/deprecated models.
 */
export const CODEX_CATALOG: AgentCatalogEntry[] = CODEX_VISIBLE_MODELS;

/**
 * All Codex models including hidden ones
 */
export const CODEX_CATALOG_ALL = CODEX_CATALOG_GENERATED;

// Re-export utilities
export { getDefaultCodexModel, getCodexModel };
