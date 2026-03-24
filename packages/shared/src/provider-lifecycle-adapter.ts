/**
 * Provider Lifecycle Adapter
 *
 * Centralizes lifecycle event emission that was previously duplicated across
 * provider environment files. Each provider now calls this module instead of
 * building shell hook scripts independently.
 *
 * This follows the simplification plan from:
 * - cmux-agent-platform-simplification-rollout-plan.md (Phase 2)
 *
 * Benefits:
 * - Consistent event payloads across all providers
 * - Single point of maintenance for shell hook scripts
 * - Canonical event types match agent-comm-events.ts
 * - Testable without spinning up provider environments
 *
 * ## Canonical Event Shape
 *
 * Shell hooks emit JSON payloads matching AgentCommEvent types from
 * agent-comm-events.ts. The activity endpoint accepts a simplified
 * payload that is expanded server-side to the full canonical shape.
 *
 * Activity payload format:
 * ```json
 * {
 *   "taskRunId": "...",
 *   "type": "context_warning" | "context_compacted" | "session_start" | ...,
 *   "toolName": "claude" | "codex" | "gemini" | ...,
 *   "summary": "Human-readable description"
 * }
 * ```
 *
 * For context health events, additional fields are included:
 * ```json
 * {
 *   "severity": "info" | "warning" | "critical",
 *   "warningType": "capacity" | "token_limit" | "memory_bloat" | ...,
 *   "currentUsage": 85000,
 *   "maxCapacity": 100000,
 *   "usagePercent": 85
 * }
 * ```
 */

import type { EnvironmentResult } from "./providers/common/environment-result";

/**
 * Provider identifier for lifecycle events.
 */
export type ProviderName =
  | "claude"
  | "codex"
  | "gemini"
  | "opencode"
  | "amp"
  | "grok"
  | "qwen"
  | "cursor";

/**
 * Lifecycle event types that can be emitted from provider hooks.
 *
 * Extended in Priority 1 (lifecycle normalization) to include:
 * - stop_requested / stop_blocked / stop_failed for graceful shutdown
 * - tool_requested / tool_completed for full tool lifecycle
 * - approval_requested / approval_resolved for approval flow
 * - memory_scope_changed for scope transitions
 * - prompt_submitted / session_finished / run_resumed for turn tracking
 * - mcp_capabilities_negotiated for MCP runtime state
 */
export type LifecycleEventType =
  // Session lifecycle
  | "session_start"
  | "session_stop"
  | "session_resumed"
  | "session_finished"
  // Stop lifecycle (Priority 1)
  | "stop_requested"
  | "stop_blocked"
  | "stop_failed"
  // Prompt and turn tracking (P1 Lifecycle Parity)
  | "prompt_submitted"
  | "run_resumed"
  // Error
  | "error"
  // Context health
  | "context_warning"
  | "context_compacted"
  // Memory
  | "memory_loaded"
  | "memory_scope_changed"
  // Tool lifecycle (Priority 1)
  | "tool_call"
  | "tool_requested"
  | "tool_completed"
  // Approval lifecycle (Priority 1)
  | "approval_requested"
  | "approval_resolved"
  // MCP runtime (P5 Lifecycle Parity)
  | "mcp_capabilities_negotiated";

/**
 * Context for building lifecycle hooks.
 */
export interface LifecycleAdapterContext {
  /** Provider name (e.g., "claude", "codex", "gemini") */
  provider: ProviderName;
  /** Task run ID for the session */
  taskRunId?: string;
  /** Base directory for lifecycle files (default: /root/lifecycle) */
  lifecycleDir?: string;
  /** Provider-specific lifecycle subdirectory (default: /root/lifecycle/{provider}) */
  providerLifecycleDir?: string;
  /** Log file path (default: /root/lifecycle/{provider}-hook.log) */
  logFile?: string;
  /** Whether to include memory sync in stop hook */
  includeMemorySync?: boolean;
  /** Whether to create completion marker file */
  createCompletionMarker?: boolean;
  /** Completion marker path (default: /root/lifecycle/done.txt) */
  completionMarkerPath?: string;
}

/**
 * Options for individual hook scripts.
 */
