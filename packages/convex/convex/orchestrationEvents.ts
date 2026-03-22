/**
 * Orchestration Events - Mutations and queries for typed event persistence.
 *
 * Provides durable storage for AgentCommEvent events, enabling:
 * - Audit trail of all orchestration activity
 * - Event replay for debugging
 * - SSE delivery from persisted events
 * - Cross-run event history
 */

import { v } from "convex/values";
import { getTeamId } from "../_shared/team";
import { internalMutation, internalQuery } from "./_generated/server";
import { authMutation, authQuery } from "./users/utils";

// =============================================================================
// Event Types Validator
// =============================================================================

const eventTypeValidator = v.union(
  // Task lifecycle events
  v.literal("task_spawn_requested"),
  v.literal("task_started"),
  v.literal("task_status_changed"),
  v.literal("task_completed"),
  // Worker communication events
  v.literal("worker_message"),
  v.literal("worker_status"),
  // Approval events
  v.literal("approval_required"),
  v.literal("approval_resolved"),
  // Plan and orchestration events
  v.literal("plan_updated"),
  v.literal("orchestration_completed"),
  v.literal("provider_session_bound"),
  // Session lifecycle events (Phase 4)
  v.literal("session_started"),
  v.literal("session_resumed"),
  v.literal("session_stop_requested"),
  v.literal("session_stop_blocked"),
  v.literal("session_stop_failed"),
  // Memory and instructions events (Phase 4)
  v.literal("instructions_loaded"),
  v.literal("memory_loaded"),
  v.literal("memory_updated"),
  v.literal("memory_pruned"), // Legacy alias for memory_updated with action=archive
  // Context health events (Phase 4)
  v.literal("context_warning"),
  v.literal("context_compacted")
);

// =============================================================================
// Public Mutations
// =============================================================================

/**
 * Log an orchestration event (authenticated).
 * Used by external clients (CLI, UI) to record events.
 */
export const logEvent = authMutation({
  args: {
    teamSlugOrId: v.string(),
    eventId: v.string(),
    orchestrationId: v.string(),
    eventType: eventTypeValidator,
    taskId: v.optional(v.string()),
    taskRunId: v.optional(v.id("taskRuns")),
    correlationId: v.optional(v.string()),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    const eventDocId = await ctx.db.insert("orchestrationEvents", {
      eventId: args.eventId,
      orchestrationId: args.orchestrationId,
      eventType: args.eventType,
      teamId,
      taskId: args.taskId,
      taskRunId: args.taskRunId,
      correlationId: args.correlationId,
      payload: args.payload,
      createdAt: Date.now(),
    });

    return { eventDocId, eventId: args.eventId };
  },
});

// =============================================================================
// Internal Mutations (for background worker and server)
// =============================================================================

/**
 * Log an orchestration event internally (no auth).
 * Used by background worker and internal services.
 */
export const logEventInternal = internalMutation({
  args: {
    teamId: v.string(),
    eventId: v.string(),
    orchestrationId: v.string(),
    eventType: eventTypeValidator,
    taskId: v.optional(v.string()),
    taskRunId: v.optional(v.id("taskRuns")),
    correlationId: v.optional(v.string()),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const eventDocId = await ctx.db.insert("orchestrationEvents", {
      eventId: args.eventId,
      orchestrationId: args.orchestrationId,
      eventType: args.eventType,
      teamId: args.teamId,
      taskId: args.taskId,
      taskRunId: args.taskRunId,
      correlationId: args.correlationId,
      payload: args.payload,
      createdAt: Date.now(),
    });

    return { eventDocId, eventId: args.eventId };
  },
});

// =============================================================================
// Public Queries
// =============================================================================

/**
 * Get events for an orchestration (authenticated).
 * Returns events in chronological order.
 */
