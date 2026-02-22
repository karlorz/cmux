"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import {
  AGENT_CATALOG,
  getVariantsForVendor,
  type AgentVendor,
} from "@cmux/shared/agent-catalog";

const OPENCODE_ZEN_MODELS_URL = "https://opencode.ai/zen/v1/models";
const OPENCODE_CHAT_COMPLETIONS_URL =
  "https://opencode.ai/zen/v1/chat/completions";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

/**
 * Fetch model IDs from OpenCode Zen API
 */
async function fetchOpencodeModelIds(): Promise<string[]> {
  const response = await fetch(OPENCODE_ZEN_MODELS_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch OpenCode models: HTTP ${response.status} ${response.statusText}`
    );
  }

  const payload = (await response.json()) as {
    data?: Array<{ id?: string }>;
  };
  const ids =
    payload?.data?.map((entry) => entry?.id).filter(Boolean) ?? [];

  return ids as string[];
}

/**
 * Probe a model to check if it responds without authentication (free tier)
 */
async function probeModelFree(
  modelId: string
): Promise<{ modelId: string; free: boolean }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(OPENCODE_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { modelId, free: false };
    }

    const data = (await response.json()) as { choices?: unknown[] };
    const isFree = Array.isArray(data?.choices);
    return { modelId, free: isFree };
  } catch {
    return { modelId, free: false };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Discover models from OpenCode Zen API and upsert them into the models table.
 * Free models (those that respond without auth) are marked as such.
 */
export const discoverOpencodeModels = internalAction({
  args: {},
  handler: async (ctx): Promise<{
    discovered: number;
    free: number;
    paid: number;
  }> => {
    console.log("[modelDiscovery] Starting OpenCode model discovery...");

    const modelIds = await fetchOpencodeModelIds();
    console.log(`[modelDiscovery] Found ${modelIds.length} models from API`);

    // Probe models sequentially to avoid rate limiting
    const results: Array<{ modelId: string; free: boolean }> = [];
    for (const modelId of modelIds) {
      const result = await probeModelFree(modelId);
      console.log(
        `[modelDiscovery] ${result.free ? "FREE" : "PAID"}: ${modelId}`
      );
      results.push(result);
    }

    const freeModels = results.filter((r) => r.free).map((r) => r.modelId);
    const paidModels = results.filter((r) => !r.free).map((r) => r.modelId);

    console.log(
      `[modelDiscovery] Free: ${freeModels.length}, Paid: ${paidModels.length}`
    );

    const now = Date.now();
    const modelsToUpsert = [];

    // Prepare free models
    for (const modelId of freeModels) {
      modelsToUpsert.push({
        name: `opencode/${modelId}`,
        displayName: modelId,
        vendor: "opencode",
        source: "discovered" as const,
        discoveredFrom: "opencode-zen",
        discoveredAt: now,
        requiredApiKeys: [] as string[],
        tier: "free" as const,
        tags: ["free", "discovered"],
      });
    }

    // Prepare paid models - all OpenCode paid models require OPENCODE_API_KEY
    // (OpenCode is a unified proxy, so all non-free models use the same key)
    for (const modelId of paidModels) {
      modelsToUpsert.push({
        name: `opencode/${modelId}`,
        displayName: modelId,
        vendor: "opencode",
        source: "discovered" as const,
        discoveredFrom: "opencode-zen",
        discoveredAt: now,
        requiredApiKeys: ["OPENCODE_API_KEY"],
        tier: "paid" as const,
        tags: ["discovered"],
      });
    }

    // Bulk upsert all discovered models
    if (modelsToUpsert.length > 0) {
      const result = await ctx.runMutation(internal.models.bulkUpsert, {
        models: modelsToUpsert,
      });
      console.log(
        `[modelDiscovery] Upserted ${result.upsertedCount} models`
      );
    }

    return {
      discovered: modelIds.length,
      free: freeModels.length,
      paid: paidModels.length,
    };
  },
});

/**
 * OpenRouter model type from their API
 */
interface OpenRouterModel {
  id: string;
  name: string;
  pricing?: { prompt: string; completion: string };
  context_length?: number;
}

/**
 * Fetch models from OpenRouter API (public, no auth required)
 */
async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  const response = await fetch(OPENROUTER_MODELS_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch OpenRouter models: HTTP ${response.status} ${response.statusText}`
    );
  }
  const payload = (await response.json()) as { data?: OpenRouterModel[] };
  return payload.data ?? [];
}

/**
 * Discover models from OpenRouter API and upsert them into the models table.
 * Free models are determined by pricing.prompt === "0".
 */
export const discoverOpenRouterModels = internalAction({
  args: {},
  handler: async (
    ctx
  ): Promise<{ discovered: number; free: number; paid: number }> => {
    console.log("[modelDiscovery] Starting OpenRouter model discovery...");

    const models = await fetchOpenRouterModels();
    console.log(
      `[modelDiscovery] Found ${models.length} models from OpenRouter API`
    );

    const now = Date.now();
    const modelsToUpsert = models.map((model) => {
      // Free if: id ends with ":free" OR prompt price is "0"
      // Based on OpenClaw's model-scan.ts detection logic
      const isFree =
        model.id.endsWith(":free") ||
        model.pricing?.prompt === "0" ||
        parseFloat(model.pricing?.prompt ?? "1") === 0;

      return {
        name: `openrouter/${model.id}`,
        displayName: model.name || model.id,
        vendor: "openrouter",
        source: "discovered" as const,
        discoveredFrom: "openrouter-api",
        discoveredAt: now,
        requiredApiKeys: isFree ? ([] as string[]) : ["OPENROUTER_API_KEY"],
        tier: isFree ? ("free" as const) : ("paid" as const),
        tags: isFree ? ["free", "discovered"] : ["discovered"],
      };
    });

    if (modelsToUpsert.length > 0) {
      const result = await ctx.runMutation(internal.models.bulkUpsert, {
        models: modelsToUpsert,
      });
      console.log(
        `[modelDiscovery] Upserted ${result.upsertedCount} OpenRouter models`
      );
    }

    const freeCount = modelsToUpsert.filter((m) => m.tier === "free").length;
    return {
      discovered: models.length,
      free: freeCount,
      paid: models.length - freeCount,
    };
  },
});