export interface HookScriptOptions {
  /** Additional shell commands to run before the main hook logic */
  prolog?: string;
  /** Additional shell commands to run after the main hook logic */
  epilog?: string;
  /** Whether to run the curl call in background (default: true) */
  backgroundCurl?: boolean;
}

/**
 * Result of building lifecycle hooks.
 */
export interface LifecycleHooksResult {
  /** Files to be added to the environment */
  files: EnvironmentResult["files"];
  /** Startup commands to create directories */
  startupCommands: string[];
}

/**
 * Build common lifecycle hook preamble.
 */
function buildHookPreamble(ctx: LifecycleAdapterContext): string {
  const logFile =
    ctx.logFile ?? `/root/lifecycle/${ctx.provider}-hook.log`;
  return `#!/bin/bash
set -eu
LOG_FILE="${logFile}"
`;
}

/**
 * Build the curl command for posting activity events.
 */
function buildActivityCurl(
  eventType: LifecycleEventType,
  provider: ProviderName,
  summaryExpr: string,
  extraFields?: string,
  options?: HookScriptOptions
): string {
  const background = options?.backgroundCurl !== false;
  const jqFields = extraFields
    ? `'{taskRunId: $trid, type: "${eventType}", toolName: "${provider}", summary: ${summaryExpr}${extraFields}}'`
    : `'{taskRunId: $trid, type: "${eventType}", toolName: "${provider}", summary: ${summaryExpr}}'`;

  const curlCmd = `curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$(jq -n --arg trid "\${CMUX_TASK_RUN_ID:-}" \\
         ${jqFields})" \\
    >> "\${LOG_FILE}" 2>&1 || true`;

  if (background) {
    return `(
  ${curlCmd}
) &`;
  }
  return curlCmd;
}

/**
 * Build session start hook script.
 */
export function buildSessionStartHook(
  ctx: LifecycleAdapterContext,
  options?: HookScriptOptions
): string {
  const preamble = buildHookPreamble(ctx);
  const curl = buildActivityCurl(
    "session_start",
    ctx.provider,
    '"Session started"',
    undefined,
    options
  );

  return `${preamble}
${options?.prolog ?? ""}
if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ]; then
  exit 0
fi
# Post session start activity event (non-blocking)
${curl}
${options?.epilog ?? ""}
exit 0
`;
}

/**
 * Build session stop/complete hook script.
 */
export function buildSessionStopHook(
  ctx: LifecycleAdapterContext,
  options?: HookScriptOptions
): string {
  const preamble = buildHookPreamble(ctx);
  const curl = buildActivityCurl(
    "session_stop",
    ctx.provider,
    '"Session completed"',
    undefined,
    options
  );

  const includeMemorySync = ctx.includeMemorySync !== false;
  const createMarker = ctx.createCompletionMarker !== false;
  const markerPath = ctx.completionMarkerPath ?? "/root/lifecycle/done.txt";

  let memorySyncBlock = "";
  if (includeMemorySync) {
    memorySyncBlock = `
# Sync memory files (best-effort)
/root/lifecycle/memory/sync.sh >> "\${LOG_FILE}" 2>&1 || true
`;
  }

  let markerBlock = "";
  if (createMarker) {
    markerBlock = `
# Create completion marker
touch "${markerPath}"
echo "[CMUX] ${ctx.provider} session complete" >> "\${LOG_FILE}"
`;
  }

  return `${preamble}
${options?.prolog ?? ""}
# Post session completion activity event (non-blocking)
if [ -n "\${CMUX_TASK_RUN_JWT:-}" ] && [ -n "\${CMUX_CALLBACK_URL:-}" ]; then
  ${curl}
fi
${memorySyncBlock}${markerBlock}${options?.epilog ?? ""}`;
}

/**
 * Build error hook script.
 */
export function buildErrorHook(
  ctx: LifecycleAdapterContext,
  options?: HookScriptOptions
): string {
  const preamble = buildHookPreamble(ctx);
  const curl = buildActivityCurl(
    "error",
    ctx.provider,
    "$msg",
    undefined,
    options
  );

  return `${preamble}
ERROR_MSG="\${1:-Unknown error}"
${options?.prolog ?? ""}
if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ]; then
  exit 0
fi
# Post error activity event (non-blocking)
$(jq -n --arg msg "$ERROR_MSG" '""') >/dev/null 2>&1  # validate jq is available
${curl.replace("$msg", "$ERROR_MSG")}
${options?.epilog ?? ""}
exit 0
`;
}