export const getByOrchestration = authQuery({
  args: {
    teamSlugOrId: v.string(),
    orchestrationId: v.string(),
    eventType: v.optional(eventTypeValidator),
    limit: v.optional(v.number()),
    afterTimestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const limit = args.limit ?? 100;

    let query;
    if (args.eventType) {
      query = ctx.db
        .query("orchestrationEvents")
        .withIndex("by_orchestration_type", (q) =>
          q
            .eq("orchestrationId", args.orchestrationId)
            .eq("eventType", args.eventType!)
        );
    } else {
      query = ctx.db
        .query("orchestrationEvents")
        .withIndex("by_orchestration", (q) =>
          q.eq("orchestrationId", args.orchestrationId)
        );
    }

    let events = await query.order("asc").take(limit * 2);

    // Filter by team (security) and timestamp
    events = events.filter((e) => e.teamId === teamId);
    if (args.afterTimestamp) {
      events = events.filter((e) => e.createdAt > args.afterTimestamp!);
    }

    return events.slice(0, limit);
  },
});

/**
 * Get events for a task run (authenticated).
 */
export const getByTaskRun = authQuery({
  args: {
    teamSlugOrId: v.string(),
    taskRunId: v.id("taskRuns"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const limit = args.limit ?? 100;

    const events = await ctx.db
      .query("orchestrationEvents")
      .withIndex("by_task_run", (q) => q.eq("taskRunId", args.taskRunId))
      .order("asc")
      .take(limit * 2);

    // Filter by team (security)
    return events.filter((e) => e.teamId === teamId).slice(0, limit);
  },
});

/**
 * Get recent events for a team (authenticated).
 */
export const getRecentByTeam = authQuery({
  args: {
    teamSlugOrId: v.string(),
    limit: v.optional(v.number()),
    eventTypes: v.optional(v.array(eventTypeValidator)),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const limit = args.limit ?? 50;

    let events = await ctx.db
      .query("orchestrationEvents")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .order("desc")
      .take(limit * 2);

    // Filter by event types if specified
    if (args.eventTypes && args.eventTypes.length > 0) {
      const typeSet = new Set(args.eventTypes);
      events = events.filter((e) => typeSet.has(e.eventType as typeof args.eventTypes extends (infer T)[] ? T : never));
    }

    return events.slice(0, limit);
  },
});

// =============================================================================
// Internal Queries
// =============================================================================

/**
 * Get events since a timestamp (for SSE polling).
 * Internal query for server-side SSE endpoint.
 */
export const getEventsSince = internalQuery({
  args: {
    orchestrationId: v.string(),
    sinceTimestamp: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;

    const events = await ctx.db
      .query("orchestrationEvents")
      .withIndex("by_orchestration", (q) =>
        q.eq("orchestrationId", args.orchestrationId)
      )
      .order("asc")
      .take(limit * 2);

    return events
      .filter((e) => e.createdAt > args.sinceTimestamp)
      .slice(0, limit);
  },
});

/**
 * Get events for an orchestration (internal, no auth required).
 * Used by server-side SSE endpoint for JWT-authenticated head agents.
 * Returns events in chronological order.
 */
export const getByOrchestrationInternal = internalQuery({
  args: {
    teamId: v.string(),
    orchestrationId: v.string(),
    eventType: v.optional(eventTypeValidator),
    limit: v.optional(v.number()),
    afterTimestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;

    let query;
    if (args.eventType) {
      query = ctx.db
        .query("orchestrationEvents")
        .withIndex("by_orchestration_type", (q) =>
          q
            .eq("orchestrationId", args.orchestrationId)
            .eq("eventType", args.eventType!)
        );
    } else {
      query = ctx.db
        .query("orchestrationEvents")
        .withIndex("by_orchestration", (q) =>
          q.eq("orchestrationId", args.orchestrationId)
        );
    }

    let events = await query.order("asc").take(limit * 2);

    // Filter by team (security) and timestamp
    events = events.filter((e) => e.teamId === args.teamId);
    if (args.afterTimestamp) {
      events = events.filter((e) => e.createdAt > args.afterTimestamp!);
    }

    return events.slice(0, limit);
  },
});

/**
 * Check if an event already exists (for deduplication).
 */
export const eventExists = internalQuery({
  args: {
    eventId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("orchestrationEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
      .first();

    return existing !== null;
  },
});
