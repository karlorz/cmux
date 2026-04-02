import { execa } from "execa";
import type {
  SpawnOptions,
  TaskResult,
  SandboxProvider,
  ResumeOptions,
  CheckpointOptions,
  CheckpointRef,
  MigrateOptions,
} from "./types.js";

/**
 * Execute an agent via devsh orchestrate spawn
 */
export async function executeAgent(
  options: SpawnOptions
): Promise<TaskResult> {

  // Build devsh orchestrate spawn command
  const args = ["orchestrate", "spawn", "--json"];

  if (options.sync) {
    args.push("--sync");
  }

  // Add provider
  args.push("--provider", options.provider);

  // Add repo if specified
  if (options.repo) {
    args.push("--repo", options.repo);
  }

  // Add branch
  args.push("--branch", options.branch);

  // Add snapshot if specified
  if (options.snapshotId) {
    args.push("--snapshot", options.snapshotId);
  }

  // Add timeout
  args.push("--timeout", String(Math.floor(options.timeoutMs / 1000)));

  // Add agent
  args.push("--agent", options.agent);

  // Add the prompt
  args.push("--", options.prompt);

  // Build environment (filter out undefined values from process.env)
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  if (options.env) {
    Object.assign(env, options.env);
  }
  if (options.apiBaseUrl) {
    env.CMUX_API_BASE_URL = options.apiBaseUrl;
  }
  if (options.authToken) {
    env.CMUX_AUTH_TOKEN = options.authToken;
  }

  const startTime = Date.now();

  try {
    const result = await execa(options.devshPath, args, {
      env,
      cwd: options.workDir,
      timeout: options.timeoutMs + 30000, // Add buffer for spawn overhead
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
        sessionId: output.sessionId,
        checkpointRef: output.checkpointRef,
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
    const err = error as Error & { exitCode?: number; stderr?: string };

    return {
      taskId: "error",
      exitCode: err.exitCode ?? 1,
      stdout: "",
      stderr: err.message ?? String(error),
      result: "",
      durationMs,
    };
  }
}

/**
 * Execute a resume operation via devsh
 */
export async function executeResume(
  options: ResumeOptions
): Promise<TaskResult> {
  const args = ["orchestrate", "inject", "--json"];

  args.push("--session-id", options.sessionId);

  if (options.provider) {
    args.push("--provider", options.provider);
  }

  args.push("--", options.message);

  const startTime = Date.now();

  try {
    const result = await execa(options.devshPath, args);
    const durationMs = Date.now() - startTime;

    try {
      const output = JSON.parse(result.stdout);
      return {
        taskId: output.taskId ?? "resumed",
        exitCode: output.exitCode ?? 0,
        stdout: output.stdout ?? result.stdout,
        stderr: output.stderr ?? result.stderr,
        result: output.result ?? output.stdout ?? "",
        durationMs,
        sessionId: output.sessionId ?? options.sessionId,
      };
    } catch {
      return {
        taskId: "resumed",
        exitCode: result.exitCode ?? 0,
        stdout: result.stdout,
        stderr: result.stderr,
        result: result.stdout,
        durationMs,
        sessionId: options.sessionId,
      };
    }
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const err = error as Error & { exitCode?: number };

    return {
      taskId: "error",
      exitCode: err.exitCode ?? 1,
      stdout: "",
      stderr: err.message ?? String(error),
      result: "",
      durationMs,
    };
  }
}

/**
 * Check if devsh is available
 */
export async function checkDevshAvailable(
  devshPath = "devsh"
): Promise<{ available: boolean; version?: string; error?: string }> {
  try {
    const result = await execa(devshPath, ["--version"], { timeout: 5000 });
    return { available: true, version: result.stdout.trim() };
  } catch (error) {
    return { available: false, error: String(error) };
  }
}

/**
 * Get supported providers from devsh
 */
export function getSupportedProviders(): SandboxProvider[] {
  return ["pve-lxc", "morph", "e2b", "modal", "local"];
}

/**
 * Get supported agent backends
 */
export function getSupportedBackends(): string[] {
  return ["claude", "codex", "gemini", "amp", "opencode"];
}

/**
 * Create a checkpoint for a running or completed task
 */
export async function executeCheckpoint(
  options: CheckpointOptions
): Promise<CheckpointRef | null> {
  const args = ["orchestrate", "checkpoint", "--json"];
  args.push("--task-id", options.taskId);

  if (options.label) {
    args.push("--label", options.label);
  }

  try {
    const result = await execa(options.devshPath, args, { timeout: 30000 });

    try {
      const output = JSON.parse(result.stdout);
      return {
        id: output.checkpointId ?? output.id,
        taskId: options.taskId,
        agent: output.agent ?? "unknown/unknown",
        sourceProvider: output.provider ?? "local",
        sessionId: output.sessionId,
        createdAt: new Date(output.createdAt ?? Date.now()),
        resumable: output.resumable ?? true,
        data: output.data,
      };
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

/**
 * Migrate a session to a different provider
 */
export async function executeMigrate(
  options: MigrateOptions
): Promise<TaskResult> {
  const args = ["orchestrate", "migrate", "--json"];

  args.push("--source", options.source);
  args.push("--target-provider", options.targetProvider);

  if (options.repo) {
    args.push("--repo", options.repo);
  }

  if (options.branch) {
    args.push("--branch", options.branch);
  }

  if (options.message) {
    args.push("--", options.message);
  }

  // Build environment
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  if (options.apiBaseUrl) {
    env.CMUX_API_BASE_URL = options.apiBaseUrl;
  }
  if (options.authToken) {
    env.CMUX_AUTH_TOKEN = options.authToken;
  }

  const startTime = Date.now();

  try {
    const result = await execa(options.devshPath, args, { env, timeout: 300000 });
    const durationMs = Date.now() - startTime;

    try {
      const output = JSON.parse(result.stdout);
      return {
        taskId: output.taskId ?? "migrated",
        exitCode: output.exitCode ?? 0,
        stdout: output.stdout ?? result.stdout,
        stderr: output.stderr ?? result.stderr,
        result: output.result ?? output.stdout ?? "",
        durationMs,
        sessionId: output.sessionId,
        checkpointRef: output.checkpointRef,
      };
    } catch {
      return {
        taskId: "migrated",
        exitCode: result.exitCode ?? 0,
        stdout: result.stdout,
        stderr: result.stderr,
        result: result.stdout,
        durationMs,
      };
    }
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const err = error as Error & { exitCode?: number };

    return {
      taskId: "error",
      exitCode: err.exitCode ?? 1,
      stdout: "",
      stderr: err.message ?? String(error),
      result: "",
      durationMs,
    };
  }
}
