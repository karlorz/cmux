import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execaMock: vi.fn(),
  readFileMock: vi.fn(),
  readdirMock: vi.fn(),
  statMock: vi.fn(),
}));

vi.mock("execa", () => ({
  execa: mocks.execaMock,
}));

vi.mock("node:fs/promises", () => ({
  readFile: mocks.readFileMock,
  readdir: mocks.readdirMock,
  stat: mocks.statMock,
}));

import { DevshExecutor } from "./executor.js";

function jsonResult(value: unknown) {
  return {
    stdout: JSON.stringify(value),
    stderr: "",
  };
}

function detachedProcess() {
  return {
    unref: vi.fn(),
    catch: vi.fn(),
  };
}

function localDir(name: string) {
  return {
    name,
    isDirectory: () => true,
  };
}

describe("DevshExecutor", () => {
  beforeEach(() => {
    mocks.execaMock.mockReset();
    mocks.readFileMock.mockReset();
    mocks.readdirMock.mockReset();
    mocks.statMock.mockReset();
  });

  it("routes simple prompts to local run-local", async () => {
    const process = detachedProcess();
    mocks.execaMock.mockReturnValue(process);
    mocks.readdirMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([localDir("local_123")]);
    mocks.readFileMock
      .mockResolvedValueOnce(
        JSON.stringify({
          orchestrationId: "local_123",
          agent: "claude/haiku-4.5",
          prompt: "Fix typo",
          workspace: "/root/workspace",
          timeout: "30m",
          createdAt: "2026-04-02T00:00:00Z",
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          sessionId: "session_123",
          injectionMode: "active",
        })
      );
    mocks.statMock.mockResolvedValue({ mtimeMs: 1 });

    const executor = new DevshExecutor({ devshPath: "devsh" });
    const result = await executor.spawn({
      agent: "claude/haiku-4.5",
      prompt: "Fix typo",
    });

    expect(mocks.execaMock).toHaveBeenCalledWith(
      "devsh",
      [
        "orchestrate",
        "run-local",
        "--json",
        "--persist",
        "--agent",
        "claude/haiku-4.5",
        "Fix typo",
      ],
      {
        detached: true,
        cleanup: false,
        stdio: "ignore",
      }
    );
    expect(process.unref).toHaveBeenCalled();
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

  it("routes repo-scoped requests to remote spawn", async () => {
    mocks.execaMock.mockReturnValue(
      jsonResult({
        orchestrationTaskId: "orch_123",
        taskId: "task_123",
        taskRunId: "run_123",
        agentName: "claude/haiku-4.5",
        status: "running",
      })
    );

    const executor = new DevshExecutor({ devshPath: "devsh" });
    const result = await executor.spawn({
      agent: "claude/haiku-4.5",
      prompt: "Fix auth bug",
      repo: "owner/repo",
    });

    expect(mocks.execaMock).toHaveBeenCalledWith(
      "devsh",
      [
        "orchestrate",
        "spawn",
        "--json",
        "--agent",
        "claude/haiku-4.5",
        "--repo",
        "owner/repo",
        "--",
        "Fix auth bug",
      ],
      { timeout: 330000 }
    );
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
    mocks.execaMock.mockReturnValue(
      jsonResult({
        orchestrationTaskId: "orch_456",
        taskId: "task_456",
        taskRunId: "run_456",
        status: "running",
      })
    );

    const executor = new DevshExecutor({ devshPath: "devsh" });
    await executor.spawn({
      agent: "claude/haiku-4.5",
      prompt: "Run remotely",
      provider: "morph",
    });

    expect(mocks.execaMock).toHaveBeenCalledWith(
      "devsh",
      [
        "orchestrate",
        "spawn",
        "--json",
        "--provider",
        "morph",
        "--agent",
        "claude/haiku-4.5",
        "--",
        "Run remotely",
      ],
      { timeout: 330000 }
    );
  });

  it("routes local inject to inject-local", async () => {
    mocks.execaMock.mockReturnValue(
      jsonResult({
        mode: "active",
        controlLane: "continue_session",
        continuationMode: "session_continuation",
      })
    );

    const executor = new DevshExecutor({ devshPath: "devsh" });
    const result = await executor.inject({
      sessionId: "local_123",
      message: "Continue the task",
      provider: "local",
    });

    expect(mocks.execaMock).toHaveBeenCalledWith(
      "devsh",
      ["orchestrate", "inject-local", "--json", "local_123", "Continue the task"],
      { timeout: 300000 }
    );
    expect(result).toMatchObject({
      venue: "local",
      controlLane: "continue_session",
    });
  });

  it("routes remote inject to orchestrate message", async () => {
    mocks.execaMock.mockReturnValue({ stdout: "ok", stderr: "" });

    const executor = new DevshExecutor({ devshPath: "devsh" });
    const result = await executor.inject({
      sessionId: "taskrun_123",
      message: "Continue the task",
    });

    expect(mocks.execaMock).toHaveBeenCalledWith(
      "devsh",
      [
        "orchestrate",
        "message",
        "taskrun_123",
        "Continue the task",
        "--type",
        "request",
      ],
      { timeout: 30000 }
    );
    expect(result).toMatchObject({
      venue: "remote",
      taskRunId: "taskrun_123",
      continuationMode: "mailbox_request",
    });
  });

  it("falls back to task status when results are queried with a task id", async () => {
    mocks.execaMock
      .mockReturnValueOnce(
        jsonResult({
          orchestrationId: "task_123",
          status: "completed",
          totalTasks: 0,
          completedTasks: 0,
          results: [],
        })
      )
      .mockReturnValueOnce(
        jsonResult({
          task: {
            _id: "task_123",
            status: "completed",
            taskRunId: "run_123",
            result: "done",
          },
        })
      );

    const executor = new DevshExecutor({ devshPath: "devsh" });
    const result = await executor.results({ taskId: "task_123" });

    expect(mocks.execaMock).toHaveBeenNthCalledWith(
      1,
      "devsh",
      ["orchestrate", "results", "--json", "task_123"],
      { timeout: 60000 }
    );
    expect(mocks.execaMock).toHaveBeenNthCalledWith(
      2,
      "devsh",
      ["orchestrate", "status", "--json", "task_123"],
      { timeout: 30000 }
    );
    expect(result).toMatchObject({
      venue: "remote",
      resultType: "task",
      controlId: "task_123",
    });
  });
});
