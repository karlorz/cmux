import { execa } from "execa";
import type {
  CmuxSandboxConfig,
  SandboxAgentResult,
  SandboxProvider,
} from "./types.js";

/**
 * Execute a prompt in a cmux sandbox via devsh orchestrate
 */
export async function executeSandboxAgent(
  prompt: string,
  agentName: string,
  config: CmuxSandboxConfig,
  options: {
    devshPath?: string;
    apiBaseUrl?: string;
    authToken?: string;
  } = {}
): Promise<SandboxAgentResult> {
  const devsh = options.devshPath ?? "devsh";
  const startTime = Date.now();

  // Build devsh orchestrate spawn command
  const args = ["orchestrate", "spawn", "--sync", "--json"];

  // Add provider
  args.push("--provider", config.provider);

  // Add repo if specified
  if (config.repo) {
    args.push("--repo", config.repo);
  }

  // Add branch
  if (config.branch) {
    args.push("--branch", config.branch);
  }

  // Add snapshot if specified
  if (config.snapshotId) {
    args.push("--snapshot", config.snapshotId);
  }

  // Add timeout
  args.push("--timeout", String(Math.floor(config.timeoutMs / 1000)));

  // Add agent name
  args.push("--agent", agentName);

  // Add the prompt
  args.push("--", prompt);

  // Build environment - filter out undefined values from process.env
  const baseEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      baseEnv[key] = value;
    }
  }
  const env: Record<string, string> = {
    ...baseEnv,
    ...(config.env ?? {}),
  };

  if (options.apiBaseUrl) {
    env.CMUX_API_BASE_URL = options.apiBaseUrl;
  }
  if (options.authToken) {
    env.CMUX_AUTH_TOKEN = options.authToken;
  }

  try {
    const result = await execa(devsh, args, {
      env,
      cwd: config.workDir,
      timeout: config.timeoutMs + 30000, // Extra buffer for spawn overhead
    });

    const durationMs = Date.now() - startTime;

    // Parse JSON output from devsh
    try {
      const output = JSON.parse(result.stdout);
      return {
        taskId: output.taskId ?? "unknown",
        exitCode: output.exitCode ?? 0,
        stdout: output.stdout ?? result.stdout,
        stderr: output.stderr ?? result.stderr,
        result: output.result ?? output.stdout ?? "",
        durationMs,
        instanceId: output.instanceId,
      };
    } catch {
      // Fallback if output isn't JSON
      return {
        taskId: "unknown",
        exitCode: result.exitCode ?? 0,
        stdout: result.stdout,
        stderr: result.stderr,
        result: result.stdout,
        durationMs,
      };
    }
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const execError = error as { exitCode?: number; stdout?: string; stderr?: string; message?: string };

    return {
      taskId: "error",
      exitCode: execError.exitCode ?? 1,
      stdout: execError.stdout ?? "",
      stderr: execError.stderr ?? execError.message ?? String(error),
      result: "",
      durationMs,
    };
  }
}

/**
 * Check if devsh is available and working
 */
export async function checkDevshAvailable(
  devshPath: string = "devsh"
): Promise<{ available: boolean; version?: string; error?: string }> {
  try {
    const result = await execa(devshPath, ["--version"], { timeout: 5000 });
    const version = result.stdout.trim();
    return { available: true, version };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get available sandbox providers
 */
export function getSupportedProviders(): SandboxProvider[] {
  return ["pve-lxc", "morph", "e2b", "modal"];
}
