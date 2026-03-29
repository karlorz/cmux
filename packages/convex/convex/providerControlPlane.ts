/**
 * Provider Control Plane Convex Module.
 *
 * Provides unified queries and mutations for provider inventory,
 * connection state, and model availability.
 *
 * Uses the shared control plane service from @cmux/shared.
 */

import { v } from "convex/values";
import { authQuery, authMutation } from "./users/utils";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { resolveTeamIdLoose } from "../_shared/team";
import {
  listProviders,
  listModels,
  computeDiscoveryFreshness,
  type ControlPlaneContext,
  type StoredModel,
} from "@cmux/shared/providers/control-plane";
import { BASE_PROVIDERS } from "@cmux/shared/provider-registry";

// View modes for model listing
const viewValidator = v.union(
  v.literal("all"),
  v.literal("connected"),
  v.literal("vendor"),
);

/**
 * Build the control plane context from Convex data.
 * Fetches API keys, provider overrides, and models for a team.
 */
async function buildControlPlaneContext(
  ctx: { db: QueryCtx["db"] },
  teamId: string,
  _userId: string,
): Promise<ControlPlaneContext> {
  // Fetch all required data in parallel
  // Note: API keys are team-wide (any team member can configure them for all team members)
  const [apiKeysRaw, providerOverridesRaw, modelsRaw] = await Promise.all([
    ctx.db
      .query("apiKeys")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect(),
    ctx.db
      .query("providerOverrides")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect(),
    ctx.db
      .query("models")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect(),
  ]);

  // Convert API keys to a simple map
  const storedApiKeys: Record<string, string> = {};
  for (const key of apiKeysRaw) {
    storedApiKeys[key.envVar] = key.value;
  }

  // Convert provider overrides to the expected format
  const providerOverrides = providerOverridesRaw.map((o) => ({
    teamId: o.teamId,
    providerId: o.providerId,
    baseUrl: o.baseUrl,
    apiFormat: o.apiFormat,
    apiKeyEnvVar: o.apiKeyEnvVar,
    customHeaders: o.customHeaders,
    fallbacks: o.fallbacks,
    enabled: o.enabled,
  }));

  // Convert models to StoredModel format
  const models: StoredModel[] = modelsRaw.map((m) => ({
    name: m.name,
    displayName: m.displayName,
    vendor: m.vendor,
    source: m.source,
    requiredApiKeys: m.requiredApiKeys,
    tier: m.tier,
    tags: m.tags,
    enabled: m.enabled,
    sortOrder: m.sortOrder,
    variants: m.variants,
    defaultVariant: m.defaultVariant,
    disabled: m.disabled,
    disabledReason: m.disabledReason,
    discoveredAt: m.discoveredAt,
    discoveredFrom: m.discoveredFrom,
  }));

  return {
    storedApiKeys,
    providerOverrides,
    models,
  };
}

// ============================================================================
// Public Queries
// ============================================================================

/**
 * List all providers with their connection states.
 * Returns providers with auth methods, connection sources, and default models.
 */
export const listProvidersQuery = authQuery({
  args: { teamSlugOrId: v.string() },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const context = await buildControlPlaneContext(ctx, teamId, userId);
    return listProviders(BASE_PROVIDERS, context);
  },
});

/**
 * List models with availability resolved.
 * Supports views: all, connected (default), vendor.
 */
export const listModelsQuery = authQuery({
  args: {
    teamSlugOrId: v.string(),
    view: v.optional(viewValidator),
    providerId: v.optional(v.string()),
    includeDisabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const context = await buildControlPlaneContext(ctx, teamId, userId);

    return listModels(BASE_PROVIDERS, context, {
      view: args.view ?? "connected",
      providerId: args.providerId,
      includeDisabled: args.includeDisabled ?? false,
    });
  },
});

/**
 * Get discovery freshness for providers that support model discovery.
 */
