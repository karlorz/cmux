/**
 * MCP Runtime Capabilities - Track negotiated capabilities from active MCP sessions.
 *
 * This module stores the actual capabilities negotiated at runtime, separate from
 * static server configuration in mcpServerConfigs. This enables:
 * - Operator visibility into what tools/resources are actually available
 * - Runtime capability queries across task runs
 * - Tracking connection state and session identity
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { getTeamId } from "../_shared/team";
import { authQuery } from "./users/utils";

// =============================================================================
// Validators
// =============================================================================

const transportValidator = v.union(
  v.literal("stdio"),
  v.literal("http"),
  v.literal("sse")
);

const capabilitiesValidator = v.object({
  tools: v.optional(v.array(v.string())),
  resources: v.optional(v.array(v.string())),
  prompts: v.optional(v.array(v.string())),
  tasks: v.optional(v.boolean()),
  roots: v.optional(v.boolean()),
  sampling: v.optional(v.boolean()),
  elicitation: v.optional(v.boolean()),
});

// =============================================================================
// Types for external use
// =============================================================================

export interface McpCapabilitySummary {
  serverName: string;
  protocolVersion: string;
  transport: "stdio" | "http" | "sse";
  status: "connecting" | "connected" | "disconnected" | "error";
  toolCount: number;
  resourceCount: number;
  promptCount: number;
  hasAdvancedCapabilities: boolean;
  sessionId: string | null;
  connectedAt: number | null;
  lastActiveAt: number;
}

export interface TaskRunMcpSummary {
  servers: McpCapabilitySummary[];
  totalToolCount: number;
  totalResourceCount: number;
  activeConnections: number;
  hasErrors: boolean;
}

// =============================================================================
// Internal Mutations (called from sandbox/agent environments)
// =============================================================================

/**
 * Record MCP server connection and initial capabilities.
 */
export const recordConnection = internalMutation({
  args: {
    taskRunId: v.id("taskRuns"),
    teamId: v.string(),
    serverName: v.string(),
    configId: v.optional(v.id("mcpServerConfigs")),
    protocolVersion: v.string(),
    capabilities: capabilitiesValidator,
    transport: transportValidator,
    sessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check for existing record
    const existing = await ctx.db
      .query("mcpRuntimeCapabilities")
      .withIndex("by_server", (q) =>
        q.eq("serverName", args.serverName).eq("taskRunId", args.taskRunId)
      )
      .first();

    if (existing) {
      // Update existing record
      await ctx.db.patch(existing._id, {
        protocolVersion: args.protocolVersion,
        capabilities: args.capabilities,
        transport: args.transport,
        sessionId: args.sessionId,
        status: "connected",
        connectedAt: now,
        lastActiveAt: now,
        errorMessage: undefined,
      });
      return existing._id;
    }

    // Create new record
    return ctx.db.insert("mcpRuntimeCapabilities", {
      taskRunId: args.taskRunId,
      teamId: args.teamId,
      serverName: args.serverName,
      configId: args.configId,
      protocolVersion: args.protocolVersion,
      capabilities: args.capabilities,
      transport: args.transport,
      sessionId: args.sessionId,
      status: "connected",
      connectedAt: now,
      lastActiveAt: now,
      createdAt: now,
    });
  },
});

/**
 * Update capabilities after capability renegotiation.
 */
export const updateCapabilities = internalMutation({
  args: {
    taskRunId: v.id("taskRuns"),
    serverName: v.string(),
    capabilities: capabilitiesValidator,
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("mcpRuntimeCapabilities")
      .withIndex("by_server", (q) =>
        q.eq("serverName", args.serverName).eq("taskRunId", args.taskRunId)
      )
      .first();

    if (!record) {
      throw new Error(`No MCP capability record for ${args.serverName}`);
    }

    await ctx.db.patch(record._id, {
      capabilities: args.capabilities,
      lastActiveAt: Date.now(),
    });
  },
});

/**
 * Record MCP server disconnection.
 */
