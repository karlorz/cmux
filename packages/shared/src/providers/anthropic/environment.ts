import type {
  EnvironmentContext,
  EnvironmentResult,
} from "../common/environment-result";
import {
  CMUX_ANTHROPIC_PROXY_PLACEHOLDER_API_KEY,
  normalizeAnthropicBaseUrl,
} from "../../utils/anthropic";
import {
  getMemoryStartupCommand,
  getMemorySeedFiles,
  getProjectContextFile,
  getCrossToolSymlinkCommands,
} from "../../agent-memory-protocol";
import { buildClaudeMdContent } from "../../agent-instruction-pack";
import { buildMergedClaudeConfig } from "../../mcp-preview";

export const CLAUDE_KEY_ENV_VARS_TO_UNSET = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_CUSTOM_HEADERS",
  "CLAUDE_API_KEY",
];

const CLAUDE_OPUS_46_EFFORT_LEVELS = new Set(["low", "medium", "high", "max"]);

function resolveClaudeEffortLevel(
  agentName: string | undefined,
  selectedVariant: string | undefined,
): string | undefined {
  const effort = selectedVariant?.trim();
  if (!effort) {
    return undefined;
  }

  if (agentName !== "claude/opus-4.6") {
    throw new Error(
      `Model ${agentName ?? "claude"} does not support effort selection`,
    );
  }

  if (!CLAUDE_OPUS_46_EFFORT_LEVELS.has(effort)) {
    throw new Error(
      `Unsupported Claude effort "${effort}". Allowed values: low, medium, high, max`,
    );
  }

  return effort;
}

/**
 * @deprecated Use permissionDenyRules from Convex instead.
 * Kept as fallback if Convex fetch fails during migration period.
 *
 * These deny rules were previously hardcoded and are now stored in Convex
 * as system-level permissionDenyRules with contexts: ["task_sandbox"].
 * They do NOT apply to head agents (cloud workspaces) which need full capabilities.
 */
const FALLBACK_DENY_RULES = [
  // PR lifecycle — cmux manages PR creation/merging automatically
  "Bash(gh pr create:*)",
  "Bash(gh pr merge:*)",
  "Bash(gh pr close:*)",
  // Force push — destructive history rewrite
  "Bash(git push --force:*)",
  "Bash(git push --force-with-lease:*)",
  "Bash(git push -f:*)",
  // Sandbox lifecycle — only the orchestration system should manage sandboxes
  "Bash(devsh start:*)",
  "Bash(devsh delete:*)",
  "Bash(devsh pause:*)",
  "Bash(devsh resume:*)",
  "Bash(cloudrouter start:*)",
  "Bash(cloudrouter delete:*)",
  "Bash(cloudrouter stop:*)",
  // Infrastructure — snapshot rebuilds affect all future sandboxes
  "Bash(gh workflow run:*)",
];

