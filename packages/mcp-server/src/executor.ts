import { execa } from "execa";
import type {
  SpawnInput,
  StatusInput,
  WaitInput,
  CancelInput,
  ResultsInput,
  InjectInput,
  CheckpointInput,
  MigrateInput,
  ListInput,
} from "./tools.js";

export interface ExecutorConfig {
  devshPath?: string;
}

/**
 * Executor that wraps devsh CLI commands
 */
export class DevshExecutor {
  private devshPath: string;

  constructor(config: ExecutorConfig = {}) {
    this.devshPath = config.devshPath ?? "devsh";
  }

  async spawn(input: SpawnInput): Promise<unknown> {
    const args = ["orchestrate", "spawn", "--json"];

    if (input.provider) {
      args.push("--provider", input.provider);
    }
    args.push("--agent", input.agent);

    if (input.repo) {
      args.push("--repo", input.repo);
    }
    if (input.branch) {
      args.push("--branch", input.branch);
    }
    if (input.timeoutMs) {
      args.push("--timeout", `${Math.ceil(input.timeoutMs / 1000)}s`);
    }

    // Claude Agent SDK specific options (only for claude/* agents)
    if (input.agent.startsWith("claude/")) {
      if (input.permissionMode) {
        args.push("--permission-mode", input.permissionMode);
      }
      if (input.settingSources && input.settingSources.length > 0) {
        args.push("--setting-sources", input.settingSources.join(","));
      }
      if (input.systemPromptPreset) {
        args.push("--system-prompt-preset", input.systemPromptPreset);
      }
      if (input.systemPrompt) {
        args.push("--system-prompt", input.systemPrompt);
      }
      if (input.allowedTools && input.allowedTools.length > 0) {
        args.push("--allowed-tools", input.allowedTools.join(","));
      }
      if (input.disallowedTools && input.disallowedTools.length > 0) {
        args.push("--disallowed-tools", input.disallowedTools.join(","));
      }
    }

    args.push("--", input.prompt);

    const result = await execa(this.devshPath, args, {
      timeout: (input.timeoutMs ?? 300000) + 30000,
    });

    try {
      return JSON.parse(result.stdout);
    } catch {
      return { stdout: result.stdout, stderr: result.stderr };
    }
  }

  async status(input: StatusInput): Promise<unknown> {
    const args = ["orchestrate", "status", "--json", input.taskId];
    const result = await execa(this.devshPath, args, { timeout: 30000 });

    try {
      return JSON.parse(result.stdout);
    } catch {
      return { stdout: result.stdout };
    }
  }

  async wait(input: WaitInput): Promise<unknown> {
    const timeoutSec = Math.ceil((input.timeoutMs ?? 300000) / 1000);
    const args = ["orchestrate", "wait", "--json", input.taskId, "--timeout", `${timeoutSec}s`];

    const result = await execa(this.devshPath, args, {
      timeout: (input.timeoutMs ?? 300000) + 30000,
    });

    try {
      return JSON.parse(result.stdout);
    } catch {
      return { stdout: result.stdout };
    }
  }

  async cancel(input: CancelInput): Promise<unknown> {
    const args = ["orchestrate", "cancel", "--json", input.taskId];
    const result = await execa(this.devshPath, args, { timeout: 30000 });

    try {
      return JSON.parse(result.stdout);
    } catch {
      return { success: true, taskId: input.taskId };
    }
  }

  async results(input: ResultsInput): Promise<unknown> {
    const args = ["orchestrate", "results", "--json", input.taskId];
    const result = await execa(this.devshPath, args, { timeout: 60000 });

    try {
      return JSON.parse(result.stdout);
    } catch {
      return { stdout: result.stdout };
    }
  }

  async inject(input: InjectInput): Promise<unknown> {
    const args = ["orchestrate", "inject", "--json", "--session-id", input.sessionId];

    if (input.provider) {
      args.push("--provider", input.provider);
    }

    args.push("--", input.message);

    const result = await execa(this.devshPath, args, { timeout: 300000 });

    try {
      return JSON.parse(result.stdout);
    } catch {
      return { stdout: result.stdout };
    }
  }

  async checkpoint(input: CheckpointInput): Promise<unknown> {
    const args = ["orchestrate", "checkpoint", "--json", "--task-id", input.taskId];

    if (input.label) {
      args.push("--label", input.label);
    }

    const result = await execa(this.devshPath, args, { timeout: 30000 });

    try {
      return JSON.parse(result.stdout);
    } catch {
      return { stdout: result.stdout };
    }
  }

  async migrate(input: MigrateInput): Promise<unknown> {
    const args = ["orchestrate", "migrate", "--json", "--source", input.source, "--target-provider", input.targetProvider];

    if (input.message) {
      args.push("--", input.message);
    }

    const result = await execa(this.devshPath, args, { timeout: 300000 });

    try {
      return JSON.parse(result.stdout);
    } catch {
      return { stdout: result.stdout };
    }
  }

  async list(input: ListInput): Promise<unknown> {
    const args = ["orchestrate", "list", "--json"];

    if (input.status) {
      args.push("--status", input.status);
    }
    if (input.limit) {
      args.push("--limit", String(input.limit));
    }

    const result = await execa(this.devshPath, args, { timeout: 30000 });

    try {
      return JSON.parse(result.stdout);
    } catch {
      // Parse tabular output as fallback
      return { stdout: result.stdout };
    }
  }
}
