import { v } from "convex/values";
import { authMutation, authQuery } from "./users/utils";
import { resolveTeamIdLoose } from "../_shared/team";

// Default keyboard shortcuts
export const DEFAULT_SHORTCUTS = {
  commandPaletteMac: "Cmd+K",
  commandPaletteOther: "Ctrl+K",
  sidebarToggle: "Ctrl+Shift+S",
  taskRunNavigationMac: "Ctrl",
  taskRunNavigationOther: "Alt",
  devToolsMac: "Cmd+I",
  devToolsOther: "Ctrl+I",
};

/**
 * Get keyboard shortcuts for the current user's team
 */
export const get = authQuery({
  args: { teamSlugOrId: v.string() },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    const existing = await ctx.db
      .query("keyboardShortcuts")
      .withIndex("by_team_user", (q) => q.eq("teamId", teamId).eq("userId", userId))
      .first();

    if (existing) {
      return {
        commandPaletteMac: existing.commandPaletteMac ?? DEFAULT_SHORTCUTS.commandPaletteMac,
        commandPaletteOther: existing.commandPaletteOther ?? DEFAULT_SHORTCUTS.commandPaletteOther,
        sidebarToggle: existing.sidebarToggle ?? DEFAULT_SHORTCUTS.sidebarToggle,
        taskRunNavigationMac: existing.taskRunNavigationMac ?? DEFAULT_SHORTCUTS.taskRunNavigationMac,
        taskRunNavigationOther: existing.taskRunNavigationOther ?? DEFAULT_SHORTCUTS.taskRunNavigationOther,
        devToolsMac: existing.devToolsMac ?? DEFAULT_SHORTCUTS.devToolsMac,
        devToolsOther: existing.devToolsOther ?? DEFAULT_SHORTCUTS.devToolsOther,
      };
    }

    return DEFAULT_SHORTCUTS;
  },
});

/**
 * Update keyboard shortcuts for the current user's team
 */
export const update = authMutation({
  args: {
    teamSlugOrId: v.string(),
    commandPaletteMac: v.optional(v.string()),
    commandPaletteOther: v.optional(v.string()),
    sidebarToggle: v.optional(v.string()),
    taskRunNavigationMac: v.optional(v.string()),
    taskRunNavigationOther: v.optional(v.string()),
    devToolsMac: v.optional(v.string()),
    devToolsOther: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    const existing = await ctx.db
      .query("keyboardShortcuts")
      .withIndex("by_team_user", (q) => q.eq("teamId", teamId).eq("userId", userId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        commandPaletteMac: args.commandPaletteMac,
        commandPaletteOther: args.commandPaletteOther,
        sidebarToggle: args.sidebarToggle,
        taskRunNavigationMac: args.taskRunNavigationMac,
        taskRunNavigationOther: args.taskRunNavigationOther,
        devToolsMac: args.devToolsMac,
        devToolsOther: args.devToolsOther,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("keyboardShortcuts", {
        teamId,
        userId,
        commandPaletteMac: args.commandPaletteMac,
        commandPaletteOther: args.commandPaletteOther,
        sidebarToggle: args.sidebarToggle,
        taskRunNavigationMac: args.taskRunNavigationMac,
        taskRunNavigationOther: args.taskRunNavigationOther,
        devToolsMac: args.devToolsMac,
        devToolsOther: args.devToolsOther,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});
