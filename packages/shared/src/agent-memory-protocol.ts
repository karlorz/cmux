import type { AuthFile } from "./worker-schemas";

export const CMUX_MEMORY_DIR = "/root/workspace/.cmux/memory";
export const CMUX_MEMORY_TASKS_PATH = `${CMUX_MEMORY_DIR}/TASKS.json`;
export const CMUX_MEMORY_MARKDOWN_PATH = `${CMUX_MEMORY_DIR}/MEMORY.md`;
export const CMUX_MEMORY_MAILBOX_PATH = `${CMUX_MEMORY_DIR}/MAILBOX.json`;
const MEMORY_PROTOCOL_HEADING = "## cmux Agent Memory Protocol";

type MemoryTaskSeed = {
  version: number;
  tasks: Array<unknown>;
  metadata: {
    sandboxId: string;
    createdAt: string;
  };
};

type MemoryMailboxSeed = {
  version: number;
  messages: Array<unknown>;
};

function toBase64(value: string): string {
  return Buffer.from(value, "utf-8").toString("base64");
}

function withTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

export function getMemoryStartupCommands(): string[] {
  return [`mkdir -p ${CMUX_MEMORY_DIR}`];
}

export function getMemoryAuthFiles(sandboxId: string): AuthFile[] {
  const tasksSeed: MemoryTaskSeed = {
    version: 1,
    tasks: [],
    metadata: {
      sandboxId,
      createdAt: new Date().toISOString(),
    },
  };

  const mailboxSeed: MemoryMailboxSeed = {
    version: 1,
    messages: [],
  };

  const memoryMarkdown = `# Project Memory

> This file is maintained by agents. Read on start, append on finish.

---
`;

  return [
    {
      destinationPath: CMUX_MEMORY_TASKS_PATH,
      contentBase64: toBase64(withTrailingNewline(JSON.stringify(tasksSeed, null, 2))),
      mode: "644",
    },
    {
      destinationPath: CMUX_MEMORY_MARKDOWN_PATH,
      contentBase64: toBase64(memoryMarkdown),
      mode: "644",
    },
    {
      destinationPath: CMUX_MEMORY_MAILBOX_PATH,
      contentBase64: toBase64(
        withTrailingNewline(JSON.stringify(mailboxSeed, null, 2)),
      ),
      mode: "644",
    },
  ];
}

export function getMemoryProtocolInstructions(agentName: string): string {
  return `${MEMORY_PROTOCOL_HEADING}

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
- Your agent name: ${agentName}
- Check \`.cmux/memory/MAILBOX.json\` for messages addressed to you
- To message another agent: append to the messages array`;
}

export function appendMemoryProtocolInstructions(
  existingContent: string | null | undefined,
  agentName: string,
): string {
  const normalizedExisting = existingContent?.trimEnd() ?? "";
  if (normalizedExisting.includes(MEMORY_PROTOCOL_HEADING)) {
    return withTrailingNewline(normalizedExisting);
  }

  if (normalizedExisting.length === 0) {
    return withTrailingNewline(getMemoryProtocolInstructions(agentName));
  }

  return withTrailingNewline(
    `${normalizedExisting}\n\n${getMemoryProtocolInstructions(agentName)}`,
  );
}
