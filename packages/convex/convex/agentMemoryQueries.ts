import { v } from "convex/values";
import { getTeamId } from "../_shared/team";
import { internalQuery } from "./_generated/server";
import { authQuery } from "./users/utils";

/**
 * Get the latest knowledge memory snapshot for a team.
 * Used for cross-run memory seeding - new sandboxes get previous run's knowledge.
 *
 * Returns the most recent "knowledge" type snapshot content, or null if none exists.
 */
export const getLatestTeamKnowledge = authQuery({
  args: { teamSlugOrId: v.string() },
  handler: async (ctx, args): Promise<string | null> => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    // Query the most recent knowledge snapshot for this team
    // Uses by_team_type index with createdAt for ordering
    const snapshot = await ctx.db
      .query("agentMemorySnapshots")
      .withIndex("by_team_type", (q) =>
        q.eq("teamId", teamId).eq("memoryType", "knowledge")
      )
      .order("desc")
      .first();

    if (!snapshot) {
      return null;
    }

    // Return content if it's non-empty and substantial
    const content = snapshot.content?.trim();
    if (!content || content.length < 50) {
      // If content is too short, it's probably just the template
      return null;
    }

    return snapshot.content;
  },
});

/**
 * Get all memory snapshots for a specific task run.
 * Used by the Memory Viewer UI panel to display synced memory.
 *
 * Returns an array of snapshots with knowledge, daily, tasks, and mailbox content.
 */
export const getByTaskRun = authQuery({
  args: {
    teamSlugOrId: v.string(),
    taskRunId: v.id("taskRuns"),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    // Verify the task run belongs to this team
    const taskRun = await ctx.db.get(args.taskRunId);
    if (!taskRun || taskRun.teamId !== teamId) {
      return [];
    }

    // Query all snapshots for this task run
    const snapshots = await ctx.db
      .query("agentMemorySnapshots")
      .withIndex("by_task_run", (q) => q.eq("taskRunId", args.taskRunId))
      .collect();

    return snapshots;
  },
});

/**
 * Message type for inter-agent mailbox communication.
 */
interface MailboxMessage {
  id: string;
  from: string;
  to: string;
  type?: "handoff" | "request" | "status";
  message: string;
  timestamp: string;
  read?: boolean;
}

/**
 * Mailbox JSON structure.
 */
interface MailboxContent {
  version: number;
  messages: MailboxMessage[];
}

/**
 * Get the latest team mailbox with unread messages from all task runs.
 * Used for cross-run mailbox seeding - new sandboxes get unread messages from previous runs.
 *
 * Returns the merged MAILBOX.json content with all unread messages, or null if none.
 */
export const getLatestTeamMailbox = authQuery({
  args: { teamSlugOrId: v.string() },
  handler: async (ctx, args): Promise<string | null> => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    // Query the most recent mailbox snapshots for this team (limit to recent ones)
    const mailboxSnapshots = await ctx.db
      .query("agentMemorySnapshots")
      .withIndex("by_team_type", (q) =>
        q.eq("teamId", teamId).eq("memoryType", "mailbox")
      )
      .order("desc")
      .take(50); // Limit to 50 most recent snapshots

    if (mailboxSnapshots.length === 0) {
      return null;
    }

    // Merge and dedupe messages from all mailbox snapshots
    const allMessages: MailboxMessage[] = [];
    const seenIds = new Set<string>();

    for (const snapshot of mailboxSnapshots) {
      try {
        const content = snapshot.content?.trim();
        if (!content) continue;

        const mailbox = JSON.parse(content) as MailboxContent;
        if (!mailbox.messages || !Array.isArray(mailbox.messages)) continue;

        for (const msg of mailbox.messages) {
          // Only include unread messages, dedupe by ID
          if (!msg.read && msg.id && !seenIds.has(msg.id)) {
            seenIds.add(msg.id);
            allMessages.push(msg);
          }
        }
      } catch (error) {
        console.error("[agentMemory] Failed to parse mailbox snapshot", error);
        continue;
      }
    }

    // If no unread messages, return null
    if (allMessages.length === 0) {
      return null;
    }

    // Sort by timestamp (oldest first) for chronological reading
    allMessages.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime() || 0;
      const timeB = new Date(b.timestamp).getTime() || 0;
      return timeA - timeB;
    });

    // Return merged mailbox content
    const mergedMailbox: MailboxContent = {
      version: 1,
      messages: allMessages,
    };

    return JSON.stringify(mergedMailbox, null, 2);
  },
});

/**
 * Internal query to get the latest team knowledge for JWT-based spawns.
 * Used by orchestration HTTP endpoints when Stack Auth is not available.
 */
