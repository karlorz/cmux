import { describe, expect, it } from "vitest";
import { DevshExecutor } from "./executor.js";

function jsonResult(value: unknown) {
  return {
    stdout: JSON.stringify(value),
    stderr: "",
  };
}

function localDir(name: string) {
  return {
    name,
    isDirectory: () => true,
  };
}

describe("DevshExecutor", () => {
  it("routes simple prompts to local run-local", async () => {
    let unrefCalled = false;
    const execaCalls: unknown[] = [];

    const execaFn = (_bin: string, args: string[], opts: unknown) => {
      execaCalls.push({ args: [...args], opts });
      if ((opts as { detached?: boolean }).detached) {
        return {
          unref() {
            unrefCalled = true;
          },
          catch() {
            return undefined;
          },
        };
      }
      return Promise.resolve({ stdout: "", stderr: "" });
    };

    let readdirCallCount = 0;
    const readdirFn = async () => {
      readdirCallCount++;
      if (readdirCallCount === 1) return [];
      return [localDir("local_123")];
    };

    const readFileFn = async (filePath: string, _enc: "utf8") => {
      if (filePath.endsWith("config.json")) {
        return JSON.stringify({
          orchestrationId: "local_123",
          agent: "claude/haiku-4.5",
          prompt: "Fix typo",
          workspace: "/root/workspace",
          timeout: "30m",
          createdAt: "2026-04-02T00:00:00Z",
        });
      }
      return JSON.stringify({
        sessionId: "session_123",
        injectionMode: "active",
      });
    };

    const statFn = async () => ({ mtimeMs: 1 });

    const executor = new DevshExecutor({
      devshPath: "devsh",
      execa: execaFn as never,
      readFile: readFileFn,
      readdir: readdirFn as never,
      stat: statFn as never,
    });

    const result = await executor.spawn({
      agent: "claude/haiku-4.5",
      prompt: "Fix typo",
    });

    expect(execaCalls).toHaveLength(1);
    const call = execaCalls[0] as { args: string[]; opts: unknown };
    expect(call.args).toEqual([
      "orchestrate",
      "run-local",
      "--json",
      "--persist",
      "--agent",
      "claude/haiku-4.5",
      "Fix typo",
    ]);
    expect(unrefCalled).toBe(true);
    expect(result).toMatchObject({
      venue: "local",
      runId: "local_123",
      status: "running",
      routingReason: "Prompt looks short and self-contained, so it stays local.",
      capabilities: {
        continueSession: true,
        appendInstruction: true,
      },
      followUp: {
        statusId: expect.stringContaining("local_123"),
        injectId: expect.stringContaining("local_123"),
      },
    });
  });

  it("routes Claude plugin-dev requests to local run-local with local defaults", async () => {
    let unrefCalled = false;
    const execaCalls: unknown[] = [];

    const execaFn = (_bin: string, args: string[], opts: unknown) => {
      execaCalls.push({ args: [...args], opts });
      if ((opts as { detached?: boolean }).detached) {
        return {
          unref() {
            unrefCalled = true;
          },
          catch() {
            return undefined;
          },
        };
      }
      return Promise.resolve({ stdout: "", stderr: "" });
    };

    let readdirCallCount = 0;
    const readdirFn = async () => {
      readdirCallCount++;
      if (readdirCallCount === 1) return [];
      return [localDir("local_456")];
    };

    const readFileFn = async (filePath: string, _enc: "utf8") => {
      if (filePath.endsWith("config.json")) {
        return JSON.stringify({
          orchestrationId: "local_456",
          agent: "claude/opus-4.6",
          prompt: "Exercise plugin workflow",
          workspace: "/root/workspace",
          timeout: "30m",
          createdAt: "2026-04-04T00:00:00Z",
        });
      }
      return JSON.stringify({
        sessionId: "session_456",
        injectionMode: "active",
      });
    };

    const executor = new DevshExecutor({
      devshPath: "devsh",
      execa: execaFn as never,
      readFile: readFileFn,
      readdir: readdirFn as never,
      stat: (async () => ({ mtimeMs: 1 })) as never,
    });

    const result = await executor.spawn({
      agent: "claude/opus-4.6",
      prompt: "Exercise plugin workflow",
      localClaudeProfile: "plugin-dev",
      pluginDirs: ["./plugin-a"],
      settings: "./settings.local.json",
      mcpConfigs: ["./mcp.local.json"],
      allowedTools: ["Read", "Write"],
    });

    const call = execaCalls[0] as { args: string[] };
    expect(call.args).toEqual([
      "orchestrate",
      "run-local",
      "--json",
      "--persist",
      "--agent",
      "claude/opus-4.6",
      "--setting-sources",
      "project,local",
      "--allowed-tools",
      "Read,Write",
      "--plugin-dir",
      "./plugin-a",
      "--settings",
      "./settings.local.json",
      "--mcp-config",
      "./mcp.local.json",
      "Exercise plugin workflow",
    ]);
    expect(unrefCalled).toBe(true);
    expect(result).toMatchObject({
      venue: "local",
      runId: "local_456",
      routingReason: "Claude local plugin-development options favor the local execution lane.",
    });
  });

  it("routes repo-scoped requests to remote spawn", async () => {
    const execaCalls: { args: string[] }[] = [];
    const execaFn = (_bin: string, args: string[]) => {
      execaCalls.push({ args: [...args] });
      return Promise.resolve(
        jsonResult({
          orchestrationTaskId: "orch_123",
          taskId: "task_123",
          taskRunId: "run_123",
          agentName: "claude/haiku-4.5",
          status: "running",
        })
      );
    };

    const executor = new DevshExecutor({
      devshPath: "devsh",
      execa: execaFn as never,
    });

    const result = await executor.spawn({
      agent: "claude/haiku-4.5",
      prompt: "Fix auth bug",
      repo: "owner/repo",
    });

    expect(execaCalls).toHaveLength(1);
    expect(execaCalls[0]?.args).toEqual([
      "orchestrate",
      "spawn",
      "--json",
      "--agent",
      "claude/haiku-4.5",
      "--repo",
      "owner/repo",
      "--",
      "Fix auth bug",
    ]);
    expect(result).toMatchObject({
      venue: "remote",
      controlId: "orch_123",
      routingReason: "Repo or branch checkout requires the remote orchestration lane.",
      followUp: {
        injectId: "run_123",
      },
    });
  });

  it("passes explicit remote provider through to spawn", async () => {
    const execaCalls: { args: string[] }[] = [];
    const execaFn = (_bin: string, args: string[]) => {
      execaCalls.push({ args: [...args] });
      return Promise.resolve(
        jsonResult({
          orchestrationTaskId: "orch_456",
          taskId: "task_456",
          taskRunId: "run_456",
          status: "running",
        })
      );
    };

    const executor = new DevshExecutor({
      devshPath: "devsh",
      execa: execaFn as never,
    });

    await executor.spawn({
      agent: "claude/haiku-4.5",
      prompt: "Run remotely",
      provider: "morph",
    });

    expect(execaCalls[0]?.args).toEqual([
      "orchestrate",
      "spawn",
      "--json",
      "--provider",
      "morph",
      "--agent",
      "claude/haiku-4.5",
      "--",
      "Run remotely",
    ]);
  });

  it("routes local inject to inject-local", async () => {
    const execaCalls: { args: string[] }[] = [];
    const execaFn = (_bin: string, args: string[]) => {
      execaCalls.push({ args: [...args] });
      return Promise.resolve(
        jsonResult({
          mode: "active",
          controlLane: "continue_session",
          continuationMode: "session_continuation",
        })
      );
    };

    const executor = new DevshExecutor({
      devshPath: "devsh",
      execa: execaFn as never,
    });

    const result = await executor.inject({
      sessionId: "local_123",
      message: "Continue the task",
      provider: "local",
    });

    expect(execaCalls[0]?.args).toEqual([
      "orchestrate",
      "inject-local",
      "--json",
      "local_123",
      "Continue the task",
    ]);
    expect(result).toMatchObject({
      venue: "local",
      controlLane: "continue_session",
    });
  });

  it("routes remote inject to orchestrate message", async () => {
    const execaCalls: { args: string[] }[] = [];
    const execaFn = (_bin: string, args: string[]) => {
      execaCalls.push({ args: [...args] });
      return Promise.resolve({ stdout: "ok", stderr: "" });
    };

    const executor = new DevshExecutor({
      devshPath: "devsh",
      execa: execaFn as never,
    });

    const result = await executor.inject({
      sessionId: "taskrun_123",
      message: "Continue the task",
    });

    expect(execaCalls[0]?.args).toEqual([
      "orchestrate",
      "message",
      "taskrun_123",
      "Continue the task",
      "--type",
      "request",
    ]);
    expect(result).toMatchObject({
      venue: "remote",
      taskRunId: "taskrun_123",
      continuationMode: "mailbox_request",
    });
  });

  it("falls back to task status when results are queried with a task id", async () => {
    const execaCalls: { args: string[] }[] = [];
    const execaFn = (_bin: string, args: string[]) => {
      execaCalls.push({ args: [...args] });
      if (execaCalls.length === 1) {
        return Promise.resolve(
          jsonResult({
            orchestrationId: "task_123",
            status: "completed",
            totalTasks: 0,
            completedTasks: 0,
            results: [],
          })
        );
      }
      return Promise.resolve(
        jsonResult({
          task: {
            _id: "task_123",
            status: "completed",
            taskRunId: "run_123",
            result: "done",
          },
        })
      );
    };

    const executor = new DevshExecutor({
      devshPath: "devsh",
      execa: execaFn as never,
    });

    const result = await executor.results({ taskId: "task_123" });

    expect(execaCalls[0]?.args).toEqual(["orchestrate", "results", "--json", "task_123"]);
    expect(execaCalls[1]?.args).toEqual(["orchestrate", "status", "--json", "task_123"]);
    expect(result).toMatchObject({
      venue: "remote",
      resultType: "task",
      controlId: "task_123",
    });
  });

  it("creates local checkpoint for local runs", async () => {
    const readFileFn = async (filePath: string, _enc: "utf8") => {
      if (filePath.endsWith("session.json")) {
        return JSON.stringify({
          sessionId: "session_abc",
          injectionMode: "active",
        });
      }
      return "{}";
    };

    const readdirFn = async () => [
      { name: "local_run_001", isDirectory: () => true },
    ];

    const statFn = async () => ({ mtimeMs: Date.now() });

    const executor = new DevshExecutor({
      devshPath: "devsh",
      execa: (() => Promise.resolve({ stdout: "", stderr: "" })) as never,
      readFile: readFileFn,
      readdir: readdirFn as never,
      stat: statFn as never,
    });

    const result = await executor.checkpoint({
      taskId: "local://local_run_001",
      label: "before-refactor",
    });

    expect(result).toMatchObject({
      venue: "local",
      success: true,
      checkpointGeneration: 1,
      label: "before-refactor",
    });
    expect((result as { checkpointRef: string }).checkpointRef).toMatch(/^cp_local_/);
  });

  it("routes remote checkpoint to devsh", async () => {
    const execaCalls: unknown[] = [];

    const execaFn = (_bin: string, args: string[]) => {
      execaCalls.push({ args: [...args] });
      return Promise.resolve({
        stdout: JSON.stringify({
          taskId: "task_xyz",
          checkpointRef: "cp_task_xyz_1",
          checkpointGeneration: 1,
          createdAt: "2026-04-03T00:00:00Z",
        }),
        stderr: "",
      });
    };

    const executor = new DevshExecutor({
      devshPath: "devsh",
      execa: execaFn as never,
    });

    const result = await executor.checkpoint({
      taskId: "task_xyz",
      label: "pre-deploy",
    });

    expect(execaCalls[0]).toMatchObject({
      args: ["orchestrate", "checkpoint", "--json", "--task-id", "task_xyz", "--label", "pre-deploy"],
    });
    expect(result).toMatchObject({
      checkpointRef: "cp_task_xyz_1",
      checkpointGeneration: 1,
    });
  });
});