export const recordDisconnection = internalMutation({
  args: {
    taskRunId: v.id("taskRuns"),
    serverName: v.string(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("mcpRuntimeCapabilities")
      .withIndex("by_server", (q) =>
        q.eq("serverName", args.serverName).eq("taskRunId", args.taskRunId)
      )
      .first();

    if (!record) {
      return; // No record to update
    }

    const now = Date.now();
    await ctx.db.patch(record._id, {
      status: args.errorMessage ? "error" : "disconnected",
      errorMessage: args.errorMessage,
      disconnectedAt: now,
      lastActiveAt: now,
    });
  },
});

/**
 * Record heartbeat/activity.
 */
export const recordActivity = internalMutation({
  args: {
    taskRunId: v.id("taskRuns"),
    serverName: v.string(),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("mcpRuntimeCapabilities")
      .withIndex("by_server", (q) =>
        q.eq("serverName", args.serverName).eq("taskRunId", args.taskRunId)
      )
      .first();

    if (record) {
      await ctx.db.patch(record._id, {
        lastActiveAt: Date.now(),
      });
    }
  },
});

// =============================================================================
// Public Queries
// =============================================================================

/**
 * Get MCP capability summary for a task run.
 */
export const getByTaskRun = authQuery({
  args: {
    teamSlugOrId: v.string(),
    taskRunId: v.id("taskRuns"),
  },
  handler: async (ctx, args): Promise<TaskRunMcpSummary> => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    const records = await ctx.db
      .query("mcpRuntimeCapabilities")
      .withIndex("by_task_run", (q) => q.eq("taskRunId", args.taskRunId))
      .collect();

    // Filter by team for security
    const filtered = records.filter((r) => r.teamId === teamId);

    const servers: McpCapabilitySummary[] = filtered.map((r) => ({
      serverName: r.serverName,
      protocolVersion: r.protocolVersion,
      transport: r.transport,
      status: r.status,
      toolCount: r.capabilities.tools?.length ?? 0,
      resourceCount: r.capabilities.resources?.length ?? 0,
      promptCount: r.capabilities.prompts?.length ?? 0,
      hasAdvancedCapabilities:
        r.capabilities.tasks === true ||
        r.capabilities.roots === true ||
        r.capabilities.sampling === true ||
        r.capabilities.elicitation === true,
      sessionId: r.sessionId ?? null,
      connectedAt: r.connectedAt ?? null,
      lastActiveAt: r.lastActiveAt,
    }));

    return {
      servers,
      totalToolCount: servers.reduce((sum, s) => sum + s.toolCount, 0),
      totalResourceCount: servers.reduce((sum, s) => sum + s.resourceCount, 0),
      activeConnections: servers.filter((s) => s.status === "connected").length,
      hasErrors: servers.some((s) => s.status === "error"),
    };
  },
});

/**
 * Get detailed capabilities for a specific MCP server in a task run.
 */
export const getServerCapabilities = authQuery({
  args: {
    teamSlugOrId: v.string(),
    taskRunId: v.id("taskRuns"),
    serverName: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    const record = await ctx.db
      .query("mcpRuntimeCapabilities")
      .withIndex("by_server", (q) =>
        q.eq("serverName", args.serverName).eq("taskRunId", args.taskRunId)
      )
      .first();

    if (!record || record.teamId !== teamId) {
      return null;
    }

    return {
      serverName: record.serverName,
      protocolVersion: record.protocolVersion,
      transport: record.transport,
      sessionId: record.sessionId,
      status: record.status,
      errorMessage: record.errorMessage,
      capabilities: record.capabilities,
      connectedAt: record.connectedAt,
      lastActiveAt: record.lastActiveAt,
      disconnectedAt: record.disconnectedAt,
    };
  },
});

// =============================================================================
// Internal Queries
// =============================================================================

/**
 * Get capabilities for a task run (internal, no auth).
 */
export const getByTaskRunInternal = internalQuery({
  args: {
    taskRunId: v.id("taskRuns"),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("mcpRuntimeCapabilities")
      .withIndex("by_task_run", (q) => q.eq("taskRunId", args.taskRunId))
      .collect();
  },
});
