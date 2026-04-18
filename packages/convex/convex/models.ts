import { v } from "convex/values";
import { query, internalMutation, internalQuery } from "./_generated/server";
import { authMutation, authQuery } from "./users/utils";
import { resolveTeamIdLoose } from "../_shared/team";
import { isAuthFreeModel } from "@cmux/shared/providers/control-plane";
import { AGENT_CATALOG } from "@cmux/shared/agent-catalog";
import {
  hasAnthropicCustomEndpointConfigured,
  requiresAnthropicCustomEndpoint,
} from "@cmux/shared/providers/anthropic/models";

const CUSTOM_CLAUDE_MODEL_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CUSTOM_CLAUDE_AGENT_PREFIX = "claude/";
const CUSTOM_CLAUDE_DEFAULT_CONTEXT_WINDOW = 200000;
const CUSTOM_CLAUDE_DEFAULT_MAX_OUTPUT_TOKENS = 32000;
const CUSTOM_CLAUDE_MODEL_TAGS = ["custom", "proxy"] as const;
const LEGACY_PRESEEDED_CUSTOM_CLAUDE_MODEL_NAMES = new Set([
  "claude/gpt-5.1-codex-mini",
]);

function isLegacyPreseededCustomClaudeModel(model: {
  name: string;
  source?: string;
}): boolean {
  return (
    model.source === "curated" &&
    LEGACY_PRESEEDED_CUSTOM_CLAUDE_MODEL_NAMES.has(model.name)
  );
}

function filterLegacyPreseededCustomClaudeModels<
  T extends { name: string; source?: string },
>(models: T[]): T[] {
  return models.filter((model) => !isLegacyPreseededCustomClaudeModel(model));
}

function normalizeCustomClaudeModelId(rawModelId: string): string {
  return rawModelId.trim();
}

function normalizeOptionalDescription(rawDescription: string | undefined): string | undefined {
  const normalized = rawDescription?.trim();
  return normalized ? normalized : undefined;
}

function buildCustomClaudeModelName(modelId: string): string {
  return `${CUSTOM_CLAUDE_AGENT_PREFIX}${modelId}`;
}

function toCustomClaudeModelCatalogEntry(
  customModel: {
    _id: string;
    name: string;
    modelId: string;
    displayName: string;
    description?: string;
    enabled: boolean;
    sortOrder: number;
    createdAt: number;
    updatedAt: number;
  },
) {
  return {
    _id: customModel._id,
    name: customModel.name,
    displayName: customModel.displayName,
    vendor: "anthropic",
    source: "custom" as const,
    requiredApiKeys: ["ANTHROPIC_API_KEY"],
    tier: "paid" as const,
    tags: [...CUSTOM_CLAUDE_MODEL_TAGS],
    enabled: customModel.enabled,
    sortOrder: customModel.sortOrder,
    variants: [],
    defaultVariant: undefined,
    disabled: false,
    disabledReason: undefined,
    contextWindow: CUSTOM_CLAUDE_DEFAULT_CONTEXT_WINDOW,
    maxOutputTokens: CUSTOM_CLAUDE_DEFAULT_MAX_OUTPUT_TOKENS,
    createdAt: customModel.createdAt,
    updatedAt: customModel.updatedAt,
    customModelId: customModel.modelId,
    customModelDescription: customModel.description,
  };
}

function catalogDefinesVariants(
  catalogEntry: (typeof AGENT_CATALOG)[number] | undefined,
): boolean {
  return (
    catalogEntry !== undefined &&
    Object.prototype.hasOwnProperty.call(catalogEntry, "variants")
  );
}

function catalogDefinesDefaultVariant(
  catalogEntry: (typeof AGENT_CATALOG)[number] | undefined,
): boolean {
  return (
    catalogEntry !== undefined &&
    Object.prototype.hasOwnProperty.call(catalogEntry, "defaultVariant")
  );
}

function applyCatalogVariantOverrides<
  T extends {
    name: string;
    variants?: Array<{ id: string; displayName: string; description?: string }>;
    defaultVariant?: string;
  },
