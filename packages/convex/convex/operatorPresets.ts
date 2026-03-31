import { v } from "convex/values";
import { resolveTeamIdLoose } from "../_shared/team";
import { authMutation, authQuery } from "./users/utils";
import {
  BUILTIN_PRESETS,
  isBuiltinPresetId,
  type OperatorPreset,
} from "@cmux/shared/operator-presets";

const taskClassValidator = v.optional(
  v.union(
    v.literal("routine"),
    v.literal("deep-coding"),
    v.literal("review"),
    v.literal("eval"),
    v.literal("architecture"),
    v.literal("large-context")
  )
);

/**
 * List all presets for a team (built-in + custom).
 * Built-in presets are always returned first.
 */
export const list = authQuery({
  args: {
    teamSlugOrId: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    // Get custom presets from DB
    const customPresets = await ctx.db
      .query("operatorPresets")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();

    // Map DB records to OperatorPreset type
    const customMapped: OperatorPreset[] = customPresets.map((p) => ({
      id: p._id,
      name: p.name,
      description: p.description ?? "",
      icon: p.icon ?? "box",
      taskClass: p.taskClass,
      agentName: p.agentName,
      selectedVariant: p.selectedVariant,
      supervisorProfileId: p.supervisorProfileId,
      priority: p.priority,
      isBuiltin: false,
    }));

    // Return built-ins first, then custom
    return [...BUILTIN_PRESETS, ...customMapped];
  },
});

/**
 * Get a single preset by ID.
 * Works for both built-in and custom presets.
 */
export const get = authQuery({
  args: {
    teamSlugOrId: v.string(),
    presetId: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if it's a built-in preset
    if (isBuiltinPresetId(args.presetId)) {
      return BUILTIN_PRESETS.find((p) => p.id === args.presetId) ?? null;
    }

    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    // Try to find custom preset by querying instead of direct get
    // to avoid type inference issues with generic ID
    const presets = await ctx.db
      .query("operatorPresets")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();

    const preset = presets.find((p) => p._id === args.presetId);
    if (!preset) return null;

    return {
      id: preset._id,
      name: preset.name,
      description: preset.description ?? "",
      icon: preset.icon ?? "box",
      taskClass: preset.taskClass,
      agentName: preset.agentName,
      selectedVariant: preset.selectedVariant,
      supervisorProfileId: preset.supervisorProfileId,
      priority: preset.priority,
      isBuiltin: false,
    } satisfies OperatorPreset;
  },
});

/**
 * Create a new custom preset.
 */
export const create = authMutation({
  args: {
    teamSlugOrId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    taskClass: taskClassValidator,
    agentName: v.optional(v.string()),
    selectedVariant: v.optional(v.string()),
    supervisorProfileId: v.optional(v.id("supervisorProfiles")),
    priority: v.number(),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;
    const now = Date.now();

    // Validate name uniqueness within team
    const existing = await ctx.db
      .query("operatorPresets")
      .withIndex("by_team_name", (q) =>
        q.eq("teamId", teamId).eq("name", args.name)
      )
      .first();

    if (existing) {
      throw new Error(`Preset with name "${args.name}" already exists`);
    }

    // Don't allow names that match built-in presets
    if (BUILTIN_PRESETS.some((p) => p.name === args.name)) {
      throw new Error(`Cannot use reserved preset name "${args.name}"`);
    }

    const id = await ctx.db.insert("operatorPresets", {
      teamId,
      userId,
      name: args.name,
      description: args.description,
      icon: args.icon,
      taskClass: args.taskClass,
      agentName: args.agentName,
      selectedVariant: args.selectedVariant,
      supervisorProfileId: args.supervisorProfileId,
      priority: args.priority,
      createdAt: now,
      updatedAt: now,
    });

    return id;
  },
});

/**
 * Update an existing custom preset.
 */
export const update = authMutation({
  args: {
    teamSlugOrId: v.string(),
    presetId: v.id("operatorPresets"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    taskClass: taskClassValidator,
    agentName: v.optional(v.string()),
    selectedVariant: v.optional(v.string()),
    supervisorProfileId: v.optional(v.id("supervisorProfiles")),
    priority: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const preset = await ctx.db.get(args.presetId);

    if (!preset || preset.teamId !== teamId) {
      throw new Error("Preset not found");
    }

    // If updating name, check uniqueness
    if (args.name && args.name !== preset.name) {
      const existing = await ctx.db
        .query("operatorPresets")
        .withIndex("by_team_name", (q) =>
          q.eq("teamId", teamId).eq("name", args.name!)
        )
        .first();

      if (existing) {
        throw new Error(`Preset with name "${args.name}" already exists`);
      }

      if (BUILTIN_PRESETS.some((p) => p.name === args.name)) {
        throw new Error(`Cannot use reserved preset name "${args.name}"`);
      }
    }

    const { teamSlugOrId: _, presetId: __, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );

    await ctx.db.patch(args.presetId, {
      ...filtered,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Delete a custom preset.
 * Built-in presets cannot be deleted.
 */
export const remove = authMutation({
  args: {
    teamSlugOrId: v.string(),
    presetId: v.id("operatorPresets"),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const preset = await ctx.db.get(args.presetId);

    if (!preset || preset.teamId !== teamId) {
      throw new Error("Preset not found");
    }

    await ctx.db.delete(args.presetId);
  },
});
