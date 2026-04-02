import { z } from "zod";

/**
 * Supported agent backends
 */
export const AgentBackendSchema = z.enum([
  "claude",
  "codex",
  "gemini",
  "amp",
  "opencode",
]);
export type AgentBackend = z.infer<typeof AgentBackendSchema>;

/**
 * Sandbox provider options for cmux remote execution
 */
export const SandboxProviderSchema = z.enum([
  "pve-lxc",
  "morph",
  "e2b",
  "modal",
  "local",
]);
export type SandboxProvider = z.infer<typeof SandboxProviderSchema>;

/**
 * Agent identifier format: backend/model
 * Examples: claude/opus-4.5, codex/gpt-5.4, gemini/2.5-pro
 */
export const AgentIdSchema = z
  .string()
  .regex(
    /^(claude|codex|gemini|amp|opencode)\/[\w.-]+$/,
    "Agent ID must be in format: backend/model (e.g., claude/opus-4.5)"
  );
export type AgentId = z.infer<typeof AgentIdSchema>;

/**
 * Parse agent ID into backend and model
 */
export function parseAgentId(agentId: string): { backend: AgentBackend; model: string } {
  const [backend, model] = agentId.split("/");
  return {
    backend: backend as AgentBackend,
    model,
  };
}

/**
 * Sandbox configuration for routing agent execution
 */
export const SandboxConfigSchema = z.object({
  /** Sandbox provider to use */
  provider: SandboxProviderSchema.default("pve-lxc"),
  /** GitHub repository in owner/repo format */
  repo: z.string().optional(),
  /** Branch to checkout */
  branch: z.string().default("main"),
  /** Snapshot/template ID (provider-specific) */
  snapshotId: z.string().optional(),
  /** Working directory inside sandbox */
  workDir: z.string().default("/root/workspace"),
  /** Timeout in milliseconds */
  timeoutMs: z.number().default(600000), // 10 minutes
  /** Environment variables to inject */
  env: z.record(z.string(), z.string()).optional(),
});
export type SandboxConfig = z.infer<typeof SandboxConfigSchema>;
export type SandboxConfigInput = z.input<typeof SandboxConfigSchema>;

/**
 * Options for spawning an agent
 */
export const SpawnOptionsSchema = z.object({
  /** Agent to use (e.g., "claude/opus-4.5", "codex/gpt-5.4") */
  agent: AgentIdSchema,
  /** The prompt/task for the agent */
  prompt: z.string(),
  /** Sandbox provider (defaults to pve-lxc) */
  provider: SandboxProviderSchema.default("pve-lxc"),
  /** GitHub repository in owner/repo format */
  repo: z.string().optional(),
  /** Branch to checkout */
  branch: z.string().default("main"),
  /** Snapshot/template ID (provider-specific) */
  snapshotId: z.string().optional(),
  /** Working directory inside sandbox */
  workDir: z.string().default("/root/workspace"),
  /** Timeout in milliseconds */
  timeoutMs: z.number().default(600000),
  /** Environment variables to inject */
  env: z.record(z.string(), z.string()).optional(),
  /** Run in synchronous mode (wait for completion) */
  sync: z.boolean().default(true),
  /** devsh CLI path */
  devshPath: z.string().default("devsh"),
  /** cmux API base URL */
  apiBaseUrl: z.string().optional(),
  /** cmux authentication token */
  authToken: z.string().optional(),
});
export type SpawnOptions = z.infer<typeof SpawnOptionsSchema>;
export type SpawnOptionsInput = z.input<typeof SpawnOptionsSchema>;

/**
 * Task handle returned from spawn()
 */
export interface TaskHandle {
  /** Unique task ID */
  id: string;
  /** Agent that was spawned */
  agent: AgentId;
  /** Provider where agent is running */
  provider: SandboxProvider;
  /** Sandbox instance ID (if available) */
  instanceId?: string;
  /** Session ID for resumption (backend-specific) */
  sessionId?: string;
  /** Status of the task */
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  /** Creation timestamp */
  createdAt: Date;
}

/**
 * Result from a completed task
 */
export interface TaskResult {
  /** Task ID */
  taskId: string;
  /** Exit code from execution */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Final result/response from agent */
  result: string;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Session ID for resumption */
  sessionId?: string;
  /** Checkpoint reference (if checkpointing enabled) */
  checkpointRef?: string;
  /** Usage statistics (tokens, cost, etc.) */
  usage?: UsageStats;
}

/**
 * Unified event types emitted during agent execution
 */
