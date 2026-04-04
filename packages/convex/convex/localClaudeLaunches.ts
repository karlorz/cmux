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
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const limit = Math.max(1, Math.min(args.limit ?? 5, 20));
    const launches = await ctx.db
      .query("localClaudeLaunches")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .order("desc")
      .take(limit);

    return launches.map((launch) => ({
      id: launch._id,
      launchId: launch.launchId,
      command: launch.command,
      workspacePath: launch.workspacePath,
      terminal: launch.terminal,
      status: launch.status,
      scriptPath: launch.scriptPath,
      error: launch.error,
      exitCode: launch.exitCode,
      launchedAt: new Date(launch.launchedAt).toISOString(),
      exitedAt: launch.exitedAt ? new Date(launch.exitedAt).toISOString() : undefined,
    }));
  },
});

export const record = authMutation({
  args: {
    teamSlugOrId: v.string(),
    launchId: v.string(),
    command: v.string(),
    workspacePath: v.string(),
    terminal: terminalValidator,
    status: v.union(
      v.literal("launched"),
      v.literal("launch_failed"),
      v.literal("completed"),
      v.literal("completed_failed")
    ),
    scriptPath: v.optional(v.string()),
    error: v.optional(v.string()),
    exitCode: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;
    const now = Date.now();

    return await ctx.db.insert("localClaudeLaunches", {
      teamId,
      userId,
      launchId: args.launchId,
      command: args.command,
      workspacePath: args.workspacePath,
      terminal: args.terminal,
      status: args.status,
      scriptPath: args.scriptPath,
      error: args.error,
      exitCode: args.exitCode,
      launchedAt: now,
      createdAt: now,
    });
  },
});

export const updateOutcome = authMutation({
  args: {
    teamSlugOrId: v.string(),
    launchId: v.string(),
    status: v.union(v.literal("completed"), v.literal("completed_failed")),
    exitCode: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const existing = await ctx.db
      .query("localClaudeLaunches")
      .withIndex("by_team_launch", (q) => q.eq("teamId", teamId).eq("launchId", args.launchId))
      .first();

    if (!existing) {
      throw new Error("Launch record not found");
    }

    await ctx.db.patch(existing._id, {
      status: args.status,
      exitCode: args.exitCode,
      error: args.error,
      exitedAt: Date.now(),
    });

    return existing._id;
  },
});
