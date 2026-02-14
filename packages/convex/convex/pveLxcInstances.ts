import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const recordResumeInternal = internalMutation({
  args: {
    instanceId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sandboxInstanceActivity")
      .withIndex("by_instanceId", (q) => q.eq("instanceId", args.instanceId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        provider: "pve-lxc",
        lastResumedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("sandboxInstanceActivity", {
        instanceId: args.instanceId,
        provider: "pve-lxc",
        lastResumedAt: Date.now(),
        createdAt: Date.now(),
      });
    }
  },
});

export const recordPauseInternal = internalMutation({
  args: {
    instanceId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sandboxInstanceActivity")
      .withIndex("by_instanceId", (q) => q.eq("instanceId", args.instanceId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        provider: "pve-lxc",
        lastPausedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("sandboxInstanceActivity", {
        instanceId: args.instanceId,
        provider: "pve-lxc",
        lastPausedAt: Date.now(),
        createdAt: Date.now(),
      });
    }
  },
});

export const recordStopInternal = internalMutation({
  args: {
    instanceId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sandboxInstanceActivity")
      .withIndex("by_instanceId", (q) => q.eq("instanceId", args.instanceId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        provider: "pve-lxc",
        stoppedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("sandboxInstanceActivity", {
        instanceId: args.instanceId,
        provider: "pve-lxc",
        stoppedAt: Date.now(),
        createdAt: Date.now(),
      });
    }
  },
});
