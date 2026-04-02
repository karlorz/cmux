import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Create a prewarm entry when a user starts typing a task description.
 * Called from the www /sandboxes/prewarm endpoint.
 * Returns the entry ID so the background provisioner can update it.
 * Supports both Morph and PVE-LXC providers.
 */
export const createPrewarmEntry = mutation({
  args: {
    teamId: v.string(),
    userId: v.string(),
    snapshotId: v.string(),
    repoUrl: v.optional(v.string()),
    branch: v.optional(v.string()),
    // Provider-specific args
    provider: v.optional(v.union(v.literal("morph"), v.literal("pve-lxc"))),
    templateVmid: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const provider = args.provider ?? "morph";

    // Cancel any existing provisioning/ready entries for this user+team+repo+provider
    // to avoid accumulating stale prewarmed instances
    const existing = await ctx.db
      .query("warmPool")
      .withIndex("by_team_status", (q) =>
        q.eq("teamId", args.teamId).eq("status", "provisioning")
      )
      .collect();

    const existingReady = await ctx.db
      .query("warmPool")
      .withIndex("by_team_status", (q) =>
        q.eq("teamId", args.teamId).eq("status", "ready")
      )
      .collect();

    for (const entry of [...existing, ...existingReady]) {
      const entryProvider = entry.provider ?? "morph";
      // Only consider entries from the same provider
      if (entry.userId === args.userId && entryProvider === provider) {
        // If same repo is already prewarming/ready, skip creating a new one
        if (entry.repoUrl === args.repoUrl) {
          return { id: entry._id, alreadyExists: true };
        }
        // Different repo - mark old one as failed so cleanup removes it
        await ctx.db.patch(entry._id, {
          status: "failed",
          errorMessage: "Superseded by new prewarm request",
          updatedAt: now,
        });
      }
    }

    const id = await ctx.db.insert("warmPool", {
      instanceId: "",
      snapshotId: args.snapshotId,
      status: "provisioning",
      teamId: args.teamId,
      userId: args.userId,
      repoUrl: args.repoUrl,
      branch: args.branch,
      createdAt: now,
      updatedAt: now,
      provider,
      templateVmid: args.templateVmid,
    });

    return { id, alreadyExists: false };
  },
});

/**
 * Claim a ready prewarmed instance matching the given team, repo, and provider.
 * Returns the claimed entry or null if no match found.
 * Supports both Morph and PVE-LXC providers.
 */
export const claimInstance = mutation({
  args: {
    teamId: v.string(),
    repoUrl: v.optional(v.string()),
    branch: v.optional(v.string()),
    taskRunId: v.string(),
    provider: v.optional(v.union(v.literal("morph"), v.literal("pve-lxc"))),
  },
  handler: async (ctx, args) => {
    const requestedProvider = args.provider ?? "morph";

    // Find ready instances for this team
    const readyInstances = await ctx.db
      .query("warmPool")
      .withIndex("by_team_status", (q) =>
        q.eq("teamId", args.teamId).eq("status", "ready")
      )
      .collect();

    // Find the best match: same provider AND same repo URL AND same branch
    // All must match to ensure the warm pool instance has the correct code checked out
    const match = readyInstances.find((entry) => {
      const entryProvider = entry.provider ?? "morph";
      return (
        entryProvider === requestedProvider &&
        entry.repoUrl === args.repoUrl &&
        entry.branch === args.branch
      );
    });

    if (!match) {
      return null;
    }

    await ctx.db.patch(match._id, {
      status: "claimed",
      claimedAt: Date.now(),
      claimedByTaskRunId: args.taskRunId,
      updatedAt: Date.now(),
    });

    return {
      instanceId: match.instanceId,
      vscodeUrl: match.vscodeUrl,
      workerUrl: match.workerUrl,
      vncUrl: match.vncUrl,
      xtermUrl: match.xtermUrl,
      repoUrl: match.repoUrl,
      branch: match.branch,
      provider: match.provider ?? "morph",
      vmid: match.vmid,
      hostname: match.hostname,
    };
  },
});

