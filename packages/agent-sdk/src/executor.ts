import { execa as nodeExeca } from "execa";
import type {
  SpawnOptions,
  TaskResult,
  SandboxProvider,
  ResumeOptions,
  CheckpointOptions,
  CheckpointRef,
  MigrateOptions,
  SpawnManyOptions,
  ParallelResult,
} from "./types.js";
import { SpawnOptionsSchema } from "./types.js";

type ExecaFn = typeof nodeExeca;

/**
 * Execute an agent via devsh orchestrate spawn (remote) or run-local (local).
 * Pass execaFn to inject a test implementation without using mock frameworks.
 */
export async function executeAgent(
  options: SpawnOptions,
  execaFn: ExecaFn = nodeExeca
): Promise<TaskResult> {
  const isLocal = options.provider === "local";

  // Build devsh orchestrate spawn or run-local command
  const args = isLocal
    ? ["orchestrate", "run-local", "--json", "--persist"]
    : ["orchestrate", "spawn", "--json"];

  if (!isLocal && options.sync) {
    args.push("--sync");
  }

  if (!isLocal) {
    // Add provider for remote execution
    args.push("--provider", options.provider);
  }

  // Add repo if specified (remote only)
  if (!isLocal && options.repo) {
    args.push("--repo", options.repo);
  }

  // Add branch (remote only)
  if (!isLocal) {
    args.push("--branch", options.branch);
  }

  // Add snapshot if specified (remote only)
  if (!isLocal && options.snapshotId) {
    args.push("--snapshot", options.snapshotId);
  }

  // Add timeout
  args.push("--timeout", String(Math.floor(options.timeoutMs / 1000)));

  // Add agent
  args.push("--agent", options.agent);

  // Claude Agent SDK specific options (only for claude/* agents)
  if (options.agent.startsWith("claude/")) {
    if (options.permissionMode) {
      args.push("--permission-mode", options.permissionMode);
    }
    const effectiveSettingSources =
      options.settingSources && options.settingSources.length > 0
        ? options.settingSources
        : isLocal && options.localClaudeProfile === "plugin-dev"
          ? ["project", "local"]
          : undefined;
    if (effectiveSettingSources && effectiveSettingSources.length > 0) {
      args.push("--setting-sources", effectiveSettingSources.join(","));
    }
    if (options.systemPrompt) {
      if (options.systemPrompt.type === "preset") {
        args.push("--system-prompt-preset", options.systemPrompt.preset);
      } else {
        args.push("--system-prompt", options.systemPrompt.content);
      }
    }
    if (options.allowedTools && options.allowedTools.length > 0) {
      args.push("--allowed-tools", options.allowedTools.join(","));
    }
    if (options.disallowedTools && options.disallowedTools.length > 0) {
      args.push("--disallowed-tools", options.disallowedTools.join(","));
    }
    if (isLocal) {
      if (options.pluginDirs && options.pluginDirs.length > 0) {
        for (const pluginDir of options.pluginDirs) {
          args.push("--plugin-dir", pluginDir);
        }
      }
      if (options.settings) {
        args.push("--settings", options.settings);
      }
      if (options.mcpConfigs && options.mcpConfigs.length > 0) {
        for (const mcpConfig of options.mcpConfigs) {
          args.push("--mcp-config", mcpConfig);
        }
      }
    }
  }

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
    const result = await execaFn(options.devshPath, args, {
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
 * Execute a resume/inject operation via devsh
 * Routes to inject-local for local run IDs and path references,
 * or orchestrate message for remote task run IDs.
 * Pass execaFn to inject a test implementation without using mock frameworks.
 */
export async function executeResume(
  options: ResumeOptions,
  execaFn: ExecaFn = nodeExeca
): Promise<TaskResult> {
  const isLocal =
    options.provider === "local" ||
    options.sessionId.startsWith("local_") ||
    options.sessionId.startsWith("/") ||
    options.sessionId.startsWith("~/");

  const args = isLocal
    ? ["orchestrate", "inject-local", "--json", options.sessionId, options.message]
    : ["orchestrate", "message", options.sessionId, options.message, "--type", "request"];

  const startTime = Date.now();

  try {
    const result = await execaFn(options.devshPath, args);
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
  devshPath = "devsh",
  execaFn: ExecaFn = nodeExeca
): Promise<{ available: boolean; version?: string; error?: string }> {
  try {
    const result = await execaFn(devshPath, ["--version"], { timeout: 5000 });
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
  options: CheckpointOptions,
  execaFn: ExecaFn = nodeExeca
): Promise<CheckpointRef | null> {
  const args = ["orchestrate", "checkpoint", "--json"];
  args.push("--task-id", options.taskId);

  if (options.label) {
    args.push("--label", options.label);
  }

  try {
    const result = await execaFn(options.devshPath, args, { timeout: 30000 });

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
  options: MigrateOptions,
  execaFn: ExecaFn = nodeExeca
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
    const result = await execaFn(options.devshPath, args, { env, timeout: 300000 });
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

/**
 * Execute multiple agents in parallel with concurrency control
 */
export async function executeParallel(
  options: SpawnManyOptions
): Promise<ParallelResult> {
  const startTime = Date.now();
  const results: ParallelResult["results"] = [];
  const { tasks, concurrency, failFast, devshPath, apiBaseUrl, authToken } = options;

  // Track cancelled state for failFast
  let cancelled = false;

  // Process tasks with concurrency control
  const activePromises: Map<number, Promise<void>> = new Map();
  let taskIndex = 0;

  const processTask = async (
    task: (typeof tasks)[number],
    index: number
  ): Promise<void> => {
    if (cancelled) {
      results[index] = {
        name: task.name,
        taskId: "cancelled",
        status: "cancelled",
      };
      return;
    }

    try {
      const spawnOptions = SpawnOptionsSchema.parse({
        agent: task.agent,
        prompt: task.prompt,
        provider: task.provider,
        repo: task.repo,
        branch: task.branch,
        timeoutMs: task.timeoutMs,
        env: task.env,
        sync: true,
        devshPath,
        apiBaseUrl,
        authToken,
      });

      const result = await executeAgent(spawnOptions);

      if (result.exitCode === 0) {
        results[index] = {
          name: task.name,
          taskId: result.taskId,
          status: "completed",
          result,
        };
      } else {
        results[index] = {
          name: task.name,
          taskId: result.taskId,
          status: "failed",
          result,
          error: result.stderr || "Non-zero exit code",
        };
        if (failFast) {
          cancelled = true;
        }
      }
    } catch (error) {
      results[index] = {
        name: task.name,
        taskId: "error",
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
      if (failFast) {
        cancelled = true;
      }
    }
  };

  // Execute with concurrency limit
  while (taskIndex < tasks.length || activePromises.size > 0) {
    // Start new tasks up to concurrency limit
    while (
      taskIndex < tasks.length &&
      (concurrency === undefined || activePromises.size < concurrency) &&
      !cancelled
    ) {
      const currentIndex = taskIndex;
      const task = tasks[currentIndex];
      taskIndex++;

      const promise = processTask(task, currentIndex).finally(() => {
        activePromises.delete(currentIndex);
      });
      activePromises.set(currentIndex, promise);
    }

    // Wait for at least one task to complete
    if (activePromises.size > 0) {
      await Promise.race(activePromises.values());
    }
  }

  // Calculate summary
  const succeeded = results.filter((r) => r.status === "completed").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const totalDurationMs = Date.now() - startTime;

  return {
    results,
    succeeded,
    failed,
    totalDurationMs,
  };
}