export const getLatestTeamKnowledgeInternal = internalQuery({
  args: { teamId: v.string() },
  handler: async (ctx, args): Promise<string | null> => {
    const snapshot = await ctx.db
      .query("agentMemorySnapshots")
      .withIndex("by_team_type", (q) =>
        q.eq("teamId", args.teamId).eq("memoryType", "knowledge")
      )
      .order("desc")
      .first();

    if (!snapshot) {
      return null;
    }

    const content = snapshot.content?.trim();
    if (!content || content.length < 50) {
      return null;
    }

    return snapshot.content;
  },
});

/**
 * Internal query to get the latest team mailbox for JWT-based spawns.
 * Used by orchestration HTTP endpoints when Stack Auth is not available.
 */
export const getLatestTeamMailboxInternal = internalQuery({
  args: { teamId: v.string() },
  handler: async (ctx, args): Promise<string | null> => {
    const mailboxSnapshots = await ctx.db
      .query("agentMemorySnapshots")
      .withIndex("by_team_type", (q) =>
        q.eq("teamId", args.teamId).eq("memoryType", "mailbox")
      )
      .order("desc")
      .take(50);

    if (mailboxSnapshots.length === 0) {
      return null;
    }

    const allMessages: MailboxMessage[] = [];
    const seenIds = new Set<string>();

    for (const snapshot of mailboxSnapshots) {
      try {
        const content = snapshot.content?.trim();
        if (!content) continue;

        const mailbox = JSON.parse(content) as MailboxContent;
        if (!mailbox.messages || !Array.isArray(mailbox.messages)) continue;

        for (const msg of mailbox.messages) {
          if (!msg.read && msg.id && !seenIds.has(msg.id)) {
            seenIds.add(msg.id);
            allMessages.push(msg);
          }
        }
      } catch (error) {
        console.error("[agentMemory] Failed to parse mailbox snapshot", error);
        continue;
      }
    }

    if (allMessages.length === 0) {
      return null;
    }

    allMessages.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime() || 0;
      const timeB = new Date(b.timestamp).getTime() || 0;
      return timeA - timeB;
    });

    const mergedMailbox: MailboxContent = {
      version: 1,
      messages: allMessages,
    };

    return JSON.stringify(mergedMailbox, null, 2);
  },
});

// =============================================================================
// Behavior Memory Queries (self-improving preferences)
// =============================================================================

/**
 * Get the latest behavior HOT memory snapshot for a team.
 * Used for cross-run memory seeding - new sandboxes get previous run's behavior rules.
 *
 * Returns the most recent "behavior_hot" type snapshot content, or null if none exists.
 */
export const getLatestTeamBehaviorHot = authQuery({
  args: { teamSlugOrId: v.string() },
  handler: async (ctx, args): Promise<string | null> => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    const snapshot = await ctx.db
      .query("agentMemorySnapshots")
      .withIndex("by_team_type", (q) =>
        q.eq("teamId", teamId).eq("memoryType", "behavior_hot")
      )
      .order("desc")
      .first();

    if (!snapshot) {
      return null;
    }

    // Return content if it's non-empty and has actual rules
    const content = snapshot.content?.trim();
    if (!content || content.length < 50) {
      return null;
    }

    return snapshot.content;
  },
});

/**
 * Internal query to get the latest team behavior HOT for JWT-based spawns.
 * Used by orchestration HTTP endpoints when Stack Auth is not available.
 */
export const getLatestTeamBehaviorHotInternal = internalQuery({
  args: { teamId: v.string() },
  handler: async (ctx, args): Promise<string | null> => {
    const snapshot = await ctx.db
      .query("agentMemorySnapshots")
      .withIndex("by_team_type", (q) =>
        q.eq("teamId", args.teamId).eq("memoryType", "behavior_hot")
      )
      .order("desc")
      .first();

    if (!snapshot) {
      return null;
    }

    const content = snapshot.content?.trim();
    if (!content || content.length < 50) {
      return null;
    }

    return snapshot.content;
  },
});

/**
 * Get all behavior memory snapshots for a team.
 * Returns behavior_hot, behavior_corrections, behavior_domain, behavior_project, and behavior_index.
 */
