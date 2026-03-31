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
  taskId?: string;
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
  taskId?: string;
  taskRunId?: string;
  approvalId?: string;
  resolution:
    | "allow"
    | "allow_once"
    | "allow_session"
    | "deny"
    | "deny_always"
    | "timeout";
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
// Session Lifecycle Events (Phase 4: Provider-Neutral Lifecycle)
// =============================================================================

/**
 * A session has started for an agent.
 */
export interface SessionStartedEvent extends AgentCommEventBase {
  type: "session_started";
  taskId?: string;
  taskRunId?: string;
  provider: string;
  providerSessionId?: string;
  mode?: "head" | "worker" | "reviewer";
}

/**
 * A session was resumed from a previous state.
 */
export interface SessionResumedEvent extends AgentCommEventBase {
  type: "session_resumed";
  taskId?: string;
  taskRunId?: string;
  provider: string;
  providerSessionId?: string;
  previousSessionId?: string;
}

/**
 * A session stop was requested (by user, autopilot, or policy).
 */
export interface SessionStopRequestedEvent extends AgentCommEventBase {
  type: "session_stop_requested";
  taskId?: string;
  taskRunId?: string;
  provider: string;
  providerSessionId?: string;
  source: "user" | "hook" | "autopilot" | "policy" | "timeout" | "error";
  reason?: string;
}

/**
 * A session stop was blocked (by hook, approval, or policy).
 */
export interface SessionStopBlockedEvent extends AgentCommEventBase {
  type: "session_stop_blocked";
  taskId?: string;
  taskRunId?: string;
  provider: string;
  providerSessionId?: string;
  reason: string;
  source: "hook" | "approval" | "policy" | "autopilot";
  continuationPrompt?: string;
}

/**
 * A session stop failed (unexpected error during shutdown).
 */
export interface SessionStopFailedEvent extends AgentCommEventBase {
  type: "session_stop_failed";
  taskId?: string;
  taskRunId?: string;
  provider: string;
  providerSessionId?: string;
  error: string;
  exitCode?: number;
}

// =============================================================================
// Memory and Instructions Events (Phase 4: Context Health)
// =============================================================================

/**
 * Instructions were loaded into the agent context.
 */
export interface InstructionsLoadedEvent extends AgentCommEventBase {
  type: "instructions_loaded";
  taskId?: string;
  taskRunId?: string;
  provider: string;
  sources: string[];
  totalBytes?: number;
  fileCount?: number;
}

/**
 * Memory was loaded into the agent context.
 */
export interface MemoryLoadedEvent extends AgentCommEventBase {
  type: "memory_loaded";
  taskId?: string;
  taskRunId?: string;
  provider: string;
  memoryType: "knowledge" | "tasks" | "mailbox" | "daily" | "behavior";
  sources: string[];
  totalBytes?: number;
  entryCount?: number;
}

/**
 * Memory was updated during the session.
 */
export interface MemoryUpdatedEvent extends AgentCommEventBase {
  type: "memory_updated";
  taskId?: string;
  taskRunId?: string;
  provider: string;
  memoryType: "knowledge" | "tasks" | "mailbox" | "daily" | "behavior";
  action: "create" | "update" | "delete" | "archive";
  path?: string;
  deltaBytes?: number;
}

// =============================================================================
// Operator Input Queue Events (Active-Turn Steering)
// =============================================================================

/**
 * An operator input was queued for the next turn boundary.
 */
export interface OperatorInputQueuedEvent extends AgentCommEventBase {
  type: "operator_input_queued";
  taskId?: string;
  taskRunId?: string;
  inputId: string;
  priority: "high" | "normal" | "low";
  queueDepth: number;
  queueCapacity: number;
  userId: string;
}

/**
 * Operator inputs were drained and merged at turn boundary.
 */
export interface OperatorInputDrainedEvent extends AgentCommEventBase {
  type: "operator_input_drained";
  taskId?: string;
  taskRunId?: string;
  batchId: string;
  inputCount: number;
  mergedContentLength: number;
  inputIds: string[];
}

/**
 * An operator input was rejected because the queue is at capacity.
 */
export interface QueueFullRejectedEvent extends AgentCommEventBase {
  type: "queue_full_rejected";
  taskId?: string;
  taskRunId?: string;
  queueDepth: number;
  queueCapacity: number;
  rejectedContent: string;
  userId: string;
}

