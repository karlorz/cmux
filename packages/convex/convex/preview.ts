import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";

export const createConfiguration = mutation({
  args: {
    teamId: v.string(),
    userId: v.string(),
    repoFullName: v.string(),
    installationId: v.number(),
    repositoryId: v.optional(v.number()),
    devScript: v.optional(v.string()),
    maintenanceScript: v.optional(v.string()),
    environmentVariables: v.optional(
      v.array(
        v.object({
          key: v.string(),
          value: v.string(),
        })
      )
    ),
    browser: v.optional(v.string()),
    baseUrls: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if configuration already exists for this repo
    const existing = await ctx.db
      .query("previewConfigurations")
      .withIndex("by_team_repo", (q) =>
        q.eq("teamId", args.teamId).eq("repoFullName", args.repoFullName)
      )
      .first();

    if (existing) {
      // Update existing configuration
      await ctx.db.patch(existing._id, {
        devScript: args.devScript,
        maintenanceScript: args.maintenanceScript,
        environmentVariables: args.environmentVariables,
        browser: args.browser,
        baseUrls: args.baseUrls,
        isActive: true,
        updatedAt: now,
      });
      return existing._id;
    }

    // Create new configuration
    const configId = await ctx.db.insert("previewConfigurations", {
      teamId: args.teamId,
      userId: args.userId,
      repoFullName: args.repoFullName,
      installationId: args.installationId,
      repositoryId: args.repositoryId,
      devScript: args.devScript,
      maintenanceScript: args.maintenanceScript,
      environmentVariables: args.environmentVariables,
      browser: args.browser,
      baseUrls: args.baseUrls,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return configId;
  },
});

export const getConfigurationByRepo = query({
  args: {
    teamId: v.string(),
    repoFullName: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("previewConfigurations")
      .withIndex("by_team_repo", (q) =>
        q.eq("teamId", args.teamId).eq("repoFullName", args.repoFullName)
      )
      .first();
  },
});

export const listTeamConfigurations = query({
  args: {
    teamId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("previewConfigurations")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .order("desc")
      .collect();
  },
});

export const deactivateConfiguration = mutation({
  args: {
    configId: v.id("previewConfigurations"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.configId, {
      isActive: false,
      updatedAt: Date.now(),
    });
  },
});

export const createScreenshotJob = mutation({
  args: {
    teamId: v.string(),
    previewConfigId: v.id("previewConfigurations"),
    repoFullName: v.string(),
    pullRequestNumber: v.number(),
    pullRequestTitle: v.optional(v.string()),
    pullRequestDescription: v.optional(v.string()),
    headSha: v.string(),
    headBranch: v.string(),
    baseBranch: v.string(),
    changedFiles: v.optional(v.array(v.string())),
    gitDiff: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if job already exists for this PR and SHA
    const existing = await ctx.db
      .query("previewScreenshotJobs")
      .withIndex("by_pr", (q) =>
        q
          .eq("repoFullName", args.repoFullName)
          .eq("pullRequestNumber", args.pullRequestNumber)
      )
      .filter((q) => q.eq(q.field("headSha"), args.headSha))
      .first();

    if (existing) {
      return existing._id;
    }

    // Create new job
    const jobId = await ctx.db.insert("previewScreenshotJobs", {
      teamId: args.teamId,
      previewConfigId: args.previewConfigId,
      repoFullName: args.repoFullName,
      pullRequestNumber: args.pullRequestNumber,
      pullRequestTitle: args.pullRequestTitle,
      pullRequestDescription: args.pullRequestDescription,
      headSha: args.headSha,
      headBranch: args.headBranch,
      baseBranch: args.baseBranch,
      changedFiles: args.changedFiles,
      gitDiff: args.gitDiff,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    return jobId;
  },
});

export const updateScreenshotJob = mutation({
  args: {
    jobId: v.id("previewScreenshotJobs"),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("running"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("skipped")
      )
    ),
    errorMessage: v.optional(v.string()),
    sandboxInstanceId: v.optional(v.string()),
    vscodeUrl: v.optional(v.string()),
    screenshotStorageIds: v.optional(v.array(v.id("_storage"))),
    screenshotCount: v.optional(v.number()),
    githubCommentId: v.optional(v.number()),
    githubCommentUrl: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { jobId, ...updates } = args;
    await ctx.db.patch(jobId, {
      ...updates,
      updatedAt: Date.now(),
    });
  },
});

export const getScreenshotJob = query({
  args: {
    jobId: v.id("previewScreenshotJobs"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

export const listJobsByPR = query({
  args: {
    repoFullName: v.string(),
    pullRequestNumber: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("previewScreenshotJobs")
      .withIndex("by_pr", (q) =>
        q
          .eq("repoFullName", args.repoFullName)
          .eq("pullRequestNumber", args.pullRequestNumber)
      )
      .order("desc")
      .collect();
  },
});

export const listPendingJobs = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("previewScreenshotJobs")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .collect();
  },
});

// Internal mutation to trigger preview screenshot job from webhook
export const triggerPreviewFromWebhook = internalMutation({
  args: {
    teamId: v.string(),
    repoFullName: v.string(),
    pullRequestNumber: v.number(),
    pullRequestTitle: v.optional(v.string()),
    pullRequestDescription: v.optional(v.string()),
    headSha: v.string(),
    headBranch: v.string(),
    baseBranch: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if there's an active preview configuration for this repo
    const config = await ctx.db
      .query("previewConfigurations")
      .withIndex("by_team_repo", (q) =>
        q.eq("teamId", args.teamId).eq("repoFullName", args.repoFullName)
      )
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!config) {
      console.log("[preview] No active configuration found for repo", {
        teamId: args.teamId,
        repoFullName: args.repoFullName,
      });
      return null;
    }

    // Check if job already exists for this PR and SHA
    const existingJob = await ctx.db
      .query("previewScreenshotJobs")
      .withIndex("by_pr", (q) =>
        q
          .eq("repoFullName", args.repoFullName)
          .eq("pullRequestNumber", args.pullRequestNumber)
      )
      .filter((q) => q.eq(q.field("headSha"), args.headSha))
      .first();

    if (existingJob) {
      console.log("[preview] Job already exists", {
        jobId: existingJob._id,
        repoFullName: args.repoFullName,
        pullRequestNumber: args.pullRequestNumber,
        headSha: args.headSha,
      });
      return existingJob._id;
    }

    // Create new job
    const now = Date.now();
    const jobId = await ctx.db.insert("previewScreenshotJobs", {
      teamId: args.teamId,
      previewConfigId: config._id,
      repoFullName: args.repoFullName,
      pullRequestNumber: args.pullRequestNumber,
      pullRequestTitle: args.pullRequestTitle,
      pullRequestDescription: args.pullRequestDescription,
      headSha: args.headSha,
      headBranch: args.headBranch,
      baseBranch: args.baseBranch,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    console.log("[preview] Created screenshot job", {
      jobId,
      repoFullName: args.repoFullName,
      pullRequestNumber: args.pullRequestNumber,
      headSha: args.headSha,
    });

    return jobId;
  },
});