export const getTeamBehaviorMemory = authQuery({
  args: { teamSlugOrId: v.string() },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    const behaviorTypes = [
      "behavior_hot",
      "behavior_corrections",
      "behavior_domain",
      "behavior_project",
      "behavior_index",
    ] as const;

    type MemorySnapshot = {
      _id: string;
      _creationTime: number;
      taskRunId: string;
      teamId: string;
      userId: string;
      agentName?: string;
      memoryType: string;
      content: string;
      fileName?: string;
      date?: string;
      truncated?: boolean;
      createdAt: number;
    };

    // Fetch all behavior types in parallel (avoid N+1 sequential queries)
    const snapshotPromises = behaviorTypes.map((memoryType) =>
      ctx.db
        .query("agentMemorySnapshots")
        .withIndex("by_team_type", (q) =>
          q.eq("teamId", teamId).eq("memoryType", memoryType)
        )
        .order("desc")
        .take(10)
    );

    const allSnapshots = await Promise.all(snapshotPromises);

    const results: Record<string, MemorySnapshot[]> = {};
    behaviorTypes.forEach((memoryType, index) => {
      results[memoryType] = allSnapshots[index].map((s) => ({
        _id: s._id,
        _creationTime: s._creationTime,
        taskRunId: s.taskRunId,
        teamId: s.teamId,
        userId: s.userId,
        agentName: s.agentName,
        memoryType: s.memoryType,
        content: s.content,
        fileName: s.fileName,
        date: s.date,
        truncated: s.truncated,
        createdAt: s.createdAt,
      }));
    });

    return results;
  },
});

// =============================================================================
// Behavior Rules Queries (S15 provenance tracking)
// =============================================================================

/**
 * Get active behavior rules for a team.
 * Used to show which rules are currently loaded and their usage stats.
 */
export const getActiveBehaviorRules = authQuery({
  args: {
    teamSlugOrId: v.string(),
    scope: v.optional(
      v.union(v.literal("hot"), v.literal("domain"), v.literal("project"))
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const limit = args.limit ?? 50;

    let query = ctx.db
      .query("agentBehaviorRules")
      .withIndex("by_team_status", (q) =>
        q.eq("teamId", teamId).eq("status", "active")
      );

    const rules = await query.order("desc").take(limit);

    // Filter by scope if specified
    if (args.scope) {
      return rules.filter((r) => r.scope === args.scope);
    }

    return rules;
  },
});

/**
 * Get behavior rules applied in a specific task run (provenance).
 * Shows which rules were actually used during agent execution.
 */
export const getBehaviorRulesForTaskRun = authQuery({
  args: {
    teamSlugOrId: v.string(),
    taskRunId: v.id("taskRuns"),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    // Verify task run belongs to team
    const taskRun = await ctx.db.get(args.taskRunId);
    if (!taskRun || taskRun.teamId !== teamId) {
      return { rules: [], events: [] };
    }

    // Get rule_used events for this task run
    const events = await ctx.db
      .query("agentBehaviorEvents")
      .withIndex("by_task_run", (q) => q.eq("taskRunId", args.taskRunId))
      .collect();

    // Get unique rule IDs from rule_used events
    const ruleIds = new Set<string>();
    for (const event of events) {
      if (event.eventType === "rule_used" && event.ruleId) {
        ruleIds.add(event.ruleId);
      }
    }

    // Fetch the actual rules
    const rules = await Promise.all(
      Array.from(ruleIds).map((id) => ctx.db.get(id as any))
    );

    return {
      rules: rules.filter(Boolean),
      events: events.filter((e) => e.eventType === "rule_used"),
    };
  },
});

/**
 * Get behavior events for a team (corrections, promotions, demotions).
 * Used by the behavior dashboard to show history.
 */
export const getBehaviorEvents = authQuery({
  args: {
    teamSlugOrId: v.string(),
    eventType: v.optional(
      v.union(
        v.literal("correction_logged"),
        v.literal("reflection_logged"),
        v.literal("rule_promoted"),
        v.literal("rule_demoted"),
        v.literal("rule_forgotten"),
        v.literal("rule_suppressed"),
        v.literal("rule_used")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const limit = args.limit ?? 50;

    if (args.eventType) {
      return ctx.db
        .query("agentBehaviorEvents")
        .withIndex("by_team_type", (q) =>
          q.eq("teamId", teamId).eq("eventType", args.eventType!)
        )
        .order("desc")
        .take(limit);
    }

    return ctx.db
      .query("agentBehaviorEvents")
      .withIndex("by_team_created", (q) => q.eq("teamId", teamId))
      .order("desc")
      .take(limit);
  },
});

/**
 * Get candidate rules pending confirmation.
 * Used by the review dashboard to show rules that need user approval.
 */
export const getCandidateBehaviorRules = authQuery({
  args: {
    teamSlugOrId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const limit = args.limit ?? 20;

    return ctx.db
      .query("agentBehaviorRules")
      .withIndex("by_team_status", (q) =>
        q.eq("teamId", teamId).eq("status", "candidate")
      )
      .order("desc")
      .take(limit);
  },
});
