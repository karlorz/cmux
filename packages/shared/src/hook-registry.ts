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
  // P3 Simple hooks - Phase 2 additions
  {
    type: "subagent_start",
    providers: ["claude"],
    critical: false,
    description: "Sub-agent spawned via Agent tool",
  },
  {
    type: "subagent_stop",
    providers: ["claude"],
    critical: false,
    description: "Sub-agent completed",
  },
  {
    type: "notification",
    providers: ["claude"],
    critical: false,
    description: "Agent needs user attention (permission prompt, idle)",
  },
  {
    type: "task_created",
    providers: ["claude"],
    critical: false,
    description: "Task created via TaskCreate tool",
  },
  {
    type: "user_prompt",
    providers: ["claude"],
    critical: false,
    description: "User prompt submitted before processing",
  },
  // P2 Medium hooks
  {
    type: "plan_sync",
    providers: ["claude"],
    critical: false,
    description: "Plan synced to GitHub Projects on ExitPlanMode",
  },
  {
    type: "simplify_track",
    providers: ["claude"],
    critical: false,
    description: "Marks /simplify completion for pre-merge gate",
  },
  // P1 Critical hooks
  {
    type: "precompact",
    providers: ["claude"],
    critical: true,
    description: "Pre-compaction memory sync (must return {continue: true})",
  },
  {
    type: "postcompact",
    providers: ["claude"],
    critical: false,
    description: "Post-compaction context re-injection",
  },
  {
    type: "simplify_gate",
    providers: ["claude"],
    critical: true,
    description: "Blocks stop if /simplify required but not run",
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

    // Phase 2 Hook Portability additions
    case "subagent_start":
      return buildSubagentStartScript(provider, logFile);

    case "subagent_stop":
      return buildSubagentStopScript(provider, logFile);

    case "notification":
      return buildNotificationScript(provider, logFile);

    case "task_created":
      return buildTaskCreatedScript(provider, logFile);

    case "user_prompt":
      return buildUserPromptScript(provider, logFile);

    case "plan_sync":
      return buildPlanSyncScript(provider, logFile);

    case "simplify_track":
      return buildSimplifyTrackScript(provider, logFile);

    case "precompact":
      return buildPrecompactScript(provider, logFile);

    case "postcompact":
      return buildPostcompactScript(provider, logFile);

    case "simplify_gate":
      return buildSimplifyGateScript(provider, logFile);

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

echo "[CMUX Stop Hook] Script started at \$(date)" >> "\$LOG_FILE"
echo "[CMUX Stop Hook] CMUX_TASK_RUN_ID=\${CMUX_TASK_RUN_ID:-}" >> "\$LOG_FILE"

# Sync memory files (best-effort)
/root/lifecycle/memory/sync.sh >> "\$LOG_FILE" 2>&1 || true

# Post session completion callbacks (non-blocking)
if [ -n "\${CMUX_TASK_RUN_JWT:-}" ] && [ -n "\${CMUX_CALLBACK_URL:-}" ] && [ -n "\${CMUX_TASK_RUN_ID:-}" ]; then
  (
    # Call crown/complete for status updates
    curl -s -X POST "\${CMUX_CALLBACK_URL}/api/crown/complete" \\
      -H "Content-Type: application/json" \\
      -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
      -d "{\\"taskRunId\\": \\"\${CMUX_TASK_RUN_ID}\\", \\"exitCode\\": 0}" \\
      >> "\$LOG_FILE" 2>&1 || true

    # Call notifications endpoint for user notification
    curl -s -X POST "\${CMUX_CALLBACK_URL}/api/notifications/agent-stopped" \\
      -H "Content-Type: application/json" \\
      -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
      -d "{\\"taskRunId\\": \\"\${CMUX_TASK_RUN_ID}\\"}" \\
      >> "\$LOG_FILE" 2>&1 || true

    # Post "agent stopped" activity event for dashboard timeline
    curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
      -H "Content-Type: application/json" \\
      -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
      -d "$(jq -n --arg trid "\${CMUX_TASK_RUN_ID}" \\
           '{taskRunId: \$trid, type: "session_stop", toolName: "${provider}", summary: "Session completed"}')" \\
      >> "\$LOG_FILE" 2>&1 || true

    echo "[CMUX Stop Hook] API calls completed at \$(date)" >> "\$LOG_FILE"
  ) &