>(model: T): T {
  const catalogEntry = AGENT_CATALOG.find((entry) => entry.name === model.name);
  if (!catalogEntry) {
    return model;
  }

  const hasCatalogVariants = catalogDefinesVariants(catalogEntry);
  const hasCatalogDefaultVariant = catalogDefinesDefaultVariant(catalogEntry);

  return {
    ...model,
    variants: hasCatalogVariants ? catalogEntry?.variants : undefined,
    defaultVariant: hasCatalogDefaultVariant
      ? catalogEntry?.defaultVariant
      : undefined,
  };
}

/**
 * Public query: list enabled models for CLI/UI consumption.
 * Returns models sorted by sortOrder, filtered to only enabled ones.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const models = await ctx.db
      .query("models")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();
    const visibleGlobalModels = filterLegacyPreseededCustomClaudeModels(models);
    return visibleGlobalModels.sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
  },
});

/**
 * Admin query: list all models including disabled ones.
 * Adds hiddenForTeam to distinguish team-level visibility from global enabled state.
 * Requires authentication.
 */
export const listAll = authQuery({
  args: { teamSlugOrId: v.string() },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    const [models, customClaudeModels, teamVisibility] = await Promise.all([
      ctx.db.query("models").collect(),
      ctx.db
        .query("teamCustomClaudeModels")
        .withIndex("by_team", (q) => q.eq("teamId", teamId))
        .collect(),
      ctx.db
        .query("teamModelVisibility")
        .withIndex("by_team", (q) => q.eq("teamId", teamId))
        .first(),
    ]);

    const hiddenModels = new Set(teamVisibility?.hiddenModels ?? []);
    const visibleGlobalModels = filterLegacyPreseededCustomClaudeModels(models);
    const mergedModels = [
      ...visibleGlobalModels.map((model) =>
        applyCatalogVariantOverrides(model),
      ),
      ...customClaudeModels.map((model) => toCustomClaudeModelCatalogEntry(model)),
    ].sort((a, b) => a.sortOrder - b.sortOrder);

    return mergedModels
      .map((model) => ({
        ...model,
        hiddenForTeam: hiddenModels.has(model.name),
      }));
  },
});

/**
 * List available models filtered by team's configured API keys.
 * Returns only models the team can actually use
 * (has required keys or is an auth-free free tier model).
 * Requires authentication.
 */
