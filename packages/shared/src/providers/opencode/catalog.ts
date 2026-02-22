import type { AgentCatalogEntry } from "../../agent-catalog";
import { OPENCODE_FREE_MODEL_IDS } from "./free-models.generated";

/**
 * OpenCode catalog - only includes FREE models discovered at build-time.
 *
 * Design rationale:
 * - Free models: Discovered via probing at build-time (scripts/update-opencode-free-models.mjs)
 * - Paid models: Discovered at RUNTIME via Convex modelDiscovery.discoverOpencodeModels
 *
 * This avoids hardcoding paid model lists that go stale. The runtime discovery
 * fetches from https://opencode.ai/zen/v1/models and marks non-free models
 * with requiredApiKeys: ["OPENCODE_API_KEY"].
 *
 * See: packages/convex/convex/modelDiscovery.ts
 */
export const OPENCODE_CATALOG: AgentCatalogEntry[] = OPENCODE_FREE_MODEL_IDS.map(
  (modelId) => ({
    name: `opencode/${modelId}`,
    displayName: modelId,
    vendor: "opencode" as const,
    requiredApiKeys: [],
    tier: "free" as const,
    tags: ["free"],
  })
);
