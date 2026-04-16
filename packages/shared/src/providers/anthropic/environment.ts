import type {
  EnvironmentContext,
  EnvironmentResult,
} from "../common/environment-result";
import type { ClaudeAliasRoute } from "../../provider-registry";
import {
  CLAUDE_DEFAULT_MODEL_ENV_VARS,
  CLAUDE_ROUTING_ENV_VARS,
  type ClaudeModelFamily,
  getClaudeModelSpecByAgentName,
  hasAnthropicCustomEndpointConfigured,
} from "./models";
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
import { buildThinHookStubFile } from "../../provider-lifecycle-adapter";

export const CLAUDE_KEY_ENV_VARS_TO_UNSET = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_CUSTOM_HEADERS",
  ...CLAUDE_ROUTING_ENV_VARS,
  "CLAUDE_CODE_EFFORT_LEVEL",
  "CLAUDE_API_KEY",
];

const CLAUDE_OPUS_46_EFFORT_LEVELS = new Set(["low", "medium", "high", "max"]);
const CLAUDE_NATIVE_EFFORT_MODELS = new Set(["claude-opus-4-6"]);

function resolveClaudeDefaultModelMetadata(
  env: Record<string, string | number>,
  envVars: (typeof CLAUDE_DEFAULT_MODEL_ENV_VARS)[ClaudeModelFamily],
  route: ClaudeAliasRoute | undefined,
): void {
  if (!route) {
    return;
  }

  const model = route.model.trim();
  if (!model) {
    return;
  }

  env[envVars.model] = model;
  if (route.name?.trim()) {
    env[envVars.name] = route.name.trim();
  }
  if (route.description?.trim()) {
    env[envVars.description] = route.description.trim();
  }
  if (route.supportedCapabilities?.length) {
    env[envVars.supportedCapabilities] = route.supportedCapabilities.join(",");
  }
}

function resolveClaudeEffectiveTarget(
  ctx: Pick<EnvironmentContext, "agentName" | "providerConfig">,
): string | undefined {
  const routing = ctx.providerConfig?.claudeRouting;
  if (routing?.mode === "anthropic_compatible_gateway") {
    const spec = getClaudeModelSpecByAgentName(ctx.agentName);
    if (spec?.family === "opus") {
      return routing.opus?.model.trim() || undefined;
    }
    if (spec?.family === "sonnet") {
      return routing.sonnet?.model.trim() || undefined;
    }
    if (spec?.family === "haiku") {
      return routing.haiku?.model.trim() || undefined;
    }
  }

  return getClaudeModelSpecByAgentName(ctx.agentName)?.nativeModelId;
}

