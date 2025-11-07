import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { exec, spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { getConvex } from "./utils/convexClient";
import { serverLogger } from "./utils/fileLogger";

const execAsync = promisify(exec);

interface EnvVarLoadResult {
  success: boolean;
  envVars?: Record<string, string>;
  error?: string;
}

interface ScriptExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
}

/**
 * Load environment variables from StackAuth DataBook
 * This requires accessing the www service which has the StackAuth integration
 */
async function loadEnvVarsFromDataVault(
  dataVaultKey: string
): Promise<EnvVarLoadResult> {
  try {
    // Note: This requires the www service to be running
    // The www service has a route to fetch env vars from DataVault
    const wwwBaseUrl = process.env.WWW_BASE_URL || "http://localhost:3001";
    const response = await fetch(
      `${wwwBaseUrl}/api/internal/environments/env-vars/${dataVaultKey}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.INTERNAL_API_KEY || ""}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch env vars: ${response.statusText}`);
    }

    const content = await response.text();
    if (!content) {
      return { success: true, envVars: {} };
    }

    // Parse .env format
    const envVars: Record<string, string> = {};
    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0) {
          const value = valueParts.join("=").trim();
          // Remove quotes if present
          const unquoted = value.replace(/^["']|["']$/g, "");
          envVars[key.trim()] = unquoted;
        }
      }
    }

    return { success: true, envVars };
  } catch (error) {
    serverLogger.error("Failed to load env vars from data vault:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Inject environment variables into a worktree by creating a .env file
 */
export async function injectEnvVarsIntoWorktree(
  worktreePath: string,
  envVars: Record<string, string>
): Promise<void> {
  try {
    const envFilePath = path.join(worktreePath, ".env");

    // Format as .env file
    const envContent = Object.entries(envVars)
      .map(([key, value]) => {
        // Quote values with spaces or special characters
        const needsQuotes = /[\s#]/.test(value);
        const quotedValue = needsQuotes ? `"${value}"` : value;
        return `${key}=${quotedValue}`;
      })
      .join("\n");

    await fs.writeFile(envFilePath, envContent, "utf-8");
    serverLogger.info(
      `Injected ${Object.keys(envVars).length} env vars into ${envFilePath}`
    );

    // Add .env to .gitignore if not already there
    const gitignorePath = path.join(worktreePath, ".gitignore");
    try {
      const gitignoreContent = await fs.readFile(gitignorePath, "utf-8");
      if (!gitignoreContent.includes(".env")) {
        await fs.appendFile(gitignorePath, "\n.env\n");
        serverLogger.info("Added .env to .gitignore");
      }
    } catch (error) {
      // .gitignore doesn't exist, create it
      await fs.writeFile(gitignorePath, ".env\n", "utf-8");
      serverLogger.info("Created .gitignore with .env");
    }
  } catch (error) {
    serverLogger.error("Failed to inject env vars:", error);
    throw error;
  }
}

/**
 * Execute a setup script in a worktree (one-time, runs to completion)
 */
export async function executeSetupScript(
  worktreePath: string,
  script: string,
  envVars: Record<string, string> = {}
): Promise<ScriptExecutionResult> {
  try {
    serverLogger.info(`Executing setup script in ${worktreePath}`);

    const result = await execAsync(script, {
      cwd: worktreePath,
      env: {
        ...process.env,
        ...envVars,
      },
      shell: "/bin/zsh",
      timeout: 600000, // 10 minutes timeout
    });

    serverLogger.info("Setup script completed successfully");
    return {
      success: true,
      output: result.stdout + result.stderr,
      exitCode: 0,
    };
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string; code?: number };
    serverLogger.error("Setup script failed:", error);
    return {
      success: false,
      error: err.message,
      output: (err.stdout || "") + (err.stderr || ""),
      exitCode: err.code,
    };
  }
}

/**
 * Execute a dev script in a worktree (long-running, background process)
 * Returns the child process so it can be monitored/killed later
 */
export function executeDevScript(
  worktreePath: string,
  script: string,
  envVars: Record<string, string> = {}
): ReturnType<typeof spawn> {
  serverLogger.info(`Starting dev script in ${worktreePath}`);

  const child = spawn("/bin/zsh", ["-c", script], {
    cwd: worktreePath,
    env: {
      ...process.env,
      ...envVars,
    },
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (data) => {
    serverLogger.info(`[dev-script] ${data.toString().trim()}`);
  });

  child.stderr?.on("data", (data) => {
    serverLogger.info(`[dev-script] ${data.toString().trim()}`);
  });

  child.on("exit", (code, signal) => {
    serverLogger.info(
      `Dev script exited with code ${code} and signal ${signal}`
    );
  });

  return child;
}

/**
 * Setup environment for a local workspace task
 */
export async function setupLocalWorkspaceEnvironment(args: {
  taskId: Id<"tasks">;
  environmentId: Id<"environments">;
  worktreePath: string;
  teamSlugOrId: string;
}): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const convex = getConvex();

    // Get environment details
    const environment = await convex.query(api.environments.get, {
      teamSlugOrId: args.teamSlugOrId,
      id: args.environmentId,
    });

    if (!environment) {
      throw new Error("Environment not found");
    }

    serverLogger.info(
      `Setting up environment "${environment.name}" for task ${args.taskId}`
    );

    // Load env vars from DataVault
    let envVars: Record<string, string> = {};
    if (environment.dataVaultKey) {
      const envResult = await loadEnvVarsFromDataVault(
        environment.dataVaultKey
      );
      if (envResult.success && envResult.envVars) {
        envVars = envResult.envVars;
        // Inject into worktree
        await injectEnvVarsIntoWorktree(args.worktreePath, envVars);
      } else {
        serverLogger.warn("Failed to load env vars:", envResult.error);
      }
    }

    // Execute setup script if present
    if (environment.maintenanceScript) {
      await convex.mutation(api.tasks.updateSetupScriptStatus, {
        teamSlugOrId: args.teamSlugOrId,
        id: args.taskId,
        status: "running",
      });

      const setupResult = await executeSetupScript(
        args.worktreePath,
        environment.maintenanceScript,
        envVars
      );

      if (setupResult.success) {
        await convex.mutation(api.tasks.updateSetupScriptStatus, {
          teamSlugOrId: args.teamSlugOrId,
          id: args.taskId,
          status: "completed",
        });
        serverLogger.info("Setup script completed successfully");
      } else {
        await convex.mutation(api.tasks.updateSetupScriptStatus, {
          teamSlugOrId: args.teamSlugOrId,
          id: args.taskId,
          status: "failed",
          error: setupResult.error,
        });
        serverLogger.error("Setup script failed:", setupResult.error);
        return {
          success: false,
          error: `Setup script failed: ${setupResult.error}`,
        };
      }
    } else {
      await convex.mutation(api.tasks.updateSetupScriptStatus, {
        teamSlugOrId: args.teamSlugOrId,
        id: args.taskId,
        status: "skipped",
      });
    }

    // Start dev script if present (don't wait for it)
    if (environment.devScript) {
      await convex.mutation(api.tasks.updateDevScriptStatus, {
        teamSlugOrId: args.teamSlugOrId,
        id: args.taskId,
        status: "running",
      });

      const devProcess = executeDevScript(
        args.worktreePath,
        environment.devScript,
        envVars
      );

      // Monitor for early exit (first 5 seconds)
      const earlyExitTimeout = setTimeout(() => {
        // If we reach here, the process didn't exit early, which is good
      }, 5000);

      devProcess.on("exit", (code) => {
        clearTimeout(earlyExitTimeout);
        if (code !== 0) {
          convex
            .mutation(api.tasks.updateDevScriptStatus, {
              teamSlugOrId: args.teamSlugOrId,
              id: args.taskId,
              status: "failed",
              error: `Process exited with code ${code}`,
            })
            .catch(console.error);
        } else {
          convex
            .mutation(api.tasks.updateDevScriptStatus, {
              teamSlugOrId: args.teamSlugOrId,
              id: args.taskId,
              status: "stopped",
            })
            .catch(console.error);
        }
      });

      serverLogger.info("Dev script started in background");
    }

    return { success: true };
  } catch (error) {
    serverLogger.error("Failed to setup local workspace environment:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
