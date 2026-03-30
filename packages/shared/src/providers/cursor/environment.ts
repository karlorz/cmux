import type {
  EnvironmentContext,
  EnvironmentResult,
} from "../common/environment-result";
import {
  getMemoryStartupCommand,
  getMemorySeedFiles,
  getProjectContextFile,
} from "../../agent-memory-protocol";
import { buildGenericInstructionsContent } from "../../agent-instruction-pack";
import { getTaskSandboxWrapperFiles } from "../common/task-sandbox-wrappers";
import { buildStandardLifecycleHooks } from "../../provider-lifecycle-adapter";
import { buildClaudeMcpServers } from "../../mcp-injection";
import type { McpServerConfig } from "../../mcp-server-config";

/**
 * Fallback deny rules for Cursor CLI in task sandboxes.
 * Used when permissionDenyRules from Convex is unavailable.
 *
 * These use Cursor's native permission format:
 * - Shell(commandBase) - deny shell commands starting with pattern
 * - Read(pathOrGlob) - deny read access
 * - Write(pathOrGlob) - deny write access
 */
const CURSOR_FALLBACK_DENY_RULES = [
  // PR lifecycle — cmux manages PR creation/merging automatically
  "Shell(gh pr create)",
  "Shell(gh pr merge)",
  "Shell(gh pr close)",
  // Git destructive ops - prevent accidental data loss
  "Shell(git push --force)",
  "Shell(git push -f)",
  "Shell(git reset --hard)",
  "Shell(git clean -f)",
  // Sensitive file protection
  "Write(.env)",
  "Write(.env.*)",
  "Write(*.pem)",
  "Write(*.key)",
];

/**
 * Translates cmux permission deny rules (Claude format) to Cursor CLI format.
 *
 * Claude format: "Bash(gh pr create:*)", "Bash(git push:*)"
 * Cursor format: "Shell(gh pr create)", "Shell(git push)"
 *
 * Currently only translates Bash rules to Shell rules.
 * Read/Write rules are passed through if they match Cursor format.
 */
function translateDenyRulesToCursor(cmuxRules: string[]): string[] {
  const cursorRules: string[] = [];

  for (const rule of cmuxRules) {
    // Translate Bash(command:*) -> Shell(command)
    const bashMatch = rule.match(/^Bash\(([^:]+)(?::\*)?\)$/);
    if (bashMatch) {
      cursorRules.push(`Shell(${bashMatch[1]})`);
      continue;
    }

    // Pass through rules already in Cursor format
    if (rule.startsWith("Shell(") || rule.startsWith("Read(") || rule.startsWith("Write(")) {
      cursorRules.push(rule);
      continue;
    }

    // Log unknown formats but don't fail
    console.warn(`[cursor] Unknown deny rule format, skipping: ${rule}`);
  }

  return cursorRules;
}

/**
 * Builds .cursor/cli.json permission policy content.
 *
 * Per Cursor CLI docs, project-level config only supports permissions,
 * not other CLI settings (those must be in ~/.cursor/cli-config.json).
 */
function buildCursorCliJson(denyRules: string[]): string {
  const config = {
    permissions: {
      deny: denyRules,
    },
  };
  return JSON.stringify(config, null, 2);
}

/**
 * Orchestration env vars for MCP server passthrough.
 * Extended from EnvironmentContext["orchestrationEnv"] with CMUX_TASK_RUN_JWT.
 */
type McpOrchestrationEnv = {
  CMUX_TASK_RUN_JWT?: string;
  CMUX_SERVER_URL?: string;
  CMUX_API_BASE_URL?: string;
  CMUX_IS_ORCHESTRATION_HEAD?: string;
  CMUX_ORCHESTRATION_ID?: string;
  CMUX_CALLBACK_URL?: string;
};

/**
 * Builds .cursor/mcp.json MCP server configuration.
 *
 * Per Cursor CLI docs, MCP config is shared between CLI and editor,
 * following project -> global -> nested precedence.
 *
 * The format matches Claude's mcpServers format (JSON with command/args/env).
 */