/**
 * Build context warning hook script (for pre-compaction events).
 */
export function buildContextWarningHook(
  ctx: LifecycleAdapterContext,
  options?: HookScriptOptions
): string {
  const preamble = buildHookPreamble(ctx);

  return `${preamble}
TRIGGER="\${1:-unknown}"
${options?.prolog ?? ""}
if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ]; then
  exit 0
fi
# Post context_warning activity event (non-blocking)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID:-}" \\
      --arg trigger "$TRIGGER" \\
      '{taskRunId: $trid, type: "context_warning", toolName: "${ctx.provider}", summary: ("Context compaction triggered: " + $trigger)}')" \\
    >> "\${LOG_FILE}" 2>&1 || true
) &
${options?.epilog ?? ""}
exit 0
`;
}

/**
 * Build context compacted hook script (for post-compaction events).
 */
export function buildContextCompactedHook(
  ctx: LifecycleAdapterContext,
  options?: HookScriptOptions
): string {
  const preamble = buildHookPreamble(ctx);

  return `${preamble}
TRIGGER="\${1:-unknown}"
${options?.prolog ?? ""}
if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ]; then
  exit 0
fi
# Post context_compacted activity event (non-blocking)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID:-}" \\
      --arg trigger "$TRIGGER" \\
      '{taskRunId: $trid, type: "context_compacted", toolName: "${ctx.provider}", summary: ("Context compacted (" + $trigger + ")")}')" \\
    >> "\${LOG_FILE}" 2>&1 || true
) &
${options?.epilog ?? ""}
exit 0
`;
}

// =============================================================================
// Canonical Event Payload Builders
// =============================================================================

/**
 * Canonical event types for activity API.
 * Maps to AgentCommEvent types from agent-comm-events.ts.
 *
 * Extended in Priority 1 (lifecycle normalization) to include:
 * - stop_requested / stop_blocked / stop_failed for graceful shutdown
 * - tool_requested / tool_completed for full tool lifecycle
 * - approval_requested / approval_resolved for approval flow
 * - memory_scope_changed for scope transitions
 */
export type CanonicalActivityType =
  // Session lifecycle
  | "session_start"
  | "session_stop"
  | "session_resumed"
  // Stop lifecycle (Priority 1 additions)
  | "stop_requested"
  | "stop_blocked"
  | "stop_failed"
  // Error
  | "error"
  // Context health
  | "context_warning"
  | "context_compacted"
  // Memory
  | "memory_loaded"
  | "memory_scope_changed"
  // Tool lifecycle (Priority 1: split into requested/completed)
  | "tool_call"
  | "tool_requested"
  | "tool_completed"
  // Specific tool types
  | "file_edit"
  | "file_read"
  | "bash_command"
  // User interaction
  | "user_prompt"
  // Subagent lifecycle
  | "subagent_start"
  | "subagent_stop"
  // Approval lifecycle (Priority 1 additions)
  | "approval_requested"
  | "approval_resolved"
  // Notifications
  | "notification";

/**
 * Context warning subtypes for canonical events.
 */
export type ContextWarningType =
  | "memory_bloat"
  | "tool_output"
  | "prompt_size"
  | "capacity"
  | "token_limit";

/**
 * Severity levels for context warnings.
 */
export type ContextWarningSeverity = "info" | "warning" | "critical";

/**
 * Base payload for activity events.
 */
export interface ActivityPayloadBase {
  taskRunId: string;
  type: CanonicalActivityType;
  toolName: ProviderName;
  summary: string;
}

/**
 * Extended payload for context warning events.
 */
export interface ContextWarningPayload extends ActivityPayloadBase {
  type: "context_warning";
  severity: ContextWarningSeverity;
  warningType: ContextWarningType;
  currentUsage?: number;
  maxCapacity?: number;
  usagePercent?: number;
}

/**
 * Extended payload for context compacted events.
 */
export interface ContextCompactedPayload extends ActivityPayloadBase {
  type: "context_compacted";
  previousBytes?: number;
  newBytes?: number;
  reductionPercent?: number;
}

