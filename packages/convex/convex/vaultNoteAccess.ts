import { ConvexError, v } from "convex/values";
import { resolveTeamIdLoose } from "../_shared/team";
import { internalMutation, internalQuery } from "./_generated/server";
import { authMutation, authQuery } from "./users/utils";

/**
 * Record access to a vault note (upsert pattern).
 * If the note has been accessed before, update lastAccessedAt and increment accessCount.
 * Otherwise, create a new access record.
 */
export const recordAccess = authMutation({
  args: {
    teamSlugOrId: v.string(),
    notePath: v.string(),
    noteTitle: v.optional(v.string()),
    accessedBy: v.optional(v.string()), // agent name or user email
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const now = Date.now();

    // Check if we already have an access record for this note
    const existing = await ctx.db
      .query("vaultNoteAccess")
      .withIndex("by_team_path", (q) =>
        q.eq("teamId", teamId).eq("notePath", args.notePath)
      )
      .first();

    if (existing) {
      // Update existing record
      await ctx.db.patch(existing._id, {
        lastAccessedAt: now,
        lastAccessedBy: args.accessedBy ?? existing.lastAccessedBy,
        noteTitle: args.noteTitle ?? existing.noteTitle,
        accessCount: existing.accessCount + 1,
      });
      return existing._id;
    }

    // Create new access record
    const id = await ctx.db.insert("vaultNoteAccess", {
      teamId,
      notePath: args.notePath,
      noteTitle: args.noteTitle,
      lastAccessedAt: now,
      lastAccessedBy: args.accessedBy,
      accessCount: 1,
    });

    return id;
  },
});

/**
 * Internal mutation to record access (for use from HTTP routes without auth context).
 */
export const recordAccessInternal = internalMutation({
  args: {
    teamId: v.string(), // canonical team UUID
    notePath: v.string(),
    noteTitle: v.optional(v.string()),
    accessedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("vaultNoteAccess")
      .withIndex("by_team_path", (q) =>
        q.eq("teamId", args.teamId).eq("notePath", args.notePath)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastAccessedAt: now,
        lastAccessedBy: args.accessedBy ?? existing.lastAccessedBy,
        noteTitle: args.noteTitle ?? existing.noteTitle,
        accessCount: existing.accessCount + 1,
      });
      return existing._id;
    }

    const id = await ctx.db.insert("vaultNoteAccess", {
      teamId: args.teamId,
      notePath: args.notePath,
      noteTitle: args.noteTitle,
      lastAccessedAt: now,
      lastAccessedBy: args.accessedBy,
      accessCount: 1,
    });

    return id;
  },
});

/**
 * List recently accessed vault notes for a team, sorted by lastAccessedAt descending.
 */
export const listRecent = authQuery({
  args: {
    teamSlugOrId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const take = Math.max(1, Math.min(args.limit ?? 50, 200));

    const notes = await ctx.db
      .query("vaultNoteAccess")
      .withIndex("by_team_recent", (q) => q.eq("teamId", teamId))
      .order("desc")
      .take(take);

    return notes.map((note) => ({
      _id: note._id,
      notePath: note.notePath,
      noteTitle: note.noteTitle,
      lastAccessedAt: note.lastAccessedAt,
      lastAccessedBy: note.lastAccessedBy,
      accessCount: note.accessCount,
    }));
  },
});

/**
 * Internal query to list recent notes (for HTTP routes).
 */
export const listRecentInternal = internalQuery({
  args: {
    teamId: v.string(), // canonical team UUID
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const take = Math.max(1, Math.min(args.limit ?? 50, 200));

    const notes = await ctx.db
      .query("vaultNoteAccess")
      .withIndex("by_team_recent", (q) => q.eq("teamId", args.teamId))
      .order("desc")
      .take(take);

    return notes.map((note) => ({
      _id: note._id,
      notePath: note.notePath,
      noteTitle: note.noteTitle,
      lastAccessedAt: note.lastAccessedAt,
      lastAccessedBy: note.lastAccessedBy,
      accessCount: note.accessCount,
    }));
  },
});

/**
 * Get a single note access record by path.
 */
export const getByPath = authQuery({
  args: {
    teamSlugOrId: v.string(),
    notePath: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    const note = await ctx.db
      .query("vaultNoteAccess")
      .withIndex("by_team_path", (q) =>
        q.eq("teamId", teamId).eq("notePath", args.notePath)
      )
      .first();

    if (!note) {
      return null;
    }

    return {
      _id: note._id,
      notePath: note.notePath,
      noteTitle: note.noteTitle,
      lastAccessedAt: note.lastAccessedAt,
      lastAccessedBy: note.lastAccessedBy,
      accessCount: note.accessCount,
    };
  },
});

/**
 * Internal query to get note by path (for HTTP routes).
 */
export const getByPathInternal = internalQuery({
  args: {
    teamId: v.string(), // canonical team UUID
    notePath: v.string(),
  },
  handler: async (ctx, args) => {
    const note = await ctx.db
      .query("vaultNoteAccess")
      .withIndex("by_team_path", (q) =>
        q.eq("teamId", args.teamId).eq("notePath", args.notePath)
      )
      .first();

    if (!note) {
      return null;
    }

    return {
      _id: note._id,
      notePath: note.notePath,
      noteTitle: note.noteTitle,
      lastAccessedAt: note.lastAccessedAt,
      lastAccessedBy: note.lastAccessedBy,
      accessCount: note.accessCount,
    };
  },
});

/**
 * Delete a note access record (for cleanup or testing).
 */
export const deleteAccess = authMutation({
  args: {
    teamSlugOrId: v.string(),
    notePath: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    const existing = await ctx.db
      .query("vaultNoteAccess")
      .withIndex("by_team_path", (q) =>
        q.eq("teamId", teamId).eq("notePath", args.notePath)
      )
      .first();

    if (!existing) {
      throw new ConvexError("Note access record not found");
    }

    await ctx.db.delete(existing._id);
  },
});
