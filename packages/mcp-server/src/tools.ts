import { z } from "zod";

/**
 * Schema definitions for cmux MCP tools
 */

export const SpawnToolSchema = z.object({
  agent: z
    .string()
    .regex(/^(claude|codex|gemini|amp|opencode)\/[\w.-]+$/)
    .describe(
      "Agent ID in format 'backend/model' (e.g., 'claude/opus-4.5', 'codex/gpt-5.4')"
    ),
  prompt: z.string().describe("The task prompt for the agent"),
  provider: z
    .enum(["pve-lxc", "morph", "e2b", "modal", "local"])
    .optional()
    .describe(
      "Execution venue hint. Use 'local' for local execution, a remote provider for sandbox execution, or omit to let cmux choose."
    ),
  repo: z.string().optional().describe("GitHub repository in owner/repo format"),
  branch: z.string().optional().describe("Git branch to checkout"),
  timeoutMs: z.number().optional().describe("Timeout in milliseconds"),
  // Claude Agent SDK specific options (only used for claude/* agents)
  permissionMode: z
    .enum([
      "default",
      "acceptEdits",
      "bypassPermissions",
      "plan",
      "delegate",
      "dontAsk",
    ])
    .optional()
    .describe("Claude permission mode for tool use"),
  settingSources: z
    .array(z.enum(["user", "project", "local"]))
    .optional()
    .describe("Claude setting sources to load"),
  systemPromptPreset: z
    .enum(["claude_code", "minimal", "custom"])
    .optional()
    .describe("Claude system prompt preset"),
  systemPrompt: z
    .string()
    .optional()
    .describe("Custom system prompt content for Claude agents"),
  allowedTools: z
    .array(z.string())
    .optional()
    .describe("List of allowed tools for Claude agents"),
  disallowedTools: z
    .array(z.string())
    .optional()
    .describe("List of disallowed tools for Claude agents"),
});

export const StatusToolSchema = z.object({
  taskId: z
    .string()
    .describe("The orchestration task ID or local run ID to check status for"),
});

export const WaitToolSchema = z.object({
  taskId: z
    .string()
    .describe("The orchestration task ID or local run ID to wait for"),
  timeoutMs: z
    .number()
    .optional()
    .default(300000)
    .describe("Timeout in milliseconds (default: 5 minutes)"),
});

export const CancelToolSchema = z.object({
  taskId: z
    .string()
    .describe("The orchestration task ID or local run ID to cancel"),
});

export const ResultsToolSchema = z.object({
  taskId: z
    .string()
    .describe(
      "The orchestration task ID, orchestration session ID, or local run ID to get results for"
    ),
});

export const InjectToolSchema = z.object({
  sessionId: z
    .string()
    .describe("The task-run ID or local run ID to append an instruction to"),
  message: z.string().describe("The instruction to send"),
  provider: z
    .enum(["pve-lxc", "morph", "e2b", "modal", "local"])
    .optional()
    .describe(
      "Optional execution venue hint. Use 'local' when the target ID is ambiguous."
    ),
});

export const CheckpointToolSchema = z.object({
  taskId: z.string().describe("The task ID to checkpoint"),
  label: z.string().optional().describe("Optional label for the checkpoint"),
});

export const MigrateToolSchema = z.object({
  source: z.string().describe("Source session or checkpoint ID"),
  targetProvider: z
    .enum(["pve-lxc", "morph", "e2b", "modal", "local"])
    .describe("Target provider to migrate to"),
  message: z.string().optional().describe("Optional continuation message"),
});

export const ListToolSchema = z.object({
  status: z
    .enum(["pending", "running", "completed", "failed", "cancelled"])
    .optional()
    .describe("Filter by status"),
  limit: z.number().optional().default(10).describe("Maximum number of results"),
});

export type SpawnInput = z.infer<typeof SpawnToolSchema>;
export type StatusInput = z.infer<typeof StatusToolSchema>;
export type WaitInput = z.infer<typeof WaitToolSchema>;
export type CancelInput = z.infer<typeof CancelToolSchema>;
export type ResultsInput = z.infer<typeof ResultsToolSchema>;
export type InjectInput = z.infer<typeof InjectToolSchema>;
export type CheckpointInput = z.infer<typeof CheckpointToolSchema>;
export type MigrateInput = z.infer<typeof MigrateToolSchema>;
export type ListInput = z.infer<typeof ListToolSchema>;

/**
 * Tool definitions for MCP server
 */
export const TOOL_DEFINITIONS = [
  {
    name: "cmux_spawn",
    description:
      "Spawn a new agent task in either the local workspace or a remote sandbox. Returns an ID you can use for follow-up status, wait, results, cancel, or instruction calls.",
    inputSchema: SpawnToolSchema,
  },
  {
    name: "cmux_status",
    description:
      "Get the current status of a spawned agent task or local run. Returns the latest known state and any available metadata.",
    inputSchema: StatusToolSchema,
  },
  {
    name: "cmux_wait",
    description:
      "Wait for a spawned task or local run to complete. Blocks until the task finishes or timeout is reached.",
    inputSchema: WaitToolSchema,
  },
  {
    name: "cmux_cancel",
    description: "Cancel a running remote task or stop a running local run.",
    inputSchema: CancelToolSchema,
  },
  {
    name: "cmux_results",
    description:
      "Get the best available result payload for a completed remote task, orchestration session, or local run.",
    inputSchema: ResultsToolSchema,
  },
  {
    name: "cmux_inject",
    description:
      "Append an instruction to a running remote task or local run. Use this for course corrections and follow-up guidance after launch.",
    inputSchema: InjectToolSchema,
  },
  {
    name: "cmux_checkpoint",
    description:
      "Create a checkpoint of a task's current state. The checkpoint can be used later to resume or migrate the session.",
    inputSchema: CheckpointToolSchema,
  },
  {
    name: "cmux_migrate",
    description:
      "Migrate a session from one provider to another. Useful for moving work between sandbox environments.",
    inputSchema: MigrateToolSchema,
  },
  {
    name: "cmux_list",
    description:
      "List recent orchestration tasks and local runs with an optional status filter.",
    inputSchema: ListToolSchema,
  },
] as const;
