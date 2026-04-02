import {
  type SpawnOptionsInput,
  type TaskHandle,
  type TaskResult,
  type UnifiedEvent,
  type ResumeOptionsInput,
  SpawnOptionsSchema,
  ResumeOptionsSchema,
} from "./types.js";
import { executeAgent, executeResume, checkDevshAvailable } from "./executor.js";

/**
 * cmux Unified Agent SDK Client
 *
 * Provides a unified interface for spawning and managing agents
 * across multiple backends (Claude, Codex, Gemini, Amp, Opencode)
 * and providers (PVE-LXC, Morph, E2B, Modal, Local).
 */
export class CmuxClient {
  private devshPath: string;
  private apiBaseUrl?: string;
  private authToken?: string;
  private activeTasks: Map<string, TaskHandle> = new Map();

  constructor(options: {
    devshPath?: string;
    apiBaseUrl?: string;
    authToken?: string;
  } = {}) {
    this.devshPath = options.devshPath ?? "devsh";
    this.apiBaseUrl = options.apiBaseUrl;
    this.authToken = options.authToken;
  }

  /**
   * Spawn an agent in a sandbox
   *
   * @example
   * ```ts
   * const task = await client.spawn({
   *   agent: "claude/opus-4.5",
   *   prompt: "Refactor the auth module",
   *   provider: "pve-lxc",
   *   repo: "owner/repo",
   * });
   * ```
   */
  async spawn(options: SpawnOptionsInput): Promise<TaskHandle> {
    const parsed = SpawnOptionsSchema.parse({
      ...options,
      devshPath: options.devshPath ?? this.devshPath,
      apiBaseUrl: options.apiBaseUrl ?? this.apiBaseUrl,
      authToken: options.authToken ?? this.authToken,
    });

    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const handle: TaskHandle = {
      id: taskId,
      agent: parsed.agent,
      provider: parsed.provider,
      status: "pending",
      createdAt: new Date(),
    };

    this.activeTasks.set(taskId, handle);

    // Execute and wait for result
    handle.status = "running";

    try {
      const result = await executeAgent(parsed);

      handle.status = result.exitCode === 0 ? "completed" : "failed";
      handle.sessionId = result.sessionId;

      return handle;
    } catch (error) {
      handle.status = "failed";
      throw error;
    }
  }

  /**
   * Stream events from an agent execution
   *
   * @example
   * ```ts
   * for await (const event of client.stream(task.id)) {
   *   switch (event.type) {
   *     case "text": console.log(event.content); break;
   *     case "done": console.log(event.result); break;
   *   }
   * }
   * ```
   */
  async *stream(options: SpawnOptionsInput): AsyncGenerator<UnifiedEvent> {
    const parsed = SpawnOptionsSchema.parse({
      ...options,
      devshPath: options.devshPath ?? this.devshPath,
      apiBaseUrl: options.apiBaseUrl ?? this.apiBaseUrl,
      authToken: options.authToken ?? this.authToken,
    });

    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Emit spawn event
    yield {
      type: "spawn",
      taskId,
      agent: parsed.agent,
      provider: parsed.provider,
    };

    // Execute agent
    const result = await executeAgent(parsed);

    // Emit result text if available
    if (result.result) {
      yield { type: "text", content: result.result };
    }

    // Emit checkpoint if session ID available
    if (result.sessionId) {
      yield {
        type: "checkpoint",
        ref: result.sessionId,
        resumable: true,
      };
    }

    // Emit done event
    yield {
      type: "done",
      taskId,
      result,
    };
  }

  /**
   * Resume a previous session with a new message
   *
   * @example
   * ```ts
   * const result = await client.resume({
   *   sessionId: task.sessionId,
   *   message: "Now add tests for it",
   * });
   * ```
   */
  async resume(options: ResumeOptionsInput): Promise<TaskResult> {
    const parsed = ResumeOptionsSchema.parse({
      ...options,
      devshPath: options.devshPath ?? this.devshPath,
    });

    return executeResume(parsed);
  }

  /**
   * Get a task handle by ID
   */
  getTask(taskId: string): TaskHandle | undefined {
    return this.activeTasks.get(taskId);
  }

  /**
   * List all active tasks
   */
  listTasks(): TaskHandle[] {
    return Array.from(this.activeTasks.values());
  }

  /**
   * Check if devsh CLI is available
   */
  async checkAvailability(): Promise<{
    available: boolean;
    version?: string;
    error?: string;
  }> {
    return checkDevshAvailable(this.devshPath);
  }
}

/**
 * Create a new cmux client instance
 */
export function createClient(options?: {
  devshPath?: string;
  apiBaseUrl?: string;
  authToken?: string;
}): CmuxClient {
  return new CmuxClient(options);
}