export type UnifiedEvent =
  | { type: "spawn"; taskId: string; agent: string; provider: SandboxProvider }
  | { type: "text"; content: string }
  | { type: "tool_use"; tool: string; input: unknown }
  | { type: "tool_result"; tool: string; output: unknown }
  | { type: "progress"; message: string; percent?: number }
  | { type: "checkpoint"; ref: string; resumable: boolean }
  | { type: "error"; code: string; message: string }
  | { type: "done"; taskId: string; result: TaskResult };

/**
 * Options for resuming a task
 */
export const ResumeOptionsSchema = z.object({
  /** Session ID from previous execution */
  sessionId: z.string(),
  /** New message/prompt to continue with */
  message: z.string(),
  /** Optional: migrate to different provider */
  provider: SandboxProviderSchema.optional(),
  /** devsh CLI path */
  devshPath: z.string().default("devsh"),
});
export type ResumeOptions = z.infer<typeof ResumeOptionsSchema>;
export type ResumeOptionsInput = z.input<typeof ResumeOptionsSchema>;

/**
 * Checkpoint reference for saving/restoring state
 */
export interface CheckpointRef {
  /** Unique checkpoint ID */
  id: string;
  /** Task ID this checkpoint belongs to */
  taskId: string;
  /** Agent that created this checkpoint */
  agent: AgentId;
  /** Provider where checkpoint was created */
  sourceProvider: SandboxProvider;
  /** Session ID for resumption */
  sessionId: string;
  /** Timestamp when checkpoint was created */
  createdAt: Date;
  /** Whether this checkpoint can be resumed */
  resumable: boolean;
  /** Provider-specific checkpoint data */
  data?: Record<string, unknown>;
}

/**
 * Options for creating a checkpoint
 */
export const CheckpointOptionsSchema = z.object({
  /** Task ID to checkpoint */
  taskId: z.string(),
  /** Optional label for the checkpoint */
  label: z.string().optional(),
  /** devsh CLI path */
  devshPath: z.string().default("devsh"),
});
export type CheckpointOptions = z.infer<typeof CheckpointOptionsSchema>;
export type CheckpointOptionsInput = z.input<typeof CheckpointOptionsSchema>;

/**
 * Options for migrating a session to a different provider
 */
export const MigrateOptionsSchema = z.object({
  /** Checkpoint reference or session ID to migrate from */
  source: z.string(),
  /** Target provider to migrate to */
  targetProvider: SandboxProviderSchema,
  /** Optional: new repo (if different from source) */
  repo: z.string().optional(),
  /** Optional: new branch */
  branch: z.string().optional(),
  /** Optional: continuation message */
  message: z.string().optional(),
  /** devsh CLI path */
  devshPath: z.string().default("devsh"),
  /** cmux API base URL */
  apiBaseUrl: z.string().optional(),
  /** cmux authentication token */
  authToken: z.string().optional(),
});
export type MigrateOptions = z.infer<typeof MigrateOptionsSchema>;
export type MigrateOptionsInput = z.input<typeof MigrateOptionsSchema>;

/**
 * Options for spawning multiple agents in parallel
 */
export const SpawnManyOptionsSchema = z.object({
  /** Array of spawn configurations */
  tasks: z.array(
    z.object({
      /** Optional task name for identification */
      name: z.string().optional(),
      /** Agent to use */
      agent: AgentIdSchema,
      /** The prompt/task for the agent */
      prompt: z.string(),
      /** Sandbox provider */
      provider: SandboxProviderSchema.default("pve-lxc"),
      /** GitHub repository */
      repo: z.string().optional(),
      /** Branch to checkout */
      branch: z.string().default("main"),
      /** Timeout in milliseconds */
      timeoutMs: z.number().default(600000),
      /** Environment variables */
      env: z.record(z.string(), z.string()).optional(),
    })
  ),
  /** Maximum concurrent tasks (default: unlimited) */
  concurrency: z.number().optional(),
  /** Fail fast: stop all tasks if one fails */
  failFast: z.boolean().default(false),
  /** devsh CLI path */
  devshPath: z.string().default("devsh"),
  /** cmux API base URL */
  apiBaseUrl: z.string().optional(),
  /** cmux authentication token */
  authToken: z.string().optional(),
});
export type SpawnManyOptions = z.infer<typeof SpawnManyOptionsSchema>;
export type SpawnManyOptionsInput = z.input<typeof SpawnManyOptionsSchema>;

/**
 * Result from parallel execution
 */
export interface ParallelResult {
  /** All task results (in order of tasks array) */
  results: Array<{
    name?: string;
    taskId: string;
    status: "completed" | "failed" | "cancelled";
    result?: TaskResult;
    error?: string;
  }>;
  /** Number of successful tasks */
  succeeded: number;
  /** Number of failed tasks */
  failed: number;
  /** Total duration in milliseconds */
  totalDurationMs: number;
}