export async function getClaudeEnvironment(
  ctx: EnvironmentContext,
): Promise<EnvironmentResult> {
  // These must be lazy since configs are imported into the browser
  // const { exec } = await import("node:child_process");
  // const { promisify } = await import("node:util");
  const { Buffer } = await import("node:buffer");
  // const execAsync = promisify(exec);

  // useHostConfig is safe for desktop/Electron apps where the host IS the user's machine.
  // For server deployments, this should be false to prevent credential leakage.
  const useHostConfig = ctx.useHostConfig ?? false;

  let hostConfigText: string | undefined;
  if (useHostConfig) {
    const { readFile } = await import("node:fs/promises");

    try {
      const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? "";
      hostConfigText = await readFile(`${homeDir}/.claude.json`, "utf-8");
    } catch {
      hostConfigText = undefined;
    }
  }

  const files: EnvironmentResult["files"] = [];
  const env: Record<string, string> = {};
  const startupCommands: string[] = [];
  const effortLevel = resolveClaudeEffortLevel(
    ctx.agentName,
    ctx.selectedVariant,
  );
  const claudeLifecycleDir = "/root/lifecycle/claude";
  const claudeSecretsDir = `${claudeLifecycleDir}/secrets`;
  const claudeApiKeyHelperPath = `${claudeSecretsDir}/anthropic_key_helper.sh`;
  // Prepare .claude.json
  // Merge user custom config with host config (user config from Convex takes precedence)
  try {
    // Parse user config if provided
    let userConfig: Record<string, unknown> = {};
    if (ctx.agentConfigs?.claude) {
      try {
        userConfig = JSON.parse(ctx.agentConfigs.claude) as Record<
          string,
          unknown
        >;
      } catch {
        console.warn("Failed to parse user Claude config, ignoring");
      }
    }

    // Build base config from host + MCP servers
    // Pass orchestration env vars for MCP server passthrough (spawn_agent needs JWT)
    const baseConfig = buildMergedClaudeConfig({
      hostConfigText,
      mcpServerConfigs: ctx.mcpServerConfigs ?? [],
      agentName: ctx.agentName,
      orchestrationEnv: ctx.isOrchestrationHead
        ? {
            CMUX_TASK_RUN_JWT: ctx.taskRunJwt,
            CMUX_SERVER_URL: ctx.orchestrationEnv?.CMUX_SERVER_URL,
            CMUX_API_BASE_URL: ctx.orchestrationEnv?.CMUX_API_BASE_URL,
            CMUX_IS_ORCHESTRATION_HEAD: "1",
            CMUX_ORCHESTRATION_ID: ctx.orchestrationOptions?.orchestrationId,
            CMUX_CALLBACK_URL: ctx.orchestrationEnv?.CMUX_CALLBACK_URL,
          }
        : undefined,
    });

    // Deep merge user config (user config takes precedence)
    const config = {
      ...baseConfig,
      ...userConfig,
      // Preserve mcpServers from base config and merge with user config
      mcpServers: {
        ...((baseConfig.mcpServers as Record<string, unknown>) ?? {}),
        ...((userConfig.mcpServers as Record<string, unknown>) ?? {}),
      },
      // cmux-managed workspace trust (always override)
      projects: {
        "/root/workspace": {
          allowedTools: [],
          history: [],
          mcpContextUris: [],
          mcpServers: {},
          enabledMcpjsonServers: [],
          disabledMcpjsonServers: [],
          hasTrustDialogAccepted: true,
          projectOnboardingSeenCount: 0,
          hasClaudeMdExternalIncludesApproved: false,
          hasClaudeMdExternalIncludesWarningShown: false,
        },
      },
      isQualifiedForDataSharing: false,
      hasCompletedOnboarding: true,
      bypassPermissionsModeAccepted: true,
      hasAcknowledgedCostThreshold: true,
    };

    files.push({
      destinationPath: "$HOME/.claude.json",
      contentBase64: Buffer.from(JSON.stringify(config, null, 2)).toString(
        "base64",
      ),
      mode: "644",
    });
  } catch (error) {
    console.warn("Failed to prepare .claude.json:", error);
  }

  // // Try to get credentials and prepare .credentials.json
  // let credentialsAdded = false;
  // try {
  //   // First try Claude Code-credentials (preferred)
  //   const execResult = await execAsync(
  //     "security find-generic-password -a $USER -w -s 'Claude Code-credentials'",
  //   );
  //   const credentialsText = execResult.stdout.trim();

  //   // Validate that it's valid JSON with claudeAiOauth
  //   const credentials = JSON.parse(credentialsText);
  //   if (credentials.claudeAiOauth) {
  //     files.push({
  //       destinationPath: "$HOME/.claude/.credentials.json",
  //       contentBase64: Buffer.from(credentialsText).toString("base64"),
  //       mode: "600",
  //     });
  //     credentialsAdded = true;
  //   }
  // } catch {
  //   // noop
  // }

  // // If no credentials file was created, try to use API key via helper script (avoid env var to prevent prompts)
  // if (!credentialsAdded) {
  //   try {
  //     const execResult = await execAsync(
  //       "security find-generic-password -a $USER -w -s 'Claude Code'",
  //     );
  //     const apiKey = execResult.stdout.trim();

  //     // Write the key to a persistent location with strict perms
  //     files.push({
  //       destinationPath: claudeApiKeyPath,
  //       contentBase64: Buffer.from(apiKey).toString("base64"),
  //       mode: "600",
  //     });
  //     credentialsAdded = true;
  //   } catch {
  //     console.warn("No Claude API key found in keychain");
  //   }
  // }

  // Ensure directories exist
  startupCommands.unshift("mkdir -p ~/.claude");
  startupCommands.push(`mkdir -p ${claudeLifecycleDir}`);
  startupCommands.push(`mkdir -p ${claudeSecretsDir}`);

  // Clean up any previous Claude completion markers
  // This should run before the agent starts to ensure clean state
  startupCommands.push(
    "rm -f /root/lifecycle/claude-complete-* 2>/dev/null || true",
  );

  // Create the stop hook script in /root/lifecycle (outside git repo)
  const stopHookScript = `#!/bin/bash
# Claude Code stop hook for cmux task completion detection
# This script is called when Claude Code finishes responding

LOG_FILE="/root/lifecycle/claude-hook.log"

echo "[CMUX Stop Hook] Script started at $(date)" >> "$LOG_FILE"
echo "[CMUX Stop Hook] CMUX_TASK_RUN_ID=\${CMUX_TASK_RUN_ID}" >> "$LOG_FILE"
echo "[CMUX Stop Hook] CMUX_CALLBACK_URL=\${CMUX_CALLBACK_URL}" >> "$LOG_FILE"

if [ -n "\${CMUX_TASK_RUN_JWT}" ] && [ -n "\${CMUX_TASK_RUN_ID}" ] && [ -n "\${CMUX_CALLBACK_URL}" ]; then
  (
    # Sync memory files to Convex (best-effort, before completion callbacks)
    echo "[CMUX Stop Hook] Syncing memory files..." >> "$LOG_FILE"
    /root/lifecycle/memory/sync.sh >> "$LOG_FILE" 2>&1 || true

    # Call crown/complete for status updates
    echo "[CMUX Stop Hook] Calling crown/complete..." >> "$LOG_FILE"
    curl -s -X POST "\${CMUX_CALLBACK_URL}/api/crown/complete" \\
      -H "Content-Type: application/json" \\
      -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
      -d "{\\"taskRunId\\": \\"\${CMUX_TASK_RUN_ID}\\", \\"exitCode\\": 0}" \\
      >> "$LOG_FILE" 2>&1
    echo "" >> "$LOG_FILE"

    # Call notifications endpoint for user notification
    echo "[CMUX Stop Hook] Calling notifications/agent-stopped..." >> "$LOG_FILE"
    curl -s -X POST "\${CMUX_CALLBACK_URL}/api/notifications/agent-stopped" \\
      -H "Content-Type: application/json" \\
      -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
      -d "{\\"taskRunId\\": \\"\${CMUX_TASK_RUN_ID}\\"}" \\
      >> "$LOG_FILE" 2>&1
    echo "" >> "$LOG_FILE"
    # Post "agent stopped" activity event for dashboard timeline
    curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
      -H "Content-Type: application/json" \\
      -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
      -d "{\\"taskRunId\\": \\"\${CMUX_TASK_RUN_ID}\\", \\"type\\": \\"tool_call\\", \\"toolName\\": \\"Stop\\", \\"summary\\": \\"Agent stopped\\"}" \\
      >> "$LOG_FILE" 2>&1 || true

    echo "[CMUX Stop Hook] API calls completed at $(date)" >> "$LOG_FILE"
  ) &
else
  echo "[CMUX Stop Hook] Missing required env vars, skipping API calls" >> "$LOG_FILE"
fi

# Write completion marker for backward compatibility
if [ -n "\${CMUX_TASK_RUN_ID}" ]; then
  COMPLETE_MARKER="/root/lifecycle/claude-complete-\${CMUX_TASK_RUN_ID}"
  echo "[CMUX Stop Hook] Creating completion marker at \${COMPLETE_MARKER}" >> "$LOG_FILE"
  mkdir -p "$(dirname "$COMPLETE_MARKER")"
  touch "$COMPLETE_MARKER"
fi

# Also log to stderr for visibility
echo "[CMUX Stop Hook] Task completed for task run ID: \${CMUX_TASK_RUN_ID:-unknown}" >&2

# Always allow Claude to stop (don't block)
exit 0`;

  // Add stop hook script to files array (like Codex does) to ensure it's created before git init
  files.push({
    destinationPath: `${claudeLifecycleDir}/stop-hook.sh`,
    contentBase64: Buffer.from(stopHookScript).toString("base64"),
    mode: "755",
  });

  // Plan hook script - captures ExitPlanMode and syncs to GitHub Projects
  // Receives JSON on stdin with tool_input containing plan file path
  const planHookScript = `#!/bin/bash
# Claude Code plan hook - syncs plans to GitHub Projects
# This script is called when ExitPlanMode tool is used

LOG_FILE="/root/lifecycle/claude-hook.log"
INPUT=$(cat)

echo "[CMUX Plan Hook] Script started at $(date)" >> "$LOG_FILE"
echo "[CMUX Plan Hook] Input: $INPUT" >> "$LOG_FILE"

# Only sync if we have the required env vars and a linked project
if [ -z "\${CMUX_TASK_RUN_JWT}" ] || [ -z "\${CMUX_CALLBACK_URL}" ]; then
  echo "[CMUX Plan Hook] Missing env vars, skipping sync" >> "$LOG_FILE"
  exit 0
fi

# Extract plan file path from tool_input (if available)
# ExitPlanMode doesn't pass the plan file path directly, so we look for plan files
PLAN_DIR="/root/.claude/plans"
if [ ! -d "$PLAN_DIR" ]; then
  echo "[CMUX Plan Hook] No plans directory found" >> "$LOG_FILE"
  exit 0
fi

# Find the most recently modified plan file
PLAN_FILE=$(ls -t "$PLAN_DIR"/*.md 2>/dev/null | head -1)
if [ -z "$PLAN_FILE" ] || [ ! -f "$PLAN_FILE" ]; then
  echo "[CMUX Plan Hook] No plan files found" >> "$LOG_FILE"
  exit 0
fi

echo "[CMUX Plan Hook] Found plan file: $PLAN_FILE" >> "$LOG_FILE"

# Read plan content
PLAN_CONTENT=$(cat "$PLAN_FILE" | head -c 50000)  # Limit to 50KB

# Send to plan sync endpoint (best-effort, non-blocking)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/integrations/github-projects/plan-sync" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$(jq -n --arg content "$PLAN_CONTENT" --arg file "$PLAN_FILE" '{planContent: $content, planFile: $file}')" \\
    >> "$LOG_FILE" 2>&1 || true
  echo "[CMUX Plan Hook] Sync request sent" >> "$LOG_FILE"
) &

exit 0`;

  files.push({
    destinationPath: `${claudeLifecycleDir}/plan-hook.sh`,
    contentBase64: Buffer.from(planHookScript).toString("base64"),
    mode: "755",
  });

  // Activity hook script - reports agent tool-use events to cmux dashboard
  const activityHookScript = `#!/bin/bash
# Claude Code activity hook - posts tool-use events for real-time dashboard
# Runs after every matched tool call. Non-blocking (background POST).
set -eu
EVENT=$(cat)
TOOL_NAME=$(echo "$EVENT" | jq -r '.tool_use.name // "unknown"')

if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ] || [ -z "\${CMUX_TASK_RUN_ID:-}" ]; then
  exit 0
fi

# Map tool names to activity types
case "$TOOL_NAME" in
  Edit|Write|NotebookEdit) TYPE="file_edit" ;;
  Read)                     TYPE="file_read" ;;
  Bash)                     TYPE="bash_command" ;;
  Grep|Glob)                TYPE="file_read" ;;
  Agent)                    TYPE="tool_call" ;;
  *)                        TYPE="tool_call" ;;
esac

# Build human-readable summary from tool input
case "$TOOL_NAME" in
  Edit)  SUMMARY="Edit $(echo "$EVENT" | jq -r '.tool_use.input.file_path // ""' | sed 's|.*/||')" ;;
  Read)  SUMMARY="Read $(echo "$EVENT" | jq -r '.tool_use.input.file_path // ""' | sed 's|.*/||')" ;;
  Write) SUMMARY="Write $(echo "$EVENT" | jq -r '.tool_use.input.file_path // ""' | sed 's|.*/||')" ;;
  Bash)  SUMMARY="Run: $(echo "$EVENT" | jq -r '.tool_use.input.command // ""' | head -c 80)" ;;
  Grep)  SUMMARY="Search: $(echo "$EVENT" | jq -r '.tool_use.input.pattern // ""' | head -c 60)" ;;
  Glob)  SUMMARY="Find: $(echo "$EVENT" | jq -r '.tool_use.input.pattern // ""' | head -c 60)" ;;
  Agent) SUMMARY="Agent: $(echo "$EVENT" | jq -r '.tool_use.input.description // ""' | head -c 60)" ;;
  *)     SUMMARY="$TOOL_NAME" ;;
esac

# Non-blocking POST
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID}" \\
      --arg type "$TYPE" \\
      --arg tool "$TOOL_NAME" \\
      --arg summary "$SUMMARY" \\
      '{taskRunId: $trid, type: $type, toolName: $tool, summary: $summary}')" \\
    >> /root/lifecycle/activity-hook.log 2>&1 || true
) &
exit 0`;

  files.push({
    destinationPath: `${claudeLifecycleDir}/activity-hook.sh`,
    contentBase64: Buffer.from(activityHookScript).toString("base64"),
    mode: "755",
  });

  // Error hook script - reports StopFailure events (API errors, rate limits) to dashboard
  const errorHookScript = `#!/bin/bash
# Claude Code error hook - surfaces agent failures in cmux dashboard
# Fires on StopFailure: rate limit, auth failure, API error, etc.
set -eu
EVENT=$(cat)

if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ] || [ -z "\${CMUX_TASK_RUN_ID:-}" ]; then
  exit 0
fi

ERROR_MSG=$(echo "$EVENT" | jq -r '.error // "Agent stopped due to an error"' | head -c 300)

(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID}" \\
      --arg summary "Error: $ERROR_MSG" \\
      '{taskRunId: $trid, type: "error", summary: $summary}')" \\
    >> /root/lifecycle/activity-hook.log 2>&1 || true
) &
exit 0`;

  files.push({
    destinationPath: `${claudeLifecycleDir}/error-hook.sh`,
    contentBase64: Buffer.from(errorHookScript).toString("base64"),
    mode: "755",
  });

  // Permission hook script - bridges Claude permission requests to cmux approval broker
  // This enables human-in-the-loop approval via the cmux dashboard
  const permissionHookScript = `#!/bin/bash
# Claude Code permission hook - bridges to cmux approval broker
# Fires on PermissionRequest: before showing permission dialog
set -eu
REQUEST=$(cat)

if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ] || [ -z "\${CMUX_TASK_RUN_ID:-}" ]; then
  # No cmux context - fall through to default permission dialog
  exit 1
fi

TOOL_NAME=$(echo "$REQUEST" | jq -r '.tool_name // "unknown"')
TOOL_INPUT=$(echo "$REQUEST" | jq -r '.tool_input | tostring' | head -c 500)
PERMISSION_MODE=$(echo "$REQUEST" | jq -r '.permission_mode // "default"')

# Only intercept in default/plan modes - bypass modes should not trigger approvals
if [ "$PERMISSION_MODE" != "default" ] && [ "$PERMISSION_MODE" != "plan" ]; then
  exit 1
fi

# Risk classification function - mirrors approval-risk-classifier.ts
classify_risk() {
  local tool="$1"
  local input="$2"
  local is_head="\${CMUX_IS_ORCHESTRATION_HEAD:-}"

  # Low-risk tools
  case "$tool" in
    Read|Glob|Grep|LS|ListDir|Search|Find)
      echo "low"
      return
      ;;
    WebFetch|WebSearch)
      echo "high"
      return
      ;;
    Write|Edit|NotebookEdit)
      echo "medium"
      return
      ;;
  esac

  # For Bash/Shell, check patterns
  if [ "$tool" = "Bash" ] || [ "$tool" = "Shell" ] || [ "$tool" = "Execute" ]; then
    # High-risk patterns (always high, even for head agents)
    if echo "$input" | grep -qE 'git\\s+push\\s+(-f|--force)'; then echo "high"; return; fi
    if echo "$input" | grep -qE 'git\\s+reset\\s+--hard'; then echo "high"; return; fi
    if echo "$input" | grep -qE 'rm\\s+(-rf|--recursive)'; then echo "high"; return; fi
    if echo "$input" | grep -qE 'rm\\s+-[^r]*f'; then echo "high"; return; fi
    if echo "$input" | grep -qE 'sudo\\s'; then echo "high"; return; fi
    if echo "$input" | grep -qiE 'DROP\\s+(TABLE|DATABASE)'; then echo "high"; return; fi
    if echo "$input" | grep -qiE 'TRUNCATE\\s+TABLE'; then echo "high"; return; fi

    # Head-agent-managed operations (medium for head, high otherwise)
    if echo "$input" | grep -qE 'gh\\s+pr\\s+(create|merge|close)'; then
      [ -n "$is_head" ] && echo "medium" || echo "high"
      return
    fi
    if echo "$input" | grep -qE 'gh\\s+workflow\\s+run'; then
      [ -n "$is_head" ] && echo "medium" || echo "high"
      return
    fi
    if echo "$input" | grep -qE 'devsh\\s+(start|delete|pause|resume)'; then
      [ -n "$is_head" ] && echo "medium" || echo "high"
      return
    fi
    if echo "$input" | grep -qE 'cloudrouter\\s+(start|delete|stop)'; then
      [ -n "$is_head" ] && echo "medium" || echo "high"
      return
    fi

    # Low-risk read operations
    if echo "$input" | grep -qE '^(cat|head|tail|less|more)\\s'; then echo "low"; return; fi
    if echo "$input" | grep -qE '^ls\\s'; then echo "low"; return; fi
    if echo "$input" | grep -qE '^(grep|rg|ag)\\s'; then echo "low"; return; fi
    if echo "$input" | grep -qE '^git\\s+(status|log|diff|show|branch|tag)(\\s|\$)'; then echo "low"; return; fi
    if echo "$input" | grep -qE '^gh\\s+(pr|issue)\\s+(list|view|status)'; then echo "low"; return; fi
    if echo "$input" | grep -qE '^(npm|yarn|pnpm|bun)\\s+(list|ls|outdated|audit)'; then echo "low"; return; fi
  fi

  # Default to medium
  echo "medium"
}

RISK_LEVEL=$(classify_risk "$TOOL_NAME" "$TOOL_INPUT")

# Create approval request
RESPONSE=$(curl -s -X POST "\${CMUX_CALLBACK_URL}/api/approvals/create" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer \${CMUX_TASK_RUN_JWT}" \\
  -d "$(jq -n \\
    --arg action "Permission: $TOOL_NAME" \\
    --arg tool "$TOOL_NAME" \\
    --arg input "$TOOL_INPUT" \\
    --arg risk "$RISK_LEVEL" \\
    '{
      source: "tool_use",
      approvalType: "tool_permission",
      action: $action,
      context: {
        agentName: "claude",
        command: $input,
        toolName: $tool,
        riskLevel: $risk
      }
    }')" 2>/dev/null)

REQUEST_ID=$(echo "$RESPONSE" | jq -r '.requestId // empty')

if [ -z "$REQUEST_ID" ]; then
  # Failed to create approval - fall through to default dialog
  echo "[permission-hook] Failed to create approval: $RESPONSE" >> /root/lifecycle/permission-hook.log 2>&1
  exit 1
fi

echo "[permission-hook] Created approval $REQUEST_ID for $TOOL_NAME" >> /root/lifecycle/permission-hook.log 2>&1

# Poll for resolution (timeout 5 minutes = 60 * 5 seconds)
for i in {1..60}; do
  RESULT=$(curl -s "\${CMUX_CALLBACK_URL}/api/approvals/$REQUEST_ID" \\
    -H "Authorization: Bearer \${CMUX_TASK_RUN_JWT}" 2>/dev/null)
  STATUS=$(echo "$RESULT" | jq -r '.status // "pending"')
  RESOLUTION=$(echo "$RESULT" | jq -r '.resolution // empty')

  if [ "$STATUS" = "resolved" ]; then
    echo "[permission-hook] Approval $REQUEST_ID resolved: $RESOLUTION" >> /root/lifecycle/permission-hook.log 2>&1

    # Map resolution to Claude decision
    case "$RESOLUTION" in
      allow|allow_once|allow_session)
        echo "{\\\"hookSpecificOutput\\\": {\\\"hookEventName\\\": \\\"PermissionRequest\\\", \\\"decision\\\": {\\\"behavior\\\": \\\"allow\\\"}}}"
        exit 0
        ;;
      deny|deny_always)
        NOTE=$(echo "$RESULT" | jq -r '.resolutionNote // "Denied by cmux approval broker"')
        echo "{\\\"hookSpecificOutput\\\": {\\\"hookEventName\\\": \\\"PermissionRequest\\\", \\\"decision\\\": {\\\"behavior\\\": \\\"deny\\\", \\\"message\\\": \\\"$NOTE\\\"}}}"
        exit 0
        ;;
    esac
  elif [ "$STATUS" = "expired" ]; then
    echo "[permission-hook] Approval $REQUEST_ID expired" >> /root/lifecycle/permission-hook.log 2>&1
    echo "{\\\"hookSpecificOutput\\\": {\\\"hookEventName\\\": \\\"PermissionRequest\\\", \\\"decision\\\": {\\\"behavior\\\": \\\"deny\\\", \\\"message\\\": \\\"Approval request expired\\\"}}}"
    exit 0
  fi

  sleep 5
done

# Timeout - default deny
echo "[permission-hook] Approval $REQUEST_ID timed out" >> /root/lifecycle/permission-hook.log 2>&1
echo "{\\\"hookSpecificOutput\\\": {\\\"hookEventName\\\": \\\"PermissionRequest\\\", \\\"decision\\\": {\\\"behavior\\\": \\\"deny\\\", \\\"message\\\": \\\"Approval timeout (5 minutes)\\\"}}}"
exit 0`;

  files.push({
    destinationPath: `${claudeLifecycleDir}/permission-hook.sh`,
    contentBase64: Buffer.from(permissionHookScript).toString("base64"),
    mode: "755",
  });

  // PreCompact hook script - syncs memory to Convex before context compression
  // This ensures memory state is persisted before the context window gets summarized
  const preCompactHookScript = `#!/bin/bash
# Claude Code pre-compact hook - syncs memory before context compression
# Fires on PreCompact: before context window gets compressed/summarized
set -eu
REQUEST=$(cat)

if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ] || [ -z "\${CMUX_TASK_RUN_ID:-}" ]; then
  # No cmux context - allow compaction to proceed
  echo '{"continue": true}'
  exit 0
fi

TRIGGER=$(echo "$REQUEST" | jq -r '.trigger // "auto"')
SESSION_ID=$(echo "$REQUEST" | jq -r '.session_id // empty')

echo "[precompact-hook] Trigger: $TRIGGER, Session: $SESSION_ID" >> /root/lifecycle/precompact-hook.log 2>&1

# Sync memory to Convex before compaction (background, don't block)
(
  # Read current memory state
  MEMORY_CONTENT=""
  if [ -f "/root/lifecycle/memory/knowledge/MEMORY.md" ]; then
    MEMORY_CONTENT=$(cat /root/lifecycle/memory/knowledge/MEMORY.md | head -c 50000 | base64 -w 0)
  fi

  TASKS_CONTENT=""
  if [ -f "/root/lifecycle/memory/TASKS.json" ]; then
    TASKS_CONTENT=$(cat /root/lifecycle/memory/TASKS.json | head -c 20000 | base64 -w 0)
  fi

  # Post to memory sync endpoint
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/memory/sync" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID}" \\
      --arg trigger "$TRIGGER" \\
      --arg memory "$MEMORY_CONTENT" \\
      --arg tasks "$TASKS_CONTENT" \\
      '{taskRunId: $trid, trigger: $trigger, memoryBase64: $memory, tasksBase64: $tasks}')" \\
    >> /root/lifecycle/precompact-hook.log 2>&1 || true

  # Also post a context_warning activity event
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID}" \\
      --arg trigger "$TRIGGER" \\
      '{taskRunId: $trid, type: "context_warning", summary: ("Context compaction triggered: " + $trigger)}')" \\
    >> /root/lifecycle/precompact-hook.log 2>&1 || true
) &

# Allow compaction to proceed
echo '{"continue": true}'
exit 0`;

  files.push({
    destinationPath: `${claudeLifecycleDir}/precompact-hook.sh`,
    contentBase64: Buffer.from(preCompactHookScript).toString("base64"),
    mode: "755",
  });

  // SubagentStart hook script - tracks when Claude spawns sub-agents
  const subagentStartHookScript = `#!/bin/bash
# Claude Code subagent-start hook - tracks sub-agent spawning in cmux dashboard
# Fires on SubagentStart: when a subagent is spawned via Agent tool
set -eu
REQUEST=$(cat)

if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ] || [ -z "\${CMUX_TASK_RUN_ID:-}" ]; then
  exit 0
fi

AGENT_ID=$(echo "$REQUEST" | jq -r '.agent_id // "unknown"')
AGENT_TYPE=$(echo "$REQUEST" | jq -r '.agent_type // "unknown"')

echo "[subagent-start] Agent $AGENT_ID ($AGENT_TYPE) spawned" >> /root/lifecycle/subagent-hook.log 2>&1

# Post activity event to dashboard (background, don't block)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID}" \\
      --arg agentId "$AGENT_ID" \\
      --arg agentType "$AGENT_TYPE" \\
      '{taskRunId: $trid, type: "subagent_start", toolName: "Agent", summary: ("Spawned " + $agentType + " subagent: " + $agentId)}')" \\
    >> /root/lifecycle/subagent-hook.log 2>&1 || true
) &
exit 0`;

  files.push({
    destinationPath: `${claudeLifecycleDir}/subagent-start-hook.sh`,
    contentBase64: Buffer.from(subagentStartHookScript).toString("base64"),
    mode: "755",
  });

  // SubagentStop hook script - tracks when Claude sub-agents complete
  const subagentStopHookScript = `#!/bin/bash
# Claude Code subagent-stop hook - tracks sub-agent completion in cmux dashboard
# Fires on SubagentStop: when a subagent finishes responding
set -eu
REQUEST=$(cat)

if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ] || [ -z "\${CMUX_TASK_RUN_ID:-}" ]; then
  exit 0
fi

AGENT_ID=$(echo "$REQUEST" | jq -r '.agent_id // "unknown"')
AGENT_TYPE=$(echo "$REQUEST" | jq -r '.agent_type // "unknown"')
LAST_MESSAGE=$(echo "$REQUEST" | jq -r '.last_assistant_message // ""' | head -c 200)

echo "[subagent-stop] Agent $AGENT_ID ($AGENT_TYPE) completed" >> /root/lifecycle/subagent-hook.log 2>&1

# Post activity event to dashboard (background, don't block)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID}" \\
      --arg agentId "$AGENT_ID" \\
      --arg agentType "$AGENT_TYPE" \\
      --arg summary "$LAST_MESSAGE" \\
      '{taskRunId: $trid, type: "subagent_stop", toolName: "Agent", summary: ($agentType + " subagent completed: " + ($summary | if length > 100 then (.[0:100] + "...") else . end))}')" \\
    >> /root/lifecycle/subagent-hook.log 2>&1 || true
) &
exit 0`;

  files.push({
    destinationPath: `${claudeLifecycleDir}/subagent-stop-hook.sh`,
    contentBase64: Buffer.from(subagentStopHookScript).toString("base64"),
    mode: "755",
  });

  // UserPromptSubmit hook script - tracks when user submits prompts
  // Useful for session activity monitoring and interaction tracking
  const userPromptSubmitHookScript = `#!/bin/bash
# Claude Code user-prompt-submit hook - tracks user prompt submissions
# Fires on UserPromptSubmit: when user submits a prompt, before Claude processes it
set -eu
REQUEST=$(cat)

if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ] || [ -z "\${CMUX_TASK_RUN_ID:-}" ]; then
  exit 0
fi

PROMPT=$(echo "$REQUEST" | jq -r '.prompt // ""' | head -c 200)
SESSION_ID=$(echo "$REQUEST" | jq -r '.session_id // ""')

# Only log non-empty prompts
if [ -z "$PROMPT" ]; then
  exit 0
fi

echo "[user-prompt] Session $SESSION_ID: $PROMPT" >> /root/lifecycle/prompt-hook.log 2>&1

# Post activity event to dashboard (background, don't block prompt processing)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID}" \\
      --arg prompt "$PROMPT" \\
      '{taskRunId: $trid, type: "user_prompt", summary: ("User: " + ($prompt | if length > 100 then (.[0:100] + "...") else . end))}')" \\
    >> /root/lifecycle/prompt-hook.log 2>&1 || true
) &
exit 0`;

  files.push({
    destinationPath: `${claudeLifecycleDir}/user-prompt-hook.sh`,
    contentBase64: Buffer.from(userPromptSubmitHookScript).toString("base64"),
    mode: "755",
  });

  // Notification hook script - fires when Claude needs user attention
  // Useful for surfacing permission prompts and idle states to dashboard
  const notificationHookScript = `#!/bin/bash
# Claude Code notification hook - surfaces attention requests to dashboard
# Fires on Notification: when Claude needs user attention (permission prompt, idle, etc.)
set -eu
REQUEST=$(cat)

if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ] || [ -z "\${CMUX_TASK_RUN_ID:-}" ]; then
  exit 0
fi

NOTIFICATION_TYPE=$(echo "$REQUEST" | jq -r '.notification_type // "unknown"')
MESSAGE=$(echo "$REQUEST" | jq -r '.message // ""' | head -c 200)

echo "[notification] Type: $NOTIFICATION_TYPE - $MESSAGE" >> /root/lifecycle/notification-hook.log 2>&1

# Post activity event to dashboard (background, don't block)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID}" \\
      --arg notifType "$NOTIFICATION_TYPE" \\
      --arg msg "$MESSAGE" \\
      '{taskRunId: $trid, type: "notification", summary: ($notifType + ": " + ($msg | if length > 100 then (.[0:100] + "...") else . end))}')" \\
    >> /root/lifecycle/notification-hook.log 2>&1 || true
) &
exit 0`;

  files.push({
    destinationPath: `${claudeLifecycleDir}/notification-hook.sh`,
    contentBase64: Buffer.from(notificationHookScript).toString("base64"),
    mode: "755",
  });

  // PostCompact hook script - fires after context compression completes
  // Can re-inject critical context and log compaction events
  const postCompactHookScript = `#!/bin/bash
# Claude Code post-compact hook - fires after context compression
# Useful for re-injecting critical context and logging compaction events
set -eu
REQUEST=$(cat)

if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ] || [ -z "\${CMUX_TASK_RUN_ID:-}" ]; then
  exit 0
fi

TRIGGER=$(echo "$REQUEST" | jq -r '.trigger // "auto"')
SUMMARY=$(echo "$REQUEST" | jq -r '.summary // ""' | head -c 300)

echo "[postcompact] Trigger: $TRIGGER, Summary length: \${#SUMMARY}" >> /root/lifecycle/postcompact-hook.log 2>&1

# Post activity event to dashboard (background)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID}" \\
      --arg trigger "$TRIGGER" \\
      '{taskRunId: $trid, type: "context_compacted", summary: ("Context compacted (" + $trigger + ")")}')" \\
    >> /root/lifecycle/postcompact-hook.log 2>&1 || true
) &

# Re-inject critical task context after compaction
# This ensures agent remembers its core mission even after context is summarized
TASK_CONTEXT=""
if [ -f "/root/lifecycle/memory/knowledge/MEMORY.md" ]; then
  # Extract P0 (Core) entries - most critical to preserve
  TASK_CONTEXT=$(grep -A 50 "## P0 Core" /root/lifecycle/memory/knowledge/MEMORY.md 2>/dev/null | head -20 || true)
fi

if [ -n "$TASK_CONTEXT" ]; then
  echo "Critical context from MEMORY.md (P0 Core):"
  echo "$TASK_CONTEXT"
fi

exit 0`;

  files.push({
    destinationPath: `${claudeLifecycleDir}/postcompact-hook.sh`,
    contentBase64: Buffer.from(postCompactHookScript).toString("base64"),
    mode: "755",
  });

  // Simplify skill tracking hook - detects when /simplify is used
  // Marks the task run as having passed /simplify when the skill completes
  const simplifyTrackHookScript = `#!/bin/bash
# Claude Code /simplify tracking hook - marks task run when simplify skill completes
# Fires on PostToolUse for Skill tool, checks if it's /simplify
set -eu
REQUEST=$(cat)

if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ] || [ -z "\${CMUX_TASK_RUN_ID:-}" ]; then
  exit 0
fi

# Extract skill name from tool input
SKILL_NAME=$(echo "$REQUEST" | jq -r '.tool_input.skill // .tool_use.input.skill // empty')

echo "[simplify-track] Skill used: $SKILL_NAME" >> /root/lifecycle/simplify-hook.log 2>&1

# Check if this is the simplify skill (with or without arguments)
if [[ "$SKILL_NAME" == "simplify" ]] || [[ "$SKILL_NAME" == "simplify "* ]]; then
  echo "[simplify-track] /simplify detected, marking as passed..." >> /root/lifecycle/simplify-hook.log 2>&1

  # Extract mode from arguments if present (--quick, --staged-only, or default to "full")
  MODE="full"
  if [[ "$SKILL_NAME" == *"--quick"* ]]; then
    MODE="quick"
  elif [[ "$SKILL_NAME" == *"--staged-only"* ]]; then
    MODE="staged-only"
  fi

  # Call the mark-passed endpoint
  (
    RESPONSE=$(curl -s -X POST "\${CMUX_CALLBACK_URL}/api/v1/cmux/orchestration/simplify/mark-passed" \\
      -H "Content-Type: application/json" \\
      -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
      -d "{\\"mode\\": \\"$MODE\\"}" 2>&1)
    echo "[simplify-track] API response: $RESPONSE" >> /root/lifecycle/simplify-hook.log 2>&1

    # Also post activity event
    curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
      -H "Content-Type: application/json" \\
      -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
      -d "$(jq -n \\
        --arg trid "\${CMUX_TASK_RUN_ID}" \\
        --arg mode "$MODE" \\
        '{taskRunId: $trid, type: "simplify_passed", summary: ("/simplify (" + $mode + ") completed")}')" \\
      >> /root/lifecycle/simplify-hook.log 2>&1 || true
  ) &
fi

exit 0`;

  files.push({
    destinationPath: `${claudeLifecycleDir}/simplify-track-hook.sh`,
    contentBase64: Buffer.from(simplifyTrackHookScript).toString("base64"),
    mode: "755",
  });

  // Simplify gate hook - blocks agent stop if /simplify required but not passed
  // Only runs when CMUX_REQUIRE_SIMPLIFY=1 is set
  const simplifyGateHookScript = `#!/bin/bash
# Claude Code /simplify gate hook - enforces pre-merge requirement
# Exit code 2 = block agent from stopping, stderr = message to user
set -eu

LOG_FILE="/root/lifecycle/simplify-gate.log"
echo "[simplify-gate] Checking simplify requirement at $(date)" >> "$LOG_FILE"

# Skip if requirement not enabled
if [ "\${CMUX_REQUIRE_SIMPLIFY:-0}" != "1" ]; then
  echo "[simplify-gate] Requirement not enabled, allowing stop" >> "$LOG_FILE"
  exit 0
fi

# Skip if missing env vars
if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ]; then
  echo "[simplify-gate] Missing env vars, allowing stop" >> "$LOG_FILE"
  exit 0
fi

# Check simplify status from API
RESPONSE=$(curl -s "\${CMUX_CALLBACK_URL}/api/v1/cmux/orchestration/simplify/status" \\
  -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" 2>&1)

echo "[simplify-gate] API response: $RESPONSE" >> "$LOG_FILE"

# Parse response
REQUIRED=$(echo "$RESPONSE" | jq -r '.required // false')
PASSED=$(echo "$RESPONSE" | jq -r '.passed // false')
SKIPPED_REASON=$(echo "$RESPONSE" | jq -r '.skippedReason // empty')

echo "[simplify-gate] Required: $REQUIRED, Passed: $PASSED, Skipped: $SKIPPED_REASON" >> "$LOG_FILE"

# If not required or already passed/skipped, allow stop
if [ "$REQUIRED" != "true" ] || [ "$PASSED" == "true" ] || [ -n "$SKIPPED_REASON" ]; then
  echo "[simplify-gate] Requirement satisfied, allowing stop" >> "$LOG_FILE"
  exit 0
fi

# Block the stop - /simplify is required but hasn't been run
echo "[simplify-gate] BLOCKING: /simplify required but not run" >> "$LOG_FILE"

# Emit stop_blocked event to dashboard (background, non-blocking)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID:-}" \\
      '{taskRunId: $trid, type: "stop_blocked", toolName: "claude", summary: "Stop blocked: /simplify required but not run", blockedBy: "simplify_gate"}')" \\
    >> "$LOG_FILE" 2>&1 || true
) &

echo "BLOCKED: Your team requires /simplify to run before task completion." >&2
echo "Please run /simplify (or /simplify --quick) before stopping." >&2
echo "To skip this requirement, ask your team admin to disable it in settings." >&2
exit 2`;

  files.push({
    destinationPath: `${claudeLifecycleDir}/simplify-gate-hook.sh`,
    contentBase64: Buffer.from(simplifyGateHookScript).toString("base64"),
    mode: "755",
  });

  // TaskCreated hook script - tracks when tasks are created via TaskCreate tool
  // Useful for dashboard activity tracking and task registry sync
  // See: https://code.claude.com/docs/en/changelog (v2.1.84)
  const taskCreatedHookScript = `#!/bin/bash
# Claude Code task-created hook - tracks task creation in cmux dashboard
# Fires on TaskCreated: when a task is created via TaskCreate tool
set -eu
REQUEST=$(cat)

if [ -z "\${CMUX_TASK_RUN_JWT:-}" ] || [ -z "\${CMUX_CALLBACK_URL:-}" ] || [ -z "\${CMUX_TASK_RUN_ID:-}" ]; then
  exit 0
fi

TASK_ID=$(echo "$REQUEST" | jq -r '.task_id // "unknown"')
TASK_SUBJECT=$(echo "$REQUEST" | jq -r '.subject // ""' | head -c 100)
TASK_STATUS=$(echo "$REQUEST" | jq -r '.status // "pending"')

echo "[task-created] Task $TASK_ID created: $TASK_SUBJECT" >> /root/lifecycle/task-hook.log 2>&1

# Post activity event to dashboard (background, don't block)
(
  curl -s -X POST "\${CMUX_CALLBACK_URL}/api/task-run/activity" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$(jq -n \\
      --arg trid "\${CMUX_TASK_RUN_ID}" \\
      --arg taskId "$TASK_ID" \\
      --arg subject "$TASK_SUBJECT" \\
      --arg status "$TASK_STATUS" \\
      '{taskRunId: $trid, type: "task_created", toolName: "TaskCreate", summary: ("Created task: " + ($subject | if length > 60 then (.[0:60] + "...") else . end))}')" \\
    >> /root/lifecycle/task-hook.log 2>&1 || true
) &
exit 0`;

  files.push({
    destinationPath: `${claudeLifecycleDir}/task-created-hook.sh`,
    contentBase64: Buffer.from(taskCreatedHookScript).toString("base64"),
    mode: "755",
  });

  // Check if user has provided an OAuth token (preferred) or API key
  const hasOAuthToken =
    ctx.apiKeys?.CLAUDE_CODE_OAUTH_TOKEN &&
    ctx.apiKeys.CLAUDE_CODE_OAUTH_TOKEN.trim().length > 0;
  const hasAnthropicApiKey =
    ctx.apiKeys?.ANTHROPIC_API_KEY &&
    ctx.apiKeys.ANTHROPIC_API_KEY.trim().length > 0;
  const userCustomBaseUrl = ctx.apiKeys?.ANTHROPIC_BASE_URL?.trim();
  const bypassProxy = ctx.workspaceSettings?.bypassAnthropicProxy ?? false;
  const hasTaskRunJwt = ctx.taskRunJwt.trim().length > 0;

  // If OAuth token is provided, write it to /etc/claude-code/env
  // The wrapper scripts (claude and other launchers) source this file before running claude-code
  // This is necessary because CLAUDE_CODE_OAUTH_TOKEN must be set as an env var
  // BEFORE claude-code starts (it checks OAuth early, before loading settings.json)
  if (hasOAuthToken) {
    const oauthEnvContent = `CLAUDE_CODE_OAUTH_TOKEN=${ctx.apiKeys?.CLAUDE_CODE_OAUTH_TOKEN}\n`;
    files.push({
      destinationPath: "/etc/claude-code/env",
      contentBase64: Buffer.from(oauthEnvContent).toString("base64"),
      mode: "600", // Restrictive permissions for the token
    });
  }

  // Create settings.json with hooks configuration
  // When OAuth token is present, we don't use the cmux proxy (user pays directly via their subscription)
  // When only API key is present, we route through cmux proxy for tracking/rate limiting

  // Determine deny rules to apply:
  // 1. Head agents (isOrchestrationHead) get NO deny rules - they need full capabilities
  // 2. Task sandboxes use permissionDenyRules from Convex if available
  // 3. Fall back to FALLBACK_DENY_RULES if no Convex rules provided (migration period)
  const shouldApplyDenyRules = hasTaskRunJwt && !ctx.isOrchestrationHead;
  const denyRules = shouldApplyDenyRules
    ? ctx.permissionDenyRules?.length
      ? ctx.permissionDenyRules
      : FALLBACK_DENY_RULES
    : undefined;

  const settingsConfig: Record<string, unknown> = {
    alwaysThinkingEnabled: true,
    // Always use apiKeyHelper when not using OAuth (helper outputs correct key based on user config)
    ...(hasOAuthToken ? {} : { apiKeyHelper: claudeApiKeyHelperPath }),
    // Always set bypassPermissions mode for task sandboxes to skip interactive confirmation
    // The --dangerously-skip-permissions flag enables bypass, but defaultMode ensures it's active
    permissions: {
      defaultMode: "bypassPermissions",
      ...(denyRules?.length ? { deny: denyRules } : {}),
    },
    hooks: {
      Stop: [
        // First check simplify gate (can block with exit 2)
        {
          hooks: [
            {
              type: "command",
              command: `${claudeLifecycleDir}/simplify-gate-hook.sh`,
            },
          ],
        },
        // Then run completion callbacks
        {
          hooks: [
            {
              type: "command",
              command: `${claudeLifecycleDir}/stop-hook.sh`,
            },
          ],
        },
      ],
      // Error surfacing: fires when agent stops due to API error (rate limit, auth, etc.)
      StopFailure: [
        {
          hooks: [
            {
              type: "command",
              command: `${claudeLifecycleDir}/error-hook.sh`,
            },
          ],
        },
      ],
      // Permission approval: bridges Claude permission requests to cmux approval broker
      // Enables human-in-the-loop approval via dashboard instead of terminal
      PermissionRequest: [
        {
          hooks: [
            {
              type: "command",
              command: `${claudeLifecycleDir}/permission-hook.sh`,
            },
          ],
        },
      ],
      // Pre-compaction: sync memory to Convex before context compression
      // Ensures memory state is persisted before context window gets summarized
      PreCompact: [
        {
          hooks: [
            {
              type: "command",
              command: `${claudeLifecycleDir}/precompact-hook.sh`,
            },
          ],
        },
      ],
      // Post-compaction: re-inject critical context after compression
      PostCompact: [
        {
          hooks: [
            {
              type: "command",
              command: `${claudeLifecycleDir}/postcompact-hook.sh`,
            },
          ],
        },
      ],
      // Subagent lifecycle: track sub-agent spawning/completion in dashboard
      SubagentStart: [
        {
          hooks: [
            {
              type: "command",
              command: `${claudeLifecycleDir}/subagent-start-hook.sh`,
            },
          ],
        },
      ],
      SubagentStop: [
        {
          hooks: [
            {
              type: "command",
              command: `${claudeLifecycleDir}/subagent-stop-hook.sh`,
            },
          ],
        },
      ],
      // User prompt tracking: logs when user submits prompts for session activity
      UserPromptSubmit: [
        {
          hooks: [
            {
              type: "command",
              command: `${claudeLifecycleDir}/user-prompt-hook.sh`,
            },
          ],
        },
      ],
      // Notification: fires when Claude needs user attention (permission prompt, idle, etc.)
      Notification: [
        {
          hooks: [
            {
              type: "command",
              command: `${claudeLifecycleDir}/notification-hook.sh`,
            },
          ],
        },
      ],
      // TaskCreated: fires when a task is created via TaskCreate tool (v2.1.84)
      // Tracks task creation in cmux dashboard activity timeline
      TaskCreated: [
        {
          hooks: [
            {
              type: "command",
              command: `${claudeLifecycleDir}/task-created-hook.sh`,
            },
          ],
        },
      ],
      // Plan mode hook: captures plans when ExitPlanMode is called
      // Syncs plan content to GitHub Projects if project is linked
      PostToolUse: [
        {
          matcher: "ExitPlanMode",
          hooks: [
            {
              type: "command",
              command: `${claudeLifecycleDir}/plan-hook.sh`,
            },
          ],
        },
        // Activity stream: report tool-use events to cmux dashboard
        {
          matcher: "Edit|Write|Read|Bash|Grep|Glob|NotebookEdit|Agent",
          hooks: [
            {
              type: "command",
              command: `${claudeLifecycleDir}/activity-hook.sh`,
            },
          ],
        },
        // /simplify skill tracking - marks task run when simplify completes
        {
          matcher: "Skill",
          hooks: [
            {
              type: "command",
              command: `${claudeLifecycleDir}/simplify-track-hook.sh`,
            },
          ],
        },
      ],
    },
    env: {
      CLAUDE_CODE_ENABLE_TELEMETRY: 0,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: 1,
      CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: 1,
      ...(effortLevel ? { CLAUDE_CODE_EFFORT_LEVEL: effortLevel } : {}),
      // CMUX system vars for stop hooks (memory sync, crown/complete)
      CMUX_CALLBACK_URL: ctx.callbackUrl,
      CMUX_TASK_RUN_ID: ctx.taskRunId,
      CMUX_TASK_RUN_JWT: ctx.taskRunJwt,
      // /simplify pre-merge gate requirement
      ...(ctx.simplifySettings?.requireSimplifyBeforeMerge && hasTaskRunJwt
        ? { CMUX_REQUIRE_SIMPLIFY: "1" }
        : {}),
      ...(() => {
        // Priority order for base URL routing:
        // 1. OAuth token -> direct to Anthropic (no proxy)
        // 2. Provider override with baseUrl -> direct to override URL + custom headers
        // 3. bypassProxy && userCustomBaseUrl -> legacy bypass
        // 4. Default -> cmux proxy

        if (hasOAuthToken) {
          // OAuth users always connect directly to Anthropic.
          return {};
        }

        // Provider override takes precedence over legacy bypass
        if (ctx.providerConfig?.isOverridden && ctx.providerConfig.baseUrl) {
          const result: Record<string, string | number> = {
            ANTHROPIC_BASE_URL: normalizeAnthropicBaseUrl(
              ctx.providerConfig.baseUrl,
            ).forRawFetch,
          };
          if (ctx.providerConfig.customHeaders) {
            result.ANTHROPIC_CUSTOM_HEADERS = Object.entries(
              ctx.providerConfig.customHeaders,
            )
              .map(([k, v]) => `${k}:${v}`)
              .join("\n");
          }
          return result;
        }

        if (bypassProxy && userCustomBaseUrl) {
          return {
            ANTHROPIC_BASE_URL:
              normalizeAnthropicBaseUrl(userCustomBaseUrl).forRawFetch,
          };
        }

        return {
          ANTHROPIC_BASE_URL: `${ctx.callbackUrl}/api/anthropic`,
          ANTHROPIC_CUSTOM_HEADERS: `x-cmux-token:${ctx.taskRunJwt}\nx-cmux-source:cmux`,
        };
      })(),
    },
  };

  // Add settings.json to files array as well
  files.push({
    destinationPath: "$HOME/.claude/settings.json",
    contentBase64: Buffer.from(
      JSON.stringify(settingsConfig, null, 2),
    ).toString("base64"),
    mode: "644",
  });

  // Add apiKey helper script - outputs user's API key if provided, otherwise placeholder
  const apiKeyToOutput = hasAnthropicApiKey
    ? ctx.apiKeys?.ANTHROPIC_API_KEY
    : CMUX_ANTHROPIC_PROXY_PLACEHOLDER_API_KEY;
  const helperScript = `#!/bin/sh
echo ${apiKeyToOutput}`;
  files.push({
    destinationPath: claudeApiKeyHelperPath,
    contentBase64: Buffer.from(helperScript).toString("base64"),
    mode: "700",
  });

  // Log the files for debugging
  startupCommands.push(
    `echo '[CMUX] Created Claude hook files in /root/lifecycle:' && ls -la ${claudeLifecycleDir}/`,
  );
  startupCommands.push(
    "echo '[CMUX] Settings directory in ~/.claude:' && ls -la /root/.claude/",
  );

  // Add agent memory protocol support
  startupCommands.push(getMemoryStartupCommand());
  files.push(
    ...getMemorySeedFiles(
      ctx.taskRunId,
      ctx.previousKnowledge,
      ctx.previousMailbox,
      ctx.orchestrationOptions,
      ctx.previousBehavior,
    ),
  );

  // Inject GitHub Projects context if task is linked to a project item (Phase 5)
  if (ctx.githubProjectContext) {
    files.push(
      getProjectContextFile({
        ...ctx.githubProjectContext,
        taskRunJwt: ctx.taskRunJwt,
        callbackUrl: ctx.callbackUrl,
      }),
    );
  }

  // Add CLAUDE.md to user-level memory (~/.claude/CLAUDE.md)
  // This follows Claude Code's native memory hierarchy:
  // - User memory (~/.claude/CLAUDE.md) applies to all projects
  // - Stored outside git workspace to avoid pollution
  // See: https://code.claude.com/docs/en/memory.md
  // Uses shared instruction pack builder for consistent assembly across providers
  const claudeMdContent = buildClaudeMdContent({
    policyRules: ctx.policyRules,
    orchestrationRules: ctx.orchestrationRules,
    previousBehavior: ctx.previousBehavior,
    isOrchestrationHead: ctx.isOrchestrationHead,
  });
  files.push({
    destinationPath: "$HOME/.claude/CLAUDE.md",
    contentBase64: Buffer.from(claudeMdContent).toString("base64"),
    mode: "644",
  });

  // Create cross-tool symlinks for shared instructions
  // This allows Codex and Gemini to read the same CLAUDE.md via symlinks
  // at their native user-level paths (~/.codex/AGENTS.md, ~/.gemini/GEMINI.md)
  startupCommands.push(...getCrossToolSymlinkCommands());

  // Set Claude Code stream idle timeout to 5 minutes (default is 90s)
  // This prevents timeouts during long tool executions in sandboxes
  // See: https://code.claude.com/docs/en/changelog (v2.1.84)
  env.CLAUDE_STREAM_IDLE_TIMEOUT_MS = "300000";

  // Enable subprocess credential scrubbing for security in sandboxes
  // This strips Anthropic and cloud provider credentials from subprocess environments
  // Prevents accidental credential exposure to tools and child processes
  // See: https://code.claude.com/docs/en/changelog (v2.1.84)
  env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB = "1";

  // Disable cron jobs in task sandboxes - scheduled tasks shouldn't persist
  // across agent runs and could cause unexpected behavior
  // Head agents may need cron for orchestration, so only disable for task sandboxes
  // See: https://code.claude.com/docs/en/changelog (v2.1.72)
  if (hasTaskRunJwt && !ctx.isOrchestrationHead) {
    env.CLAUDE_CODE_DISABLE_CRON = "1";
  }

  return {
    files,
    env,
    startupCommands,
    unsetEnv: [...CLAUDE_KEY_ENV_VARS_TO_UNSET],
  };
}
