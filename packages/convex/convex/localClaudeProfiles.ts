import { v } from "convex/values";
import { resolveTeamIdLoose } from "../_shared/team";
import { authMutation, authQuery } from "./users/utils";

const terminalValidator = v.union(
  v.literal("terminal"),
  v.literal("iterm"),
  v.literal("ghostty"),
  v.literal("alacritty"),
);

export const list = authQuery({
  args: {
    teamSlugOrId: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const profiles = await ctx.db
      .query("localClaudeProfiles")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();

    return profiles
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((profile) => ({
        id: profile._id,
        name: profile.name,
        workspacePath: profile.workspacePath ?? "",
        terminal: profile.terminal,
        pluginDirsInput: profile.pluginDirsInput ?? "",
        settingsInput: profile.settingsInput ?? "",
        mcpConfigsInput: profile.mcpConfigsInput ?? "",
        allowedToolsInput: profile.allowedToolsInput ?? "",
        disallowedToolsInput: profile.disallowedToolsInput ?? "",
        updatedAt: new Date(profile.updatedAt).toISOString(),
      }));
  },
});

export const upsert = authMutation({
  args: {
    teamSlugOrId: v.string(),
    name: v.string(),
    workspacePath: v.optional(v.string()),
    terminal: terminalValidator,
    pluginDirsInput: v.optional(v.string()),
    settingsInput: v.optional(v.string()),
    mcpConfigsInput: v.optional(v.string()),
    allowedToolsInput: v.optional(v.string()),
    disallowedToolsInput: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;
    const now = Date.now();
    const name = args.name.trim();

    if (!name) {
      throw new Error("Profile name is required");
    }

    const existing = await ctx.db
      .query("localClaudeProfiles")
      .withIndex("by_team_name", (q) => q.eq("teamId", teamId).eq("name", name))
      .first();

    const payload = {
      userId,
      workspacePath: args.workspacePath?.trim() || undefined,
      terminal: args.terminal,
      pluginDirsInput: args.pluginDirsInput ?? "",
      settingsInput: args.settingsInput ?? "",
      mcpConfigsInput: args.mcpConfigsInput ?? "",
      allowedToolsInput: args.allowedToolsInput ?? "",
      disallowedToolsInput: args.disallowedToolsInput ?? "",
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("localClaudeProfiles", {
      teamId,
      name,
      createdAt: now,
      ...payload,
    });
  },
});

export const remove = authMutation({
  args: {
    teamSlugOrId: v.string(),
    profileId: v.id("localClaudeProfiles"),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const profile = await ctx.db.get(args.profileId);

    if (!profile || profile.teamId !== teamId) {
      throw new Error("Profile not found");
    }

    await ctx.db.delete(args.profileId);
  },
});
