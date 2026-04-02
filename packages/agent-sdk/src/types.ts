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
