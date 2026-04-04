import {
  readFile as nodeReadFile,
  readdir as nodeReaddir,
  stat as nodeStat,
} from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { execa as nodeExeca } from "execa";
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

type ExecaFn = typeof nodeExeca;
type ReadFileFn = (path: string, encoding: "utf8") => Promise<string>;
type ReaddirFn = (
  path: string,
  options: { withFileTypes: true }
) => Promise<{ name: string; isDirectory(): boolean }[]>;
type StatFn = (path: string) => Promise<{ mtimeMs: number }>;

export interface ExecutorConfig {
  devshPath?: string;
  execa?: ExecaFn;
  readFile?: ReadFileFn;
  readdir?: ReaddirFn;
  stat?: StatFn;
}

type Venue = "local" | "remote";

type RemoteProvider = Exclude<SpawnInput["provider"], "local" | undefined>;

interface VenueDecision {
  venue: Venue;
  requestedVenue: SpawnInput["provider"] | null;
  remoteProvider: RemoteProvider | null;
  routingReason: string;
}

interface RemoteSpawnResult {
  orchestrationTaskId: string;
  taskId: string;
  taskRunId: string;
  agentName?: string;
  status?: string;
  [key: string]: unknown;
}

interface RemoteTaskRun {
  id?: string;
  agent?: string;
  status?: string;
  pullRequestUrl?: string;
  [key: string]: unknown;
}

interface RemoteTaskStatus {
  _id: string;
  status: string;
  prompt?: string;
  assignedAgentName?: string;
  taskRunId?: string;
  result?: string;
  errorMessage?: string;
  createdAt?: number;
  updatedAt?: number;
  startedAt?: number;
  completedAt?: number;
  [key: string]: unknown;
}

interface RemoteStatusResult {
  task: RemoteTaskStatus;
  taskRun?: RemoteTaskRun;
  [key: string]: unknown;
}

interface RemoteListResult {
  tasks: RemoteTaskStatus[];
}

interface RemoteResultsEntry {
  taskId: string;
  agentName?: string;
  status: string;
  prompt: string;
  result?: string;
  errorMessage?: string;
  taskRunId?: string;
}

interface RemoteResultsResult {
  orchestrationId: string;
  status: string;
  totalTasks: number;
  completedTasks: number;
  results: RemoteResultsEntry[];
  [key: string]: unknown;
}

interface LocalStateResult {
  orchestrationId: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  status: string;
  agent: string;
  prompt: string;
  workspace: string;
  result?: string;
  error?: string;
  runDir?: string;
}

interface LocalShowResult {
  state: LocalStateResult;
  runDir: string;
  stdout?: string;
  stderr?: string;
}

interface LocalRunningConfig {
  orchestrationId: string;
  agent: string;
  prompt: string;
  workspace: string;
  timeout: string;
  createdAt: string;
}

interface LocalSessionInfo {
  sessionId?: string;
  threadId?: string;
  injectionMode?: string;
  checkpointRef?: string;
  checkpointGeneration?: number;
  checkpointLabel?: string;
  checkpointCreatedAt?: number;
}

interface LocalRunSummary {
  orchestrationId: string;
  agent: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  runDir: string;
  prompt?: string;
}

const DEFAULT_TIMEOUT_MS = 300000;
const COMMAND_TIMEOUT_MS = 30000;
const LOCAL_SPAWN_DISCOVERY_TIMEOUT_MS = 15000;
const LOCAL_WAIT_POLL_MS = 1000;
const LOCAL_SPAWN_DISCOVERY_POLL_MS = 200;
const LOCAL_LIST_SCAN_LIMIT = 1000;

/**
 * Executor that wraps devsh CLI commands
 */
export class DevshExecutor {
  private devshPath: string;
  private execaFn: ExecaFn;
  private readFileFn: ReadFileFn;
  private readdirFn: ReaddirFn;
  private statFn: StatFn;

  constructor(config: ExecutorConfig = {}) {
    this.devshPath = config.devshPath ?? "devsh";
    this.execaFn = config.execa ?? nodeExeca;
    this.readFileFn = config.readFile ?? nodeReadFile;
    this.readdirFn = config.readdir ?? nodeReaddir;
    this.statFn = config.stat ?? nodeStat;
  }