fi

# Create completion marker for task run
if [ -n "\${CMUX_TASK_RUN_ID:-}" ]; then
  touch "/root/lifecycle/${provider}-complete-\${CMUX_TASK_RUN_ID}"
fi

# Create generic completion marker
touch /root/lifecycle/done.txt
echo "[CMUX] ${provider} session complete" >> "\$LOG_FILE"
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
  // For Claude, we receive error events via stdin
  if (provider === "claude") {
    return `#!/bin/bash
set -eu
LOG_FILE="${logFile}"
EVENT=\$(cat)

if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ] || [ -z "\${CMUX_TASK_RUN_ID:-}" ]; then
  exit 0
fi

ERROR_MSG=\$(echo "\$EVENT" | jq -r '.error // "Agent stopped due to an error"' | head -c 300)

(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "\$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID}" \\
      --arg summary "Error: \$ERROR_MSG" \\
      '{taskRunId: \$trid, type: "error", summary: \$summary}')" \\
    >> "\$LOG_FILE" 2>&1 || true
) &
exit 0
`;
  }

  // Default pattern for other providers (error message as argument)
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
  // For Claude, we receive tool_use events via stdin and need to parse them
  // For Codex, we receive env vars TOOL_NAME and SUMMARY
  if (provider === "claude") {
    return `#!/bin/bash
set -eu
LOG_FILE="${logFile}"
EVENT=\$(cat)
TOOL_NAME=\$(echo "\$EVENT" | jq -r '.tool_use.name // "unknown"')

if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ] || [ -z "\${CMUX_TASK_RUN_ID:-}" ]; then
  exit 0
fi

# Map tool names to activity types
case "\$TOOL_NAME" in
  Edit|Write|NotebookEdit) TYPE="file_edit" ;;
  Read)                     TYPE="file_read" ;;
  Bash)                     TYPE="bash_command" ;;
  Grep|Glob)                TYPE="file_read" ;;
  Agent)                    TYPE="tool_call" ;;
  *)                        TYPE="tool_call" ;;
esac

# Build human-readable summary from tool input
case "\$TOOL_NAME" in
  Edit)  SUMMARY="Edit \$(echo "\$EVENT" | jq -r '.tool_use.input.file_path // ""' | sed 's|.*/||')" ;;
  Read)  SUMMARY="Read \$(echo "\$EVENT" | jq -r '.tool_use.input.file_path // ""' | sed 's|.*/||')" ;;
  Write) SUMMARY="Write \$(echo "\$EVENT" | jq -r '.tool_use.input.file_path // ""' | sed 's|.*/||')" ;;
  Bash)  SUMMARY="Run: \$(echo "\$EVENT" | jq -r '.tool_use.input.command // ""' | head -c 80)" ;;
  Grep)  SUMMARY="Search: \$(echo "\$EVENT" | jq -r '.tool_use.input.pattern // ""' | head -c 60)" ;;
  Glob)  SUMMARY="Find: \$(echo "\$EVENT" | jq -r '.tool_use.input.pattern // ""' | head -c 60)" ;;
  Agent) SUMMARY="Agent: \$(echo "\$EVENT" | jq -r '.tool_use.input.description // ""' | head -c 60)" ;;
  *)     SUMMARY="\$TOOL_NAME" ;;
esac

# Non-blocking POST
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "\$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID}" \\
      --arg type "\$TYPE" \\
      --arg tool "\$TOOL_NAME" \\
      --arg summary "\$SUMMARY" \\
      '{taskRunId: \$trid, type: \$type, toolName: \$tool, summary: \$summary}')" \\
    >> "\$LOG_FILE" 2>&1 || true
) &
exit 0
`;
  }

  // Default pattern for other providers (Codex uses env vars)
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

// =============================================================================
// Phase 2 Hook Portability - Additional Script Builders
// =============================================================================

