/**
 * Agent Memory Protocol - Spike S1
 *
 * Seeds `.cmux/memory/` directory with TASKS.json, MEMORY.md, and MAILBOX.json
 * on every sandbox creation. Agents read these on start and update them during work.
 *
 * This is a file-based approach to validate agent memory before investing in
 * Convex sync, MCP servers, or Rust harness changes.
 */

import type { AuthFile } from "./worker-schemas";

// Memory protocol directory path (relative to workspace root)
export const MEMORY_PROTOCOL_DIR = ".cmux/memory";

/**
 * Seed content for TASKS.json
 */
export function getTasksSeedContent(sandboxId: string): string {
  const seed = {
    version: 1,
    tasks: [],
    metadata: {
      sandboxId,
      createdAt: new Date().toISOString(),
    },
  };
  return JSON.stringify(seed, null, 2);
}

/**
 * Seed content for MEMORY.md
 */
export function getMemorySeedContent(): string {
  return `# Project Memory

> This file is maintained by agents. Read on start, append on finish.

---
`;
}

/**
 * Seed content for MAILBOX.json
 */
export function getMailboxSeedContent(): string {
  const seed = {
    version: 1,
    messages: [],
  };
  return JSON.stringify(seed, null, 2);
}

/**
 * Memory protocol instructions for agents.
 * This text should be included in each agent's instruction file.
 *
 * @param agentNameEnvVar - The environment variable name for agent name (default: $CMUX_AGENT_NAME)
 */
export function getMemoryProtocolInstructions(
  agentNameEnvVar: string = "$CMUX_AGENT_NAME"
): string {
  return `## cmux Agent Memory Protocol

You have access to persistent memory in \`.cmux/memory/\`:

### On Start
1. Read \`.cmux/memory/TASKS.json\` to see existing tasks and their statuses
2. Read \`.cmux/memory/MEMORY.md\` to see what previous agents have learned

### During Work
- Update task statuses in TASKS.json (pending -> in_progress -> completed)
- Create new tasks if you discover additional work needed

### On Completion
- Append a dated section to MEMORY.md with what you accomplished and learned
- Update TASKS.json with final statuses

### Inter-Agent Messaging
- Your agent name: ${agentNameEnvVar}
- Check \`.cmux/memory/MAILBOX.json\` for messages addressed to you
- To message another agent: append to the messages array with format:
  \`\`\`json
  {"from": "your-agent", "to": "target-agent", "message": "...", "timestamp": "ISO-8601"}
  \`\`\`
`;
}

/**
 * Get the startup command to create the memory directory.
 */
export function getMemoryStartupCommand(): string {
  return `mkdir -p /root/workspace/${MEMORY_PROTOCOL_DIR}`;
}

/**
 * Get auth files for memory protocol seed content.
 * These files are written to the sandbox at startup.
 *
 * @param sandboxId - The sandbox/task run ID for metadata
 */
export function getMemorySeedFiles(sandboxId: string): AuthFile[] {
  const Buffer = globalThis.Buffer;

  return [
    {
      destinationPath: `/root/workspace/${MEMORY_PROTOCOL_DIR}/TASKS.json`,
      contentBase64: Buffer.from(getTasksSeedContent(sandboxId)).toString(
        "base64"
      ),
      mode: "644",
    },
    {
      destinationPath: `/root/workspace/${MEMORY_PROTOCOL_DIR}/MEMORY.md`,
      contentBase64: Buffer.from(getMemorySeedContent()).toString("base64"),
      mode: "644",
    },
    {
      destinationPath: `/root/workspace/${MEMORY_PROTOCOL_DIR}/MAILBOX.json`,
      contentBase64: Buffer.from(getMailboxSeedContent()).toString("base64"),
      mode: "644",
    },
  ];
}
