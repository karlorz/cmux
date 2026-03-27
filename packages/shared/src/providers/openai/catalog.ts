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
 * This catalog is for the **Codex CLI** (coding agent) model picker.
 * Run `bun run scripts/sync-codex-models.ts` to update.
 *
 * NOTE: This is SEPARATE from `packages/shared/src/utils/platform-ai.ts`
 * which defines models for cmux's internal AI services (crown, commit gen, etc.)
 * Platform AI uses different models like gpt-5.4-mini that may not be in Codex.
 */
export const CODEX_CATALOG: AgentCatalogEntry[] = CODEX_VISIBLE_MODELS;

/**
 * All Codex models including hidden ones
 */
export const CODEX_CATALOG_ALL = CODEX_CATALOG_GENERATED;

// Re-export utilities
export { getDefaultCodexModel, getCodexModel };
