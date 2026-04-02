import type {
  AgentMessage,
  CmuxAgentDefinition,
  CmuxAgentOptionsInput,
  SandboxAgentResult,
} from "./types.js";
import { CmuxAgentOptionsSchema, CmuxSandboxConfigSchema } from "./types.js";
import { executeSandboxAgent, checkDevshAvailable } from "./sandbox-executor.js";

/**
 * Query the Claude Agent with cmux sandbox support for sub-agents.
 *
 * This is a wrapper that intercepts Agent tool calls for agents with
 * sandbox configurations and routes them to cmux sandboxes via devsh.
 *
 * @example
 * ```typescript
 * import { query } from '@cmux/claude-agent';
 *
 * for await (const msg of query("Refactor auth module", {
 *   allowedTools: ["Read", "Grep", "Agent"],
 *   agents: {
 *     "remote-worker": {
 *       description: "Execute tasks in isolated cmux sandbox",
 *       sandbox: { provider: "pve-lxc", repo: "owner/repo" },
 *       tools: ["Read", "Edit", "Bash"],
 *     }
 *   }
 * })) {
 *   console.log(msg);
 * }
 * ```
 */
export async function* query(
  prompt: string,
  options: CmuxAgentOptionsInput = {}
): AsyncGenerator<AgentMessage> {
  const opts = CmuxAgentOptionsSchema.parse(options);

  // Check devsh availability if we have sandbox agents
  const hasSandboxAgents = Object.values(opts.agents ?? {}).some(
    (agent) => agent.sandbox !== undefined
  );

  if (hasSandboxAgents) {
    const devshCheck = await checkDevshAvailable(opts.devshPath);
    if (!devshCheck.available) {
      yield {
        type: "error",
        message: `devsh CLI not available: ${devshCheck.error}. Install with: npm install -g devsh`,
      };
      return;
    }
  }

  // For now, this is a simplified implementation that directly executes
  // sandbox agents when called. A full implementation would integrate
  // with the actual @anthropic-ai/claude-agent-sdk.
  //
  // The pattern is:
  // 1. Start the main Claude agent with the prompt
  // 2. When Agent tool is called for a sandbox-configured agent:
  //    a. Intercept the call
  //    b. Route to devsh orchestrate spawn
  //    c. Return the result to the main agent
  // 3. Continue until completion

  yield { type: "text", content: `Starting query with prompt: ${prompt}` };

  // Check if this is a direct sandbox execution request
  const sandboxAgents = Object.entries(opts.agents ?? {}).filter(
    ([, agent]) => agent.sandbox !== undefined
  );

  if (sandboxAgents.length > 0) {
    yield {
      type: "text",
      content: `Found ${sandboxAgents.length} sandbox-configured agent(s): ${sandboxAgents.map(([name]) => name).join(", ")}`,
    };

    // Yield spawn events for all agents
    for (const [name, agent] of sandboxAgents) {
      const sandboxConfig = CmuxSandboxConfigSchema.parse(agent.sandbox);
      yield {
        type: "sandbox_spawn",
        taskId: `pending-${name}`,
        provider: sandboxConfig.provider,
      };
    }

    // Execute all sandbox agents in parallel
    const results = await Promise.all(
      sandboxAgents.map(async ([name, agent]) => {
        const sandboxConfig = CmuxSandboxConfigSchema.parse(agent.sandbox);

        const result = await executeSandboxAgent(
          agent.prompt ?? prompt,
          name,
          sandboxConfig,
          {
            devshPath: opts.devshPath,
            apiBaseUrl: opts.apiBaseUrl,
            authToken: opts.authToken,
          }
        );

        return { name, result };
      })
    );

    // Yield results
    for (const { result } of results) {
      yield {
        type: "sandbox_result",
        taskId: result.taskId,
        result,
      };
    }

    // Combine results
    const combinedResult = results
      .map(({ name, result }) => `## ${name}\n${result.result}`)
      .join("\n\n");

    yield { type: "done", result: combinedResult };
  } else {
    // No sandbox agents - this would delegate to the real Claude Agent SDK
    yield {
      type: "text",
      content:
        "No sandbox agents configured. In production, this would delegate to @anthropic-ai/claude-agent-sdk.",
    };
    yield { type: "done", result: "Query completed (no sandbox execution)" };
  }
}

/**
 * Execute a single agent in a sandbox and return the result.
 *
 * This is a convenience function for when you want to directly
 * execute work in a cmux sandbox without the full agent loop.
 *
 * @example
 * ```typescript
 * import { executeSandbox } from '@cmux/claude-agent';
 *
 * const result = await executeSandbox("Run tests and fix failures", {
 *   provider: "pve-lxc",
 *   repo: "owner/repo",
 * });
 * console.log(result.result);
 * ```
 */
export async function executeSandbox(
  prompt: string,
  config: CmuxAgentDefinition["sandbox"],
  options: {
    agentName?: string;
    devshPath?: string;
    apiBaseUrl?: string;
    authToken?: string;
  } = {}
): Promise<SandboxAgentResult> {
  if (!config) {
    throw new Error("Sandbox configuration is required");
  }

  const sandboxConfig = CmuxSandboxConfigSchema.parse(config);
  const agentName = options.agentName ?? "claude/sonnet-4.5";

  return executeSandboxAgent(prompt, agentName, sandboxConfig, {
    devshPath: options.devshPath,
    apiBaseUrl: options.apiBaseUrl,
    authToken: options.authToken,
  });
}

/**
 * Create a reusable agent executor with preset configuration.
 *
 * @example
 * ```typescript
 * import { createAgent } from '@cmux/claude-agent';
 *
 * const worker = createAgent({
 *   description: "Code review specialist",
 *   sandbox: { provider: "pve-lxc", repo: "owner/repo" },
 *   tools: ["Read", "Grep", "Glob"],
 * });
 *
 * const result = await worker.execute("Review auth.ts for security issues");
 * ```
 */
export function createAgent(definition: CmuxAgentDefinition) {
  return {
    definition,

    async execute(
      prompt: string,
      options: {
        devshPath?: string;
        apiBaseUrl?: string;
        authToken?: string;
      } = {}
    ): Promise<SandboxAgentResult> {
      if (!definition.sandbox) {
        throw new Error("Agent must have sandbox configuration");
      }

      const sandboxConfig = CmuxSandboxConfigSchema.parse(definition.sandbox);
      const fullPrompt = definition.prompt
        ? `${definition.prompt}\n\nTask: ${prompt}`
        : prompt;

      return executeSandboxAgent(
        fullPrompt,
        "claude/sonnet-4.5",
        sandboxConfig,
        options
      );
    },
  };
}
