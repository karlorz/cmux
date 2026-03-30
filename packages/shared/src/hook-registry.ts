/**
 * Hook Registry
 *
 * Centralized definitions of lifecycle hooks across providers.
 * This module provides:
 * - Hook event type definitions with provider support matrix
 * - Shell script dispatch logic for each event/provider combination
 * - Registration for thin stub generation
 *
 * The registry enables the "fetch-on-invoke" pattern where thin hook stubs
 * fetch current dispatch logic from the cmux server, allowing hook updates
 * without requiring new sandbox images.
 */

import type { ProviderName, LifecycleEventType } from "./provider-lifecycle-adapter";

/**
 * Hook definition with provider support matrix.
 */
export interface HookDefinition {
  /** Event type identifier */
  type: LifecycleEventType;
  /** Providers that support this hook */
  providers: ProviderName[];
  /** Whether this hook is critical (requires inline fallback) */
  critical: boolean;
  /** Human-readable description */
  description: string;
}

/**
 * Registry of all supported hooks with provider support matrix.
 */
export const HOOK_REGISTRY: HookDefinition[] = [
  {
    type: "session_start",
    providers: ["claude", "codex", "gemini", "amp", "opencode"],
    critical: false,
    description: "Session started, emit activity event",
  },
  {
    type: "session_stop",
    providers: ["claude", "codex", "gemini", "amp", "opencode"],
    critical: true,
    description: "Session stopped, sync memory and emit completion",
  },
  {
    type: "context_warning",
    providers: ["claude"],
    critical: false,
    description: "Context approaching capacity, pre-compaction warning",
  },
  {
    type: "context_compacted",
    providers: ["claude"],
    critical: false,
    description: "Context compaction completed",
  },
  {
    type: "error",
    providers: ["claude", "codex", "gemini", "amp", "opencode"],
    critical: false,
    description: "Agent error occurred",
  },
  {
    type: "tool_call",
    providers: ["claude", "codex"],
    critical: false,
    description: "Tool invocation activity for dashboard",
  },
  {
    type: "approval_requested",
    providers: ["claude"],
    critical: false,
    description: "Permission approval requested",
  },
  {
    type: "approval_resolved",
    providers: ["claude"],
    critical: false,
    description: "Permission approval resolved",
  },
  {
    type: "memory_loaded",
    providers: ["claude", "codex", "gemini"],
    critical: false,
    description: "Memory files loaded at session start",
  },
  {
    type: "prompt_submitted",
    providers: ["claude", "codex"],
    critical: false,
    description: "User or operator prompt submitted",
  },
  {
    type: "session_finished",
    providers: ["claude", "codex"],
    critical: false,
    description: "Session finished cleanly",
  },
  {
    type: "stop_requested",
    providers: ["claude", "codex"],
    critical: false,
    description: "Stop requested by operator",
  },
];

/**
 * Get hook definition by type.
 */
export function getHookDefinition(type: LifecycleEventType): HookDefinition | undefined {
  return HOOK_REGISTRY.find((h) => h.type === type);
}

/**
 * Check if a provider supports a given hook type.
 */
export function isHookSupported(
  type: LifecycleEventType,
  provider: ProviderName
): boolean {
  const def = getHookDefinition(type);
  return def?.providers.includes(provider) ?? false;
}

/**
 * Get all hooks supported by a provider.
 */
export function getHooksForProvider(provider: ProviderName): HookDefinition[] {
  return HOOK_REGISTRY.filter((h) => h.providers.includes(provider));
}

/**
 * Check if a hook is critical (requires inline fallback).
 */
export function isHookCritical(type: LifecycleEventType): boolean {
  const def = getHookDefinition(type);
  return def?.critical ?? false;
}

// =============================================================================
// Dispatch Script Generation
// =============================================================================

/**
 * Build the shell script body for a given event type and provider.
 * These scripts are served by the /api/hooks/dispatch endpoint.
 */