function buildCursorMcpJson(
  mcpServerConfigs: McpServerConfig[],
  agentName?: string,
  orchestrationEnv?: McpOrchestrationEnv,
): string {
  // Build MCP servers from configs (reuse Claude's format builder)
  const mcpServers = buildClaudeMcpServers(mcpServerConfigs);

  // Add managed devsh-memory server with orchestration env
  const managedMemoryServer: Record<string, unknown> = {
    command: "npx",
    args: agentName
      ? ["-y", "devsh-memory-mcp@latest", "--agent", agentName]
      : ["-y", "devsh-memory-mcp@latest"],
  };

  // Pass orchestration env vars to MCP server
  if (orchestrationEnv) {
    const env: Record<string, string> = {};
    if (orchestrationEnv.CMUX_TASK_RUN_JWT) {
      env.CMUX_TASK_RUN_JWT = orchestrationEnv.CMUX_TASK_RUN_JWT;
    }
    if (orchestrationEnv.CMUX_SERVER_URL) {
      env.CMUX_SERVER_URL = orchestrationEnv.CMUX_SERVER_URL;
    }
    if (orchestrationEnv.CMUX_API_BASE_URL) {
      env.CMUX_API_BASE_URL = orchestrationEnv.CMUX_API_BASE_URL;
    }
    if (orchestrationEnv.CMUX_IS_ORCHESTRATION_HEAD) {
      env.CMUX_IS_ORCHESTRATION_HEAD = orchestrationEnv.CMUX_IS_ORCHESTRATION_HEAD;
    }
    if (orchestrationEnv.CMUX_ORCHESTRATION_ID) {
      env.CMUX_ORCHESTRATION_ID = orchestrationEnv.CMUX_ORCHESTRATION_ID;
    }
    if (orchestrationEnv.CMUX_CALLBACK_URL) {
      env.CMUX_CALLBACK_URL = orchestrationEnv.CMUX_CALLBACK_URL;
    }
    if (Object.keys(env).length > 0) {
      managedMemoryServer.env = env;
    }
  }

  const config = {
    mcpServers: {
      ...mcpServers,
      "devsh-memory": managedMemoryServer,
    },
  };

  return JSON.stringify(config, null, 2);
}