export const getDiscoveryFreshnessQuery = authQuery({
  args: {
    teamSlugOrId: v.string(),
    staleDurationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const context = await buildControlPlaneContext(ctx, teamId, userId);

    return computeDiscoveryFreshness(
      BASE_PROVIDERS,
      context,
      args.staleDurationMs,
    );
  },
});

// ============================================================================
// Public Mutations
// ============================================================================

/**
 * Connect a provider by storing an API key or credential.
 * Upserts the credential in the apiKeys table.
 */
export const connect = authMutation({
  args: {
    teamSlugOrId: v.string(),
    envVar: v.string(),
    value: v.string(),
    displayName: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const now = Date.now();

    // Check for existing key
    const existing = await ctx.db
      .query("apiKeys")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", teamId).eq("userId", userId),
      )
      .filter((q) => q.eq(q.field("envVar"), args.envVar))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        displayName: args.displayName,
        description: args.description,
        updatedAt: now,
      });
      return { action: "updated" as const, envVar: args.envVar };
    }

    await ctx.db.insert("apiKeys", {
      envVar: args.envVar,
      value: args.value,
      displayName: args.displayName,
      description: args.description,
      createdAt: now,
      updatedAt: now,
      userId,
      teamId,
    });

    return { action: "created" as const, envVar: args.envVar };
  },
});

/**
 * Disconnect a provider by removing its credential.
 */
export const disconnect = authMutation({
  args: {
    teamSlugOrId: v.string(),
    envVar: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    const existing = await ctx.db
      .query("apiKeys")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", teamId).eq("userId", userId),
      )
      .filter((q) => q.eq(q.field("envVar"), args.envVar))
      .first();

    if (!existing) {
      return { action: "not_found" as const, envVar: args.envVar };
    }

    await ctx.db.delete(existing._id);
    return { action: "deleted" as const, envVar: args.envVar };
  },
});

/**
 * Refresh model discovery for a provider.
 * Triggers the model discovery action for the specified provider.
 */
export const refresh = authMutation({
  args: {
    teamSlugOrId: v.string(),
    providerId: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify team access
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    // For now, just return success - actual discovery is handled by modelDiscovery.ts
    // This mutation serves as the control plane entry point
    console.log(
      `[providerControlPlane.refresh] Refresh requested for provider ${args.providerId}, team ${teamId}`,
    );

    return {
      action: "refresh_requested" as const,
      providerId: args.providerId,
      teamId,
    };
  },
});

// ============================================================================
// Internal Queries (for use by other Convex modules)
// ============================================================================

/**
 * Internal query to get provider control plane data for a team.
 * Used by other Convex modules that need provider/model data.
 */
export const getControlPlaneDataInternal = internalQuery({
  args: {
    teamId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const context = await buildControlPlaneContext(
      ctx,
      args.teamId,
      args.userId,
    );
    return {
      providers: listProviders(BASE_PROVIDERS, context),
      models: listModels(BASE_PROVIDERS, context, { view: "all" }),
      discoveryFreshness: computeDiscoveryFreshness(BASE_PROVIDERS, context),
    };
  },
});

/**
 * Internal query to list connected providers for a team.
 * Returns only the provider IDs that have valid credentials.
 */
export const getConnectedProviderIdsInternal = internalQuery({
  args: {
    teamId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const context = await buildControlPlaneContext(
      ctx,
      args.teamId,
      args.userId,
    );
    const result = listProviders(BASE_PROVIDERS, context);

    return result.providers
      .filter((p) => p.connectionState.isConnected)
      .map((p) => p.id);
  },
});

/**
 * Internal query to get default model for a provider.
 */
export const getProviderDefaultModelInternal = internalQuery({
  args: {
    teamId: v.string(),
    userId: v.string(),
    providerId: v.string(),
  },
  handler: async (ctx, args) => {
    const context = await buildControlPlaneContext(
      ctx,
      args.teamId,
      args.userId,
    );
    const result = listProviders(BASE_PROVIDERS, context);
    const provider = result.providers.find((p) => p.id === args.providerId);
    return provider?.defaultModel ?? null;
  },
});