function buildSubagentStartScript(provider: ProviderName, logFile: string): string {
  return `#!/bin/bash
set -eu
LOG_FILE="${logFile}"
REQUEST=\$(cat)

if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ] || [ -z "\${CMUX_TASK_RUN_ID:-}" ]; then
  exit 0
fi

AGENT_ID=\$(echo "\$REQUEST" | jq -r '.agent_id // "unknown"')
AGENT_TYPE=\$(echo "\$REQUEST" | jq -r '.agent_type // "unknown"')

echo "[subagent-start] Agent \$AGENT_ID (\$AGENT_TYPE) spawned" >> "\$LOG_FILE" 2>&1

# Post activity event to dashboard (background, don't block)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "\$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID}" \\
      --arg agentId "\$AGENT_ID" \\
      --arg agentType "\$AGENT_TYPE" \\
      '{taskRunId: \$trid, type: "subagent_start", toolName: "Agent", summary: ("Spawned " + \$agentType + " subagent: " + \$agentId)}')" \\
    >> "\$LOG_FILE" 2>&1 || true
) &
exit 0
`;
}

function buildSubagentStopScript(provider: ProviderName, logFile: string): string {
  return `#!/bin/bash
set -eu
LOG_FILE="${logFile}"
REQUEST=\$(cat)

if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ] || [ -z "\${CMUX_TASK_RUN_ID:-}" ]; then
  exit 0
fi

AGENT_ID=\$(echo "\$REQUEST" | jq -r '.agent_id // "unknown"')
AGENT_TYPE=\$(echo "\$REQUEST" | jq -r '.agent_type // "unknown"')
LAST_MESSAGE=\$(echo "\$REQUEST" | jq -r '.last_assistant_message // ""' | head -c 200)

echo "[subagent-stop] Agent \$AGENT_ID (\$AGENT_TYPE) completed" >> "\$LOG_FILE" 2>&1

# Post activity event to dashboard (background, don't block)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "\$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID}" \\
      --arg agentId "\$AGENT_ID" \\
      --arg agentType "\$AGENT_TYPE" \\
      --arg summary "\$LAST_MESSAGE" \\
      '{taskRunId: \$trid, type: "subagent_stop", toolName: "Agent", summary: (\$agentType + " subagent completed: " + (\$summary | if length > 100 then (.[0:100] + "...") else . end))}')" \\
    >> "\$LOG_FILE" 2>&1 || true
) &
exit 0
`;
}

function buildNotificationScript(provider: ProviderName, logFile: string): string {
  return `#!/bin/bash
set -eu
LOG_FILE="${logFile}"
REQUEST=\$(cat)

if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ] || [ -z "\${CMUX_TASK_RUN_ID:-}" ]; then
  exit 0
fi

NOTIFICATION_TYPE=\$(echo "\$REQUEST" | jq -r '.notification_type // "unknown"')
MESSAGE=\$(echo "\$REQUEST" | jq -r '.message // ""' | head -c 200)

echo "[notification] Type: \$NOTIFICATION_TYPE - \$MESSAGE" >> "\$LOG_FILE" 2>&1

# Post activity event to dashboard (background, don't block)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "\$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID}" \\
      --arg notifType "\$NOTIFICATION_TYPE" \\
      --arg msg "\$MESSAGE" \\
      '{taskRunId: \$trid, type: "notification", summary: (\$notifType + ": " + (\$msg | if length > 100 then (.[0:100] + "...") else . end))}')" \\
    >> "\$LOG_FILE" 2>&1 || true
) &
exit 0
`;
}