/**
 * Build a canonical activity payload (TypeScript).
 * Use this when building payloads in Node.js code rather than shell scripts.
 */
export function buildActivityPayload(
  taskRunId: string,
  type: CanonicalActivityType,
  provider: ProviderName,
  summary: string
): ActivityPayloadBase {
  return { taskRunId, type, toolName: provider, summary };
}

/**
 * Build a canonical context warning payload (TypeScript).
 */
export function buildContextWarningPayload(
  taskRunId: string,
  provider: ProviderName,
  options: {
    severity: ContextWarningSeverity;
    warningType: ContextWarningType;
    summary: string;
    currentUsage?: number;
    maxCapacity?: number;
    usagePercent?: number;
  }
): ContextWarningPayload {
  return {
    taskRunId,
    type: "context_warning",
    toolName: provider,
    summary: options.summary,
    severity: options.severity,
    warningType: options.warningType,
    currentUsage: options.currentUsage,
    maxCapacity: options.maxCapacity,
    usagePercent: options.usagePercent,
  };
}

/**
 * Build a canonical context compacted payload (TypeScript).
 */
export function buildContextCompactedPayload(
  taskRunId: string,
  provider: ProviderName,
  options: {
    summary: string;
    previousBytes?: number;
    newBytes?: number;
    reductionPercent?: number;
  }
): ContextCompactedPayload {
  return {
    taskRunId,
    type: "context_compacted",
    toolName: provider,
    summary: options.summary,
    previousBytes: options.previousBytes,
    newBytes: options.newBytes,
    reductionPercent: options.reductionPercent,
  };
}

// =============================================================================
// Priority 1: Additional Canonical Payload Builders
// =============================================================================

/**
 * Extended payload for stop lifecycle events.
 */
export interface StopLifecyclePayload extends ActivityPayloadBase {
  type: "stop_requested" | "stop_blocked" | "stop_failed";
  reason?: string;
  blockedBy?: string;
  errorMessage?: string;
}

/**
 * Extended payload for tool lifecycle events.
 */
export interface ToolLifecyclePayload extends ActivityPayloadBase {
  type: "tool_requested" | "tool_completed";
  toolAction: string;
  filePath?: string;
  command?: string;
  durationMs?: number;
  exitCode?: number;
}

/**
 * Extended payload for approval lifecycle events.
 */
export interface ApprovalLifecyclePayload extends ActivityPayloadBase {
  type: "approval_requested" | "approval_resolved";
  approvalRequestId: string;
  action: string;
  resolution?: "allow" | "allow_once" | "allow_session" | "deny" | "deny_always";
}

/**
 * Extended payload for memory scope events.
 */
export interface MemoryScopePayload extends ActivityPayloadBase {
  type: "memory_scope_changed";
  previousScope?: string;
  newScope: string;
  reason?: string;
}

/**
 * Build a stop lifecycle event payload (TypeScript).
 */
export function buildStopLifecyclePayload(
  taskRunId: string,
  provider: ProviderName,
  type: "stop_requested" | "stop_blocked" | "stop_failed",
  options: {
    summary: string;
    reason?: string;
    blockedBy?: string;
    errorMessage?: string;
  }
): StopLifecyclePayload {
  return {
    taskRunId,
    type,
    toolName: provider,
    summary: options.summary,
    reason: options.reason,
    blockedBy: options.blockedBy,
    errorMessage: options.errorMessage,
  };
}

/**
 * Build a tool lifecycle event payload (TypeScript).
 */
export function buildToolLifecyclePayload(
  taskRunId: string,
  provider: ProviderName,
  type: "tool_requested" | "tool_completed",
  options: {
    summary: string;
    toolAction: string;
    filePath?: string;
    command?: string;
    durationMs?: number;
    exitCode?: number;
  }
): ToolLifecyclePayload {
  return {
    taskRunId,
    type,
    toolName: provider,
    summary: options.summary,
    toolAction: options.toolAction,
    filePath: options.filePath,
    command: options.command,
    durationMs: options.durationMs,
    exitCode: options.exitCode,
  };
}

/**
 * Build an approval lifecycle event payload (TypeScript).
 */