/**
 * Mark a provisioning instance as ready with its instance details.
 * Public mutation so the www server can call it after background provisioning.
 * Supports both Morph and PVE-LXC providers.
 */
export const markInstanceReady = mutation({
  args: {
    id: v.id("warmPool"),
    instanceId: v.string(),
    vscodeUrl: v.string(),
    workerUrl: v.string(),
    // Optional args for extended provider support
    vncUrl: v.optional(v.string()),
    xtermUrl: v.optional(v.string()),
    vmid: v.optional(v.number()),
    hostname: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.id);
    if (!entry || entry.status !== "provisioning") {
      // Entry was superseded or cleaned up
      return;
    }
    await ctx.db.patch(args.id, {
      status: "ready",
      instanceId: args.instanceId,
      vscodeUrl: args.vscodeUrl,
      workerUrl: args.workerUrl,
      vncUrl: args.vncUrl,
      xtermUrl: args.xtermUrl,
      vmid: args.vmid,
      hostname: args.hostname,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Mark a provisioning instance as failed.
 * Public mutation so the www server can call it after background provisioning.
 */
export const markInstanceFailed = mutation({
  args: {
    id: v.id("warmPool"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.id);
    if (!entry) return;
    await ctx.db.patch(args.id, {
      status: "failed",
      errorMessage: args.errorMessage,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Remove a warm pool entry by Morph instance ID.
 * Used when cleanup crons pause/stop warm pool instances.
 */
export const removeByInstanceId = internalMutation({
  args: {
    instanceId: v.string(),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db
      .query("warmPool")
      .withIndex("by_instanceId", (q) => q.eq("instanceId", args.instanceId))
      .first();

    if (entry) {
      await ctx.db.delete(entry._id);
    }
  },
});

/**
 * Remove stale entries from the warm pool.
 * TTLs vary by provider:
 * - Morph: 50 min ready (approaching 1hr pause), 10 min provisioning
 * - PVE-LXC: 2 hr ready (longer-lived containers), 15 min provisioning
 * Common:
 * - Failed entries older than 1 hour
 * - Claimed entries older than 24 hours
 */
export const cleanupStaleEntries = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;
    const TWENTY_FOUR_HOURS = 24 * ONE_HOUR;

    // Morph TTLs
    const MORPH_PROVISIONING_TTL = 10 * 60 * 1000; // 10 minutes
    const MORPH_READY_TTL = 50 * 60 * 1000; // 50 minutes

    // PVE-LXC TTLs (longer since containers are more stable)
    const PVE_PROVISIONING_TTL = 15 * 60 * 1000; // 15 minutes
    const PVE_READY_TTL = 2 * ONE_HOUR; // 2 hours

    const allEntries = await ctx.db.query("warmPool").collect();

    const removedByProvider: Record<string, number> = { morph: 0, "pve-lxc": 0 };

    for (const entry of allEntries) {
      const age = now - entry.createdAt;
      const provider = entry.provider ?? "morph";
      let shouldRemove = false;

      switch (entry.status) {
        case "failed":
          shouldRemove = age > ONE_HOUR;
          break;
        case "claimed":
          shouldRemove = age > TWENTY_FOUR_HOURS;
          break;
        case "provisioning":
          shouldRemove =
            provider === "pve-lxc"
              ? age > PVE_PROVISIONING_TTL
              : age > MORPH_PROVISIONING_TTL;
          break;
        case "ready":
          shouldRemove =
            provider === "pve-lxc" ? age > PVE_READY_TTL : age > MORPH_READY_TTL;
          break;
      }

      if (shouldRemove) {
        await ctx.db.delete(entry._id);
        removedByProvider[provider]++;
      }
    }

    return {
      removedCount: Object.values(removedByProvider).reduce((a, b) => a + b, 0),
      removedByProvider,
    };
  },
});