function buildTaskCreatedScript(provider: ProviderName, logFile: string): string {
  return `#!/bin/bash
set -eu
LOG_FILE="${logFile}"
REQUEST=\$(cat)

if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ] || [ -z "\${CMUX_TASK_RUN_ID:-}" ]; then
  exit 0
fi

TASK_ID=\$(echo "\$REQUEST" | jq -r '.task_id // "unknown"')
TASK_SUBJECT=\$(echo "\$REQUEST" | jq -r '.subject // ""' | head -c 100)
TASK_STATUS=\$(echo "\$REQUEST" | jq -r '.status // "pending"')

echo "[task-created] Task \$TASK_ID created: \$TASK_SUBJECT" >> "\$LOG_FILE" 2>&1

# Post activity event to dashboard (background, don't block)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "\$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID}" \\
      --arg taskId "\$TASK_ID" \\
      --arg subject "\$TASK_SUBJECT" \\
      --arg status "\$TASK_STATUS" \\
      '{taskRunId: \$trid, type: "task_created", toolName: "TaskCreate", summary: ("Created task: " + (\$subject | if length > 60 then (.[0:60] + "...") else . end))}')" \\
    >> "\$LOG_FILE" 2>&1 || true
) &
exit 0
`;
}

function buildUserPromptScript(provider: ProviderName, logFile: string): string {
  return `#!/bin/bash
set -eu
LOG_FILE="${logFile}"
REQUEST=\$(cat)

if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ] || [ -z "\${CMUX_TASK_RUN_ID:-}" ]; then
  exit 0
fi

PROMPT=\$(echo "\$REQUEST" | jq -r '.prompt // ""' | head -c 200)
SESSION_ID=\$(echo "\$REQUEST" | jq -r '.session_id // ""')

# Only log non-empty prompts
if [ -z "\$PROMPT" ]; then
  exit 0
fi

echo "[user-prompt] Session \$SESSION_ID: \$PROMPT" >> "\$LOG_FILE" 2>&1

# Post activity event to dashboard (background, don't block prompt processing)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "\$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID}" \\
      --arg prompt "\$PROMPT" \\
      '{taskRunId: \$trid, type: "user_prompt", summary: ("User: " + (\$prompt | if length > 100 then (.[0:100] + "...") else . end))}')" \\
    >> "\$LOG_FILE" 2>&1 || true
) &
exit 0
`;
}

function buildPlanSyncScript(provider: ProviderName, logFile: string): string {
  return `#!/bin/bash
set -eu
LOG_FILE="${logFile}"
INPUT=\$(cat)

echo "[CMUX Plan Hook] Script started at \$(date)" >> "\$LOG_FILE"
echo "[CMUX Plan Hook] Input: \$INPUT" >> "\$LOG_FILE"

# Only sync if we have the required env vars and a linked project
if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ]; then
  echo "[CMUX Plan Hook] Missing env vars, skipping sync" >> "\$LOG_FILE"
  exit 0
fi

# Extract plan file path from tool_input (if available)
# ExitPlanMode doesn't pass the plan file path directly, so we look for plan files
PLAN_DIR="/root/.claude/plans"
if [ ! -d "\$PLAN_DIR" ]; then
  echo "[CMUX Plan Hook] No plans directory found" >> "\$LOG_FILE"
  exit 0
fi

# Find the most recently modified plan file
PLAN_FILE=\$(ls -t "\$PLAN_DIR"/*.md 2>/dev/null | head -1)
if [ -z "\$PLAN_FILE" ] || [ ! -f "\$PLAN_FILE" ]; then
  echo "[CMUX Plan Hook] No plan files found" >> "\$LOG_FILE"
  exit 0
fi

echo "[CMUX Plan Hook] Found plan file: \$PLAN_FILE" >> "\$LOG_FILE"

# Read plan content
PLAN_CONTENT=\$(cat "\$PLAN_FILE" | head -c 50000)  # Limit to 50KB

# Send to plan sync endpoint (best-effort, non-blocking)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/integrations/github-projects/plan-sync" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "\$(jq -n --arg content "\$PLAN_CONTENT" --arg file "\$PLAN_FILE" '{planContent: \$content, planFile: \$file}')" \\
    >> "\$LOG_FILE" 2>&1 || true
  echo "[CMUX Plan Hook] Sync request sent" >> "\$LOG_FILE"
) &

exit 0
`;
}

