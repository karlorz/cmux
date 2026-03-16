import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getTeamId } from "../_shared/team";
import { authMutation, authQuery } from "./users/utils";
import { internalQuery } from "./_generated/server";

const laneValidator = v.union(
  v.literal("hot"),
  v.literal("orchestration"),
  v.literal("project")
);

const statusValidator = v.union(
  v.literal("candidate"),
  v.literal("active"),
  v.literal("suppressed"),
  v.literal("archived")
);

const sourceTypeValidator = v.union(
  v.literal("user_correction"),
  v.literal("run_review"),
  v.literal("manual_promotion"),
  v.literal("manual_import")
);

const eventTypeValidator = v.union(
  v.literal("learning_logged"),
  v.literal("error_logged"),
  v.literal("feature_request_logged"),
  v.literal("rule_promoted"),
  v.literal("rule_suppressed"),
  v.literal("rule_forgotten"),
  v.literal("rule_used")
);

// --- Queries ---

/**
 * List active orchestration rules for a team.
 * Used to seed rules into head-agent spawn context.
 */
export const getActiveRules = authQuery({
  args: {
    teamSlugOrId: v.string(),
    lane: v.optional(laneValidator),
    projectFullName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    if (args.lane) {
      return ctx.db
        .query("agentOrchestrationRules")
        .withIndex("by_team_lane_status", (q) =>
          q.eq("teamId", teamId).eq("lane", args.lane!).eq("status", "active")
        )
        .take(100);
    }

    if (args.projectFullName) {
      // Return both project-specific rules AND global team rules (no projectFullName)
      const [projectRules, globalRules] = await Promise.all([
        ctx.db
          .query("agentOrchestrationRules")
          .withIndex("by_team_project_status", (q) =>
            q
              .eq("teamId", teamId)
              .eq("projectFullName", args.projectFullName!)
              .eq("status", "active")
          )
          .take(100),
        ctx.db
          .query("agentOrchestrationRules")
          .withIndex("by_team_status", (q) =>
            q.eq("teamId", teamId).eq("status", "active")
          )
          .filter((q) => q.eq(q.field("projectFullName"), undefined))
          .take(100),
      ]);
      return [...globalRules, ...projectRules];
    }

    return ctx.db
      .query("agentOrchestrationRules")
      .withIndex("by_team_status", (q) =>
        q.eq("teamId", teamId).eq("status", "active")
      )
      .take(100);
  },
});

/**
 * List candidate orchestration rules (pending confirmation).
 */
export const getCandidateRules = authQuery({
  args: {
    teamSlugOrId: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    return ctx.db
      .query("agentOrchestrationRules")
      .withIndex("by_team_status", (q) =>
        q.eq("teamId", teamId).eq("status", "candidate")
      )
      .take(100);
  },
});

/**
 * Get learning events for a specific task run.
 */
export const getLearningEventsForTaskRun = authQuery({
  args: {
    teamSlugOrId: v.string(),
    taskRunId: v.id("taskRuns"),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    // Verify task run belongs to caller's team
    const taskRun = await ctx.db.get(args.taskRunId);
    if (!taskRun || taskRun.teamId !== teamId) {
      throw new Error("Task run not found or unauthorized");
    }

    return ctx.db
      .query("agentOrchestrationLearningEvents")
      .withIndex("by_task_run", (q) => q.eq("taskRunId", args.taskRunId))
      .take(200);
  },
});

/**
 * Get learning events for a specific orchestration run.
 */
export const getLearningEventsForOrchestration = authQuery({
  args: {
    teamSlugOrId: v.string(),
    orchestrationId: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    // Verify orchestration belongs to caller's team by checking any event
    // (orchestrationId is a string reference, not a doc ID)
    const events = await ctx.db
      .query("agentOrchestrationLearningEvents")
      .withIndex("by_orchestration", (q) =>
        q.eq("orchestrationId", args.orchestrationId)
      )
      .take(200);

    // Filter to only events belonging to caller's team
    return events.filter((e) => e.teamId === teamId);
  },
});

/**
 * List skill candidates for a team.
 */
export const getSkillCandidates = authQuery({
  args: {
    teamSlugOrId: v.string(),
    status: v.optional(
      v.union(
        v.literal("candidate"),
        v.literal("approved"),
        v.literal("extracted"),
        v.literal("rejected")
      )
    ),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    if (args.status) {
      return ctx.db
        .query("agentOrchestrationSkillCandidates")
        .withIndex("by_team_status", (q) =>
          q.eq("teamId", teamId).eq("status", args.status!)
        )
        .take(50);
    }

    return ctx.db
      .query("agentOrchestrationSkillCandidates")
      .withIndex("by_team_status", (q) => q.eq("teamId", teamId))
      .take(50);
  },
});

