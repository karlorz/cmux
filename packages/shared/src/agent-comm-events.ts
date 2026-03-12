/**
 * Agent Communication Events - Typed event schema for orchestration.
 *
 * This module defines the canonical event types for agent-to-agent and
 * agent-to-system communication. These events serve as the live transport
 * layer, while PLAN.json, AGENTS.json, EVENTS.jsonl, and MAILBOX.json
 * serve as durable projections.
 *
 * Design principles:
 * - Events are immutable records of what happened
 * - All events have a consistent base shape (type, orchestrationId, timestamp)
 * - Events can be routed, persisted, and replayed
 * - Events are the source of truth; file projections derive from them
 *
 * @see cmux-bridge-inspired-agent-communication.md for architecture context
 */

// =============================================================================
// Base Event Types
// =============================================================================

/**
 * Common fields for all agent communication events.
 */
export interface AgentCommEventBase {
  /** Unique event ID for deduplication and tracking */
  eventId: string;
  /** Orchestration this event belongs to */
  orchestrationId: string;
  /** ISO 8601 timestamp when event was created */
  timestamp: string;
  /** Optional correlation ID for request-response tracking */
  correlationId?: string;
}

// =============================================================================
// Task Lifecycle Events
// =============================================================================

/**
 * A task spawn was requested (before actual sandbox creation).
 */
