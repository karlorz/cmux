import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { getTeamId } from "../_shared/team";
import { authMutation, authQuery } from "./users/utils";
import { internalMutation, internalQuery } from "./_generated/server";

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
 * Internal version of logEvent for JWT-auth calls from www routes.
 * Takes teamId and userId directly instead of requiring auth context.
 */
export const logEventInternal = internalMutation({
  args: {
    teamId: v.string(),
    userId: v.string(),
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
    const now = Date.now();
    const { text, lane, confidence, metadata, sourceTaskRunId } = args.payload;

    // For learnings and errors, create a candidate rule
    let ruleId: string | undefined;
    if (
      args.eventType === "learning_logged" ||
      args.eventType === "error_logged"
    ) {
      ruleId = await ctx.db.insert("agentOrchestrationRules", {
        teamId: args.teamId,
        userId: args.userId,
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
      teamId: args.teamId,
      userId: args.userId,
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
    text: v.optional(v.string()), // Allow editing rule text during promotion
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;

    const rule = await ctx.db.get(args.ruleId);
    if (!rule || rule.teamId !== teamId) {
      throw new Error("Rule not found or unauthorized");
    }

    const newText = args.text?.trim() || rule.text;
    const newLane = args.lane ?? rule.lane;

    await ctx.db.patch(args.ruleId, {
      status: "active",
      lane: newLane,
      text: newText,
      confidence: 1.0,
      lastConfirmedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return ctx.db.insert("agentOrchestrationLearningEvents", {
      teamId,
      userId,
      ruleId: args.ruleId,
      eventType: "rule_promoted",
      text: `Promoted rule to active (lane: ${newLane})`,
      createdAt: Date.now(),
    });
  },
});

/**
 * Bulk promote multiple orchestration rules to active status.
 */
export const bulkPromoteRules = authMutation({
  args: {
    teamSlugOrId: v.string(),
    ruleIds: v.array(v.id("agentOrchestrationRules")),
    lane: v.optional(laneValidator),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;
    const now = Date.now();

    let promoted = 0;
    for (const ruleId of args.ruleIds) {
      const rule = await ctx.db.get(ruleId);
      if (!rule || rule.teamId !== teamId) {
        continue; // Skip invalid rules
      }

      const newLane = args.lane ?? rule.lane;
      await ctx.db.patch(ruleId, {
        status: "active",
        lane: newLane,
        confidence: 1.0,
        lastConfirmedAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("agentOrchestrationLearningEvents", {
        teamId,
        userId,
        ruleId,
        eventType: "rule_promoted",
        text: `Bulk promoted to active (lane: ${newLane})`,
        createdAt: now,
      });

      promoted++;
    }

    return { promoted, total: args.ruleIds.length };
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
 * Used by orchestration_http.ts spawn-config endpoint and www JWT-auth routes.
 */
export const getActiveRulesInternal = internalQuery({
  args: {
    teamId: v.string(),
    lane: v.optional(laneValidator),
    projectFullName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Filter by lane if specified
    if (args.lane) {
      return ctx.db
        .query("agentOrchestrationRules")
        .withIndex("by_team_lane_status", (q) =>
          q.eq("teamId", args.teamId).eq("lane", args.lane!).eq("status", "active")
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

/**
 * Analyze active rules to detect patterns and create skill candidates.
 * Looks for rules with similar text/intent that appear multiple times.
 *
 * Called by a scheduled job or after rules reach a threshold count.
 */
export const detectPatterns = internalMutation({
  args: {
    teamId: v.string(),
    minOccurrences: v.optional(v.number()), // Default: 3
  },
  handler: async (ctx, args) => {
    const minOccurrences = args.minOccurrences ?? 3;
    const now = Date.now();

    // Get all active rules for the team
    const activeRules = await ctx.db
      .query("agentOrchestrationRules")
      .withIndex("by_team_status", (q) =>
        q.eq("teamId", args.teamId).eq("status", "active")
      )
      .take(500);

    if (activeRules.length < minOccurrences) {
      return { patternsFound: 0, candidatesCreated: 0 };
    }

    // Simple pattern detection: group rules by normalized text
    // (lowercase, remove extra whitespace, remove common stop words)
    const normalizeText = (text: string): string => {
      return text
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/\b(the|a|an|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|must|shall|can|need|dare|ought|used|to|of|in|for|on|with|at|by|from|as|into|through|during|before|after|above|below|between|under|again|further|then|once|here|there|when|where|why|how|all|each|every|both|few|more|most|other|some|such|no|nor|not|only|own|same|so|than|too|very|just|also|now|always|never)\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
    };

    const generatePatternKey = (text: string): string => {
      const normalized = normalizeText(text);
      // Simple hash: take first 50 chars and create a key
      return `pattern_${normalized.slice(0, 50).replace(/\s/g, "_")}`;
    };

    // Group rules by pattern key
    const patternGroups = new Map<string, typeof activeRules>();
    for (const rule of activeRules) {
      const key = generatePatternKey(rule.text);
      const group = patternGroups.get(key) ?? [];
      group.push(rule);
      patternGroups.set(key, group);
    }

    // Create skill candidates for patterns that appear >= minOccurrences times
    let candidatesCreated = 0;
    for (const [patternKey, rules] of patternGroups.entries()) {
      if (rules.length >= minOccurrences) {
        // Check if candidate already exists
        const existing = await ctx.db
          .query("agentOrchestrationSkillCandidates")
          .withIndex("by_team_pattern", (q) =>
            q.eq("teamId", args.teamId).eq("patternKey", patternKey)
          )
          .first();

        const ruleIds = rules.map((r) => r._id);
        const title = `Repeated Pattern: ${rules[0].text.slice(0, 50)}...`;
        const summary = `This pattern appeared ${rules.length} times across orchestration rules:\n\n${rules.map((r) => `- ${r.text}`).join("\n")}`;

        if (existing) {
          // Update existing candidate
          await ctx.db.patch(existing._id, {
            sourceRuleIds: ruleIds,
            recurrenceCount: rules.length,
            summary,
            updatedAt: now,
          });
        } else {
          // Create new candidate
          await ctx.db.insert("agentOrchestrationSkillCandidates", {
            teamId: args.teamId,
            patternKey,
            title,
            summary,
            sourceRuleIds: ruleIds,
            recurrenceCount: rules.length,
            status: "candidate",
            createdAt: now,
            updatedAt: now,
          });
          candidatesCreated++;
        }
      }
    }

    return {
      patternsFound: patternGroups.size,
      candidatesCreated,
      rulesAnalyzed: activeRules.length,
    };
  },
});

/**
 * Run pattern detection across all teams.
 * Called by cron job to periodically extract skill candidates.
 */
export const detectPatternsAllTeams = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Get distinct team IDs from active rules
    const rules = await ctx.db
      .query("agentOrchestrationRules")
      .filter((q) => q.eq(q.field("status"), "active"))
      .take(1000);

    const teamIds = [...new Set(rules.map((r) => r.teamId))];

    let totalCandidates = 0;
    for (const teamId of teamIds) {
      const result = await ctx.runMutation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (internal as any).agentOrchestrationLearning.detectPatterns,
        { teamId, minOccurrences: 3 }
      );
      totalCandidates += result.candidatesCreated;
    }

    return {
      teamsProcessed: teamIds.length,
      totalCandidatesCreated: totalCandidates,
    };
  },
});
