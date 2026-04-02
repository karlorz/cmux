import { z } from "zod";

/**
 * Sandbox provider options for cmux remote execution
 */
export const SandboxProviderSchema = z.enum(["pve-lxc", "morph", "e2b", "modal"]);
export type SandboxProvider = z.infer<typeof SandboxProviderSchema>;

/**
 * Sandbox configuration for routing agent execution to cmux sandboxes
 */
export const CmuxSandboxConfigSchema = z.object({
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
export type CmuxSandboxConfig = z.infer<typeof CmuxSandboxConfigSchema>;

/**
 * Extended AgentDefinition with cmux sandbox support
 */
export const CmuxAgentDefinitionSchema = z.object({
  /** Natural language description of when to use this agent */
  description: z.string(),
  /** System prompt defining role and behavior */
  prompt: z.string().optional(),
  /** Allowed tools for this agent */
  tools: z.array(z.string()).optional(),
  /** Model override (sonnet, opus, haiku, or inherit) */
  model: z.enum(["sonnet", "opus", "haiku", "inherit"]).optional(),
  /** cmux sandbox configuration - if set, agent runs in remote sandbox */
  sandbox: CmuxSandboxConfigSchema.optional(),
});
export type CmuxAgentDefinition = z.infer<typeof CmuxAgentDefinitionSchema>;

/**
 * Options for cmux-enhanced Claude Agent query
 */
export const CmuxAgentOptionsSchema = z.object({
  /** Allowed tools for the main agent */
  allowedTools: z.array(z.string()).optional(),
  /** Agent definitions with optional cmux sandbox routing */
  agents: z.record(z.string(), CmuxAgentDefinitionSchema).optional(),
  /** Working directory for local execution */
  cwd: z.string().optional(),
  /** Model to use for main agent */
  model: z.enum(["sonnet", "opus", "haiku"]).optional(),
  /** Maximum tokens for response */
  maxTokens: z.number().optional(),
  /** devsh CLI path (defaults to 'devsh' in PATH) */
  devshPath: z.string().optional().default("devsh"),
  /** cmux API base URL */
  apiBaseUrl: z.string().optional(),
  /** cmux authentication token */
  authToken: z.string().optional(),
});
export type CmuxAgentOptions = z.infer<typeof CmuxAgentOptionsSchema>;

/** Input type for CmuxAgentOptions (before defaults are applied) */
export type CmuxAgentOptionsInput = z.input<typeof CmuxAgentOptionsSchema>;

/**
 * Result from a sandbox-executed agent
 */
export interface SandboxAgentResult {
  /** Task ID from devsh orchestrate */
  taskId: string;
  /** Exit code from sandbox execution */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Agent's final response/result */
  result: string;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Sandbox instance ID */
  instanceId?: string;
}

/**
 * Message types emitted during agent execution
 */
export type AgentMessage =
  | { type: "text"; content: string }
  | { type: "tool_use"; tool: string; input: unknown }
  | { type: "tool_result"; tool: string; output: unknown }
  | { type: "sandbox_spawn"; taskId: string; provider: SandboxProvider }
  | { type: "sandbox_result"; taskId: string; result: SandboxAgentResult }
  | { type: "error"; message: string }
  | { type: "done"; result: string };
