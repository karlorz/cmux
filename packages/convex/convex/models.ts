import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import { authMutation, authQuery } from "./users/utils";
import { resolveTeamIdLoose } from "../_shared/team";

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
    return models.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

/**
 * Admin query: list all models including disabled ones.
 * Requires authentication.
 */
export const listAll = authQuery({
  args: { teamSlugOrId: v.string() },
  handler: async (ctx, args) => {
    // Verify user has access to the team
    await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    const models = await ctx.db.query("models").collect();
    return models.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

/**
 * List available models filtered by team's configured API keys.
 * Returns only models the team can actually use (has required keys or free tier).
 * Requires authentication.
 */
export const listAvailable = authQuery({
  args: {
    teamSlugOrId: v.string(),
    showAll: v.optional(v.boolean()), // If true, returns all models ignoring credentials
  },
  handler: async (ctx, args) => {
    // Verify user has access to the team and get teamId
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    // Get enabled models from database
    const models = await ctx.db
      .query("models")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();

    // If showAll is true, return all enabled models without filtering
    if (args.showAll) {
      return models.sort((a, b) => a.sortOrder - b.sortOrder);
    }

    // Get team's configured API keys
    const apiKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();

    const configuredKeyEnvVars = new Set(apiKeys.map((k) => k.envVar));

    // Filter models by availability
    const availableModels = models.filter((model) => {
      // Free tier models are always available
      if (model.tier === "free") return true;
      // Models with no required keys are available
      if (!model.requiredApiKeys || model.requiredApiKeys.length === 0)
        return true;
      // Check if any required key is configured
      return model.requiredApiKeys.some((key) => configuredKeyEnvVars.has(key));
    });

    return availableModels.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

/**
 * Admin mutation: toggle the global enabled state of a model.
 */
export const setEnabled = authMutation({
  args: {
    teamSlugOrId: v.string(),
    modelName: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Verify user has access to the team
    await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    const model = await ctx.db
      .query("models")
      .withIndex("by_name", (q) => q.eq("name", args.modelName))
      .first();

    if (!model) {
      throw new Error(`Model not found: ${args.modelName}`);
    }

    await ctx.db.patch(model._id, {
      enabled: args.enabled,
      updatedAt: Date.now(),
    });

    return { success: true };
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
    await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    const now = Date.now();

    // Update sortOrder for each model based on position in array
    for (let i = 0; i < args.modelNames.length; i++) {
      const modelName = args.modelNames[i];
      const model = await ctx.db
        .query("models")
        .withIndex("by_name", (q) => q.eq("name", modelName))
        .first();

      if (model) {
        await ctx.db.patch(model._id, {
          sortOrder: i,
          updatedAt: now,
        });
      }
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
        })
      )
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
      -1
    );
    const sortOrder = args.sortOrder ?? maxSortOrder + 1;

    // Default enabled state: curated=true, discovered=false
    const enabled = args.enabled ?? (args.source === "curated");

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
            })
          )
        ),
        defaultVariant: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existingModels = await ctx.db.query("models").collect();
    const existingByName = new Map(existingModels.map((m) => [m.name, m]));

    let maxSortOrder = existingModels.reduce(
      (max, m) => Math.max(max, m.sortOrder),
      -1
    );

    const results: string[] = [];

    for (const model of args.models) {
      const existing = existingByName.get(model.name);

      if (existing) {
        // Update existing
        // Auto-enable free discovered models that are currently disabled
        const shouldEnable =
          model.tier === "free" && model.enabled === true && !existing.enabled;
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
          ...(model.source === "discovered" && model.discoveredAt
            ? { discoveredAt: model.discoveredAt }
            : {}),
          ...(shouldEnable ? { enabled: true } : {}),
          updatedAt: now,
        });
        results.push(existing._id);
      } else {
        // Insert new
        maxSortOrder++;
        const sortOrder = model.sortOrder ?? maxSortOrder;
        const enabled = model.enabled ?? (model.source === "curated");

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
          createdAt: now,
          updatedAt: now,
        });
        results.push(id);
      }
    }

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
      (m) => m.source === args.source && !validNameSet.has(m.name)
    );

    // Delete stale models
    for (const model of modelsToDelete) {
      console.log(`[models.deleteStale] Deleting stale ${args.source} model: ${model.name}`);
      await ctx.db.delete(model._id);
    }

    return {
      deletedCount: modelsToDelete.length,
      deletedNames: modelsToDelete.map((m) => m.name),
    };
  },
});