export function buildApprovalLifecyclePayload(
  taskRunId: string,
  provider: ProviderName,
  type: "approval_requested" | "approval_resolved",
  options: {
    summary: string;
    approvalRequestId: string;
    action: string;
    resolution?: "allow" | "allow_once" | "allow_session" | "deny" | "deny_always";
  }
): ApprovalLifecyclePayload {
  return {
    taskRunId,
    type,
    toolName: provider,
    summary: options.summary,
    approvalRequestId: options.approvalRequestId,
    action: options.action,
    resolution: options.resolution,
  };
}

/**
 * Build a memory scope change event payload (TypeScript).
 */
export function buildMemoryScopePayload(
  taskRunId: string,
  provider: ProviderName,
  options: {
    summary: string;
    previousScope?: string;
    newScope: string;
    reason?: string;
  }
): MemoryScopePayload {
  return {
    taskRunId,
    type: "memory_scope_changed",
    toolName: provider,
    summary: options.summary,
    previousScope: options.previousScope,
    newScope: options.newScope,
    reason: options.reason,
  };
}

// =============================================================================
// Shell Helpers
// =============================================================================

/**
 * Generate a jq command for building canonical activity payloads in shell.
 * Returns the jq expression (without the jq -n prefix).
 */
export function shellJqActivityPayload(
  type: CanonicalActivityType,
  provider: ProviderName,
  summaryExpr: string
): string {
  return `--arg trid "\${CMUX_TASK_RUN_ID:-}" '{taskRunId: $trid, type: "${type}", toolName: "${provider}", summary: ${summaryExpr}}'`;
}

/**
 * Generate a jq command for context warning payloads in shell.
 * Includes severity and warningType fields.
 */
export function shellJqContextWarningPayload(
  provider: ProviderName,
  options: {
    severity: ContextWarningSeverity;
    warningType: ContextWarningType;
    summaryExpr: string;
  }
): string {
  return `--arg trid "\${CMUX_TASK_RUN_ID:-}" --arg sev "${options.severity}" --arg wtype "${options.warningType}" '{taskRunId: $trid, type: "context_warning", toolName: "${provider}", summary: ${options.summaryExpr}, severity: $sev, warningType: $wtype}'`;
}

/**
 * Generate a full curl command for posting activity events from shell.
 * Handles background execution and logging.
 */
export function shellCurlActivityPost(
  type: CanonicalActivityType,
  provider: ProviderName,
  summaryExpr: string,
  options?: {
    background?: boolean;
    logFile?: string;
    extraJqArgs?: string;
    extraJqFields?: string;
  }
): string {
  const background = options?.background !== false;
  const logFile = options?.logFile ?? '"\${LOG_FILE}"';
  const extraArgs = options?.extraJqArgs ?? "";
  const extraFields = options?.extraJqFields ?? "";

  const jqPayload = `'{taskRunId: $trid, type: "${type}", toolName: "${provider}", summary: ${summaryExpr}${extraFields}}'`;

  const curlCmd = `curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$(jq -n --arg trid "\${CMUX_TASK_RUN_ID:-}" ${extraArgs} ${jqPayload})" \\
    >> ${logFile} 2>&1 || true`;

  if (background) {
    return `(
  ${curlCmd}
) &`;
  }
  return curlCmd;
}

/**
 * Build activity hook script for tool call events.
 */
export function buildActivityHook(
  ctx: LifecycleAdapterContext,
  options?: HookScriptOptions
): string {
  const preamble = buildHookPreamble(ctx);

  return `${preamble}
TOOL_NAME="\${TOOL_NAME:-unknown}"
SUMMARY="\${SUMMARY:-Tool used}"
${options?.prolog ?? ""}
if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ]; then
  exit 0
fi
# Post tool_call activity event (non-blocking)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID:-}" \\
      --arg tool "$TOOL_NAME" \\
      --arg sum "$SUMMARY" \\
      '{taskRunId: $trid, type: "tool_call", toolName: $tool, summary: $sum}')" \\
    >> "\${LOG_FILE}" 2>&1 || true
) &
${options?.epilog ?? ""}
exit 0
`;
}