// =============================================================================
// Context Health Events (Phase 4: Context Pressure Visibility)
// =============================================================================

/**
 * A context health warning was detected.
 */
export interface ContextWarningEvent extends AgentCommEventBase {
  type: "context_warning";
  taskId?: string;
  taskRunId?: string;
  provider: string;
  severity: "info" | "warning" | "critical";
  warningType:
    | "memory_bloat"
    | "tool_output"
    | "prompt_size"
    | "capacity"
    | "token_limit";
  summary: string;
  currentUsage?: number;
  maxCapacity?: number;
  usagePercent?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Context was compacted to reduce size.
 */
export interface ContextCompactedEvent extends AgentCommEventBase {
  type: "context_compacted";
  taskId?: string;
  taskRunId?: string;
  provider: string;
  previousBytes?: number;
  newBytes?: number;
  reductionPercent?: number;
  summary?: string;
}

// =============================================================================
// Prompt and Turn Events (P1 Lifecycle Parity)
// =============================================================================

/**
 * A prompt was submitted to the agent.
 */
export interface PromptSubmittedEvent extends AgentCommEventBase {
  type: "prompt_submitted";
  taskId?: string;
  taskRunId?: string;
  provider: string;
  providerSessionId?: string;
  promptLength?: number;
  source: "user" | "operator" | "hook" | "queue" | "handoff";
  turnNumber?: number;
}

/**
 * A session finished (clean exit, not error).
 */
export interface SessionFinishedEvent extends AgentCommEventBase {
  type: "session_finished";
  taskId?: string;
  taskRunId?: string;
  provider: string;
  providerSessionId?: string;
  exitCode?: number;
  turnCount?: number;
  durationMs?: number;
  summary?: string;
}

/**
 * A run was resumed from a previous checkpoint or session.
 */
export interface RunResumedEvent extends AgentCommEventBase {
  type: "run_resumed";
  taskId?: string;
  taskRunId?: string;
  provider: string;
  providerSessionId?: string;
  previousTaskRunId?: string;
  previousSessionId?: string;
  resumeReason: "checkpoint" | "reconnect" | "handoff" | "retry" | "manual";
  checkpointRef?: string;
}

// =============================================================================
// Tool Lifecycle Events (P1 Lifecycle Parity)
// =============================================================================

/**
 * A tool invocation was requested.
 */
export interface ToolRequestedEvent extends AgentCommEventBase {
  type: "tool_requested";
  taskId?: string;
  taskRunId?: string;
  provider: string;
  toolName: string;
  toolCallId?: string;
  inputPreview?: string;
  requiresApproval?: boolean;
}

/**
 * A tool invocation completed.
 */
export interface ToolCompletedEvent extends AgentCommEventBase {
  type: "tool_completed";
  taskId?: string;
  taskRunId?: string;
  provider: string;
  toolName: string;
  toolCallId?: string;
  status: "success" | "error" | "timeout" | "denied";
  durationMs?: number;
  outputPreview?: string;
  error?: string;
}

// =============================================================================
// Memory Scope Events (P4 Lifecycle Parity)
// =============================================================================

/**
 * Memory scope changed during the session.
 */
export interface MemoryScopeChangedEvent extends AgentCommEventBase {
  type: "memory_scope_changed";
  taskId?: string;
  taskRunId?: string;
  provider: string;
  previousScope?: "team" | "repo" | "user" | "run";
  newScope: "team" | "repo" | "user" | "run";
  reason: "spawn" | "handoff" | "promotion" | "reset";
  affectedTypes?: string[];
}

// =============================================================================
// MCP Runtime Events (P5 Lifecycle Parity)
// =============================================================================

/**
 * MCP capabilities were negotiated with a server.
 */
export interface McpCapabilitiesNegotiatedEvent extends AgentCommEventBase {
  type: "mcp_capabilities_negotiated";
  taskId?: string;
  taskRunId?: string;
  provider: string;
  serverName: string;
  serverId?: string;
  protocolVersion?: string;
  transport: "stdio" | "http" | "sse" | "websocket";
  capabilities: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
    tasks?: boolean;
    logging?: boolean;
    completions?: boolean;
  };
  toolCount?: number;
  resourceCount?: number;
  sessionId?: string;
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
  | ProviderSessionBoundEvent
  // Session Lifecycle Events (Phase 4)
  | SessionStartedEvent
  | SessionResumedEvent
  | SessionStopRequestedEvent
  | SessionStopBlockedEvent
  | SessionStopFailedEvent
  // Prompt and Turn Events (P1 Lifecycle Parity)
  | PromptSubmittedEvent
  | SessionFinishedEvent
  | RunResumedEvent
  // Tool Lifecycle Events (P1 Lifecycle Parity)
  | ToolRequestedEvent
  | ToolCompletedEvent
  // Memory and Instructions Events (Phase 4)
  | InstructionsLoadedEvent
  | MemoryLoadedEvent
  | MemoryUpdatedEvent
  // Memory Scope Events (P4 Lifecycle Parity)
  | MemoryScopeChangedEvent
  // Context Health Events (Phase 4)
  | ContextWarningEvent
  | ContextCompactedEvent
  // MCP Runtime Events (P5 Lifecycle Parity)
  | McpCapabilitiesNegotiatedEvent
  // Operator Input Queue Events
  | OperatorInputQueuedEvent
  | OperatorInputDrainedEvent
  | QueueFullRejectedEvent;

/**
 * Extract event type string from event union.
 */
export type AgentCommEventType = AgentCommEvent["type"];

/**
 * Canonical event types as a const array.
 * This is the single source of truth for all event type names.
 * Use this to derive validators in Convex and other subsystems.
 */
export const CANONICAL_EVENT_TYPES = [
  // Task Lifecycle
  "task_spawn_requested",
  "task_started",
  "task_status_changed",
  "task_completed",
  // Worker Communication
  "worker_message",
  "worker_status",
  // Approval and Review
  "approval_required",
  "approval_resolved",
  // Plan and Orchestration
  "plan_updated",
  "orchestration_completed",
  // Provider Session
  "provider_session_bound",
  // Session Lifecycle
  "session_started",
  "session_resumed",
  "session_stop_requested",
  "session_stop_blocked",
  "session_stop_failed",
  "session_finished",
  // Prompt and Turn
  "prompt_submitted",
  "run_resumed",
  // Tool Lifecycle
  "tool_requested",
  "tool_completed",
  // Memory and Instructions
  "instructions_loaded",
  "memory_loaded",
  "memory_updated",
  "memory_scope_changed",
  // Context Health
  "context_warning",
  "context_compacted",
  // MCP Runtime
  "mcp_capabilities_negotiated",
  // Operator Input Queue
  "operator_input_queued",
  "operator_input_drained",
  "queue_full_rejected",
] as const;

/**
 * Type assertion to ensure CANONICAL_EVENT_TYPES matches AgentCommEventType.
 * This will cause a compile error if the types diverge.
 */
type _AssertCanonicalTypes = typeof CANONICAL_EVENT_TYPES[number] extends AgentCommEventType
  ? AgentCommEventType extends typeof CANONICAL_EVENT_TYPES[number]
    ? true
    : never
  : never;
const _assertCanonicalTypes: _AssertCanonicalTypes = true;
void _assertCanonicalTypes; // Prevent unused variable warning

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

/**
 * Create a prompt submitted event.
 */
export function createPromptSubmittedEvent(
  orchestrationId: string,
  provider: string,
  source: PromptSubmittedEvent["source"],
  options?: {
    taskId?: string;
    taskRunId?: string;
    providerSessionId?: string;
    promptLength?: number;
    turnNumber?: number;
    correlationId?: string;
  }
): PromptSubmittedEvent {
  return {
    ...createEventBase(orchestrationId, options?.correlationId),
    type: "prompt_submitted",
    taskId: options?.taskId,
    taskRunId: options?.taskRunId,
    provider,
    providerSessionId: options?.providerSessionId,
    promptLength: options?.promptLength,
    source,
    turnNumber: options?.turnNumber,
  };
}

/**
 * Create a tool requested event.
 */
export function createToolRequestedEvent(
  orchestrationId: string,
  provider: string,
  toolName: string,
  options?: {
    taskId?: string;
    taskRunId?: string;
    toolCallId?: string;
    inputPreview?: string;
    requiresApproval?: boolean;
    correlationId?: string;
  }
): ToolRequestedEvent {
  return {
    ...createEventBase(orchestrationId, options?.correlationId),
    type: "tool_requested",
    taskId: options?.taskId,
    taskRunId: options?.taskRunId,
    provider,
    toolName,
    toolCallId: options?.toolCallId,
    inputPreview: options?.inputPreview,
    requiresApproval: options?.requiresApproval,
  };
}

/**
 * Create a tool completed event.
 */
export function createToolCompletedEvent(
  orchestrationId: string,
  provider: string,
  toolName: string,
  status: ToolCompletedEvent["status"],
  options?: {
    taskId?: string;
    taskRunId?: string;
    toolCallId?: string;
    durationMs?: number;
    outputPreview?: string;
    error?: string;
    correlationId?: string;
  }
): ToolCompletedEvent {
  return {
    ...createEventBase(orchestrationId, options?.correlationId),
    type: "tool_completed",
    taskId: options?.taskId,
    taskRunId: options?.taskRunId,
    provider,
    toolName,
    toolCallId: options?.toolCallId,
    status,
    durationMs: options?.durationMs,
    outputPreview: options?.outputPreview,
    error: options?.error,
  };
}

/**
 * Create an MCP capabilities negotiated event.
 */
export function createMcpCapabilitiesNegotiatedEvent(
  orchestrationId: string,
  provider: string,
  serverName: string,
  transport: McpCapabilitiesNegotiatedEvent["transport"],
  capabilities: McpCapabilitiesNegotiatedEvent["capabilities"],
  options?: {
    taskId?: string;
    taskRunId?: string;
    serverId?: string;
    protocolVersion?: string;
    toolCount?: number;
    resourceCount?: number;
    sessionId?: string;
    correlationId?: string;
  }
): McpCapabilitiesNegotiatedEvent {
  return {
    ...createEventBase(orchestrationId, options?.correlationId),
    type: "mcp_capabilities_negotiated",
    taskId: options?.taskId,
    taskRunId: options?.taskRunId,
    provider,
    serverName,
    serverId: options?.serverId,
    protocolVersion: options?.protocolVersion,
    transport,
    capabilities,
    toolCount: options?.toolCount,
    resourceCount: options?.resourceCount,
    sessionId: options?.sessionId,
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

/**
 * Check if an event is a session lifecycle event.
 */
export function isSessionLifecycleEvent(
  event: AgentCommEvent
): event is
  | SessionStartedEvent
  | SessionResumedEvent
  | SessionStopRequestedEvent
  | SessionStopBlockedEvent
  | SessionStopFailedEvent {
  return (
    event.type === "session_started" ||
    event.type === "session_resumed" ||
    event.type === "session_stop_requested" ||
    event.type === "session_stop_blocked" ||
    event.type === "session_stop_failed"
  );
}

/**
 * Check if an event is a memory-related event.
 */
export function isMemoryEvent(
  event: AgentCommEvent
): event is InstructionsLoadedEvent | MemoryLoadedEvent | MemoryUpdatedEvent {
  return (
    event.type === "instructions_loaded" ||
    event.type === "memory_loaded" ||
    event.type === "memory_updated"
  );
}

/**
 * Check if an event is a context health event.
 */
export function isContextHealthEvent(
  event: AgentCommEvent
): event is ContextWarningEvent | ContextCompactedEvent {
  return (
    event.type === "context_warning" || event.type === "context_compacted"
  );
}

/**
 * Check if an event is a tool lifecycle event.
 */
export function isToolLifecycleEvent(
  event: AgentCommEvent
): event is ToolRequestedEvent | ToolCompletedEvent {
  return event.type === "tool_requested" || event.type === "tool_completed";
}

/**
 * Check if an event is a prompt/turn event.
 */
export function isPromptTurnEvent(
  event: AgentCommEvent
): event is PromptSubmittedEvent | SessionFinishedEvent | RunResumedEvent {
  return (
    event.type === "prompt_submitted" ||
    event.type === "session_finished" ||
    event.type === "run_resumed"
  );
}

/**
 * Check if an event is a memory scope event.
 */
export function isMemoryScopeEvent(
  event: AgentCommEvent
): event is MemoryScopeChangedEvent {
  return event.type === "memory_scope_changed";
}

/**
 * Check if an event is an MCP runtime event.
 */
export function isMcpRuntimeEvent(
  event: AgentCommEvent
): event is McpCapabilitiesNegotiatedEvent {
  return event.type === "mcp_capabilities_negotiated";
}
