import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
} from "./_generated/server";

function generateShareToken(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  const rand = Math.random().toString(36).slice(2);
  const timestamp = Date.now().toString(36);
  return `${timestamp}-${rand}`;
}

export const getByIdInternal = internalQuery({
  args: { id: v.id("taskRunScreenshotSets") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByShareToken = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (!token) {
      return null;
    }
    return await ctx.db
      .query("taskRunScreenshotSets")
      .withIndex("by_public_share_token", (q) =>
        q.eq("publicShareToken", token),
      )
      .first();
  },
});

export const ensurePublicShareToken = internalMutation({
  args: { id: v.id("taskRunScreenshotSets") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) {
      throw new Error("Screenshot set not found");
    }

    if (doc.publicShareToken) {
      return { token: doc.publicShareToken };
    }

    const token = generateShareToken();
    await ctx.db.patch(args.id, {
      publicShareToken: token,
      publicShareEnabledAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { token };
  },
});