  async spawn(input: SpawnInput): Promise<unknown> {
    const venue = this.selectVenue(input);
    return venue.venue === "local"
      ? this.spawnLocal(input, venue)
      : this.spawnRemote(input, venue);
  }

  async status(input: StatusInput): Promise<unknown> {
    if (this.isLocalReference(input.taskId)) {
      return this.statusLocal(input.taskId);
    }

    const result = await this.runDevshJson<RemoteStatusResult>(
      ["orchestrate", "status", "--json", input.taskId],
      COMMAND_TIMEOUT_MS
    );

    const taskRunId = result.taskRun?.id ?? result.task?.taskRunId;
    return {
      ...result,
      venue: "remote",
      controlId: input.taskId,
      followUp: this.buildRemoteFollowUp(input.taskId, taskRunId),
      capabilities: this.buildRemoteCapabilities(result.task.status, taskRunId),
      availableActions: this.buildRemoteAvailableActions(result.task.status, taskRunId),
    };
  }

  async wait(input: WaitInput): Promise<unknown> {
    if (this.isLocalReference(input.taskId)) {
      return this.waitLocal(input);
    }

    const timeoutSec = Math.ceil((input.timeoutMs ?? DEFAULT_TIMEOUT_MS) / 1000);
    const result = await this.runDevshJson<RemoteStatusResult>(
      ["orchestrate", "wait", "--json", input.taskId, "--timeout", `${timeoutSec}s`],
      (input.timeoutMs ?? DEFAULT_TIMEOUT_MS) + COMMAND_TIMEOUT_MS
    );

    const taskRunId = result.taskRun?.id ?? result.task?.taskRunId;
    return {
      ...result,
      venue: "remote",
      controlId: input.taskId,
      followUp: this.buildRemoteFollowUp(input.taskId, taskRunId),
      capabilities: this.buildRemoteCapabilities(result.task.status, taskRunId),
      availableActions: this.buildRemoteAvailableActions(result.task.status, taskRunId),
    };
  }

