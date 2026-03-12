import { v } from "convex/values";
import { getTeamId } from "../_shared/team";
import { authMutation } from "./users/utils";

/**
 * Log a behavior correction event.
 * Used when a user explicitly corrects agent behavior.
 */
export const logCorrection = authMutation({
  args: {
    teamSlugOrId: v.string(),
    taskRunId: v.optional(v.id("taskRuns")),
    wrongAction: v.string(),
    correctAction: v.string(),
    learnedRule: v.optional(v.string()),
    context: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;

    // Create the event
    const eventId = await ctx.db.insert("agentBehaviorEvents", {
      teamId,
      userId,
      taskRunId: args.taskRunId,
      eventType: "correction_logged",
      wrongAction: args.wrongAction,
      correctAction: args.correctAction,
      learnedRule: args.learnedRule,
      context: args.context,
      createdAt: Date.now(),
    });

    // If a learned rule was derived, create a candidate rule
    let ruleId = undefined;
    if (args.learnedRule) {
      ruleId = await ctx.db.insert("agentBehaviorRules", {
        teamId,
        userId,
        namespace: "general",
        scope: "hot",
        status: "candidate",
        text: args.learnedRule,
        sourceType: "user_correction",
        sourceTaskRunId: args.taskRunId,
        confidence: 0.5,
        timesSeen: 1,
        timesUsed: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // Link the rule to the event
      await ctx.db.patch(eventId, { ruleId });
    }

    return { eventId, ruleId };
  },
});

/**
 * Log a rule_used event (provenance tracking).
 * Called when an agent applies a behavior rule during execution.
 */
export const logRuleUsed = authMutation({
  args: {
    teamSlugOrId: v.string(),
    taskRunId: v.id("taskRuns"),
    ruleId: v.id("agentBehaviorRules"),
    appliedInContext: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;

    // Verify the rule exists
    const rule = await ctx.db.get(args.ruleId);
    if (!rule || rule.teamId !== teamId) {
      throw new Error("Rule not found or unauthorized");
    }

    // Create the event
    const eventId = await ctx.db.insert("agentBehaviorEvents", {
      teamId,
      userId,
      taskRunId: args.taskRunId,
      ruleId: args.ruleId,
      eventType: "rule_used",
      appliedInContext: args.appliedInContext,
      createdAt: Date.now(),
    });

    // Update rule usage stats
    await ctx.db.patch(args.ruleId, {
      timesUsed: (rule.timesUsed ?? 0) + 1,
      lastUsedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return eventId;
  },
});

/**
 * Promote a candidate rule to active status.
 * Called when a user confirms a rule should be applied.
 */
export const promoteRule = authMutation({
  args: {
    teamSlugOrId: v.string(),
    ruleId: v.id("agentBehaviorRules"),
    scope: v.optional(
      v.union(v.literal("hot"), v.literal("domain"), v.literal("project"))
    ),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;

    const rule = await ctx.db.get(args.ruleId);
    if (!rule || rule.teamId !== teamId) {
      throw new Error("Rule not found or unauthorized");
    }

    const previousStatus = rule.status;

    // Update rule status
    await ctx.db.patch(args.ruleId, {
      status: "active",
      scope: args.scope ?? rule.scope,
      confidence: 1.0,
      lastConfirmedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Log the promotion event
    const eventId = await ctx.db.insert("agentBehaviorEvents", {
      teamId,
      userId,
      ruleId: args.ruleId,
      eventType: "rule_promoted",
      previousStatus,
      newStatus: "active",
      createdAt: Date.now(),
    });

    return eventId;
  },
});

/**
 * Suppress a rule (user doesn't want it applied).
 */
export const suppressRule = authMutation({
  args: {
    teamSlugOrId: v.string(),
    ruleId: v.id("agentBehaviorRules"),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;

    const rule = await ctx.db.get(args.ruleId);
    if (!rule || rule.teamId !== teamId) {
      throw new Error("Rule not found or unauthorized");
    }

    const previousStatus = rule.status;

    await ctx.db.patch(args.ruleId, {
      status: "suppressed",
      updatedAt: Date.now(),
    });

    const eventId = await ctx.db.insert("agentBehaviorEvents", {
      teamId,
      userId,
      ruleId: args.ruleId,
      eventType: "rule_suppressed",
      previousStatus,
      newStatus: "suppressed",
      createdAt: Date.now(),
    });

    return eventId;
  },
});

/**
 * Forget a rule (permanently remove from active retrieval).
 */
export const forgetRule = authMutation({
  args: {
    teamSlugOrId: v.string(),
    ruleId: v.id("agentBehaviorRules"),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;

    const rule = await ctx.db.get(args.ruleId);
    if (!rule || rule.teamId !== teamId) {
      throw new Error("Rule not found or unauthorized");
    }

    const previousStatus = rule.status;

    await ctx.db.patch(args.ruleId, {
      status: "archived",
      updatedAt: Date.now(),
    });

    const eventId = await ctx.db.insert("agentBehaviorEvents", {
      teamId,
      userId,
      ruleId: args.ruleId,
      eventType: "rule_forgotten",
      previousStatus,
      newStatus: "archived",
      createdAt: Date.now(),
    });

    return eventId;
  },
});

/**
 * Create a behavior rule directly (manual import).
 */
export const createRule = authMutation({
  args: {
    teamSlugOrId: v.string(),
    text: v.string(),
    scope: v.union(v.literal("hot"), v.literal("domain"), v.literal("project")),
    namespace: v.optional(v.string()),
    projectFullName: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("candidate"),
        v.literal("active"),
        v.literal("suppressed"),
        v.literal("archived")
      )
    ),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;

    const ruleId = await ctx.db.insert("agentBehaviorRules", {
      teamId,
      userId,
      projectFullName: args.projectFullName,
      namespace: args.namespace ?? "general",
      scope: args.scope,
      status: args.status ?? "active",
      text: args.text,
      sourceType: "manual_import",
      confidence: 1.0,
      timesSeen: 1,
      timesUsed: 0,
      lastConfirmedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return ruleId;
  },
});
