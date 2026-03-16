import type {
  EnvironmentContext,
  EnvironmentResult,
} from "../common/environment-result";
import {
  getMemoryStartupCommand,
  getMemorySeedFiles,
  getMemoryProtocolInstructions,
  getProjectContextFile,
  getPolicyRulesInstructions,
  getOrchestrationRulesInstructions,
  extractBehaviorRulesSection,
} from "../../agent-memory-protocol";
import { getTaskSandboxWrapperFiles } from "../common/task-sandbox-wrappers";

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
  const policyRulesSection = ctx.policyRules && ctx.policyRules.length > 0
    ? `\n${getPolicyRulesInstructions(ctx.policyRules)}\n`
    : "";
  const orchestrationRulesSection = ctx.orchestrationRules && ctx.orchestrationRules.length > 0
    ? `\n${getOrchestrationRulesInstructions(ctx.orchestrationRules)}\n`
    : "";
  const behaviorRulesSection = ctx.previousBehavior
    ? `\n${extractBehaviorRulesSection(ctx.previousBehavior)}\n`
    : "";
  const cursorMdContent = `# cmux Project Instructions
${policyRulesSection}${orchestrationRulesSection}${behaviorRulesSection}
${getMemoryProtocolInstructions()}
`;
  files.push({
    destinationPath: "/root/workspace/.cursor/rules/cmux-memory-protocol.mdc",
    contentBase64: Buffer.from(cursorMdContent).toString("base64"),
    mode: "644",
  });

  // Block dangerous commands in task sandboxes (when enabled via settings)
  // Disabled by default - use permission deny rules or policy rules instead
  const hasTaskRunJwt = ctx.taskRunJwt.trim().length > 0;
  if (hasTaskRunJwt && ctx.enableShellWrappers) {
    files.push(...getTaskSandboxWrapperFiles(Buffer));
  }

  return { files, env, startupCommands };
}