// --- Mutations ---

/**
 * Create an orchestration rule.
 */
export const createRule = authMutation({
  args: {
    teamSlugOrId: v.string(),
    text: v.string(),
    lane: laneValidator,
    status: v.optional(statusValidator),
    sourceType: v.optional(sourceTypeValidator),
    projectFullName: v.optional(v.string()),
    sourceTaskRunId: v.optional(v.id("taskRuns")),
    linkedOrchestrationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;
    const now = Date.now();

    return ctx.db.insert("agentOrchestrationRules", {
      teamId,
      userId,
      projectFullName: args.projectFullName,
      lane: args.lane,
      status: args.status ?? "active",
      text: args.text,
      sourceType: args.sourceType ?? "manual_import",
      sourceTaskRunId: args.sourceTaskRunId,
      linkedOrchestrationId: args.linkedOrchestrationId,
      confidence: 1.0,
      timesSeen: 1,
      timesUsed: 0,
      lastConfirmedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Log an orchestration learning event.
 */
export const logLearningEvent = authMutation({
  args: {
    teamSlugOrId: v.string(),
    eventType: eventTypeValidator,
    text: v.string(),
    taskRunId: v.optional(v.id("taskRuns")),
    ruleId: v.optional(v.id("agentOrchestrationRules")),
    orchestrationId: v.optional(v.string()),
    metadataJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;

    // Validate referenced records belong to caller's team
    if (args.taskRunId) {
      const taskRun = await ctx.db.get(args.taskRunId);
      if (!taskRun || taskRun.teamId !== teamId) {
        throw new Error("Task run not found or unauthorized");
      }
    }

    if (args.ruleId) {
      const rule = await ctx.db.get(args.ruleId);
      if (!rule || rule.teamId !== teamId) {
        throw new Error("Rule not found or unauthorized");
      }
    }

    return ctx.db.insert("agentOrchestrationLearningEvents", {
      teamId,
      userId,
      taskRunId: args.taskRunId,
      ruleId: args.ruleId,
      orchestrationId: args.orchestrationId,
      eventType: args.eventType,
      text: args.text,
      metadataJson: args.metadataJson,
      createdAt: Date.now(),
    });
  },
});

/**
 * Log an orchestration event from an agent (via MCP tool or HTTP API).
 * Creates a candidate rule and logs the event.
 */
export const logEvent = authMutation({
  args: {
    teamSlugOrId: v.string(),
    eventType: eventTypeValidator,
    payload: v.object({
      text: v.string(),
      lane: v.optional(laneValidator),
      confidence: v.optional(v.number()),
      metadata: v.optional(v.any()),
      sourceTaskRunId: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;
    const now = Date.now();

    const { text, lane, confidence, metadata, sourceTaskRunId } = args.payload;

    // For learnings and errors, create a candidate rule
    let ruleId: string | undefined;
    if (
      args.eventType === "learning_logged" ||
      args.eventType === "error_logged"
    ) {
      ruleId = await ctx.db.insert("agentOrchestrationRules", {
        teamId,
        userId,
        lane: lane ?? "orchestration",
        status: "candidate",
        text,
        sourceType:
          args.eventType === "learning_logged"
            ? "run_review"
            : "user_correction",
        sourceTaskRunId: sourceTaskRunId
          ? (sourceTaskRunId as Id<"taskRuns">)
          : undefined,
        confidence: confidence ?? (args.eventType === "error_logged" ? 0.8 : 0.5),
        timesSeen: 1,
        timesUsed: 0,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Log the event
    const eventId = await ctx.db.insert("agentOrchestrationLearningEvents", {
      teamId,
      userId,
      ruleId: ruleId ? (ruleId as Id<"agentOrchestrationRules">) : undefined,
      eventType: args.eventType,
      text,
      metadataJson: metadata ? JSON.stringify(metadata) : undefined,
      createdAt: now,
    });

    return { eventId, ruleId };
  },
});

/**
 * Promote an orchestration rule to active status.
 */
export const promoteRule = authMutation({
  args: {
    teamSlugOrId: v.string(),
    ruleId: v.id("agentOrchestrationRules"),
    lane: v.optional(laneValidator),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;

    const rule = await ctx.db.get(args.ruleId);
    if (!rule || rule.teamId !== teamId) {
      throw new Error("Rule not found or unauthorized");
    }

    await ctx.db.patch(args.ruleId, {
      status: "active",
      lane: args.lane ?? rule.lane,
      confidence: 1.0,
      lastConfirmedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return ctx.db.insert("agentOrchestrationLearningEvents", {
      teamId,
      userId,
      ruleId: args.ruleId,
      eventType: "rule_promoted",
      text: `Promoted rule to active (lane: ${args.lane ?? rule.lane})`,
      createdAt: Date.now(),
    });
  },
});

/**
 * Suppress an orchestration rule.
 */
export const suppressRule = authMutation({
  args: {
    teamSlugOrId: v.string(),
    ruleId: v.id("agentOrchestrationRules"),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;

    const rule = await ctx.db.get(args.ruleId);
    if (!rule || rule.teamId !== teamId) {
      throw new Error("Rule not found or unauthorized");
    }

    await ctx.db.patch(args.ruleId, {
      status: "suppressed",
      updatedAt: Date.now(),
    });

    return ctx.db.insert("agentOrchestrationLearningEvents", {
      teamId,
      userId,
      ruleId: args.ruleId,
      eventType: "rule_suppressed",
      text: `Suppressed rule: ${rule.text.slice(0, 100)}`,
      createdAt: Date.now(),
    });
  },
});

/**
 * Log rule usage (provenance tracking for orchestration rules).
 */
export const logRuleUsed = authMutation({
  args: {
    teamSlugOrId: v.string(),
    taskRunId: v.id("taskRuns"),
    ruleId: v.id("agentOrchestrationRules"),
    orchestrationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;

    const rule = await ctx.db.get(args.ruleId);
    if (!rule || rule.teamId !== teamId) {
      throw new Error("Rule not found or unauthorized");
    }

    await ctx.db.patch(args.ruleId, {
      timesUsed: (rule.timesUsed ?? 0) + 1,
      lastUsedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return ctx.db.insert("agentOrchestrationLearningEvents", {
      teamId,
      userId,
      taskRunId: args.taskRunId,
      ruleId: args.ruleId,
      orchestrationId: args.orchestrationId,
      eventType: "rule_used",
      text: rule.text.slice(0, 200),
      createdAt: Date.now(),
    });
  },
});

/**
 * Create or update a skill candidate based on pattern detection.
 */
export const upsertSkillCandidate = authMutation({
  args: {
    teamSlugOrId: v.string(),
    patternKey: v.string(),
    title: v.string(),
    summary: v.string(),
    sourceRuleIds: v.array(v.id("agentOrchestrationRules")),
    projectFullName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const now = Date.now();

    const existing = await ctx.db
      .query("agentOrchestrationSkillCandidates")
      .withIndex("by_team_pattern", (q) =>
        q.eq("teamId", teamId).eq("patternKey", args.patternKey)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        summary: args.summary,
        sourceRuleIds: args.sourceRuleIds,
        recurrenceCount: existing.recurrenceCount + 1,
        updatedAt: now,
      });
      return existing._id;
    }

    return ctx.db.insert("agentOrchestrationSkillCandidates", {
      teamId,
      projectFullName: args.projectFullName,
      patternKey: args.patternKey,
      title: args.title,
      summary: args.summary,
      sourceRuleIds: args.sourceRuleIds,
      recurrenceCount: 1,
      status: "candidate",
      createdAt: now,
      updatedAt: now,
    });
  },
});

// --- Internal Queries (for httpAction / spawn-config path) ---

/**
 * Get active orchestration rules for a team (internal, no auth required).
 * Used by orchestration_http.ts spawn-config endpoint.
 */
export const getActiveRulesInternal = internalQuery({
  args: {
    teamId: v.string(),
    projectFullName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.projectFullName) {
      // Return both project-specific rules AND global team rules (no projectFullName)
      const [projectRules, globalRules] = await Promise.all([
        ctx.db
          .query("agentOrchestrationRules")
          .withIndex("by_team_project_status", (q) =>
            q
              .eq("teamId", args.teamId)
              .eq("projectFullName", args.projectFullName!)
              .eq("status", "active")
          )
          .take(100),
        ctx.db
          .query("agentOrchestrationRules")
          .withIndex("by_team_status", (q) =>
            q.eq("teamId", args.teamId).eq("status", "active")
          )
          .filter((q) => q.eq(q.field("projectFullName"), undefined))
          .take(100),
      ]);
      return [...globalRules, ...projectRules];
    }

    return ctx.db
      .query("agentOrchestrationRules")
      .withIndex("by_team_status", (q) =>
        q.eq("teamId", args.teamId).eq("status", "active")
      )
      .take(100);
  },
});