function resolveClaudeEffortLevel(
  ctx: Pick<
    EnvironmentContext,
    "agentName" | "selectedVariant" | "providerConfig"
  >,
): string | undefined {
  const effort = ctx.selectedVariant?.trim();
  if (!effort) {
    return undefined;
  }

  const effectiveTarget = resolveClaudeEffectiveTarget(ctx);
  if (!effectiveTarget || !CLAUDE_NATIVE_EFFORT_MODELS.has(effectiveTarget)) {
    throw new Error(
      `Model ${ctx.agentName ?? "claude"} does not support effort selection`,
    );
  }

  if (!CLAUDE_OPUS_46_EFFORT_LEVELS.has(effort)) {
    throw new Error(
      `Unsupported Claude effort "${effort}". Allowed values: low, medium, high, max`,
    );
  }

  return effort;
}

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
  const effortLevel = resolveClaudeEffortLevel(ctx);
  const modelSpec = getClaudeModelSpecByAgentName(ctx.agentName);
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

  // Stop hook script - thin stub with comprehensive fallback for critical operations
  // P0 Critical: must sync memory and create completion markers even if server unreachable
  const stopHookFallback = `#!/bin/bash
set -eu
LOG_FILE="/root/lifecycle/claude-hook.log"
echo "[CMUX Stop Hook Fallback] Running at \$(date)" >> "\$LOG_FILE"

# Sync memory files (best-effort)
/root/lifecycle/memory/sync.sh >> "\$LOG_FILE" 2>&1 || true

# Create completion marker for task run
if [ -n "\${CMUX_TASK_RUN_ID:-}" ]; then
  touch "/root/lifecycle/claude-complete-\${CMUX_TASK_RUN_ID}"
fi

# Create generic completion marker
touch /root/lifecycle/done.txt

echo "[CMUX Stop Hook Fallback] Completed" >> "\$LOG_FILE"
exit 0`;

  // Add stop hook script to files array (like Codex does) to ensure it's created before git init
  files.push(
    buildThinHookStubFile(
      "session_stop",
      "claude",
      `${claudeLifecycleDir}/stop-hook.sh`,
      Buffer.from.bind(Buffer),
      { fallbackScript: stopHookFallback },
    ),
  );

  // Plan hook script - thin stub that fetches dispatch logic from server
  files.push(
    buildThinHookStubFile(
      "plan_sync",
      "claude",
      `${claudeLifecycleDir}/plan-hook.sh`,
      Buffer.from.bind(Buffer),
    ),
  );

  // Activity hook script - thin stub that fetches dispatch logic from server
  files.push(
    buildThinHookStubFile(
      "tool_call",
      "claude",
      `${claudeLifecycleDir}/activity-hook.sh`,
      Buffer.from.bind(Buffer),
    ),
  );

  // Error hook script - thin stub that fetches dispatch logic from server
  files.push(
    buildThinHookStubFile(
      "error",
      "claude",
      `${claudeLifecycleDir}/error-hook.sh`,
      Buffer.from.bind(Buffer),
    ),
  );

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

  // PreCompact hook script - thin stub with fallback that allows compaction
  // Critical: must return {"continue": true} even if server unreachable
  const precompactFallback = `#!/bin/bash
set -eu
# Fallback: allow compaction to proceed
echo '{"continue": true}'
exit 0`;
  files.push(
    buildThinHookStubFile(
      "precompact",
      "claude",
      `${claudeLifecycleDir}/precompact-hook.sh`,
      Buffer.from.bind(Buffer),
      { fallbackScript: precompactFallback },
    ),
  );

  // SubagentStart hook script - thin stub that fetches dispatch logic from server
  files.push(
    buildThinHookStubFile(
      "subagent_start",
      "claude",
      `${claudeLifecycleDir}/subagent-start-hook.sh`,
      Buffer.from.bind(Buffer),
    ),
  );

  // SubagentStop hook script - thin stub that fetches dispatch logic from server
  files.push(
    buildThinHookStubFile(
      "subagent_stop",
      "claude",
      `${claudeLifecycleDir}/subagent-stop-hook.sh`,
      Buffer.from.bind(Buffer),
    ),
  );

  // UserPromptSubmit hook script - thin stub that fetches dispatch logic from server
  files.push(
    buildThinHookStubFile(
      "user_prompt",
      "claude",
      `${claudeLifecycleDir}/user-prompt-hook.sh`,
      Buffer.from.bind(Buffer),
    ),
  );

  // Notification hook script - thin stub that fetches dispatch logic from server
  files.push(
    buildThinHookStubFile(
      "notification",
      "claude",
      `${claudeLifecycleDir}/notification-hook.sh`,
      Buffer.from.bind(Buffer),
    ),
  );

  // PostCompact hook script - thin stub that fetches dispatch logic from server
  files.push(
    buildThinHookStubFile(
      "postcompact",
      "claude",
      `${claudeLifecycleDir}/postcompact-hook.sh`,
      Buffer.from.bind(Buffer),
    ),
  );

  // Simplify skill tracking hook - thin stub that fetches dispatch logic from server
  files.push(
    buildThinHookStubFile(
      "simplify_track",
      "claude",
      `${claudeLifecycleDir}/simplify-track-hook.sh`,
      Buffer.from.bind(Buffer),
    ),
  );

  // Simplify gate hook - thin stub with fallback that allows stop on server failure
  // Critical: should not block stop if server is unreachable
  const simplifyGateFallback = `#!/bin/bash
set -eu
# Fallback: allow stop to proceed (fail open)
exit 0`;
  files.push(
    buildThinHookStubFile(
      "simplify_gate",
      "claude",
      `${claudeLifecycleDir}/simplify-gate-hook.sh`,
      Buffer.from.bind(Buffer),
      { fallbackScript: simplifyGateFallback },
    ),
  );

  // TaskCreated hook script - thin stub that fetches dispatch logic from server
  files.push(
    buildThinHookStubFile(
      "task_created",
      "claude",
      `${claudeLifecycleDir}/task-created-hook.sh`,
      Buffer.from.bind(Buffer),
    ),
  );

  // Check if user has provided an OAuth token (preferred) or API key
  const hasOAuthToken =
    modelSpec?.requiresCustomEndpoint !== true &&
    ctx.apiKeys?.CLAUDE_CODE_OAUTH_TOKEN &&
    ctx.apiKeys.CLAUDE_CODE_OAUTH_TOKEN.trim().length > 0;
  const hasAnthropicApiKey =
    ctx.apiKeys?.ANTHROPIC_API_KEY &&
    ctx.apiKeys.ANTHROPIC_API_KEY.trim().length > 0;
  const userCustomBaseUrl = ctx.apiKeys?.ANTHROPIC_BASE_URL?.trim();
  const bypassProxy = ctx.workspaceSettings?.bypassAnthropicProxy ?? false;
  const hasAnthropicCustomEndpoint = hasAnthropicCustomEndpointConfigured({
    apiKeys: {
      ANTHROPIC_BASE_URL: ctx.apiKeys?.ANTHROPIC_BASE_URL,
    },
    bypassAnthropicProxy: bypassProxy,
    providerOverrides: ctx.providerConfig?.isOverridden
      ? [
          {
            providerId: "anthropic",
            enabled: true,
            baseUrl: ctx.providerConfig.baseUrl,
            apiFormat: ctx.providerConfig.apiFormat,
          },
        ]
      : [],
  });
  const hasTaskRunJwt = ctx.taskRunJwt.trim().length > 0;
  const routingConfig = ctx.providerConfig?.claudeRouting;
  const shouldApplyClaudeRouting =
    !hasOAuthToken &&
    ctx.providerConfig?.isOverridden === true &&
    ctx.providerConfig.apiFormat === "anthropic" &&
    routingConfig?.mode === "anthropic_compatible_gateway";

  if (modelSpec?.requiresCustomEndpoint && !hasAnthropicApiKey) {
    throw new Error(
      `${ctx.agentName ?? "claude"} requires an Anthropic API key`,
    );
  }

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
  // 1. Deny rules only apply for task-backed runs (JWT present)
  // 2. The caller is responsible for fetching the correct context
  //    (task_sandbox vs cloud_workspace)
  // 3. If no rules are provided, omit permissions.deny entirely
  const shouldApplyDenyRules = hasTaskRunJwt;
  const denyRules = shouldApplyDenyRules ? ctx.permissionDenyRules : undefined;

  const settingsConfig: Record<string, unknown> = {
    alwaysThinkingEnabled: true,
    // Always use apiKeyHelper when not using OAuth (helper outputs correct key based on user config)
    ...(hasOAuthToken ? {} : { apiKeyHelper: claudeApiKeyHelperPath }),
    // Always set bypassPermissions mode for task-backed Claude runs to skip interactive confirmation
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

        const result: Record<string, string | number> = {};

        if (hasOAuthToken) {
          // OAuth users always connect directly to Anthropic.
          return result;
        }

        // Provider override takes precedence over legacy bypass
        if (ctx.providerConfig?.isOverridden && ctx.providerConfig.baseUrl) {
          result.ANTHROPIC_BASE_URL = normalizeAnthropicBaseUrl(
            ctx.providerConfig.baseUrl,
          ).forRawFetch;
          if (ctx.providerConfig.customHeaders) {
            result.ANTHROPIC_CUSTOM_HEADERS = Object.entries(
              ctx.providerConfig.customHeaders,
            )
              .map(([k, v]) => `${k}:${v}`)
              .join("\n");
          }
        } else if (bypassProxy && userCustomBaseUrl) {
          result.ANTHROPIC_BASE_URL =
            normalizeAnthropicBaseUrl(userCustomBaseUrl).forRawFetch;
        } else {
          result.ANTHROPIC_BASE_URL = `${ctx.callbackUrl}/api/anthropic`;
          result.ANTHROPIC_CUSTOM_HEADERS = `x-cmux-token:${ctx.taskRunJwt}\nx-cmux-source:cmux`;
        }

        if (shouldApplyClaudeRouting && routingConfig) {
          resolveClaudeDefaultModelMetadata(
            result,
            CLAUDE_DEFAULT_MODEL_ENV_VARS.opus,
            routingConfig.opus,
          );
          resolveClaudeDefaultModelMetadata(
            result,
            CLAUDE_DEFAULT_MODEL_ENV_VARS.sonnet,
            routingConfig.sonnet,
          );
          resolveClaudeDefaultModelMetadata(
            result,
            CLAUDE_DEFAULT_MODEL_ENV_VARS.haiku,
            routingConfig.haiku,
          );
          if (routingConfig.subagentModel?.trim()) {
            result.CLAUDE_CODE_SUBAGENT_MODEL =
              routingConfig.subagentModel.trim();
          }
          result.ANTHROPIC_CUSTOM_MODEL_OPTION = "custom";
        }

        if (modelSpec?.requiresCustomEndpoint) {
          if (!hasAnthropicCustomEndpoint) {
            throw new Error(
              `${ctx.agentName ?? "claude"} requires an Anthropic-compatible custom endpoint`,
            );
          }
          result.ANTHROPIC_CUSTOM_MODEL_OPTION = modelSpec.nativeModelId;
          if (modelSpec.customModelOptionName?.trim()) {
            result.ANTHROPIC_CUSTOM_MODEL_OPTION_NAME =
              modelSpec.customModelOptionName.trim();
          }
          if (modelSpec.customModelOptionDescription?.trim()) {
            result.ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION =
              modelSpec.customModelOptionDescription.trim();
          }
          if (modelSpec.customModelOptionSupportedCapabilities?.length) {
            result.ANTHROPIC_CUSTOM_MODEL_OPTION_SUPPORTED_CAPABILITIES =
              modelSpec.customModelOptionSupportedCapabilities.join(",");
          }
        }

        return result;
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
