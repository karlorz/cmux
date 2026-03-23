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
 * Lifecycle event types that can be emitted.
 */
export type LifecycleEventType =
  | "session_start"
  | "session_stop"
  | "session_resumed"
  | "error"
  | "context_warning"
  | "context_compacted"
  | "memory_loaded"
  | "tool_call";

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
 */
export type CanonicalActivityType =
  | "session_start"
  | "session_stop"
  | "session_resumed"
  | "error"
  | "context_warning"
  | "context_compacted"
  | "memory_loaded"
  | "tool_call"
  | "file_edit"
  | "file_read"
  | "bash_command"
  | "user_prompt"
  | "subagent_start"
  | "subagent_stop"
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