/**
 * Build standard lifecycle hooks for a provider.
 *
 * This creates the common set of hooks that most providers need:
 * - session-start-hook.sh
 * - session-complete-hook.sh (or session-stop-hook.sh)
 * - error-hook.sh
 *
 * @param ctx - Lifecycle adapter context
 * @param bufferFrom - Buffer.from function (passed to avoid Node.js dependency at import time)
 * @returns Files and startup commands for the hooks
 */
export function buildStandardLifecycleHooks(
  ctx: LifecycleAdapterContext,
  bufferFrom: (content: string) => { toString(encoding: "base64"): string }
): LifecycleHooksResult {
  const lifecycleDir = ctx.lifecycleDir ?? "/root/lifecycle";
  const providerDir = ctx.providerLifecycleDir ?? `${lifecycleDir}/${ctx.provider}`;

  const files: EnvironmentResult["files"] = [];
  const startupCommands: string[] = [];

  // Ensure directories exist
  startupCommands.push(`mkdir -p ${providerDir}`);

  // Session start hook
  const sessionStartScript = buildSessionStartHook(ctx);
  files.push({
    destinationPath: `${providerDir}/session-start-hook.sh`,
    contentBase64: bufferFrom(sessionStartScript).toString("base64"),
    mode: "755",
  });

  // Session complete/stop hook
  const sessionStopScript = buildSessionStopHook(ctx);
  files.push({
    destinationPath: `${providerDir}/session-complete-hook.sh`,
    contentBase64: bufferFrom(sessionStopScript).toString("base64"),
    mode: "755",
  });

  // Error hook
  const errorScript = buildErrorHook(ctx);
  files.push({
    destinationPath: `${providerDir}/error-hook.sh`,
    contentBase64: bufferFrom(errorScript).toString("base64"),
    mode: "755",
  });

  return { files, startupCommands };
}

/**
 * Build extended lifecycle hooks including context health events.
 *
 * This adds context health hooks on top of standard hooks:
 * - context-warning-hook.sh (pre-compaction)
 * - context-compacted-hook.sh (post-compaction)
 * - activity-hook.sh (tool calls)
 *
 * @param ctx - Lifecycle adapter context
 * @param bufferFrom - Buffer.from function
 * @returns Files and startup commands for all hooks
 */
export function buildExtendedLifecycleHooks(
  ctx: LifecycleAdapterContext,
  bufferFrom: (content: string) => { toString(encoding: "base64"): string }
): LifecycleHooksResult {
  // Start with standard hooks
  const result = buildStandardLifecycleHooks(ctx, bufferFrom);
  const providerDir =
    ctx.providerLifecycleDir ?? `${ctx.lifecycleDir ?? "/root/lifecycle"}/${ctx.provider}`;

  // Context warning hook
  const contextWarningScript = buildContextWarningHook(ctx);
  result.files.push({
    destinationPath: `${providerDir}/context-warning-hook.sh`,
    contentBase64: bufferFrom(contextWarningScript).toString("base64"),
    mode: "755",
  });

  // Context compacted hook
  const contextCompactedScript = buildContextCompactedHook(ctx);
  result.files.push({
    destinationPath: `${providerDir}/context-compacted-hook.sh`,
    contentBase64: bufferFrom(contextCompactedScript).toString("base64"),
    mode: "755",
  });

  // Activity hook for tool calls
  const activityScript = buildActivityHook(ctx);
  result.files.push({
    destinationPath: `${providerDir}/activity-hook.sh`,
    contentBase64: bufferFrom(activityScript).toString("base64"),
    mode: "755",
  });

  return result;
}

// =============================================================================
// P2: Runtime Interruption Payload Builders
// =============================================================================

/**
 * P2: Interruption status types for the generalized runtime model.
 */
export type InterruptionStatusType =
  | "none"
  | "approval_pending"
  | "paused_by_operator"
  | "sandbox_paused"
  | "context_overflow"
  | "rate_limited"
  | "timed_out"
  | "checkpoint_pending"
  | "handoff_pending"
  | "user_input_required";

/**
 * P2: Payload for reporting a runtime interruption.
 */