function buildSimplifyTrackScript(provider: ProviderName, logFile: string): string {
  return `#!/bin/bash
set -eu
LOG_FILE="${logFile}"
REQUEST=\$(cat)

if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ] || [ -z "\${CMUX_TASK_RUN_ID:-}" ]; then
  exit 0
fi

# Extract skill name from tool input
SKILL_NAME=\$(echo "\$REQUEST" | jq -r '.tool_input.skill // .tool_use.input.skill // empty')

echo "[simplify-track] Skill used: \$SKILL_NAME" >> "\$LOG_FILE" 2>&1

# Check if this is the simplify skill (with or without arguments)
if [[ "\$SKILL_NAME" == "simplify" ]] || [[ "\$SKILL_NAME" == "simplify "* ]]; then
  echo "[simplify-track] /simplify detected, marking as passed..." >> "\$LOG_FILE" 2>&1

  # Extract mode from arguments if present (--quick, --staged-only, or default to "full")
  MODE="full"
  if [[ "\$SKILL_NAME" == *"--quick"* ]]; then
    MODE="quick"
  elif [[ "\$SKILL_NAME" == *"--staged-only"* ]]; then
    MODE="staged-only"
  fi

  # Call the mark-passed endpoint
  (
    RESPONSE=\$(curl -s -X POST "\${CMUX_CALLBACK_URL}/api/v1/cmux/orchestration/simplify/mark-passed" \\
      -H "Content-Type: application/json" \\
      -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
      -d "{\\"mode\\": \\"\$MODE\\"}" 2>&1)
    echo "[simplify-track] API response: \$RESPONSE" >> "\$LOG_FILE" 2>&1

    # Also post activity event
    curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
      -H "Content-Type: application/json" \\
      -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
      -d "\$(jq -n \\
        --arg trid "\${CMUX_TASK_RUN_ID}" \\
        --arg mode "\$MODE" \\
        '{taskRunId: \$trid, type: "simplify_passed", summary: ("/simplify (" + \$mode + ") completed")}')" \\
      >> "\$LOG_FILE" 2>&1 || true
  ) &
fi

exit 0
`;
}

function buildPrecompactScript(provider: ProviderName, logFile: string): string {
  return `#!/bin/bash
set -eu
LOG_FILE="${logFile}"
REQUEST=\$(cat)

if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ] || [ -z "\${CMUX_TASK_RUN_ID:-}" ]; then
  # No cmux context - allow compaction to proceed
  echo '{"continue": true}'
  exit 0
fi

TRIGGER=\$(echo "\$REQUEST" | jq -r '.trigger // "auto"')
SESSION_ID=\$(echo "\$REQUEST" | jq -r '.session_id // empty')

echo "[precompact-hook] Trigger: \$TRIGGER, Session: \$SESSION_ID" >> "\$LOG_FILE" 2>&1

# Sync memory to Convex before compaction (background, don't block)
(
  # Read current memory state
  MEMORY_CONTENT=""
  if [ -f "/root/lifecycle/memory/knowledge/MEMORY.md" ]; then
    MEMORY_CONTENT=\$(cat /root/lifecycle/memory/knowledge/MEMORY.md | head -c 50000 | base64 -w 0)
  fi

  TASKS_CONTENT=""
  if [ -f "/root/lifecycle/memory/TASKS.json" ]; then
    TASKS_CONTENT=\$(cat /root/lifecycle/memory/TASKS.json | head -c 20000 | base64 -w 0)
  fi

  # Post to memory sync endpoint
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/memory/sync" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "\$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID}" \\
      --arg trigger "\$TRIGGER" \\
      --arg memory "\$MEMORY_CONTENT" \\
      --arg tasks "\$TASKS_CONTENT" \\
      '{taskRunId: \$trid, trigger: \$trigger, memoryBase64: \$memory, tasksBase64: \$tasks}')" \\
    >> "\$LOG_FILE" 2>&1 || true

  # Also post a context_warning activity event
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "\$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID}" \\
      --arg trigger "\$TRIGGER" \\
      '{taskRunId: \$trid, type: "context_warning", summary: ("Context compaction triggered: " + \$trigger)}')" \\
    >> "\$LOG_FILE" 2>&1 || true
) &

# Allow compaction to proceed
echo '{"continue": true}'
exit 0
`;
}

