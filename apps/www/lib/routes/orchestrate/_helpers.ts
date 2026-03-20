/**
 * Orchestration Route Helpers
 *
 * Shared helpers, schemas, and utilities for orchestration endpoints.
 */

import { z } from "@hono/zod-openapi";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Map known Convex/domain errors to appropriate HTTP status codes.
 * Returns null if the error is not a recognized domain error (caller should return 500).
 */
export function mapDomainError(
  error: unknown,
): { status: 403 | 404; message: string } | null {
  if (!(error instanceof Error)) return null;
  const msg = error.message;
  if (msg.includes("Forbidden")) {
    return { status: 403, message: msg };
  }
  if (msg.includes("not found") || msg.includes("Not found")) {
    return { status: 404, message: msg };
  }
  return null;
}

// ============================================================================
// Shared Schemas
// ============================================================================

export const TaskStatusSchema = z
  .enum(["pending", "assigned", "running", "completed", "failed", "cancelled"])
  .openapi("TaskStatus");

export const OrchestrationTaskSchema = z
  .object({
    _id: z.string().openapi({ description: "Task ID (Convex document ID)" }),
    prompt: z.string().openapi({ description: "Task prompt" }),
    status: TaskStatusSchema,
    priority: z.number().openapi({ description: "Task priority (lower = higher priority)" }),
    assignedAgentName: z.string().optional().openapi({ description: "Assigned agent name" }),
    assignedSandboxId: z.string().optional().openapi({ description: "Sandbox ID" }),
    createdAt: z.number().openapi({ description: "Creation timestamp" }),
    updatedAt: z.number().optional().openapi({ description: "Last update timestamp" }),
    startedAt: z.number().optional().openapi({ description: "Start timestamp" }),
    completedAt: z.number().optional().openapi({ description: "Completion timestamp" }),
    errorMessage: z.string().optional().openapi({ description: "Error message if failed" }),
    result: z.string().optional().openapi({ description: "Result if completed" }),
    dependencies: z.array(z.string()).optional().openapi({ description: "Dependency task IDs" }),
  })
  .openapi("OrchestrationTask");

export const DependencyInfoSchema = z
  .object({
    totalDeps: z.number(),
    completedDeps: z.number(),
    pendingDeps: z.number(),
    blockedBy: z.array(
      z.object({
        _id: z.string(),
        status: z.string(),
        prompt: z.string(),
      })
    ),
  })
  .openapi("DependencyInfo");

export const OrchestrationTaskWithDepsSchema = OrchestrationTaskSchema.extend({
  dependencyInfo: DependencyInfoSchema.optional(),
}).openapi("OrchestrationTaskWithDeps");

export const OrchestrationSummarySchema = z
  .object({
    totalTasks: z.number().openapi({ description: "Total number of tasks" }),
    statusCounts: z.record(z.string(), z.number()).openapi({ description: "Count by status" }),
    activeAgentCount: z.number().openapi({ description: "Number of active agents" }),
    activeAgents: z.array(z.string()).openapi({ description: "List of active agent names" }),
    recentTasks: z.array(
      z.object({
        _id: z.string(),
        prompt: z.string(),
        status: z.string(),
        assignedAgentName: z.string().optional(),
        completedAt: z.number().optional(),
        errorMessage: z.string().optional(),
      })
    ).openapi({ description: "Recent completed/failed tasks" }),
  })
  .openapi("OrchestrationSummary");

export const ApprovalRequestSchema = z
  .object({
    requestId: z.string().openapi({ description: "Approval request ID (apr_xxx format)" }),
    orchestrationId: z.string().openapi({ description: "Orchestration ID" }),
    taskId: z.string().optional().openapi({ description: "Task ID (if linked)" }),
    source: z.enum(["tool_use", "head_agent", "worker_agent", "policy", "system"]).openapi({
      description: "Source of the approval request",
    }),
    approvalType: z.enum([
      "tool_permission",
      "review_request",
      "deployment",
      "cost_override",
      "escalation",
      "risky_action",
    ]).openapi({ description: "Type of approval" }),
    action: z.string().openapi({ description: "Action being requested" }),
    context: z.object({
      agentName: z.string(),
      filePath: z.string().optional(),
      command: z.string().optional(),
      reasoning: z.string().optional(),
      riskLevel: z.enum(["low", "medium", "high"]).optional(),
    }).openapi({ description: "Context for the approval" }),
    status: z.enum(["pending", "approved", "denied", "expired", "cancelled"]).openapi({
      description: "Current status",
    }),
    expiresAt: z.number().optional().openapi({ description: "Expiration timestamp" }),
    createdAt: z.number().openapi({ description: "Creation timestamp" }),
  })
  .openapi("ApprovalRequest");

/**
 * Extract team slug/ID from JWT payload
 */
export function extractTeamFromJwt(authHeader: string | undefined): string | undefined {
  if (!authHeader?.startsWith("Bearer ")) return undefined;
  const jwt = authHeader.slice(7);
  try {
    const parts = jwt.split(".");
    if (parts.length === 3) {
      const payload = JSON.parse(
        Buffer.from(parts[1], "base64url").toString("utf-8")
      );
      return payload.teamSlugOrId ?? payload.teamId;
    }
  } catch {
    // Invalid JWT
  }
  return undefined;
}

/**
 * Extract task run ID from JWT payload
 */
export function extractTaskRunIdFromJwt(authHeader: string | undefined): string | undefined {
  if (!authHeader?.startsWith("Bearer ")) return undefined;
  const jwt = authHeader.slice(7);
  try {
    const parts = jwt.split(".");
    if (parts.length === 3) {
      const payload = JSON.parse(
        Buffer.from(parts[1], "base64url").toString("utf-8")
      );
      return payload.taskRunId;
    }
  } catch {
    // Invalid JWT
  }
  return undefined;
}