export interface RuntimeInterruptionPayload {
  taskRunId: string;
  status: InterruptionStatusType;
  reason?: string;
  expiresInMs?: number;
  resumeToken?: string;
  // Provider session binding
  providerSessionId?: string;
  resumeTargetId?: string;
  // Checkpoint reference
  checkpointRef?: string;
  checkpointGeneration?: number;
  // Link to approval if applicable
  approvalRequestId?: string;
}

/**
 * P2: Build a runtime interruption payload (TypeScript).
 * Use when agents need to report blocking states to the control plane.
 */
export function buildRuntimeInterruptionPayload(
  taskRunId: string,
  status: InterruptionStatusType,
  options?: {
    reason?: string;
    expiresInMs?: number;
    resumeToken?: string;
    providerSessionId?: string;
    resumeTargetId?: string;
    checkpointRef?: string;
    checkpointGeneration?: number;
    approvalRequestId?: string;
  }
): RuntimeInterruptionPayload {
  return {
    taskRunId,
    status,
    reason: options?.reason,
    expiresInMs: options?.expiresInMs,
    resumeToken: options?.resumeToken,
    providerSessionId: options?.providerSessionId,
    resumeTargetId: options?.resumeTargetId,
    checkpointRef: options?.checkpointRef,
    checkpointGeneration: options?.checkpointGeneration,
    approvalRequestId: options?.approvalRequestId,
  };
}

/**
 * P2: Generate shell curl command for reporting runtime interruptions.
 */
export function shellCurlInterruptionPost(
  status: InterruptionStatusType,
  options?: {
    background?: boolean;
    logFile?: string;
    reasonExpr?: string;
  }
): string {
  const background = options?.background !== false;
  const logFile = options?.logFile ?? '"\${LOG_FILE}"';
  const reasonArg = options?.reasonExpr
    ? `--arg reason ${options.reasonExpr}`
    : '--arg reason ""';

  const jqPayload = `'{taskRunId: $trid, status: "${status}", reason: $reason}'`;

  const curlCmd = `curl -s -X POST "\${CMUX_CALLBACK_URL}/api/runtime/interrupt" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$(jq -n --arg trid "\${CMUX_TASK_RUN_ID:-}" ${reasonArg} ${jqPayload})" \\
    >> ${logFile} 2>&1 || true`;

  if (background) {
    return `(
  ${curlCmd}
) &`;
  }
  return curlCmd;
}

/**
 * P2: Build interruption hook script for checkpoint-based pauses.
 * Called when an agent wants to save a checkpoint and pause.
 */
export function buildCheckpointInterruptionHook(
  ctx: LifecycleAdapterContext,
  options?: HookScriptOptions
): string {
  const preamble = buildHookPreamble(ctx);

  return `${preamble}
CHECKPOINT_REF="\${1:-}"
REASON="\${2:-Checkpoint saved}"
${options?.prolog ?? ""}
if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ]; then
  exit 0
fi
# Report checkpoint interruption
curl -s -X POST "\${CMUX_CALLBACK_URL}/api/runtime/interrupt" \\
  -H "Content-Type: application/json" \\
  -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
  -d "$(jq -n \\
    --arg trid "\${CMUX_TASK_RUN_ID:-}" \\
    --arg cpref "$CHECKPOINT_REF" \\
    --arg reason "$REASON" \\
    '{taskRunId: $trid, status: "checkpoint_pending", reason: $reason, checkpointRef: $cpref}')" \\
  >> "\${LOG_FILE}" 2>&1 || true
${options?.epilog ?? ""}
exit 0
`;
}

// =============================================================================
// P1 Lifecycle Parity: Prompt and Turn Tracking
// =============================================================================

/**
 * Payload for prompt_submitted events.
 */
export interface PromptSubmittedPayload {
  taskRunId: string;
  type: "prompt_submitted";
  toolName: string;
  summary: string;
  source: "user" | "operator" | "hook" | "queue" | "handoff";
  turnNumber?: number;
  promptLength?: number;
  providerSessionId?: string;
}

/**
 * P1: Build a prompt_submitted payload (TypeScript).
 * Use when tracking prompts/turns submitted to the agent.
 */
