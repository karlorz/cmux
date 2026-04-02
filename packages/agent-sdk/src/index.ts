/**
 * @cmux/agent-sdk - Unified Agent SDK for cmux
 *
 * Spawn Claude, Codex, Gemini, Amp, and Opencode agents in remote sandboxes.
 *
 * @example Basic usage with client
 * ```ts
 * import { createClient } from '@cmux/agent-sdk';
 *
 * const client = createClient();
 *
 * // Spawn an agent
 * const task = await client.spawn({
 *   agent: "claude/opus-4.5",
 *   prompt: "Refactor the auth module",
 *   provider: "pve-lxc",
 *   repo: "owner/repo",
 * });
 *
 * // Resume a session
 * const result = await client.resume({
 *   sessionId: task.sessionId,
 *   message: "Now add tests",
 * });
 * ```
 *
 * @example Streaming events
 * ```ts
 * import { createClient } from '@cmux/agent-sdk';
 *
 * const client = createClient();
 *
 * for await (const event of client.stream({
 *   agent: "codex/gpt-5.4",
 *   prompt: "Fix the bug in auth.ts",
 *   provider: "morph",
 * })) {
 *   switch (event.type) {
 *     case "spawn": console.log(`Task ${event.taskId} started`); break;
 *     case "text": console.log(event.content); break;
 *     case "done": console.log(`Completed: ${event.result.result}`); break;
 *   }
 * }
 * ```
 *
 * @example Direct execution (no client)
 * ```ts
 * import { spawn, stream, resume } from '@cmux/agent-sdk';
 *
 * const task = await spawn({
 *   agent: "gemini/2.5-pro",
 *   prompt: "Analyze this codebase",
 *   provider: "e2b",
 * });
 * ```
 */

// Types
export {
  type AgentBackend,
  type AgentId,
  type SandboxProvider,
  type SandboxConfig,
  type SandboxConfigInput,
  type SpawnOptions,
  type SpawnOptionsInput,
  type TaskHandle,
  type TaskResult,
  type UnifiedEvent,
  type ResumeOptions,
  type ResumeOptionsInput,
  type CheckpointRef,
  type CheckpointOptions,
  type CheckpointOptionsInput,
  type MigrateOptions,
  type MigrateOptionsInput,
  type SpawnManyOptions,
  type SpawnManyOptionsInput,
  type ParallelResult,
  type TokenUsage,
  type CostBreakdown,
  type UsageStats,
  type ModelPricing,
  type PermissionMode,
  type SettingSource,
  type SystemPromptConfig,
  AgentBackendSchema,
  AgentIdSchema,
  SandboxProviderSchema,
  SandboxConfigSchema,
  SpawnOptionsSchema,
  ResumeOptionsSchema,
  CheckpointOptionsSchema,
  MigrateOptionsSchema,
  SpawnManyOptionsSchema,
  PermissionModeSchema,
  SettingSourceSchema,
  SystemPromptConfigSchema,
  MODEL_PRICING,
  parseAgentId,
  calculateCost,
  getModelPricing,
} from "./types.js";

// Client
export { CmuxClient, createClient } from "./client.js";

// Direct executor functions
export {
  executeAgent,
  executeResume,
  checkDevshAvailable,
  getSupportedProviders,
  getSupportedBackends,
  executeCheckpoint,
  executeMigrate,
  executeParallel,
} from "./executor.js";

// Convenience functions that use default client
import { CmuxClient } from "./client.js";
import type { SpawnOptionsInput, TaskHandle, TaskResult, UnifiedEvent, ResumeOptionsInput, CheckpointOptionsInput, CheckpointRef, MigrateOptionsInput, SpawnManyOptionsInput, ParallelResult } from "./types.js";

let defaultClient: CmuxClient | null = null;

function getDefaultClient(): CmuxClient {
  if (!defaultClient) {
    defaultClient = new CmuxClient();
  }
  return defaultClient;
}

/**
 * Spawn an agent (uses default client)
 */
export async function spawn(options: SpawnOptionsInput): Promise<TaskHandle> {
  return getDefaultClient().spawn(options);
}

/**
 * Stream events from agent execution (uses default client)
 */
export async function* stream(
  options: SpawnOptionsInput
): AsyncGenerator<UnifiedEvent> {
  yield* getDefaultClient().stream(options);
}

/**
 * Resume a previous session (uses default client)
 */
export async function resume(options: ResumeOptionsInput): Promise<TaskResult> {
  return getDefaultClient().resume(options);
}

/**
 * Create a checkpoint (uses default client)
 */
export async function checkpoint(options: CheckpointOptionsInput): Promise<CheckpointRef | null> {
  return getDefaultClient().checkpoint(options);
}

/**
 * Migrate a session to a different provider (uses default client)
 */
export async function migrate(options: MigrateOptionsInput): Promise<TaskResult> {
  return getDefaultClient().migrate(options);
}

/**
 * Spawn multiple agents in parallel (uses default client)
 */
export async function spawnMany(options: SpawnManyOptionsInput): Promise<ParallelResult> {
  return getDefaultClient().spawnMany(options);
}
