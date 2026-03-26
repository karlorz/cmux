import { v } from "convex/values";
import { getTeamId } from "../_shared/team";
import { internalQuery } from "./_generated/server";
import { authQuery } from "./users/utils";

/** Calculate UTF-8 byte length without Node.js Buffer (works in Convex V8 runtime) */
function utf8ByteLength(str: string): number {
  return new TextEncoder().encode(str).length;
}

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

// =============================================================================
// Scoped Memory Queries (Phase 5: IronClaw-inspired memory scope model)
// =============================================================================

/**
 * Memory scope type for layered reads.
 * Read precedence: run > user > repo > team (most specific wins)
 */
type MemoryScope = "team" | "repo" | "user" | "run";

/**
 * Result of scoped knowledge query with merged content.
 */
interface ScopedKnowledgeResult {
  /** Merged knowledge content with scope precedence applied */
  content: string | null;
  /** Which scopes contributed content */
  sources: {
    scope: MemoryScope;
    hasContent: boolean;
    byteSize: number;
  }[];
  /** Total byte size of merged content */
  totalByteSize: number;
}

/**
 * Get knowledge memory with scope precedence.
 * Merges content from team → repo → user → run scopes.
 * More specific scopes take precedence for conflicting keys.
 *
 * @param teamSlugOrId - Team identifier
 * @param projectFullName - Optional repo for repo-scoped memory
 * @param includeRunScope - Whether to include run/local ephemeral content
 */
export const getScopedKnowledge = authQuery({
  args: {
    teamSlugOrId: v.string(),
    projectFullName: v.optional(v.string()),
    includeRunScope: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<ScopedKnowledgeResult> => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity?.subject;

    const sources: ScopedKnowledgeResult["sources"] = [];
    const contentParts: string[] = [];

    // 1. Team-scoped knowledge (lowest precedence)
    const teamKnowledge = await ctx.db
      .query("agentMemorySnapshots")
      .withIndex("by_team_scope_type", (q) =>
        q.eq("teamId", teamId).eq("scope", "team").eq("memoryType", "knowledge")
      )
      .order("desc")
      .first();

    if (teamKnowledge?.content) {
      contentParts.push(`# Team Knowledge\n\n${teamKnowledge.content}`);
      sources.push({
        scope: "team",
        hasContent: true,
        byteSize: utf8ByteLength(teamKnowledge.content),
      });
    } else {
      sources.push({ scope: "team", hasContent: false, byteSize: 0 });
    }

    // 2. Repo-scoped knowledge (if projectFullName provided)
    if (args.projectFullName) {
      const repoKnowledge = await ctx.db
        .query("agentMemorySnapshots")
        .withIndex("by_repo_type", (q) =>
          q.eq("projectFullName", args.projectFullName).eq("memoryType", "knowledge")
        )
        .order("desc")
        .first();

      if (repoKnowledge?.content) {
        contentParts.push(`# Repo Knowledge (${args.projectFullName})\n\n${repoKnowledge.content}`);
        sources.push({
          scope: "repo",
          hasContent: true,
          byteSize: utf8ByteLength(repoKnowledge.content),
        });
      } else {
        sources.push({ scope: "repo", hasContent: false, byteSize: 0 });
      }
    }

    // 3. User-scoped knowledge
    if (userId) {
      const userKnowledge = await ctx.db
        .query("agentMemorySnapshots")
        .withIndex("by_user_type", (q) =>
          q.eq("userId", userId).eq("memoryType", "knowledge")
        )
        .filter((q) => q.eq(q.field("scope"), "user"))
        .order("desc")
        .first();

      if (userKnowledge?.content) {
        contentParts.push(`# User Knowledge\n\n${userKnowledge.content}`);
        sources.push({
          scope: "user",
          hasContent: true,
          byteSize: utf8ByteLength(userKnowledge.content),
        });
      } else {
        sources.push({ scope: "user", hasContent: false, byteSize: 0 });
      }
    }

    // 4. Run-scoped knowledge (ephemeral, only if requested)
    if (args.includeRunScope) {
      sources.push({ scope: "run", hasContent: false, byteSize: 0 });
      // Run-scoped content is not merged here - it's task-specific
    }

    const mergedContent = contentParts.length > 0 ? contentParts.join("\n\n---\n\n") : null;

    return {
      content: mergedContent,
      sources,
      totalByteSize: mergedContent ? utf8ByteLength(mergedContent) : 0,
    };
  },
});