export function getDispatchScript(
  eventType: LifecycleEventType,
  provider: ProviderName
): string | null {
  if (!isHookSupported(eventType, provider)) {
    return null;
  }

  const logFile = `/root/lifecycle/${provider}-hook.log`;

  switch (eventType) {
    case "session_start":
      return buildSessionStartScript(provider, logFile);

    case "session_stop":
      return buildSessionStopScript(provider, logFile);

    case "context_warning":
      return buildContextWarningScript(provider, logFile);

    case "context_compacted":
      return buildContextCompactedScript(provider, logFile);

    case "error":
      return buildErrorScript(provider, logFile);

    case "tool_call":
      return buildToolCallScript(provider, logFile);

    case "approval_requested":
      return buildApprovalRequestedScript(provider, logFile);

    case "memory_loaded":
      return buildMemoryLoadedScript(provider, logFile);

    case "prompt_submitted":
      return buildPromptSubmittedScript(provider, logFile);

    case "session_finished":
      return buildSessionFinishedScript(provider, logFile);

    case "stop_requested":
      return buildStopRequestedScript(provider, logFile);

    default:
      return null;
  }
}

// =============================================================================
// Script Builders
// =============================================================================

function buildSessionStartScript(provider: ProviderName, logFile: string): string {
  return `#!/bin/bash
set -eu
LOG_FILE="${logFile}"

if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ]; then
  exit 0
fi

# Post session start activity event (non-blocking)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$(jq -n --arg trid "\${CMUX_TASK_RUN_ID:-}" \\
         '{taskRunId: $trid, type: "session_start", toolName: "${provider}", summary: "Session started"}')" \\
    >> "\${LOG_FILE}" 2>&1 || true
) &
exit 0
`;
}

function buildSessionStopScript(provider: ProviderName, logFile: string): string {
  return `#!/bin/bash
set -eu
LOG_FILE="${logFile}"

# Sync memory files (best-effort)
/root/lifecycle/memory/sync.sh >> "\${LOG_FILE}" 2>&1 || true

# Post session completion activity event (non-blocking)
if [ -n "\${CMUX_TASK_RUN_JWT:-}" ] && [ -n "\${CMUX_CALLBACK_URL:-}" ]; then
  (
    curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
      -H "Content-Type: application/json" \\
      -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
      -d "$(jq -n --arg trid "\${CMUX_TASK_RUN_ID:-}" \\
           '{taskRunId: $trid, type: "session_stop", toolName: "${provider}", summary: "Session completed"}')" \\
      >> "\${LOG_FILE}" 2>&1 || true
  ) &
fi

# Create completion marker
touch /root/lifecycle/done.txt
echo "[CMUX] ${provider} session complete" >> "\${LOG_FILE}"
`;
}

function buildContextWarningScript(provider: ProviderName, logFile: string): string {
  return `#!/bin/bash
set -eu
LOG_FILE="${logFile}"
TRIGGER="\${1:-unknown}"

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
      '{taskRunId: $trid, type: "context_warning", toolName: "${provider}", summary: ("Context compaction triggered: " + $trigger)}')" \\
    >> "\${LOG_FILE}" 2>&1 || true
) &
exit 0
`;
}

function buildContextCompactedScript(provider: ProviderName, logFile: string): string {
  return `#!/bin/bash
set -eu
LOG_FILE="${logFile}"
TRIGGER="\${1:-unknown}"

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
      '{taskRunId: $trid, type: "context_compacted", toolName: "${provider}", summary: ("Context compacted (" + $trigger + ")")}')" \\
    >> "\${LOG_FILE}" 2>&1 || true
) &
exit 0
`;
}

function buildErrorScript(provider: ProviderName, logFile: string): string {
  return `#!/bin/bash
set -eu
LOG_FILE="${logFile}"
ERROR_MSG="\${1:-Unknown error}"

if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ]; then
  exit 0
fi

# Post error activity event (non-blocking)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID:-}" \\
      --arg msg "$ERROR_MSG" \\
      '{taskRunId: $trid, type: "error", toolName: "${provider}", summary: $msg}')" \\
    >> "\${LOG_FILE}" 2>&1 || true
) &
exit 0
`;
}