export async function getCursorEnvironment(
  ctx: EnvironmentContext
): Promise<EnvironmentResult> {
  // These must be lazy since configs are imported into the browser
  const { Buffer } = await import("node:buffer");

  // useHostConfig is safe for desktop/Electron apps where the host IS the user's machine.
  // For server deployments, this should be false to prevent credential leakage.
  const useHostConfig = ctx.useHostConfig ?? false;

  const files: EnvironmentResult["files"] = [];
  const env: Record<string, string> = {};
  const startupCommands: string[] = [];

  let authAdded = false;

  if (useHostConfig) {
    const { readFile } = await import("node:fs/promises");
    const { homedir } = await import("node:os");
    const { join } = await import("node:path");
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);

    const homeDir = homedir();
    const cursorCliConfigPath = join(homeDir, ".cursor", "cli-config.json");
    const cursorAuthPath = join(homeDir, ".config", "cursor", "auth.json");

    // Copy cursor CLI config (read directly, handle ENOENT in catch)
    try {
      const content = await readFile(cursorCliConfigPath, "utf-8");
      files.push({
        destinationPath: "/root/.cursor/cli-config.json",
        contentBase64: Buffer.from(content).toString("base64"),
        mode: "644",
      });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code !== "ENOENT") {
        console.warn("Failed to read cursor CLI config:", error);
      }
    }

    // Try to copy cursor auth, otherwise fallback to keychain
    try {
      const content = await readFile(cursorAuthPath, "utf-8");
      files.push({
        destinationPath: "/root/.config/cursor/auth.json",
        contentBase64: Buffer.from(content).toString("base64"),
        mode: "600",
      });
      authAdded = true;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code !== "ENOENT") {
        console.warn("Failed to read cursor auth:", error);
      }
    }

    // If no auth file exists, try to get tokens from keychain
    if (!authAdded) {
      try {
        // Try to get both access token and refresh token from keychain
        const [accessTokenResult, refreshTokenResult] = await Promise.all([
          execAsync(
            "security find-generic-password -w -s 'cursor-access-token'"
          ).catch(() => null),
          execAsync(
            "security find-generic-password -w -s 'cursor-refresh-token'"
          ).catch(() => null),
        ]);

        if (accessTokenResult && refreshTokenResult) {
          const accessToken = accessTokenResult.stdout.trim();
          const refreshToken = refreshTokenResult.stdout.trim();

          // Create auth.json with tokens from keychain
          const authJson = {
            accessToken,
            refreshToken,
          };

          files.push({
            destinationPath: "/root/.config/cursor/auth.json",
            contentBase64: Buffer.from(
              JSON.stringify(authJson, null, 2)
            ).toString("base64"),
            mode: "600",
          });
          authAdded = true;
        }
      } catch (error) {
        console.warn("Failed to get Cursor tokens from keychain:", error);
      }
    }
  }

  // If still no auth, check for CURSOR_API_KEY environment variable
  if (!authAdded && process.env.CURSOR_API_KEY) {
    env.CURSOR_API_KEY = process.env.CURSOR_API_KEY;

    // Add startup command to persist the API key in .bashrc
    startupCommands.push(
      `grep -q "export CURSOR_API_KEY=" ~/.bashrc || echo 'export CURSOR_API_KEY="${process.env.CURSOR_API_KEY}"' >> ~/.bashrc`
    );
  }

  // Ensure directories exist
  startupCommands.push("mkdir -p ~/.cursor");
  startupCommands.push("mkdir -p ~/.config/cursor");
  startupCommands.push("mkdir -p /root/workspace/.cursor/rules");

  // Build standard lifecycle hooks using shared adapter
  const lifecycleHooks = buildStandardLifecycleHooks(
    {
      provider: "cursor",
      taskRunId: ctx.taskRunId,
      includeMemorySync: true,
      createCompletionMarker: true,
    },
    Buffer.from.bind(Buffer)
  );
  files.push(...lifecycleHooks.files);
  startupCommands.push(...lifecycleHooks.startupCommands);

  // Fire session start hook on sandbox initialization
  startupCommands.push("/root/lifecycle/cursor/session-start-hook.sh &");

  // Add agent memory protocol support
  startupCommands.push(getMemoryStartupCommand());
  files.push(...getMemorySeedFiles(ctx.taskRunId, ctx.previousKnowledge, ctx.previousMailbox, ctx.orchestrationOptions, ctx.previousBehavior));

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

  // Add CURSOR.md with memory protocol instructions for the project
  const cursorMdContent = buildGenericInstructionsContent({
    policyRules: ctx.policyRules,
    orchestrationRules: ctx.orchestrationRules,
    previousBehavior: ctx.previousBehavior,
    isOrchestrationHead: ctx.isOrchestrationHead,
  }, "# cmux Project Instructions");
  files.push({
    destinationPath: "/root/workspace/.cursor/rules/cmux-memory-protocol.mdc",
    contentBase64: Buffer.from(cursorMdContent).toString("base64"),
    mode: "644",
  });

  // Generate project-level permission policy (.cursor/cli.json)
  // Per Cursor docs, only permissions can be set at project level
  const hasTaskRunJwt = ctx.taskRunJwt.trim().length > 0;
  const shouldApplyDenyRules = hasTaskRunJwt && !ctx.isOrchestrationHead;

  if (shouldApplyDenyRules) {
    // Use Convex rules if available, otherwise fall back to defaults.
    // An empty array means "apply no deny rules".
    const cursorDenyRules = translateDenyRulesToCursor(
      ctx.permissionDenyRules ?? CURSOR_FALLBACK_DENY_RULES,
    );

    const cursorCliJson = buildCursorCliJson(cursorDenyRules);
    files.push({
      destinationPath: "/root/workspace/.cursor/cli.json",
      contentBase64: Buffer.from(cursorCliJson).toString("base64"),
      mode: "644",
    });
  }

  // Generate .cursor/mcp.json for MCP server configuration
  // Per Cursor docs, CLI MCP uses the same config as the editor (project -> global -> nested)
  const mcpConfigs = ctx.mcpServerConfigs ?? [];
  const orchestrationEnv = ctx.isOrchestrationHead
    ? {
        CMUX_TASK_RUN_JWT: ctx.taskRunJwt,
        CMUX_SERVER_URL: ctx.orchestrationEnv?.CMUX_SERVER_URL,
        CMUX_API_BASE_URL: ctx.orchestrationEnv?.CMUX_API_BASE_URL,
        CMUX_IS_ORCHESTRATION_HEAD: ctx.orchestrationEnv?.CMUX_IS_ORCHESTRATION_HEAD,
        CMUX_ORCHESTRATION_ID: ctx.orchestrationEnv?.CMUX_ORCHESTRATION_ID,
        CMUX_CALLBACK_URL: ctx.orchestrationEnv?.CMUX_CALLBACK_URL,
      }
    : undefined;

  // Always inject MCP config with at least the managed memory server
  const cursorMcpJson = buildCursorMcpJson(mcpConfigs, ctx.agentName, orchestrationEnv);
  files.push({
    destinationPath: "/root/workspace/.cursor/mcp.json",
    contentBase64: Buffer.from(cursorMcpJson).toString("base64"),
    mode: "644",
  });

  // Block dangerous commands in task sandboxes (when enabled via settings)
  // Disabled by default - use permission deny rules or policy rules instead
  if (hasTaskRunJwt && ctx.enableShellWrappers) {
    files.push(...getTaskSandboxWrapperFiles(Buffer));
  }

  // Provider config override for custom API endpoints
  if (ctx.providerConfig?.isOverridden && ctx.providerConfig.baseUrl) {
    env.CURSOR_API_BASE_URL = ctx.providerConfig.baseUrl;
  }

  return { files, env, startupCommands };
}