/**
 * Internal version of getScopedKnowledge for JWT-based spawns.
 * Used by orchestration HTTP endpoints when Stack Auth is not available.
 */
export const getScopedKnowledgeInternal = internalQuery({
  args: {
    teamId: v.string(),
    userId: v.optional(v.string()),
    projectFullName: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ScopedKnowledgeResult> => {
    const sources: ScopedKnowledgeResult["sources"] = [];
    const contentParts: string[] = [];

    // 1. Team-scoped knowledge
    const teamKnowledge = await ctx.db
      .query("agentMemorySnapshots")
      .withIndex("by_team_scope_type", (q) =>
        q.eq("teamId", args.teamId).eq("scope", "team").eq("memoryType", "knowledge")
      )
      .order("desc")
      .first();

    if (teamKnowledge?.content) {
      contentParts.push(`# Team Knowledge\n\n${teamKnowledge.content}`);
      sources.push({
        scope: "team",
        hasContent: true,
        byteSize: utf8ByteLength(teamKnowledge.content),
      });
    } else {
      sources.push({ scope: "team", hasContent: false, byteSize: 0 });
    }

    // 2. Repo-scoped knowledge
    if (args.projectFullName) {
      const repoKnowledge = await ctx.db
        .query("agentMemorySnapshots")
        .withIndex("by_repo_type", (q) =>
          q.eq("projectFullName", args.projectFullName).eq("memoryType", "knowledge")
        )
        .order("desc")
        .first();

      if (repoKnowledge?.content) {
        contentParts.push(`# Repo Knowledge (${args.projectFullName})\n\n${repoKnowledge.content}`);
        sources.push({
          scope: "repo",
          hasContent: true,
          byteSize: utf8ByteLength(repoKnowledge.content),
        });
      } else {
        sources.push({ scope: "repo", hasContent: false, byteSize: 0 });
      }
    }

    // 3. User-scoped knowledge
    if (args.userId) {
      const userIdValue = args.userId; // Narrow type for index query
      const userKnowledge = await ctx.db
        .query("agentMemorySnapshots")
        .withIndex("by_user_type", (q) =>
          q.eq("userId", userIdValue).eq("memoryType", "knowledge")
        )
        .filter((q) => q.eq(q.field("scope"), "user"))
        .order("desc")
        .first();

      if (userKnowledge?.content) {
        contentParts.push(`# User Knowledge\n\n${userKnowledge.content}`);
        sources.push({
          scope: "user",
          hasContent: true,
          byteSize: utf8ByteLength(userKnowledge.content),
        });
      } else {
        sources.push({ scope: "user", hasContent: false, byteSize: 0 });
      }
    }

    const mergedContent = contentParts.length > 0 ? contentParts.join("\n\n---\n\n") : null;

    return {
      content: mergedContent,
      sources,
      totalByteSize: mergedContent ? utf8ByteLength(mergedContent) : 0,
    };
  },
});

/**
 * Check if a memory type is an identity file that should never cascade across scopes.
 * Identity files include IDENTITY.md, USER.md, SOUL.md - these must stay local.
 */
export function isIdentityMemoryType(fileName: string | undefined): boolean {
  if (!fileName) return false;
  const identityFiles = ["IDENTITY.md", "USER.md", "SOUL.md", "IDENTITY", "USER", "SOUL"];
  return identityFiles.some((f) => fileName.toUpperCase().includes(f.toUpperCase()));
}

// =============================================================================
// Memory Scope Summary for UI (Priority 3: Operator visibility)
// =============================================================================

/**
 * Memory scope summary for task run UI.
 * Shows what memory was injected from each scope level.
 */
interface MemoryScopeSummary {
  /** Scope breakdown with content sizes */
  scopes: Array<{
    scope: MemoryScope;
    label: string;
    hasContent: boolean;
    byteSize: number;
    snapshotCount: number;
    lastSyncedAt?: number;
  }>;
  /** Total memory injected */
  totalByteSize: number;
  /** Whether memory injection is enabled */
  memoryEnabled: boolean;
}

/**
 * Get memory scope summary for a task run.
 * Shows what memory was seeded from each scope level (team, repo, user, run).
 * Used by TaskRunMemoryPanel to visualize memory scope breakdown.
 */
export const getMemoryScopeSummary = authQuery({
  args: {
    teamSlugOrId: v.string(),
    taskRunId: v.id("taskRuns"),
  },
  handler: async (ctx, args): Promise<MemoryScopeSummary> => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity?.subject;

    // Get task run to find project info
    const taskRun = await ctx.db.get(args.taskRunId);
    if (!taskRun || taskRun.teamId !== teamId) {
      return {
        scopes: [],
        totalByteSize: 0,
        memoryEnabled: false,
      };
    }

    // Get the task to find projectFullName
    const task = await ctx.db.get(taskRun.taskId);
    const projectFullName = task?.projectFullName;

    const scopes: MemoryScopeSummary["scopes"] = [];
    let totalByteSize = 0;

    // 1. Team scope
    const teamSnapshots = await ctx.db
      .query("agentMemorySnapshots")
      .withIndex("by_team_scope_type", (q) =>
        q.eq("teamId", teamId).eq("scope", "team").eq("memoryType", "knowledge")
      )
      .collect();
    const teamByteSize = teamSnapshots.reduce(
      (sum, s) => sum + (s.content ? utf8ByteLength(s.content) : 0),
      0
    );
    scopes.push({
      scope: "team",
      label: "Team (shared)",
      hasContent: teamByteSize > 0,
      byteSize: teamByteSize,
      snapshotCount: teamSnapshots.length,
      lastSyncedAt: teamSnapshots[0]?.createdAt,
    });
    totalByteSize += teamByteSize;

    // 2. Repo scope (if project exists)
    if (projectFullName) {
      const repoSnapshots = await ctx.db
        .query("agentMemorySnapshots")
        .withIndex("by_repo_type", (q) =>
          q.eq("projectFullName", projectFullName).eq("memoryType", "knowledge")
        )
        .collect();
      const repoByteSize = repoSnapshots.reduce(
        (sum, s) => sum + (s.content ? utf8ByteLength(s.content) : 0),
        0
      );
      scopes.push({
        scope: "repo",
        label: `Repo (${projectFullName.split("/")[1] || projectFullName})`,
        hasContent: repoByteSize > 0,
        byteSize: repoByteSize,
        snapshotCount: repoSnapshots.length,
        lastSyncedAt: repoSnapshots[0]?.createdAt,
      });
      totalByteSize += repoByteSize;
    }

    // 3. User scope
    if (userId) {
      const userSnapshots = await ctx.db
        .query("agentMemorySnapshots")
        .withIndex("by_user_type", (q) =>
          q.eq("userId", userId).eq("memoryType", "knowledge")
        )
        .filter((q) => q.eq(q.field("scope"), "user"))
        .collect();
      const userByteSize = userSnapshots.reduce(
        (sum, s) => sum + (s.content ? utf8ByteLength(s.content) : 0),
        0
      );
      scopes.push({
        scope: "user",
        label: "User (personal)",
        hasContent: userByteSize > 0,
        byteSize: userByteSize,
        snapshotCount: userSnapshots.length,
        lastSyncedAt: userSnapshots[0]?.createdAt,
      });
      totalByteSize += userByteSize;
    }

    // 4. Run scope (task-specific ephemeral memory)
    const runSnapshots = await ctx.db
      .query("agentMemorySnapshots")
      .withIndex("by_task_run", (q) => q.eq("taskRunId", args.taskRunId))
      .collect();
    const runByteSize = runSnapshots.reduce(
      (sum, s) => sum + (s.content ? utf8ByteLength(s.content) : 0),
      0
    );
    scopes.push({
      scope: "run",
      label: "Run (ephemeral)",
      hasContent: runByteSize > 0,
      byteSize: runByteSize,
      snapshotCount: runSnapshots.length,
      lastSyncedAt: runSnapshots[0]?.createdAt,
    });
    totalByteSize += runByteSize;

    return {
      scopes,
      totalByteSize,
      memoryEnabled: true,
    };
  },
});