export function buildPromptSubmittedPayload(
  taskRunId: string,
  provider: ProviderName,
  source: PromptSubmittedPayload["source"],
  options?: {
    turnNumber?: number;
    promptLength?: number;
    providerSessionId?: string;
    summary?: string;
  }
): PromptSubmittedPayload {
  return {
    taskRunId,
    type: "prompt_submitted",
    toolName: provider,
    summary: options?.summary ?? `Turn ${options?.turnNumber ?? "?"} submitted`,
    source,
    turnNumber: options?.turnNumber,
    promptLength: options?.promptLength,
    providerSessionId: options?.providerSessionId,
  };
}

/**
 * Payload for session_finished events.
 */
export interface SessionFinishedPayload {
  taskRunId: string;
  type: "session_finished";
  toolName: string;
  summary: string;
  exitCode?: number;
  turnCount?: number;
  durationMs?: number;
  providerSessionId?: string;
}

/**
 * P1: Build a session_finished payload (TypeScript).
 * Use when a session completes cleanly (not error).
 */
export function buildSessionFinishedPayload(
  taskRunId: string,
  provider: ProviderName,
  options?: {
    exitCode?: number;
    turnCount?: number;
    durationMs?: number;
    providerSessionId?: string;
    summary?: string;
  }
): SessionFinishedPayload {
  const turns = options?.turnCount ? ` (${options.turnCount} turns)` : "";
  const duration = options?.durationMs
    ? ` in ${Math.round(options.durationMs / 1000)}s`
    : "";
  return {
    taskRunId,
    type: "session_finished",
    toolName: provider,
    summary: options?.summary ?? `Session finished${turns}${duration}`,
    exitCode: options?.exitCode,
    turnCount: options?.turnCount,
    durationMs: options?.durationMs,
    providerSessionId: options?.providerSessionId,
  };
}

/**
 * Payload for run_resumed events.
 */
export interface RunResumedPayload {
  taskRunId: string;
  type: "run_resumed";
  toolName: string;
  summary: string;
  resumeReason: "checkpoint" | "reconnect" | "handoff" | "retry" | "manual";
  previousTaskRunId?: string;
  previousSessionId?: string;
  checkpointRef?: string;
  providerSessionId?: string;
}

/**
 * P1: Build a run_resumed payload (TypeScript).
 * Use when resuming from a previous checkpoint or session.
 */
export function buildRunResumedPayload(
  taskRunId: string,
  provider: ProviderName,
  resumeReason: RunResumedPayload["resumeReason"],
  options?: {
    previousTaskRunId?: string;
    previousSessionId?: string;
    checkpointRef?: string;
    providerSessionId?: string;
    summary?: string;
  }
): RunResumedPayload {
  return {
    taskRunId,
    type: "run_resumed",
    toolName: provider,
    summary: options?.summary ?? `Run resumed (${resumeReason})`,
    resumeReason,
    previousTaskRunId: options?.previousTaskRunId,
    previousSessionId: options?.previousSessionId,
    checkpointRef: options?.checkpointRef,
    providerSessionId: options?.providerSessionId,
  };
}

// =============================================================================
// P5 Lifecycle Parity: MCP Runtime Events
// =============================================================================

/**
 * Payload for mcp_capabilities_negotiated events.
 */
export interface McpCapabilitiesPayload {
  taskRunId: string;
  type: "mcp_capabilities_negotiated";
  toolName: string;
  summary: string;
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

/**
 * P5: Build an mcp_capabilities_negotiated payload (TypeScript).
 * Use when MCP server capabilities are negotiated.
 */
export function buildMcpCapabilitiesPayload(
  taskRunId: string,
  provider: ProviderName,
  serverName: string,
  transport: McpCapabilitiesPayload["transport"],
  capabilities: McpCapabilitiesPayload["capabilities"],
  options?: {
    serverId?: string;
    protocolVersion?: string;
    toolCount?: number;
    resourceCount?: number;
    sessionId?: string;
    summary?: string;
  }
): McpCapabilitiesPayload {
  const capList = Object.entries(capabilities)
    .filter(([, v]) => v)
    .map(([k]) => k);
  const toolInfo = options?.toolCount ? `, ${options.toolCount} tools` : "";
  return {
    taskRunId,
    type: "mcp_capabilities_negotiated",
    toolName: provider,
    summary:
      options?.summary ??
      `MCP ${serverName}: ${capList.join(", ")}${toolInfo}`,
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