function buildToolCallScript(provider: ProviderName, logFile: string): string {
  return `#!/bin/bash
set -eu
LOG_FILE="${logFile}"
TOOL_NAME="\${TOOL_NAME:-unknown}"
SUMMARY="\${SUMMARY:-Tool used}"

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
exit 0
`;
}

function buildApprovalRequestedScript(provider: ProviderName, logFile: string): string {
  return `#!/bin/bash
set -eu
LOG_FILE="${logFile}"
REQUEST_ID="\${1:-unknown}"
ACTION="\${2:-unknown action}"

if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ]; then
  exit 0
fi

# Post approval_requested activity event (non-blocking)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID:-}" \\
      --arg rid "$REQUEST_ID" \\
      --arg act "$ACTION" \\
      '{taskRunId: $trid, type: "approval_requested", toolName: "${provider}", summary: ("Approval requested: " + $act), approvalRequestId: $rid}')" \\
    >> "\${LOG_FILE}" 2>&1 || true
) &
exit 0
`;
}

function buildMemoryLoadedScript(provider: ProviderName, logFile: string): string {
  return `#!/bin/bash
set -eu
LOG_FILE="${logFile}"

if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ]; then
  exit 0
fi

# Post memory_loaded activity event (non-blocking)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$(jq -n --arg trid "\${CMUX_TASK_RUN_ID:-}" \\
         '{taskRunId: $trid, type: "memory_loaded", toolName: "${provider}", summary: "Memory files loaded"}')" \\
    >> "\${LOG_FILE}" 2>&1 || true
) &
exit 0
`;
}

function buildPromptSubmittedScript(provider: ProviderName, logFile: string): string {
  return `#!/bin/bash
set -eu
LOG_FILE="${logFile}"
SOURCE="\${1:-user}"
TURN="\${2:-}"

if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ]; then
  exit 0
fi

SUMMARY="Prompt submitted"
if [ -n "$TURN" ]; then
  SUMMARY="Turn $TURN submitted"
fi

# Post prompt_submitted activity event (non-blocking)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID:-}" \\
      --arg src "$SOURCE" \\
      --arg sum "$SUMMARY" \\
      '{taskRunId: $trid, type: "prompt_submitted", toolName: "${provider}", summary: $sum, source: $src}')" \\
    >> "\${LOG_FILE}" 2>&1 || true
) &
exit 0
`;
}

function buildSessionFinishedScript(provider: ProviderName, logFile: string): string {
  return `#!/bin/bash
set -eu
LOG_FILE="${logFile}"
EXIT_CODE="\${1:-0}"
TURN_COUNT="\${2:-}"

if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ]; then
  exit 0
fi

SUMMARY="Session finished"
if [ -n "$TURN_COUNT" ]; then
  SUMMARY="Session finished ($TURN_COUNT turns)"
fi

# Post session_finished activity event (non-blocking)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID:-}" \\
      --arg code "$EXIT_CODE" \\
      --arg sum "$SUMMARY" \\
      '{taskRunId: $trid, type: "session_finished", toolName: "${provider}", summary: $sum, exitCode: ($code | tonumber)}')" \\
    >> "\${LOG_FILE}" 2>&1 || true
) &
exit 0
`;
}

function buildStopRequestedScript(provider: ProviderName, logFile: string): string {
  return `#!/bin/bash
set -eu
LOG_FILE="${logFile}"
REASON="\${1:-operator request}"

if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ]; then
  exit 0
fi

# Post stop_requested activity event (non-blocking)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID:-}" \\
      --arg reason "$REASON" \\
      '{taskRunId: $trid, type: "stop_requested", toolName: "${provider}", summary: ("Stop requested: " + $reason)}')" \\
    >> "\${LOG_FILE}" 2>&1 || true
) &
exit 0
`;
}