/**
 * Token usage statistics from an agent execution
 */
export interface TokenUsage {
  /** Input/prompt tokens */
  inputTokens: number;
  /** Output/completion tokens */
  outputTokens: number;
  /** Cache read tokens (if applicable) */
  cacheReadTokens?: number;
  /** Cache write tokens (if applicable) */
  cacheWriteTokens?: number;
  /** Total tokens (input + output) */
  totalTokens: number;
}

/**
 * Cost breakdown for an agent execution
 */
export interface CostBreakdown {
  /** Input token cost in USD */
  inputCost: number;
  /** Output token cost in USD */
  outputCost: number;
  /** Cache cost in USD (if applicable) */
  cacheCost?: number;
  /** Total cost in USD */
  totalCost: number;
  /** Cost currency (always USD) */
  currency: "USD";
}

/**
 * Usage statistics for an agent execution
 */
export interface UsageStats {
  /** Token usage breakdown */
  tokens: TokenUsage;
  /** Cost breakdown (if pricing available) */
  cost?: CostBreakdown;
  /** Number of API requests made */
  apiRequests: number;
  /** Number of tool calls */
  toolCalls: number;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Model used for execution */
  model: string;
  /** Agent backend */
  backend: AgentBackend;
}

/**
 * Pricing per million tokens for a model
 */
export interface ModelPricing {
  /** Input token price per million */
  inputPerMillion: number;
  /** Output token price per million */
  outputPerMillion: number;
  /** Cache read price per million (if applicable) */
  cacheReadPerMillion?: number;
  /** Cache write price per million (if applicable) */
  cacheWritePerMillion?: number;
}

/**
 * Known model pricing (as of 2026-04)
 * Prices in USD per million tokens
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Claude models
  "claude-opus-4-6": { inputPerMillion: 15, outputPerMillion: 75, cacheReadPerMillion: 1.5, cacheWritePerMillion: 18.75 },
  "claude-opus-4-5-20251101": { inputPerMillion: 15, outputPerMillion: 75, cacheReadPerMillion: 1.5, cacheWritePerMillion: 18.75 },
  "claude-sonnet-4-6": { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
  "claude-sonnet-4-5-20250929": { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
  "claude-haiku-4-5-20251001": { inputPerMillion: 0.8, outputPerMillion: 4, cacheReadPerMillion: 0.08, cacheWritePerMillion: 1 },
  // Codex/OpenAI models (approximate)
  "gpt-5.4": { inputPerMillion: 10, outputPerMillion: 30 },
  "gpt-5.4-xhigh": { inputPerMillion: 10, outputPerMillion: 30 },
  "gpt-5.1-codex": { inputPerMillion: 2.5, outputPerMillion: 10 },
  "gpt-5.1-codex-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  // Gemini models (approximate)
  "2.5-pro": { inputPerMillion: 1.25, outputPerMillion: 5 },
  "2.5-flash": { inputPerMillion: 0.075, outputPerMillion: 0.3 },
};

/**
 * Calculate cost from token usage and pricing
 */
export function calculateCost(tokens: TokenUsage, pricing: ModelPricing): CostBreakdown {
  const inputCost = (tokens.inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (tokens.outputTokens / 1_000_000) * pricing.outputPerMillion;

  let cacheCost: number | undefined;
  if (pricing.cacheReadPerMillion && tokens.cacheReadTokens) {
    cacheCost = (tokens.cacheReadTokens / 1_000_000) * pricing.cacheReadPerMillion;
  }
  if (pricing.cacheWritePerMillion && tokens.cacheWriteTokens) {
    cacheCost = (cacheCost ?? 0) + (tokens.cacheWriteTokens / 1_000_000) * pricing.cacheWritePerMillion;
  }

  return {
    inputCost,
    outputCost,
    cacheCost,
    totalCost: inputCost + outputCost + (cacheCost ?? 0),
    currency: "USD",
  };
}

/**
 * Get pricing for a model, returns undefined if not found
 */
export function getModelPricing(model: string): ModelPricing | undefined {
  // Try exact match first
  if (MODEL_PRICING[model]) {
    return MODEL_PRICING[model];
  }

  // Try partial match (e.g., "opus-4.5" matches "claude-opus-4-5-20251101")
  const normalizedModel = model.toLowerCase().replace(/[.-]/g, "");
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    const normalizedKey = key.toLowerCase().replace(/[.-]/g, "");
    if (normalizedKey.includes(normalizedModel) || normalizedModel.includes(normalizedKey)) {
      return pricing;
    }
  }

  return undefined;
}