/**
 * Seed the models table from the static AGENT_CATALOG.
 * This imports curated models that are defined in code.
 * Also cleans up stale curated models that are no longer in the catalog.
 */
export const seedCuratedModels = internalAction({
  args: {},
  handler: async (ctx): Promise<{ seededCount: number; deletedCount: number }> => {
    console.log("[modelDiscovery] Seeding curated models from AGENT_CATALOG...");

    const modelsToUpsert = AGENT_CATALOG.map((entry, index) => {
      // Get vendor-specific variants or use entry's custom variants
      const variants =
        entry.variants ?? getVariantsForVendor(entry.vendor as AgentVendor);

      return {
        name: entry.name,
        displayName: entry.displayName,
        vendor: entry.vendor,
        source: "curated" as const,
        requiredApiKeys: entry.requiredApiKeys,
        tier: entry.tier,
        tags: entry.tags ?? [],
        sortOrder: index, // Preserve catalog order
        disabled: entry.disabled,
        disabledReason: entry.disabledReason,
        variants,
        defaultVariant: entry.defaultVariant ?? "default",
      };
    });

    // Upsert all curated models
    const result = await ctx.runMutation(internal.models.bulkUpsert, {
      models: modelsToUpsert,
    });

    // Clean up stale curated models no longer in catalog
    const validNames = AGENT_CATALOG.map((e) => e.name);
    const deleteResult = await ctx.runMutation(internal.models.deleteStale, {
      validNames,
      source: "curated",
    });

    if (deleteResult.deletedCount > 0) {
      console.log(
        `[modelDiscovery] Deleted ${deleteResult.deletedCount} stale curated models: ${deleteResult.deletedNames.join(", ")}`
      );
    }

    console.log(
      `[modelDiscovery] Seeded ${result.upsertedCount} curated models, deleted ${deleteResult.deletedCount} stale`
    );

    return {
      seededCount: result.upsertedCount,
      deletedCount: deleteResult.deletedCount,
    };
  },
});

/**
 * Public action to trigger discovery from www routes.
 * Requires authentication.
 */
export const triggerDiscovery = action({
  args: { teamSlugOrId: v.string() },
  handler: async (ctx, _args): Promise<{
    success: boolean;
    message: string;
  }> => {
    // Manual auth check for actions
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Authentication required");
    }

    // Run internal discovery action
    const discoverResult = await ctx.runAction(
      internal.modelDiscovery.discoverOpencodeModels,
      {}
    );

    return {
      success: true,
      message: `Discovered ${discoverResult.discovered} models (${discoverResult.free} free, ${discoverResult.paid} paid)`,
    };
  },
});

/**
 * Public action to seed curated models from www routes.
 * Requires authentication.
 */
export const triggerSeed = action({
  args: { teamSlugOrId: v.string() },
  handler: async (ctx, _args): Promise<{
    success: boolean;
    seededCount: number;
    deletedCount: number;
  }> => {
    // Manual auth check for actions
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Authentication required");
    }

    // Run internal seed action
    const result = await ctx.runAction(
      internal.modelDiscovery.seedCuratedModels,
      {}
    );

    return {
      success: true,
      seededCount: result.seededCount,
      deletedCount: result.deletedCount,
    };
  },
});

/**
 * Public action to run full refresh (seed + discover).
 * Requires authentication.
 */
export const triggerRefresh = action({
  args: { teamSlugOrId: v.string() },
  handler: async (
    ctx,
    _args
  ): Promise<{
    success: boolean;
    curated: number;
    discovered: number;
    free: number;
    paid: number;
    openrouter?: { discovered: number; free: number; paid: number };
  }> => {
    // Manual auth check for actions
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Authentication required");
    }

    // First seed curated models
    const seedResult = await ctx.runAction(
      internal.modelDiscovery.seedCuratedModels,
      {}
    );

    // Discover from OpenCode
    const opcodeResult = await ctx.runAction(
      internal.modelDiscovery.discoverOpencodeModels,
      {}
    );

    // Discover from OpenRouter
    let openrouterResult:
      | { discovered: number; free: number; paid: number }
      | undefined;
    try {
      openrouterResult = await ctx.runAction(
        internal.modelDiscovery.discoverOpenRouterModels,
        {}
      );
    } catch (error) {
      console.error("[modelDiscovery] OpenRouter discovery failed:", error);
    }

    return {
      success: true,
      curated: seedResult.seededCount,
      discovered: opcodeResult.discovered + (openrouterResult?.discovered ?? 0),
      free: opcodeResult.free + (openrouterResult?.free ?? 0),
      paid: opcodeResult.paid + (openrouterResult?.paid ?? 0),
      openrouter: openrouterResult,
    };
  },
});