function buildPostcompactScript(provider: ProviderName, logFile: string): string {
  return `#!/bin/bash
set -eu
LOG_FILE="${logFile}"
REQUEST=\$(cat)

if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ] || [ -z "\${CMUX_TASK_RUN_ID:-}" ]; then
  exit 0
fi

TRIGGER=\$(echo "\$REQUEST" | jq -r '.trigger // "auto"')
SUMMARY=\$(echo "\$REQUEST" | jq -r '.summary // ""' | head -c 300)

echo "[postcompact] Trigger: \$TRIGGER, Summary length: \${#SUMMARY}" >> "\$LOG_FILE" 2>&1

# Post activity event to dashboard (background)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "\$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID}" \\
      --arg trigger "\$TRIGGER" \\
      '{taskRunId: \$trid, type: "context_compacted", summary: ("Context compacted (" + \$trigger + ")")}')" \\
    >> "\$LOG_FILE" 2>&1 || true
) &

# Re-inject critical task context after compaction
# This ensures agent remembers its core mission even after context is summarized
TASK_CONTEXT=""
if [ -f "/root/lifecycle/memory/knowledge/MEMORY.md" ]; then
  # Extract P0 (Core) entries - most critical to preserve
  TASK_CONTEXT=\$(grep -A 50 "## P0 Core" /root/lifecycle/memory/knowledge/MEMORY.md 2>/dev/null | head -20 || true)
fi

if [ -n "\$TASK_CONTEXT" ]; then
  echo "Critical context from MEMORY.md (P0 Core):"
  echo "\$TASK_CONTEXT"
fi

exit 0
`;
}

function buildSimplifyGateScript(provider: ProviderName, logFile: string): string {
  return `#!/bin/bash
set -eu

LOG_FILE="${logFile}"
echo "[simplify-gate] Checking simplify requirement at \$(date)" >> "\$LOG_FILE"

# Skip if requirement not enabled
if [ "\${CMUX_REQUIRE_SIMPLIFY:-0}" != "1" ]; then
  echo "[simplify-gate] Requirement not enabled, allowing stop" >> "\$LOG_FILE"
  exit 0
fi

# Skip if missing env vars
if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ]; then
  echo "[simplify-gate] Missing env vars, allowing stop" >> "\$LOG_FILE"
  exit 0
fi

# Check simplify status from API
RESPONSE=\$(curl -s "\${CMUX_CALLBACK_URL}/api/v1/cmux/orchestration/simplify/status" \\
  -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" 2>&1)

echo "[simplify-gate] API response: \$RESPONSE" >> "\$LOG_FILE"

# Parse response
REQUIRED=\$(echo "\$RESPONSE" | jq -r '.required // false')
PASSED=\$(echo "\$RESPONSE" | jq -r '.passed // false')
SKIPPED_REASON=\$(echo "\$RESPONSE" | jq -r '.skippedReason // empty')

echo "[simplify-gate] Required: \$REQUIRED, Passed: \$PASSED, Skipped: \$SKIPPED_REASON" >> "\$LOG_FILE"

# If not required or already passed/skipped, allow stop
if [ "\$REQUIRED" != "true" ] || [ "\$PASSED" == "true" ] || [ -n "\$SKIPPED_REASON" ]; then
  echo "[simplify-gate] Requirement satisfied, allowing stop" >> "\$LOG_FILE"
  exit 0
fi

# Block the stop - /simplify is required but hasn't been run
echo "[simplify-gate] BLOCKING: /simplify required but not run" >> "\$LOG_FILE"

# Emit stop_blocked event to dashboard (background, non-blocking)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "\$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID:-}" \\
      '{taskRunId: \$trid, type: "stop_blocked", toolName: "claude", summary: "Stop blocked: /simplify required but not run", blockedBy: "simplify_gate"}')" \\
    >> "\$LOG_FILE" 2>&1 || true
) &

echo "BLOCKED: Your team requires /simplify to run before task completion." >&2
echo "Please run /simplify (or /simplify --quick) before stopping." >&2
echo "To skip this requirement, ask your team admin to disable it in settings." >&2
exit 2
`;
}