export interface TaskSpawnRequestedEvent extends AgentCommEventBase {
  type: "task_spawn_requested";
  taskId: string;
  agentName: string;
  prompt: string;
  priority?: number;
  dependsOn?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * A task has started execution in a sandbox.
 */
export interface TaskStartedEvent extends AgentCommEventBase {
  type: "task_started";
  taskId: string;
  taskRunId: string;
  provider: string;
  sandboxId?: string;
  providerSessionId?: string;
}

/**
 * A task's status has changed.
 */
export interface TaskStatusChangedEvent extends AgentCommEventBase {
  type: "task_status_changed";
  taskId: string;
  taskRunId?: string;
  previousStatus: string;
  newStatus: string;
  reason?: string;
}

/**
 * A task has completed (successfully or with failure).
 */
export interface TaskCompletedEvent extends AgentCommEventBase {
  type: "task_completed";
  taskId: string;
  taskRunId: string;
  status: "completed" | "failed" | "cancelled";
  exitCode?: number;
  summary?: string;
  artifacts?: TaskArtifact[];
  error?: string;
}

/**
 * Artifact produced by a task.
 */
export interface TaskArtifact {
  type: "pr_url" | "commit" | "file" | "log" | "other";
  value: string;
  label?: string;
}

// =============================================================================
// Worker Communication Events
// =============================================================================

/**
 * A message sent between agents (worker-to-head, head-to-worker, peer-to-peer).
 */
export interface WorkerMessageEvent extends AgentCommEventBase {
  type: "worker_message";
  taskId?: string;
  taskRunId?: string;
  from: string;
  to: string;
  messageType: "handoff" | "request" | "status" | "result" | "error";
  body: string;
  replyTo?: string;
}

/**
 * A worker status update (progress, heartbeat, etc.).
 */
export interface WorkerStatusEvent extends AgentCommEventBase {
  type: "worker_status";
  taskId: string;
  taskRunId: string;
  status: "idle" | "working" | "waiting" | "blocked" | "reviewing";
  progress?: number;
  currentStep?: string;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Approval and Review Events
// =============================================================================

/**
 * An approval is required before proceeding.
 */
export interface ApprovalRequiredEvent extends AgentCommEventBase {
  type: "approval_required";
  taskId: string;
  taskRunId?: string;
  source: string;
  action: string;
  payload: unknown;
  policy?: ApprovalPolicy;
  expiresAt?: string;
}

/**
 * An approval request has been resolved.
 */
export interface ApprovalResolvedEvent extends AgentCommEventBase {
  type: "approval_resolved";
  taskId: string;
  taskRunId?: string;
  approvalId: string;
  resolution: "allow" | "deny" | "timeout";
  resolvedBy?: string;
  reason?: string;
}

/**
 * Approval policy for gating actions.
 */
export interface ApprovalPolicy {
  requiredApprovers?: string[];
  autoApproveAfterMs?: number;
  escalationTarget?: string;
}

// =============================================================================
// Plan and Orchestration Events
// =============================================================================

/**
 * The orchestration plan was updated.
 */
export interface PlanUpdatedEvent extends AgentCommEventBase {
  type: "plan_updated";
  planStatus: "pending" | "running" | "paused" | "completed" | "failed";
  tasksAdded?: string[];
  tasksRemoved?: string[];
  dependenciesChanged?: boolean;
}

/**
 * The entire orchestration has completed.
 */
export interface OrchestrationCompletedEvent extends AgentCommEventBase {
  type: "orchestration_completed";
  status: "completed" | "failed" | "cancelled";
  summary?: string;
  totalTasks?: number;
  completedTasks?: number;
  failedTasks?: number;
}

// =============================================================================
// Provider Session Events
// =============================================================================

/**
 * A provider session was bound to a task.
 */
export interface ProviderSessionBoundEvent extends AgentCommEventBase {
  type: "provider_session_bound";
  taskId: string;
  taskRunId: string;
  provider: string;
  providerSessionId?: string;
  providerThreadId?: string;
  mode: "head" | "worker" | "reviewer";
}

// =============================================================================
// Union Type
// =============================================================================

/**
 * All possible agent communication events.
 */
export type AgentCommEvent =
  | TaskSpawnRequestedEvent
  | TaskStartedEvent
  | TaskStatusChangedEvent
  | TaskCompletedEvent
  | WorkerMessageEvent
  | WorkerStatusEvent
  | ApprovalRequiredEvent
  | ApprovalResolvedEvent
  | PlanUpdatedEvent
  | OrchestrationCompletedEvent
  | ProviderSessionBoundEvent;

/**
 * Extract event type string from event union.
 */
export type AgentCommEventType = AgentCommEvent["type"];

// =============================================================================
// Event Utilities
// =============================================================================

/**
 * Generate a unique event ID.
 */
export function generateEventId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `evt_${timestamp}_${random}`;
}

/**
 * Create a base event with common fields populated.
 */
export function createEventBase(
  orchestrationId: string,
  correlationId?: string
): AgentCommEventBase {
  return {
    eventId: generateEventId(),
    orchestrationId,
    timestamp: new Date().toISOString(),
    correlationId,
  };
}

/**
 * Create a task spawn requested event.
 */
export function createTaskSpawnRequestedEvent(
  orchestrationId: string,
  taskId: string,
  agentName: string,
  prompt: string,
  options?: {
    priority?: number;
    dependsOn?: string[];
    metadata?: Record<string, unknown>;
    correlationId?: string;
  }
): TaskSpawnRequestedEvent {
  return {
    ...createEventBase(orchestrationId, options?.correlationId),
    type: "task_spawn_requested",
    taskId,
    agentName,
    prompt,
    priority: options?.priority,
    dependsOn: options?.dependsOn,
    metadata: options?.metadata,
  };
}

/**
 * Create a task completed event.
 */
export function createTaskCompletedEvent(
  orchestrationId: string,
  taskId: string,
  taskRunId: string,
  status: "completed" | "failed" | "cancelled",
  options?: {
    exitCode?: number;
    summary?: string;
    artifacts?: TaskArtifact[];
    error?: string;
    correlationId?: string;
  }
): TaskCompletedEvent {
  return {
    ...createEventBase(orchestrationId, options?.correlationId),
    type: "task_completed",
    taskId,
    taskRunId,
    status,
    exitCode: options?.exitCode,
    summary: options?.summary,
    artifacts: options?.artifacts,
    error: options?.error,
  };
}

/**
 * Create a worker message event.
 */
export function createWorkerMessageEvent(
  orchestrationId: string,
  from: string,
  to: string,
  messageType: WorkerMessageEvent["messageType"],
  body: string,
  options?: {
    taskId?: string;
    taskRunId?: string;
    replyTo?: string;
    correlationId?: string;
  }
): WorkerMessageEvent {
  return {
    ...createEventBase(orchestrationId, options?.correlationId),
    type: "worker_message",
    taskId: options?.taskId,
    taskRunId: options?.taskRunId,
    from,
    to,
    messageType,
    body,
    replyTo: options?.replyTo,
  };
}

/**
 * Create an orchestration completed event.
 */
export function createOrchestrationCompletedEvent(
  orchestrationId: string,
  status: "completed" | "failed" | "cancelled",
  options?: {
    summary?: string;
    totalTasks?: number;
    completedTasks?: number;
    failedTasks?: number;
    correlationId?: string;
  }
): OrchestrationCompletedEvent {
  return {
    ...createEventBase(orchestrationId, options?.correlationId),
    type: "orchestration_completed",
    status,
    summary: options?.summary,
    totalTasks: options?.totalTasks,
    completedTasks: options?.completedTasks,
    failedTasks: options?.failedTasks,
  };
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if an event is a task lifecycle event.
 */
export function isTaskLifecycleEvent(
  event: AgentCommEvent
): event is
  | TaskSpawnRequestedEvent
  | TaskStartedEvent
  | TaskStatusChangedEvent
  | TaskCompletedEvent {
  return (
    event.type === "task_spawn_requested" ||
    event.type === "task_started" ||
    event.type === "task_status_changed" ||
    event.type === "task_completed"
  );
}

/**
 * Check if an event is an approval-related event.
 */
export function isApprovalEvent(
  event: AgentCommEvent
): event is ApprovalRequiredEvent | ApprovalResolvedEvent {
  return (
    event.type === "approval_required" || event.type === "approval_resolved"
  );
}

/**
 * Check if an event signals orchestration completion.
 */
export function isTerminalEvent(
  event: AgentCommEvent
): event is OrchestrationCompletedEvent {
  return event.type === "orchestration_completed";
}
