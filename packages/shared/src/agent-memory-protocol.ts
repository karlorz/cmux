/**
 * Agent Memory Protocol - Spike S1
 *
 * Seeds memory directory with TASKS.json, MEMORY.md, and MAILBOX.json
 * on every sandbox creation. Agents read these on start and update them during work.
 *
 * This is a file-based approach to validate agent memory before investing in
 * Convex sync, MCP servers, or Rust harness changes.
 *
 * IMPORTANT: Memory is stored at /root/lifecycle/memory/ (OUTSIDE the git workspace)
 * to avoid polluting the user's repository with untracked files. This follows the
 * pattern used by Claude hooks, Codex, and OpenCode which all use /root/lifecycle/.
 */

import type { AuthFile } from "./worker-schemas";

// Memory protocol directory path (absolute, outside git workspace)
// Using /root/lifecycle/ to match existing patterns (Claude hooks, Codex, OpenCode)
// This prevents git pollution - memory files won't appear in `git status`
export const MEMORY_PROTOCOL_DIR = "/root/lifecycle/memory";

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

You have access to persistent memory at \`${MEMORY_PROTOCOL_DIR}/\`:

> Note: Memory is stored outside the git workspace to avoid polluting your repository.

### On Start
1. Read \`${MEMORY_PROTOCOL_DIR}/TASKS.json\` to see existing tasks and their statuses
2. Read \`${MEMORY_PROTOCOL_DIR}/MEMORY.md\` to see what previous agents have learned

### During Work
- Update task statuses in TASKS.json (pending -> in_progress -> completed)
- Create new tasks if you discover additional work needed

### On Completion
- Append a dated section to MEMORY.md with what you accomplished and learned
- Update TASKS.json with final statuses

### Inter-Agent Messaging
- Your agent name: ${agentNameEnvVar}
- Check \`${MEMORY_PROTOCOL_DIR}/MAILBOX.json\` for messages addressed to you
- To message another agent: append to the messages array with format:
  \`\`\`json
  {"from": "your-agent", "to": "target-agent", "message": "...", "timestamp": "ISO-8601"}
  \`\`\`
`;
}

/**
 * Get the startup command to create the memory directory.
 * Uses absolute path since MEMORY_PROTOCOL_DIR is now absolute.
 */
export function getMemoryStartupCommand(): string {
  return `mkdir -p ${MEMORY_PROTOCOL_DIR}`;
}

/**
 * Get auth files for memory protocol seed content.
 * These files are written to the sandbox at startup.
 * Files are placed at /root/lifecycle/memory/ (outside git workspace).
 *
 * @param sandboxId - The sandbox/task run ID for metadata
 */
export function getMemorySeedFiles(sandboxId: string): AuthFile[] {
  const Buffer = globalThis.Buffer;

  return [
    {
      destinationPath: `${MEMORY_PROTOCOL_DIR}/TASKS.json`,
      contentBase64: Buffer.from(getTasksSeedContent(sandboxId)).toString(
        "base64"
      ),
      mode: "644",
    },
    {
      destinationPath: `${MEMORY_PROTOCOL_DIR}/MEMORY.md`,
      contentBase64: Buffer.from(getMemorySeedContent()).toString("base64"),
      mode: "644",
    },
    {
      destinationPath: `${MEMORY_PROTOCOL_DIR}/MAILBOX.json`,
      contentBase64: Buffer.from(getMailboxSeedContent()).toString("base64"),
      mode: "644",
    },
  ];
}
