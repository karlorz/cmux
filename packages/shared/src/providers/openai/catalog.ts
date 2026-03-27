import type { AgentCatalogEntry } from "../../agent-catalog";
import {
  CODEX_CATALOG_GENERATED,
  CODEX_VISIBLE_MODELS,
  getDefaultCodexModel as getDefaultGenerated,
  getCodexModel as getGeneratedModel,
  type CodexModelEntry,
} from "./catalog.generated";
import {
  CODEX_CUSTOM_MODELS,
  getCustomCodexModel,
  isCustomCodexModel,
} from "./catalog.custom";

/**
 * Merge custom models with generated catalog.
 * Custom models override generated ones with the same name.
 *
 * Note: Codex CLI accepts ANY model name - it routes to the provider.
 * Custom models work if the backend (OpenAI API / proxy) supports them.
 */
function mergeModels(
  generated: CodexModelEntry[],
  custom: CodexModelEntry[]
): CodexModelEntry[] {
  const merged = new Map<string, CodexModelEntry>();
  for (const model of generated) merged.set(model.name, model);
  for (const model of custom) merged.set(model.name, model);
  return Array.from(merged.values());
}

/**
 * Codex Catalog - Auto-generated from app-server + custom models.
 *
 * Sources:
 * 1. `catalog.generated.ts` - From `codex app-server model/list` (sync daily)
 * 2. `catalog.custom.ts` - Custom models not in app-server but available via API
 *
 * NOTE: This is SEPARATE from `packages/shared/src/utils/platform-ai.ts`
 * which defines models for cmux's internal AI services (crown, commit gen, etc.)
 */
export const CODEX_CATALOG: AgentCatalogEntry[] = mergeModels(
  CODEX_VISIBLE_MODELS,
  CODEX_CUSTOM_MODELS.filter((m) => !m.hidden)
);

/**
 * All Codex models including hidden and custom ones
 */
export const CODEX_CATALOG_ALL = mergeModels(
  CODEX_CATALOG_GENERATED,
  CODEX_CUSTOM_MODELS
);

/**
 * Get the default Codex model
 */
export function getDefaultCodexModel(): CodexModelEntry | undefined {
  return getDefaultGenerated();
}

/**
 * Get model by name (checks custom first, then generated)
 */
export function getCodexModel(name: string): CodexModelEntry | undefined {
  return getCustomCodexModel(name) ?? getGeneratedModel(name);
}

// Re-export for consumers
export { isCustomCodexModel, CODEX_CUSTOM_MODELS };
