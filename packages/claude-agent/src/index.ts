/**
 * @cmux/claude-agent - cmux wrapper for Claude Agent SDK
 *
 * Route sub-agent execution to remote cmux sandboxes via devsh.
 *
 * @example
 * ```typescript
 * import { query, executeSandbox, createAgent } from '@cmux/claude-agent';
 *
 * // Full agent query with sandbox-configured sub-agents
 * for await (const msg of query("Refactor auth module", {
 *   agents: {
 *     "worker": {
 *       description: "Execute in sandbox",
 *       sandbox: { provider: "pve-lxc", repo: "owner/repo" },
 *     }
 *   }
 * })) {
 *   console.log(msg);
 * }
 *
 * // Direct sandbox execution
 * const result = await executeSandbox("Run tests", {
 *   provider: "pve-lxc",
 *   repo: "owner/repo",
 * });
 *
 * // Reusable agent factory
 * const reviewer = createAgent({
 *   description: "Code reviewer",
 *   sandbox: { provider: "morph" },
 * });
 * const review = await reviewer.execute("Review auth.ts");
 * ```
 *
 * @packageDocumentation
 */

// Core agent functions
export { query, executeSandbox, createAgent } from "./agent.js";

// Sandbox execution utilities
export {
  executeSandboxAgent,
  checkDevshAvailable,
  getSupportedProviders,
} from "./sandbox-executor.js";

// Types
export type {
  SandboxProvider,
  CmuxSandboxConfig,
  CmuxAgentDefinition,
  CmuxAgentOptions,
  CmuxAgentOptionsInput,
  SandboxAgentResult,
  AgentMessage,
} from "./types.js";

// Schemas for validation
export {
  SandboxProviderSchema,
  CmuxSandboxConfigSchema,
  CmuxAgentDefinitionSchema,
  CmuxAgentOptionsSchema,
} from "./types.js";