  async cancel(input: CancelInput): Promise<unknown> {
    if (this.isLocalReference(input.taskId)) {
      const result = await this.runDevsh(
        ["orchestrate", "stop-local", input.taskId],
        COMMAND_TIMEOUT_MS
      );
      return {
        venue: "local",
        controlId: this.normalizeLocalControlId(input.taskId),
        success: true,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    }

    const result = await this.runDevsh(
      ["orchestrate", "cancel", "--json", input.taskId],
      COMMAND_TIMEOUT_MS
    );

    return {
      venue: "remote",
      controlId: input.taskId,
      success: true,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  async results(input: ResultsInput): Promise<unknown> {
    if (this.isLocalReference(input.taskId)) {
      const status = await this.statusLocal(input.taskId);
      return {
        ...status,
        resultType: "local_run",
      };
    }

    try {
      const result = await this.runDevshJson<RemoteResultsResult>(
        ["orchestrate", "results", "--json", input.taskId],
        60000
      );

      if (result.totalTasks === 0 && result.results.length === 0) {
        const status = await this.status({ taskId: input.taskId });
        return {
          ...(status as Record<string, unknown>),
          resultType: "task",
        };
      }

      return {
        ...result,
        venue: "remote",
        resultType: "orchestration",
        controlId: input.taskId,
      };
    } catch {
      const status = await this.status({ taskId: input.taskId });
      return {
        ...(status as Record<string, unknown>),
        resultType: "task",
      };
    }
  }

  async inject(input: InjectInput): Promise<unknown> {
    const isLocal = input.provider === "local" || this.isLocalReference(input.sessionId);

    if (isLocal) {
      const result = await this.runDevshJson<Record<string, unknown>>(
        ["orchestrate", "inject-local", "--json", input.sessionId, input.message],
        DEFAULT_TIMEOUT_MS
      );

      return {
        ...result,
        venue: "local",
        controlId: this.normalizeLocalControlId(input.sessionId),
      };
    }

    const result = await this.runDevsh(
      ["orchestrate", "message", input.sessionId, input.message, "--type", "request"],
      COMMAND_TIMEOUT_MS
    );

    return {
      venue: "remote",
      taskRunId: input.sessionId,
      controlLane: "append_instruction",
      continuationMode: "mailbox_request",
      success: true,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  async checkpoint(input: CheckpointInput): Promise<unknown> {
    // For local runs, checkpoints are created via local state file
    if (this.isLocalReference(input.taskId)) {
      return this.checkpointLocal(input);
    }

    // Remote checkpoint via devsh
    const args = ["orchestrate", "checkpoint", "--json", "--task-id", input.taskId];

    if (input.label) {
      args.push("--label", input.label);
    }

    const result = await this.runDevsh(args, COMMAND_TIMEOUT_MS);

    try {
      return JSON.parse(result.stdout);
    } catch {
      return { stdout: result.stdout, stderr: result.stderr };
    }
  }

  private async checkpointLocal(input: CheckpointInput): Promise<unknown> {
    const localRef = this.parseLocalReference(input.taskId);
    const runDir = localRef?.runDir ?? input.taskId;

    // Read current session info
    const sessionInfo = await this.readLocalSessionInfo(runDir);
    if (!sessionInfo) {
      return {
        venue: "local",
        controlId: runDir,
        success: false,
        error: "Local run not found or not running",
      };
    }

    // Generate checkpoint reference
    const generation = (sessionInfo.checkpointGeneration ?? 0) + 1;
    const checkpointRef = `cp_local_${path.basename(runDir)}_${generation}`;
    const now = Date.now();

    // Write checkpoint info to session file
    const sessionPath = path.join(runDir, "session.json");
    const updatedSession = {
      ...sessionInfo,
      checkpointRef,
      checkpointGeneration: generation,
      checkpointLabel: input.label,
      checkpointCreatedAt: now,
    };

    try {
      const writeFile = await import("node:fs/promises").then((m) => m.writeFile);
      await writeFile(sessionPath, JSON.stringify(updatedSession, null, 2));
    } catch {
      // Session file may not be writable, but we can still return the checkpoint info
    }

    return {
      venue: "local",
      controlId: runDir,
      taskId: input.taskId,
      checkpointRef,
      checkpointGeneration: generation,
      label: input.label,
      createdAt: new Date(now).toISOString(),
      success: true,
    };
  }

  async migrate(input: MigrateInput): Promise<unknown> {
    const args = [
      "orchestrate",
      "migrate",
      "--json",
      "--source",
      input.source,
      "--target-provider",
      input.targetProvider,
    ];

    if (input.message) {
      args.push("--", input.message);
    }

    const result = await this.runDevsh(args, DEFAULT_TIMEOUT_MS);

    try {
      return JSON.parse(result.stdout);
    } catch {
      return { stdout: result.stdout, stderr: result.stderr };
    }
  }

  async list(input: ListInput): Promise<unknown> {
    const remoteArgs = ["orchestrate", "list", "--json"];
    if (input.status) {
      remoteArgs.push("--status", input.status);
    }

    const localArgs = [
      "orchestrate",
      "list-local",
      "--json",
      "--limit",
      String(Math.max(input.limit ?? 10, LOCAL_LIST_SCAN_LIMIT)),
    ];
    if (input.status && ["running", "completed", "failed"].includes(input.status)) {
      localArgs.push("--status", input.status);
    }

    const [remote, local] = await Promise.all([
      this.runDevshJson<RemoteListResult>(remoteArgs, COMMAND_TIMEOUT_MS),
      this.runDevshJson<LocalRunSummary[]>(localArgs, COMMAND_TIMEOUT_MS),
    ]);

    const combined = [
      ...remote.tasks.map((task) => ({
        venue: "remote" as const,
        id: task._id,
        status: task.status,
        agent: task.assignedAgentName ?? null,
        prompt: task.prompt ?? null,
        createdAt: task.createdAt ?? null,
        updatedAt: task.updatedAt ?? null,
        controlId: task._id,
        followUp: this.buildRemoteFollowUp(task._id, task.taskRunId),
        capabilities: this.buildRemoteCapabilities(task.status, task.taskRunId),
      })),
      ...local.map((run) => ({
        venue: "local" as const,
        id: run.orchestrationId,
        status: run.status,
        agent: run.agent,
        prompt: run.prompt ?? null,
        createdAt: run.startedAt,
        updatedAt: run.completedAt ?? run.startedAt,
        controlId: run.runDir,
        runDir: run.runDir,
        followUp: this.buildLocalFollowUp(run.runDir, run.status),
        capabilities: this.buildLocalCapabilities(run.status, null),
      })),
    ]
      .sort((left, right) => this.toTimestamp(right.createdAt) - this.toTimestamp(left.createdAt))
      .slice(0, input.limit ?? 10);

    return {
      items: combined,
      count: combined.length,
      remote,
      local,
    };
  }

  private selectVenue(input: SpawnInput): VenueDecision {
    const requestedVenue = input.provider ?? null;

    if (requestedVenue === "local") {
      return {
        venue: "local",
        requestedVenue,
        remoteProvider: null,
        routingReason: "Explicit local venue requested.",
      };
    }

    if (requestedVenue) {
      return {
        venue: "remote",
        requestedVenue,
        remoteProvider: requestedVenue,
        routingReason: `Explicit remote provider '${requestedVenue}' requested.`,
      };
    }

    const localUnsupportedReason = this.getLocalUnsupportedReason(input);
    if (localUnsupportedReason) {
      return {
        venue: "remote",
        requestedVenue,
        remoteProvider: null,
        routingReason: localUnsupportedReason,
      };
    }

    if (input.localClaudeProfile === "plugin-dev" || input.pluginDirs?.length || input.settings || input.mcpConfigs?.length) {
      return {
        venue: "local",
        requestedVenue,
        remoteProvider: null,
        routingReason: "Claude local plugin-development options favor the local execution lane.",
      };
    }

    const prompt = input.prompt.toLowerCase();

    if (this.isTestHeavyPrompt(prompt)) {
      return {
        venue: "remote",
        requestedVenue,
        remoteProvider: null,
        routingReason: "Prompt looks test-heavy, so it routes remote.",
      };
    }

    if (this.isHeavyPrompt(prompt)) {
      return {
        venue: "remote",
        requestedVenue,
        remoteProvider: null,
        routingReason: "Prompt looks long-running or resource-heavy, so it routes remote.",
      };
    }

    return {
      venue: "local",
      requestedVenue,
      remoteProvider: null,
      routingReason: "Prompt looks short and self-contained, so it stays local.",
    };
  }

  private getLocalUnsupportedReason(input: SpawnInput): string | null {
    if (input.repo || input.branch) {
      return "Repo or branch checkout requires the remote orchestration lane.";
    }

    if (
      input.permissionMode ||
      input.systemPromptPreset ||
      input.systemPrompt
    ) {
      return "Claude Agent SDK launch options require the remote orchestration lane.";
    }

    return null;
  }

  private assertLocalSpawnSupported(input: SpawnInput): void {
    const localUnsupportedReason = this.getLocalUnsupportedReason(input);
    if (localUnsupportedReason) {
      throw new Error(`Local execution is not supported for this request. ${localUnsupportedReason}`);
    }
  }

  private isTestHeavyPrompt(prompt: string): boolean {
    return /\b(test|tests|testing|integration|e2e|vitest|jest|bun check|typecheck|lint|ci|smoke test)\b/i.test(
      prompt
    );
  }

  private isHeavyPrompt(prompt: string): boolean {
    return /\b(benchmark|profile|migration|migrate|repository-wide|repo-wide|across the repo|whole repo|large refactor|long-running|long running|heavy)\b/i.test(
      prompt
    );
  }

  private async spawnRemote(input: SpawnInput, venue: VenueDecision): Promise<unknown> {
    const args = ["orchestrate", "spawn", "--json"];

    if (venue.remoteProvider) {
      args.push("--provider", venue.remoteProvider);
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

    const result = await this.runDevshJson<RemoteSpawnResult>(
      args,
      (input.timeoutMs ?? DEFAULT_TIMEOUT_MS) + COMMAND_TIMEOUT_MS
    );

    return {
      ...result,
      venue: "remote",
      requestedVenue: venue.requestedVenue,
      remoteProvider: venue.remoteProvider,
      routingReason: venue.routingReason,
      controlId: result.orchestrationTaskId,
      followUp: this.buildRemoteFollowUp(result.orchestrationTaskId, result.taskRunId),
      capabilities: this.buildRemoteCapabilities(result.status, result.taskRunId),
      availableActions: this.buildRemoteAvailableActions(result.status, result.taskRunId),
    };
  }

  private async spawnLocal(input: SpawnInput, venue: VenueDecision): Promise<unknown> {
    this.assertLocalSpawnSupported(input);

    const before = await this.snapshotLocalRunNames();
    const args = ["orchestrate", "run-local", "--json", "--persist", "--agent", input.agent];

    if (input.timeoutMs) {
      args.push("--timeout", `${Math.ceil(input.timeoutMs / 1000)}s`);
    }

    if (input.agent.startsWith("claude/")) {
      const effectiveSettingSources =
        input.settingSources && input.settingSources.length > 0
          ? input.settingSources
          : input.localClaudeProfile === "plugin-dev"
            ? ["project", "local"]
            : undefined;
      if (effectiveSettingSources && effectiveSettingSources.length > 0) {
        args.push("--setting-sources", effectiveSettingSources.join(","));
      }
      if (input.allowedTools && input.allowedTools.length > 0) {
        args.push("--allowed-tools", input.allowedTools.join(","));
      }
      if (input.disallowedTools && input.disallowedTools.length > 0) {
        args.push("--disallowed-tools", input.disallowedTools.join(","));
      }
      if (input.pluginDirs && input.pluginDirs.length > 0) {
        for (const pluginDir of input.pluginDirs) {
          args.push("--plugin-dir", pluginDir);
        }
      }
      if (input.settings) {
        args.push("--settings", input.settings);
      }
      if (input.mcpConfigs && input.mcpConfigs.length > 0) {
        for (const mcpConfig of input.mcpConfigs) {
          args.push("--mcp-config", mcpConfig);
        }
      }
    }

    args.push(input.prompt);

    const subprocess = this.execaFn(this.devshPath, args, {
      detached: true,
      cleanup: false,
      stdio: "ignore",
    });
    subprocess.unref();
    subprocess.catch(() => undefined);

    const runDir = await this.waitForNewLocalRunDir(before, input.prompt, input.agent);
    const runId = path.basename(runDir);
    const sessionInfo = await this.readLocalSessionInfo(runDir);
    const capabilities = this.buildLocalCapabilities("running", sessionInfo);

    return {
      venue: "local",
      requestedVenue: venue.requestedVenue,
      remoteProvider: null,
      routingReason: venue.routingReason,
      runId,
      runDir,
      controlId: runDir,
      agent: input.agent,
      status: "running",
      followUp: this.buildLocalFollowUp(runDir, "running"),
      capabilities,
      availableActions: this.buildLocalAvailableActions("running", capabilities),
    };
  }

  private async statusLocal(taskId: string): Promise<unknown> {
    const result = await this.runDevshJson<LocalShowResult | LocalRunningConfig>(
      ["orchestrate", "show-local", "--json", taskId],
      COMMAND_TIMEOUT_MS
    );

    const localRef = this.parseLocalReference(taskId);
    const terminalResult = this.isLocalShowResult(result) ? result : null;
    const runningConfig = this.isLocalShowResult(result) ? null : result;
    const runDir = terminalResult?.runDir ?? localRef.runDir;
    const runId =
      terminalResult?.state.orchestrationId ??
      runningConfig?.orchestrationId ??
      localRef.runId ??
      taskId;
    const status = terminalResult?.state.status ?? "running";
    const sessionInfo = await this.readLocalSessionInfo(runDir);
    const capabilities = this.buildLocalCapabilities(status, sessionInfo);
    const controlId = runDir ?? taskId;

    return {
      venue: "local",
      runId,
      runDir,
      controlId,
      status,
      agent: terminalResult?.state.agent ?? runningConfig?.agent,
      prompt: terminalResult?.state.prompt ?? runningConfig?.prompt,
      workspace: terminalResult?.state.workspace ?? runningConfig?.workspace,
      startedAt: terminalResult?.state.startedAt ?? runningConfig?.createdAt,
      completedAt: terminalResult?.state.completedAt ?? null,
      durationMs: terminalResult?.state.durationMs ?? null,
      result: terminalResult?.state.result ?? null,
      error: terminalResult?.state.error ?? null,
      followUp: this.buildLocalFollowUp(controlId, status),
      capabilities,
      availableActions: this.buildLocalAvailableActions(status, capabilities),
      raw: result,
    };
  }

  private async waitLocal(input: WaitInput): Promise<unknown> {
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;

    while (true) {
      const status = (await this.statusLocal(input.taskId)) as Record<string, unknown>;
      const currentStatus = String(status.status ?? "running");
      if (this.isTerminalStatus(currentStatus)) {
        return status;
      }
      if (Date.now() >= deadline) {
        return {
          ...status,
          timedOut: true,
        };
      }
      await delay(LOCAL_WAIT_POLL_MS);
    }
  }

  private async runDevsh(args: string[], timeout: number): Promise<{ stdout: string; stderr: string }> {
    const result = await this.execaFn(this.devshPath, args, { timeout });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  private async runDevshJson<T>(args: string[], timeout: number): Promise<T> {
    const result = await this.runDevsh(args, timeout);
    return JSON.parse(result.stdout) as T;
  }

  private async snapshotLocalRunNames(): Promise<Set<string>> {
    try {
      const entries = await this.readdirFn(this.getDefaultLocalRunsDir(), { withFileTypes: true });
      return new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return new Set<string>();
      }
      throw error;
    }
  }

  private async waitForNewLocalRunDir(
    previousRuns: Set<string>,
    prompt: string,
    agent: string
  ): Promise<string> {
    const deadline = Date.now() + LOCAL_SPAWN_DISCOVERY_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const runDir = await this.findMatchingLocalRunDir(previousRuns, prompt, agent);
      if (runDir) {
        return runDir;
      }
      await delay(LOCAL_SPAWN_DISCOVERY_POLL_MS);
    }

    throw new Error("Timed out while discovering the new local run directory.");
  }

  private async findMatchingLocalRunDir(
    previousRuns: Set<string>,
    prompt: string,
    agent: string
  ): Promise<string | null> {
    const baseDir = this.getDefaultLocalRunsDir();

    let entries;
    try {
      entries = await this.readdirFn(baseDir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }

    const matches: Array<{ runDir: string; mtimeMs: number }> = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || previousRuns.has(entry.name)) {
        continue;
      }

      const runDir = path.join(baseDir, entry.name);
      const config = await this.readJsonFile<LocalRunningConfig>(path.join(runDir, "config.json"));
      if (!config) {
        continue;
      }
      if (config.prompt !== prompt || config.agent !== agent) {
        continue;
      }

      const configStats = await this.statFn(path.join(runDir, "config.json"));
      matches.push({ runDir, mtimeMs: configStats.mtimeMs });
    }

    if (matches.length === 0) {
      return null;
    }

    matches.sort((left, right) => right.mtimeMs - left.mtimeMs);
    return matches[0]?.runDir ?? null;
  }

  private async readLocalSessionInfo(runDir?: string): Promise<LocalSessionInfo | null> {
    if (!runDir) {
      return null;
    }
    return this.readJsonFile<LocalSessionInfo>(path.join(this.expandHome(runDir), "session.json"));
  }

  private async readJsonFile<T>(filePath: string): Promise<T | null> {
    try {
      const data = await this.readFileFn(filePath, "utf8");
      return JSON.parse(data) as T;
    } catch (error) {
      if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        return null;
      }
      throw error;
    }
  }

  private isLocalReference(value: string): boolean {
    const trimmed = value.trim();
    return (
      trimmed.startsWith("local_") ||
      trimmed.startsWith("/") ||
      trimmed.startsWith("~/") ||
      trimmed.startsWith("./") ||
      trimmed.startsWith("../") ||
      trimmed.includes(`${path.sep}local_`)
    );
  }

  private parseLocalReference(value: string): { runId?: string; runDir?: string } {
    const trimmed = value.trim();
    if (
      trimmed.startsWith("/") ||
      trimmed.startsWith("~/") ||
      trimmed.startsWith("./") ||
      trimmed.startsWith("../")
    ) {
      const runDir = this.expandHome(trimmed);
      return {
        runId: path.basename(runDir),
        runDir,
      };
    }

    if (trimmed.startsWith("local_")) {
      return {
        runId: trimmed,
        runDir: path.join(this.getDefaultLocalRunsDir(), trimmed),
      };
    }

    return {};
  }

  private normalizeLocalControlId(value: string): string {
    return this.parseLocalReference(value).runDir ?? value;
  }

  private getDefaultLocalRunsDir(): string {
    return path.join(os.homedir(), ".devsh", "orchestrations");
  }

  private expandHome(value: string): string {
    if (value.startsWith("~/")) {
      return path.join(os.homedir(), value.slice(2));
    }
    return value;
  }

  private isLocalShowResult(result: LocalShowResult | LocalRunningConfig): result is LocalShowResult {
    return "state" in result;
  }

  private isTerminalStatus(status: string): boolean {
    return ["completed", "failed", "cancelled"].includes(status);
  }

  private buildRemoteCapabilities(status: string | undefined, taskRunId?: string) {
    const active = !this.isTerminalStatus(status ?? "running");
    const canControl = Boolean(taskRunId) && active;

    return {
      inspect: true,
      cancel: active,
      appendInstruction: canControl,
      continueSession: canControl,
      resumeCheckpoint: Boolean(taskRunId),
      resolveApproval: Boolean(taskRunId),
    };
  }

  private buildLocalCapabilities(status: string, sessionInfo: LocalSessionInfo | null) {
    const active = status === "running";
    const canContinue =
      active && Boolean(sessionInfo?.sessionId || sessionInfo?.threadId) && sessionInfo?.injectionMode !== "passive";
    const hasCheckpoint = Boolean(sessionInfo?.checkpointRef);

    return {
      inspect: true,
      cancel: active,
      appendInstruction: active,
      continueSession: canContinue,
      resumeCheckpoint: hasCheckpoint,
      resolveApproval: false,
      createCheckpoint: active, // Can create checkpoints while running
    };
  }

  private buildRemoteAvailableActions(status: string | undefined, taskRunId?: string): string[] {
    const actions = ["cmux_status", "cmux_wait", "cmux_results"];
    if (!this.isTerminalStatus(status ?? "running")) {
      actions.push("cmux_cancel");
    }
    if (taskRunId && !this.isTerminalStatus(status ?? "running")) {
      actions.push("cmux_inject");
    }
    return actions;
  }

  private buildLocalAvailableActions(
    status: string,
    capabilities: ReturnType<DevshExecutor["buildLocalCapabilities"]>
  ): string[] {
    const actions = ["cmux_status", "cmux_wait", "cmux_results"];
    if (capabilities.cancel) {
      actions.push("cmux_cancel");
    }
    if (capabilities.appendInstruction || capabilities.continueSession) {
      actions.push("cmux_inject");
    }
    if (capabilities.createCheckpoint) {
      actions.push("cmux_checkpoint");
    }
    return actions;
  }

  private buildRemoteFollowUp(controlId: string, taskRunId?: string) {
    return {
      statusId: controlId,
      waitId: controlId,
      cancelId: controlId,
      resultsId: controlId,
      injectId: taskRunId ?? null,
    };
  }

  private buildLocalFollowUp(controlId: string, status: string) {
    return {
      statusId: controlId,
      waitId: controlId,
      cancelId: status === "running" ? controlId : null,
      resultsId: controlId,
      injectId: status === "running" ? controlId : null,
    };
  }

  private toTimestamp(value: string | number | null): number {
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }
}
