import { v } from "convex/values";
import {
  isAcceleratorValid,
  isGlobalShortcutId,
} from "@cmux/shared/global-shortcuts";
import { resolveTeamIdLoose } from "../_shared/team";
import { internalQuery } from "./_generated/server";
import { authMutation, authQuery } from "./users/utils";

function sanitizeShortcuts(
  input: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (input === undefined) {
    return undefined;
  }

  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!isGlobalShortcutId(key)) continue;
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (!isAcceleratorValid(trimmed)) continue;
    sanitized[key] = trimmed;
  }

  return sanitized;
}

export const get = authQuery({
  args: { teamSlugOrId: v.string() },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const settings = await ctx.db
      .query("workspaceSettings")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", teamId).eq("userId", userId)
      )
      .first();
    return settings ?? null;
  },
});

export const update = authMutation({
  args: {
    teamSlugOrId: v.string(),
    worktreePath: v.optional(v.string()),
    autoPrEnabled: v.optional(v.boolean()),
    shortcuts: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const sanitizedShortcuts = sanitizeShortcuts(args.shortcuts);
    const existing = await ctx.db
      .query("workspaceSettings")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", teamId).eq("userId", userId)
      )
      .first();
    const now = Date.now();

    if (existing) {
      const updates: {
        worktreePath?: string;
        autoPrEnabled?: boolean;
        updatedAt: number;
      } = { updatedAt: now };

      if (args.worktreePath !== undefined) {
        updates.worktreePath = args.worktreePath;
      }
      if (args.autoPrEnabled !== undefined) {
        updates.autoPrEnabled = args.autoPrEnabled;
      }
      if (sanitizedShortcuts !== undefined) {
        updates.shortcuts = sanitizedShortcuts;
      }

      await ctx.db.patch(existing._id, updates);
    } else {
      const toInsert: {
        worktreePath?: string;
        autoPrEnabled?: boolean;
        shortcuts?: Record<string, string>;
        nextLocalWorkspaceSequence: number;
        createdAt: number;
        updatedAt: number;
        userId: string;
        teamId: string;
      } = {
        worktreePath: args.worktreePath,
        autoPrEnabled: args.autoPrEnabled,
        nextLocalWorkspaceSequence: 0,
        createdAt: now,
        updatedAt: now,
        userId,
        teamId,
      };

      if (sanitizedShortcuts !== undefined) {
        toInsert.shortcuts = sanitizedShortcuts;
      }

      await ctx.db.insert("workspaceSettings", toInsert);
    }
  },
});

export const getByTeamAndUserInternal = internalQuery({
  args: { teamId: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("workspaceSettings")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", args.teamId).eq("userId", args.userId)
      )
      .first();
    return settings ?? null;
  },
});