export const listAvailable = authQuery({
  args: {
    teamSlugOrId: v.string(),
    showAll: v.optional(v.boolean()), // If true, returns all models ignoring credentials
  },
  handler: async (ctx, args) => {
    // Verify user has access to the team and get teamId
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    console.log(
      `[listAvailable] teamSlugOrId=${args.teamSlugOrId}, resolved teamId=${teamId}`,
    );

    const [models, customClaudeModels, teamVisibility, workspaceSettings, anthropicOverride] =
      await Promise.all([
        ctx.db
          .query("models")
          .withIndex("by_enabled", (q) => q.eq("enabled", true))
          .collect(),
        ctx.db
          .query("teamCustomClaudeModels")
          .withIndex("by_team", (q) => q.eq("teamId", teamId))
          .collect(),
        ctx.db
          .query("teamModelVisibility")
          .withIndex("by_team", (q) => q.eq("teamId", teamId))
          .first(),
        ctx.db
          .query("workspaceSettings")
          .withIndex("by_team_user", (q) =>
            q.eq("teamId", teamId).eq("userId", userId),
          )
          .first(),
        ctx.db
          .query("providerOverrides")
          .withIndex("by_team_provider", (q) =>
            q.eq("teamId", teamId).eq("providerId", "anthropic"),
          )
          .first(),
      ]);
    const hiddenModels = new Set(teamVisibility?.hiddenModels ?? []);

    const enabledCustomClaudeModels = customClaudeModels
      .filter((model) => model.enabled)
      .map((model) => toCustomClaudeModelCatalogEntry(model));
    const visibleGlobalModels = filterLegacyPreseededCustomClaudeModels(models);
    const mergedModels = [
      ...visibleGlobalModels.map((model) =>
        applyCatalogVariantOverrides(model),
      ),
      ...enabledCustomClaudeModels,
    ].sort((a, b) => a.sortOrder - b.sortOrder);

    console.log(`[listAvailable] Found ${mergedModels.length} enabled models`);
    console.log(
      `[listAvailable] Found ${hiddenModels.size} team-hidden models`,
    );

    const visibleModels = mergedModels.filter(
      (model) => !hiddenModels.has(model.name),
    );

    // If showAll is true, return all team-visible enabled models without credential filtering
    if (args.showAll) {
      return visibleModels.sort((a, b) => a.sortOrder - b.sortOrder);
    }

    // Get team's configured API keys
    const apiKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();

    const configuredKeyEnvVars = new Set(apiKeys.map((k) => k.envVar));
    const storedApiKeys = Object.fromEntries(
      apiKeys.map((key) => [key.envVar, key.value]),
    );
    const hasAnthropicCustomEndpoint = hasAnthropicCustomEndpointConfigured({
      apiKeys: {
        ANTHROPIC_BASE_URL:
          typeof storedApiKeys.ANTHROPIC_BASE_URL === "string"
            ? storedApiKeys.ANTHROPIC_BASE_URL
            : undefined,
      },
      bypassAnthropicProxy: workspaceSettings?.bypassAnthropicProxy ?? false,
      providerOverrides: anthropicOverride
        ? [
            {
              providerId: anthropicOverride.providerId,
              enabled: anthropicOverride.enabled,
              baseUrl: anthropicOverride.baseUrl,
              apiFormat: anthropicOverride.apiFormat,
            },
          ]
        : [],
    });

    // Filter models by availability
    const availableModels = visibleModels.filter((model) => {
      if (
        requiresAnthropicCustomEndpoint(model.name) &&
        !hasAnthropicCustomEndpoint
      ) {
        return false;
      }
      // Auth-free free tier models are always available
      if (isAuthFreeModel(model)) return true;
      // Models with no required keys are available
      if (!model.requiredApiKeys || model.requiredApiKeys.length === 0)
        return true;
      // Check if any required key is configured
      return model.requiredApiKeys.some((key) => configuredKeyEnvVars.has(key));
    });

    // Log Claude models filtering for debugging
    const claudeModels = visibleModels.filter((m) =>
      m.name.startsWith("claude/"),
    );
    console.log(
      `[listAvailable] Claude models in DB: ${claudeModels.map((m) => `${m.name}(keys: ${m.requiredApiKeys?.join(",") || "none"})`).join(", ")}`,
    );
    const claudeAvailable = availableModels.filter((m) =>
      m.name.startsWith("claude/"),
    );
    console.log(
      `[listAvailable] Claude models available after filtering: ${claudeAvailable.length}`,
    );

    console.log(
      `[listAvailable] Returning ${availableModels.length} available models`,
    );
    return availableModels.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

/**
 * Admin mutation: toggle the system-global enabled state of a model.
 */
export const setEnabled = authMutation({
  args: {
    teamSlugOrId: v.string(),
    modelName: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Verify user has access to the team
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    const [model, customModel] = await Promise.all([
      ctx.db
        .query("models")
        .withIndex("by_name", (q) => q.eq("name", args.modelName))
        .first(),
      ctx.db
        .query("teamCustomClaudeModels")
        .withIndex("by_team_name", (q) =>
          q.eq("teamId", teamId).eq("name", args.modelName),
        )
        .first(),
    ]);

    if (customModel) {
      await ctx.db.patch(customModel._id, {
        enabled: args.enabled,
        updatedAt: Date.now(),
        updatedBy: userId,
      });
      return { success: true };
    }

    if (model) {
      await ctx.db.patch(model._id, {
        enabled: args.enabled,
        updatedAt: Date.now(),
      });
      return { success: true };
    }

    throw new Error(`Model not found: ${args.modelName}`);
  },
});

/**
 * Admin mutation: reorder models via drag-and-drop.
 * Accepts an array of model names in the new order.
 */
export const reorder = authMutation({
  args: {
    teamSlugOrId: v.string(),
    modelNames: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // Verify user has access to the team
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    const now = Date.now();
    const [models, customModels] = await Promise.all([
      ctx.db.query("models").collect(),
      ctx.db
        .query("teamCustomClaudeModels")
        .withIndex("by_team", (q) => q.eq("teamId", teamId))
        .collect(),
    ]);

    const modelByName = new Map(models.map((model) => [model.name, model]));
    const customModelByName = new Map(
      customModels.map((model) => [model.name, model]),
    );

    const patches: Array<Promise<unknown>> = [];
    args.modelNames.forEach((name, index) => {
      const model = modelByName.get(name);
      if (model) {
        patches.push(
          ctx.db.patch(model._id, {
            sortOrder: index,
            updatedAt: now,
          }),
        );
      }

      const customModel = customModelByName.get(name);
      if (customModel) {
        patches.push(
          ctx.db.patch(customModel._id, {
            sortOrder: index,
            updatedAt: now,
            updatedBy: userId,
          }),
        );
      }
    });

    await Promise.all(patches);

    return { success: true };
  },
});

/**
 * Team query: list custom Claude models configured for this team.
 */
export const listTeamCustomClaudeModels = authQuery({
  args: {
    teamSlugOrId: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    return ctx.db
      .query("teamCustomClaudeModels")
      .withIndex("by_team_sort_order", (q) => q.eq("teamId", teamId))
      .collect();
  },
});

/**
 * Team mutation: create a custom Claude model entry.
 */
export const createCustomClaudeModel = authMutation({
  args: {
    teamSlugOrId: v.string(),
    modelId: v.string(),
    displayName: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const modelId = normalizeCustomClaudeModelId(args.modelId);
    if (!CUSTOM_CLAUDE_MODEL_ID_REGEX.test(modelId)) {
      throw new Error(
        "Invalid model ID. Use letters, numbers, dot, underscore, colon, or hyphen.",
      );
    }

    const displayName = args.displayName.trim();
    if (!displayName) {
      throw new Error("Display name is required");
    }

    const name = buildCustomClaudeModelName(modelId);
    const [existingGlobalModel, existingCustomModel, allModels, allTeamCustomModels] =
      await Promise.all([
        ctx.db
          .query("models")
          .withIndex("by_name", (q) => q.eq("name", name))
          .first(),
        ctx.db
          .query("teamCustomClaudeModels")
          .withIndex("by_team_name", (q) => q.eq("teamId", teamId).eq("name", name))
          .first(),
        ctx.db.query("models").collect(),
        ctx.db
          .query("teamCustomClaudeModels")
          .withIndex("by_team", (q) => q.eq("teamId", teamId))
          .collect(),
      ]);

    if (
      existingGlobalModel &&
      !isLegacyPreseededCustomClaudeModel(existingGlobalModel)
    ) {
      throw new Error(`Model already exists: ${name}`);
    }

    if (existingCustomModel) {
      throw new Error(`Model already exists: ${name}`);
    }

    if (existingGlobalModel) {
      await ctx.db.delete(existingGlobalModel._id);
    }

    const maxSortOrder = Math.max(
      -1,
      ...filterLegacyPreseededCustomClaudeModels(allModels).map(
        (model) => model.sortOrder,
      ),
      ...allTeamCustomModels.map((model) => model.sortOrder),
    );
    const now = Date.now();

    const insertedId = await ctx.db.insert("teamCustomClaudeModels", {
      teamId,
      name,
      modelId,
      displayName,
      description: normalizeOptionalDescription(args.description),
      enabled: true,
      sortOrder: maxSortOrder + 1,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      updatedBy: userId,
    });

    return {
      success: true,
      modelId: insertedId,
      name,
    };
  },
});

/**
 * Team mutation: update display metadata for a custom Claude model.
 */
export const updateCustomClaudeModel = authMutation({
  args: {
    teamSlugOrId: v.string(),
    name: v.string(),
    displayName: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const displayName = args.displayName.trim();
    if (!displayName) {
      throw new Error("Display name is required");
    }

    const customModel = await ctx.db
      .query("teamCustomClaudeModels")
      .withIndex("by_team_name", (q) => q.eq("teamId", teamId).eq("name", args.name))
      .first();

    if (!customModel) {
      throw new Error(`Custom Claude model not found: ${args.name}`);
    }

    await ctx.db.patch(customModel._id, {
      displayName,
      description: normalizeOptionalDescription(args.description),
      updatedAt: Date.now(),
      updatedBy: userId,
    });

    return { success: true };
  },
});

/**
 * Team mutation: delete a custom Claude model.
 */
export const deleteCustomClaudeModel = authMutation({
  args: {
    teamSlugOrId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    const [customModel, teamVisibility] = await Promise.all([
      ctx.db
        .query("teamCustomClaudeModels")
        .withIndex("by_team_name", (q) => q.eq("teamId", teamId).eq("name", args.name))
        .first(),
      ctx.db
        .query("teamModelVisibility")
        .withIndex("by_team", (q) => q.eq("teamId", teamId))
        .first(),
    ]);

    if (!customModel) {
      throw new Error(`Custom Claude model not found: ${args.name}`);
    }

    await ctx.db.delete(customModel._id);

    if (teamVisibility?.hiddenModels.includes(args.name)) {
      await ctx.db.patch(teamVisibility._id, {
        hiddenModels: teamVisibility.hiddenModels.filter(
          (modelName) => modelName !== args.name,
        ),
        updatedAt: Date.now(),
        updatedBy: userId,
      });
    }

    return { success: true };
  },
});

/**
 * Internal mutation: upsert a model (for seeding/discovery).
 * Creates if not exists, updates if exists.
 */
export const upsert = internalMutation({
  args: {
    name: v.string(),
    displayName: v.string(),
    vendor: v.string(),
    source: v.union(v.literal("curated"), v.literal("discovered")),
    discoveredFrom: v.optional(v.string()),
    discoveredAt: v.optional(v.number()),
    requiredApiKeys: v.array(v.string()),
    tier: v.union(v.literal("free"), v.literal("paid")),
    tags: v.array(v.string()),
    enabled: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
    disabled: v.optional(v.boolean()),
    disabledReason: v.optional(v.string()),
    variants: v.optional(
      v.array(
        v.object({
          id: v.string(),
          displayName: v.string(),
          description: v.optional(v.string()),
        }),
      ),
    ),
    defaultVariant: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("models")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    const now = Date.now();

    if (existing) {
      // Update existing model, preserving user-controlled fields
      await ctx.db.patch(existing._id, {
        displayName: args.displayName,
        vendor: args.vendor,
        requiredApiKeys: args.requiredApiKeys,
        tier: args.tier,
        tags: args.tags,
        disabled: args.disabled,
        disabledReason: args.disabledReason,
        variants: args.variants,
        defaultVariant: args.defaultVariant,
        // Update discovery timestamp if this is a discovered model
        ...(args.source === "discovered" && args.discoveredAt
          ? { discoveredAt: args.discoveredAt }
          : {}),
        updatedAt: now,
      });
      return existing._id;
    }

    // Get the next sortOrder (max + 1)
    const allModels = await ctx.db.query("models").collect();
    const maxSortOrder = allModels.reduce(
      (max, m) => Math.max(max, m.sortOrder),
      -1,
    );
    const sortOrder = args.sortOrder ?? maxSortOrder + 1;

    // Default enabled state: curated=true, discovered=false
    const enabled = args.enabled ?? args.source === "curated";

    const id = await ctx.db.insert("models", {
      name: args.name,
      displayName: args.displayName,
      vendor: args.vendor,
      source: args.source,
      discoveredFrom: args.discoveredFrom,
      discoveredAt: args.discoveredAt,
      requiredApiKeys: args.requiredApiKeys,
      tier: args.tier,
      tags: args.tags,
      enabled,
      sortOrder,
      disabled: args.disabled,
      disabledReason: args.disabledReason,
      variants: args.variants,
      defaultVariant: args.defaultVariant,
      createdAt: now,
      updatedAt: now,
    });

    return id;
  },
});

/**
 * Internal mutation: bulk upsert models (more efficient for seeding).
 */
export const bulkUpsert = internalMutation({
  args: {
    models: v.array(
      v.object({
        name: v.string(),
        displayName: v.string(),
        vendor: v.string(),
        source: v.union(v.literal("curated"), v.literal("discovered")),
        discoveredFrom: v.optional(v.string()),
        discoveredAt: v.optional(v.number()),
        requiredApiKeys: v.array(v.string()),
        tier: v.union(v.literal("free"), v.literal("paid")),
        tags: v.array(v.string()),
        enabled: v.optional(v.boolean()),
        sortOrder: v.optional(v.number()),
        disabled: v.optional(v.boolean()),
        disabledReason: v.optional(v.string()),
        variants: v.optional(
          v.array(
            v.object({
              id: v.string(),
              displayName: v.string(),
              description: v.optional(v.string()),
            }),
          ),
        ),
        defaultVariant: v.optional(v.string()),
        contextWindow: v.optional(v.number()),
        maxOutputTokens: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existingModels = await ctx.db.query("models").collect();
    const existingByName = new Map(existingModels.map((m) => [m.name, m]));

    console.log(
      `[bulkUpsert] Processing ${args.models.length} models, ${existingModels.length} existing in DB`,
    );

    let maxSortOrder = existingModels.reduce(
      (max, m) => Math.max(max, m.sortOrder),
      -1,
    );

    const results: string[] = [];
    let insertCount = 0;
    let updateCount = 0;

    for (const model of args.models) {
      const existing = existingByName.get(model.name);

      if (existing) {
        console.log(
          `[bulkUpsert] UPDATING existing: ${model.name} (existing _id: ${existing._id})`,
        );
        // Update existing
        // Auto-enable free discovered models that are currently disabled
        const shouldEnableFree =
          model.tier === "free" && model.enabled === true && !existing.enabled;
        // Curated models should enable and take over source from discovered
        const isCuratedTakeover =
          model.source === "curated" && existing.source === "discovered";
        // Only enable curated models during takeover from discovered (not unconditionally)
        // This preserves user's decision to disable a curated model
        const shouldEnableCurated = isCuratedTakeover && !model.disabled;
        await ctx.db.patch(existing._id, {
          displayName: model.displayName,
          vendor: model.vendor,
          requiredApiKeys: model.requiredApiKeys,
          tier: model.tier,
          tags: model.tags,
          disabled: model.disabled,
          disabledReason: model.disabledReason,
          variants: model.variants,
          defaultVariant: model.defaultVariant,
          contextWindow: model.contextWindow,
          maxOutputTokens: model.maxOutputTokens,
          // Update source when curated takes over from discovered
          ...(isCuratedTakeover ? { source: "curated" } : {}),
          ...(model.source === "discovered" && model.discoveredAt
            ? { discoveredAt: model.discoveredAt }
            : {}),
          ...(shouldEnableFree || shouldEnableCurated ? { enabled: true } : {}),
          updatedAt: now,
        });
        results.push(existing._id);
        updateCount++;
      } else {
        // Insert new
        console.log(
          `[bulkUpsert] INSERTING new model: ${model.name} (source: ${model.source})`,
        );
        maxSortOrder++;
        const sortOrder = model.sortOrder ?? maxSortOrder;
        const enabled = model.enabled ?? model.source === "curated";

        const id = await ctx.db.insert("models", {
          name: model.name,
          displayName: model.displayName,
          vendor: model.vendor,
          source: model.source,
          discoveredFrom: model.discoveredFrom,
          discoveredAt: model.discoveredAt,
          requiredApiKeys: model.requiredApiKeys,
          tier: model.tier,
          tags: model.tags,
          enabled,
          sortOrder,
          disabled: model.disabled,
          disabledReason: model.disabledReason,
          variants: model.variants,
          defaultVariant: model.defaultVariant,
          contextWindow: model.contextWindow,
          maxOutputTokens: model.maxOutputTokens,
          createdAt: now,
          updatedAt: now,
        });
        results.push(id);
        insertCount++;
      }
    }

    console.log(
      `[bulkUpsert] Done: ${insertCount} inserted, ${updateCount} updated`,
    );
    return { upsertedCount: results.length };
  },
});

/**
 * Internal mutation: delete a model by name.
 * Used to clean up stale models that are no longer in the catalog.
 */
export const deleteByName = internalMutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const model = await ctx.db
      .query("models")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    if (model) {
      await ctx.db.delete(model._id);
      return { deleted: true, name: args.name };
    }
    return { deleted: false, name: args.name };
  },
});

/**
 * Internal mutation: delete stale curated models that are no longer in the catalog.
 * Takes a list of current valid model names and deletes any curated models not in that list.
 */
export const deleteStale = internalMutation({
  args: {
    validNames: v.array(v.string()),
    source: v.union(v.literal("curated"), v.literal("discovered")),
  },
  handler: async (ctx, args) => {
    const validNameSet = new Set(args.validNames);

    // Get all models of the specified source
    const allModels = await ctx.db.query("models").collect();
    const modelsToDelete = allModels.filter(
      (m) => m.source === args.source && !validNameSet.has(m.name),
    );

    // Delete stale models in parallel
    if (modelsToDelete.length > 0) {
      console.log(
        `[models.deleteStale] Deleting ${modelsToDelete.length} stale ${args.source} models: ${modelsToDelete.map((m) => m.name).join(", ")}`,
      );
      await Promise.all(
        modelsToDelete.map((model) => ctx.db.delete(model._id)),
      );
    }

    return {
      deletedCount: modelsToDelete.length,
      deletedNames: modelsToDelete.map((m) => m.name),
    };
  },
});

/**
 * Internal mutation: delete stale discovered models from a specific provider.
 * Models are considered stale if they haven't been seen in discovery for the threshold period.
 * This prevents accumulation of deprecated/removed models in the catalog.
 */
export const deleteStaleDiscovered = internalMutation({
  args: {
    discoveredFrom: v.string(),
    currentModelNames: v.array(v.string()),
    staleThresholdMs: v.optional(v.number()), // Default: 7 days
  },
  handler: async (ctx, args) => {
    const currentNameSet = new Set(args.currentModelNames);
    const threshold = args.staleThresholdMs ?? 7 * 24 * 60 * 60 * 1000; // 7 days default
    const cutoffTime = Date.now() - threshold;

    // Query discovered models from this source
    const allModels = await ctx.db
      .query("models")
      .withIndex("by_source", (q) => q.eq("source", "discovered"))
      .collect();

    // Filter to models from this discoveredFrom source that are:
    // 1. Not in the current discovery results
    // 2. Were last discovered before the cutoff time
    const modelsToDelete = allModels.filter((m) => {
      if (m.discoveredFrom !== args.discoveredFrom) return false;
      if (currentNameSet.has(m.name)) return false;
      // If discoveredAt is missing or older than cutoff, consider stale
      const lastSeen = m.discoveredAt ?? 0;
      return lastSeen < cutoffTime;
    });

    if (modelsToDelete.length > 0) {
      console.log(
        `[models.deleteStaleDiscovered] Deleting ${modelsToDelete.length} stale models from ${args.discoveredFrom}: ${modelsToDelete.map((m) => m.name).join(", ")}`,
      );
      await Promise.all(
        modelsToDelete.map((model) => ctx.db.delete(model._id)),
      );
    }

    return {
      deletedCount: modelsToDelete.length,
      deletedNames: modelsToDelete.map((m) => m.name),
    };
  },
});

/**
 * Internal query: check if curated models need seeding.
 * Returns true if there are no curated models in the database.
 * Used by listAvailable to trigger auto-seeding.
 */
export const needsSeeding = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Check if any curated models exist
    const curatedModel = await ctx.db
      .query("models")
      .filter((q) => q.eq(q.field("source"), "curated"))
      .first();

    return curatedModel === null;
  },
});

/**
 * Internal query: check if discovered models need discovery.
 * Returns true if there are no discovered models in the database.
 * Used to trigger auto-discovery on first deployment.
 */
export const needsDiscovery = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Check if any discovered models exist (using index for efficiency)
    const discoveredModel = await ctx.db
      .query("models")
      .withIndex("by_source", (q) => q.eq("source", "discovered"))
      .first();

    return discoveredModel === null;
  },
});

/**
 * Internal mutation: clear all models (for testing auto-discovery flow).
 * WARNING: This deletes all models from the database. Use only in dev.
 */
export const clearAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allModels = await ctx.db.query("models").collect();
    // Delete all models in parallel
    await Promise.all(allModels.map((model) => ctx.db.delete(model._id)));
    console.log(`[models.clearAll] Deleted ${allModels.length} models`);
    return { deletedCount: allModels.length };
  },
});
