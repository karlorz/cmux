import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

const CONCURRENCY_LIMITS = {
  low: 50,
  mid: 100,
  high: 500,
} as const;

const DEFAULT_CONCURRENCY_LIMIT = 10;

/**
 * Check if a user is allowed to create/resume another sandbox.
 * Counts running devboxInstances across all teams for the user
 * and compares against their subscription tier limit.
 */
export const checkConcurrencyLimit = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    // Look up subscription tier
    const subscription = await ctx.db
      .query("cloudRouterSubscription")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();

    const limit = subscription
      ? CONCURRENCY_LIMITS[subscription.subscriptionType]
      : DEFAULT_CONCURRENCY_LIMIT;

    // Count running devboxInstances for this user (across all teams)
    const instances = await ctx.db
      .query("devboxInstances")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const current = instances.filter(
      (instance) => instance.status === "running",
    ).length;

    return {
      allowed: current < limit,
      limit,
      current,
    };
  },
});
