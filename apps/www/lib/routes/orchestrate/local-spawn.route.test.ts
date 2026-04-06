import { OpenAPIHono } from "@hono/zod-openapi";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  execaMock,
  randomUUIDMock,
  homedirMock,
  getAccessTokenFromRequest,
  verifyTeamAccess,
  getConvex,
} = vi.hoisted(() => ({
  execaMock: vi.fn(),
  randomUUIDMock: vi.fn(),
  homedirMock: vi.fn(),
  getAccessTokenFromRequest: vi.fn(),
  verifyTeamAccess: vi.fn(),
  getConvex: vi.fn(),
}));

vi.mock("execa", () => ({
  execa: execaMock,
}));

vi.mock("node:crypto", () => ({
  randomUUID: randomUUIDMock,
}));

vi.mock("node:os", () => ({
  default: {
    homedir: homedirMock,
  },
}));

vi.mock("@/lib/utils/auth", () => ({
  getAccessTokenFromRequest,
}));

vi.mock("@/lib/utils/team-verification", () => ({
  verifyTeamAccess,
}));

vi.mock("@/lib/utils/get-convex", () => ({
  getConvex,
}));

import { orchestrateLocalSpawnRouter } from "./local-spawn.route";

function createApp() {
  const app = new OpenAPIHono();
  app.route("/", orchestrateLocalSpawnRouter);
  return app;
}

describe("orchestrateLocalSpawnRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(1_712_345_678_901);
    randomUUIDMock.mockReturnValue("abcd1234-0000-0000-0000-000000000000");
    homedirMock.mockReturnValue("/Users/tester");
    getAccessTokenFromRequest.mockResolvedValue("token_123");
    getConvex.mockReturnValue({
      query: vi.fn(async () => []),
      mutation: vi.fn(async () => "launch_record_1"),
    });
    verifyTeamAccess.mockResolvedValue({
      uuid: "team_uuid",
      slug: "example-team",
      displayName: "Example Team",
      name: "Example Team",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects unauthenticated local spawn requests", async () => {
    getAccessTokenFromRequest.mockResolvedValue(null);

    const response = await createApp().request("/orchestrate/spawn-local", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        teamSlugOrId: "example-team",
        agent: "claude/haiku-4.5",
        prompt: "Normalize the local run contract",
      }),
    });

    expect(response.status).toBe(401);
    expect(execaMock).not.toHaveBeenCalled();
  });

  it("POST /orchestrate/spawn-local uses an explicit orchestration ID and returns canonical run metadata", async () => {
    const unref = vi.fn();
    const catchMock = vi.fn().mockReturnValue(undefined);
    execaMock.mockReturnValue({
      unref,
      catch: catchMock,
    });

    const response = await createApp().request("/orchestrate/spawn-local", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        teamSlugOrId: "example-team",
        agent: "claude/haiku-4.5",
        prompt: "Normalize the local run contract",
        workspace: "/Users/tester/Desktop/code/cmux",
        timeout: "45m",
      }),
    });

    expect(response.status).toBe(200);
    expect(verifyTeamAccess).toHaveBeenCalledWith({
      req: expect.any(Request),
      accessToken: "token_123",
      teamSlugOrId: "example-team",
    });
    expect(execaMock).toHaveBeenCalledTimes(1);
    expect(execaMock).toHaveBeenCalledWith(
      "devsh",
      [
        "orchestrate",
        "run-local",
        "--json",
        "--persist",
        "--agent",
        "claude/haiku-4.5",
        "--orchestration-id",
        "local_www_1712345678901_abcd1234",
        "--workspace",
        "/Users/tester/Desktop/code/cmux",
        "--timeout",
        "45m",
        "Normalize the local run contract",
      ],
      expect.objectContaining({
        detached: true,
        stdio: "ignore",
        env: expect.objectContaining({
          DEVSH_OUTPUT_FORMAT: "json",
        }),
      })
    );
    expect(unref).toHaveBeenCalledTimes(1);
    expect(catchMock).toHaveBeenCalledTimes(1);

    await expect(response.json()).resolves.toEqual({
      venue: "local",
      orchestrationId: "local_www_1712345678901_abcd1234",
      runId: "local_www_1712345678901_abcd1234",
      runDir: "/Users/tester/.devsh/orchestrations/local_www_1712345678901_abcd1234",
      status: "running",
      routingReason: "Explicit local venue requested via UI.",
      capabilities: {
        continueSession: true,
        appendInstruction: true,
        createCheckpoint: true,
      },
      followUp: {
        statusId: "local_www_1712345678901_abcd1234",
        injectId: "local_www_1712345678901_abcd1234",
      },
    });
  });

  it("GET /orchestrate/list-local normalizes canonical local run fields", async () => {
    execaMock.mockResolvedValue({
      stdout: JSON.stringify([
        {
          orchestrationId: "local_www_1712345678901_abcd1234",
          agent: "claude/haiku-4.5",
          status: "running",
          startedAt: "2026-04-04T08:00:00Z",
          completedAt: "2026-04-04T08:30:00Z",
          runDir: "/Users/tester/.devsh/orchestrations/local_www_1712345678901_abcd1234",
          prompt: "Normalize the local run contract",
          workspace: "/Users/tester/Desktop/code/cmux",
        },
      ]),
    });

    const response = await createApp().request(
      "/orchestrate/list-local?teamSlugOrId=example-team&limit=5&status=running",
      {
        method: "GET",
      }
    );

    expect(response.status).toBe(200);
    expect(verifyTeamAccess).toHaveBeenCalledWith({
      req: expect.any(Request),
      accessToken: "token_123",
      teamSlugOrId: "example-team",
    });
    expect(execaMock).toHaveBeenCalledWith("devsh", [
      "orchestrate",
      "list-local",
      "--json",
      "--limit",
      "5",
      "--status",
      "running",
    ], {
      timeout: 10000,
    });

    const body = await response.json();
    expect(body).toEqual({
      runs: [
        {
          orchestrationId: "local_www_1712345678901_abcd1234",
          agent: "claude/haiku-4.5",
          status: "running",
          prompt: "Normalize the local run contract",
          startedAt: "2026-04-04T08:00:00Z",
          completedAt: "2026-04-04T08:30:00Z",
          runDir: "/Users/tester/.devsh/orchestrations/local_www_1712345678901_abcd1234",
          workspace: "/Users/tester/Desktop/code/cmux",
        },
      ],
      count: 1,
    });
  });

  it("GET /orchestrate/list-local includes bridged task run IDs when launch records exist", async () => {
    execaMock.mockResolvedValue({
      stdout: JSON.stringify([
        {
          orchestrationId: "local_www_1712345678901_abcd1234",
          agent: "claude/haiku-4.5",
          status: "running",
        },
      ]),
    });
    const query = vi.fn(async () => [
      {
        orchestrationId: "local_www_1712345678901_abcd1234",
        taskRunId: "tskrun_bridge_123",
      },
    ]);
    getConvex.mockReturnValue({ query });

    const response = await createApp().request(
      "/orchestrate/list-local?teamSlugOrId=example-team&limit=5",
      { method: "GET" }
    );

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledTimes(1);
    const bridgeArgs = query.mock.calls[0] as unknown as [unknown, { teamSlugOrId: string; limit: number }] | undefined;
    expect(bridgeArgs?.length).toBe(2);
    expect(bridgeArgs?.[1]).toEqual({
      teamSlugOrId: "example-team",
      limit: 20,
    });
    await expect(response.json()).resolves.toEqual({
      runs: [
        {
          orchestrationId: "local_www_1712345678901_abcd1234",
          agent: "claude/haiku-4.5",
          status: "running",
          bridgedTaskRunId: "tskrun_bridge_123",
        },
      ],
      count: 1,
    });
  });

  it("GET /orchestrate/local-runs/:runId returns detail from show-local", async () => {
    execaMock.mockResolvedValue({
      stdout: JSON.stringify({
        orchestrationId: "local_www_1712345678901_abcd1234",
        runDir: "/Users/tester/.devsh/orchestrations/local_www_1712345678901_abcd1234",
        agent: "claude/haiku-4.5",
        status: "running",
        prompt: "Normalize the local run contract",
        workspace: "/Users/tester/Desktop/code/cmux",
        startedAt: "2026-04-04T08:00:00Z",
        selectedVariant: "high",
        model: "claude-sonnet-4-6",
        gitBranch: "feat/local-runs",
        gitCommit: "abc123def456",
        devshVersion: "1.2.3",
        sessionId: "session_123",
        injectionMode: "active",
        lastInjectionAt: "2026-04-04T08:04:00Z",
        injectionCount: 2,
        checkpointRef: "cp_local_www_1712345678901_abcd1234_1",
        checkpointGeneration: 1,
        checkpointLabel: "before-apply",
        checkpointCreatedAt: 1712217840000,
        stdout: "working...",
        stderr: "",
        events: [
          {
            timestamp: "2026-04-04T08:00:01Z",
            type: "task_started",
            message: "Starting task",
          },
        ],
      }),
    });

    const query = vi.fn(async () => ({
      taskId: "task_123",
      taskRunId: "tskrun_bridge_123",
    }));
    getConvex.mockReturnValue({ query });

    const response = await createApp().request(
      "/orchestrate/local-runs/local_www_1712345678901_abcd1234?teamSlugOrId=example-team&logs=true&events=true",
      { method: "GET" }
    );

    expect(response.status).toBe(200);
    expect(execaMock).toHaveBeenCalledWith(
      "devsh",
      [
        "orchestrate",
        "show-local",
        "local_www_1712345678901_abcd1234",
        "--json",
        "--logs",
        "--events",
      ],
      { timeout: 10000 }
    );
    await expect(response.json()).resolves.toMatchObject({
      orchestrationId: "local_www_1712345678901_abcd1234",
      bridgedTaskId: "task_123",
      bridgedTaskRunId: "tskrun_bridge_123",
      selectedVariant: "high",
      model: "claude-sonnet-4-6",
      gitBranch: "feat/local-runs",
      gitCommit: "abc123def456",
      devshVersion: "1.2.3",
      sessionId: "session_123",
      injectionMode: "active",
      lastInjectionAt: "2026-04-04T08:04:00Z",
      injectionCount: 2,
      checkpointRef: "cp_local_www_1712345678901_abcd1234_1",
      checkpointGeneration: 1,
      checkpointLabel: "before-apply",
      checkpointCreatedAt: 1712217840000,
      stdout: "working...",
      events: [
        expect.objectContaining({
          type: "task_started",
        }),
      ],
    });
  });

  it("POST /orchestrate/local-runs/:runId/inject delegates to inject-local", async () => {
    execaMock.mockResolvedValue({
      stdout: JSON.stringify({
        runId: "local_www_1712345678901_abcd1234",
        mode: "active",
        message: "Add tests too",
        injectionCount: 2,
        controlLane: "continue_session",
        continuationMode: "session_continuation",
        availableActions: ["continue_session"],
        sessionId: "session_123",
      }),
    });

    const mutation = vi.fn(async () => "launch_record_1");
    getConvex.mockReturnValue({ query: vi.fn(async () => []), mutation });

    const response = await createApp().request(
      "/orchestrate/local-runs/local_www_1712345678901_abcd1234/inject",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          teamSlugOrId: "example-team",
          message: "Add tests too",
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(execaMock).toHaveBeenCalledWith(
      "devsh",
      [
        "orchestrate",
        "inject-local",
        "local_www_1712345678901_abcd1234",
        "Add tests too",
        "--json",
      ],
      { timeout: 10000 }
    );
    expect(mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        teamSlugOrId: "example-team",
        orchestrationId: "local_www_1712345678901_abcd1234",
        sessionId: "session_123",
        injectionMode: "active",
        injectionCount: 2,
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      mode: "active",
      sessionId: "session_123",
    });
  });

  it("POST /orchestrate/local-runs/:runId/resume delegates to resume-local", async () => {
    execaMock.mockResolvedValue({
      stdout: JSON.stringify({
        runId: "local_www_1712345678901_abcd1234",
        mode: "checkpoint_restore",
        message: "Resume the interrupted task.",
        controlLane: "resume_checkpoint",
        continuationMode: "checkpoint_restore",
        availableActions: ["resume_checkpoint"],
        checkpointRef: "cp_local_www_1712345678901_abcd1234_2",
        checkpointGeneration: 2,
        checkpointLabel: "before-refactor",
      }),
    });
    const mutation = vi.fn(async () => "launch_record_1");
    getConvex.mockReturnValue({ query: vi.fn(async () => []), mutation });

    const response = await createApp().request(
      "/orchestrate/local-runs/local_www_1712345678901_abcd1234/resume",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          teamSlugOrId: "example-team",
          message: "Resume the interrupted task.",
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(execaMock).toHaveBeenCalledWith(
      "devsh",
      [
        "orchestrate",
        "resume-local",
        "local_www_1712345678901_abcd1234",
        "Resume the interrupted task.",
        "--json",
      ],
      { timeout: 10000 }
    );
    expect(mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        teamSlugOrId: "example-team",
        orchestrationId: "local_www_1712345678901_abcd1234",
        checkpointRef: "cp_local_www_1712345678901_abcd1234_2",
        checkpointGeneration: 2,
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      controlLane: "resume_checkpoint",
      continuationMode: "checkpoint_restore",
    });
  });

  it("POST /orchestrate/local-runs/:runId/checkpoint creates a local checkpoint", async () => {
    execaMock.mockResolvedValue({
      stdout: JSON.stringify({
        runId: "local_www_1712345678901_abcd1234",
        runDir: "/Users/tester/.devsh/orchestrations/local_www_1712345678901_abcd1234",
        checkpointRef: "cp_local_www_1712345678901_abcd1234_2",
        checkpointGeneration: 2,
        label: "before-refactor",
        createdAt: "2026-04-04T08:05:00Z",
      }),
    });
    const mutation = vi.fn(async () => "launch_record_1");
    getConvex.mockReturnValue({ query: vi.fn(async () => []), mutation });

    const response = await createApp().request(
      "/orchestrate/local-runs/local_www_1712345678901_abcd1234/checkpoint",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          teamSlugOrId: "example-team",
          label: "before-refactor",
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(execaMock).toHaveBeenCalledWith(
      "devsh",
      [
        "orchestrate",
        "checkpoint",
        "--json",
        "--local-run",
        "local_www_1712345678901_abcd1234",
        "--label",
        "before-refactor",
      ],
      { timeout: 10000 }
    );
    expect(mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        teamSlugOrId: "example-team",
        orchestrationId: "local_www_1712345678901_abcd1234",
        checkpointRef: "cp_local_www_1712345678901_abcd1234_2",
        checkpointGeneration: 2,
        checkpointLabel: "before-refactor",
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      checkpointRef: "cp_local_www_1712345678901_abcd1234_2",
      checkpointGeneration: 2,
      label: "before-refactor",
    });
  });

  it("POST /orchestrate/local-runs/:runId/stop delegates to stop-local", async () => {
    execaMock.mockResolvedValue({
      stdout: JSON.stringify({
        runId: "local_www_1712345678901_abcd1234",
        runDir: "/Users/tester/.devsh/orchestrations/local_www_1712345678901_abcd1234",
        pid: 4242,
        signal: "SIGTERM",
        status: "stopped",
        message: "Sent SIGTERM to process 4242",
      }),
    });

    const response = await createApp().request(
      "/orchestrate/local-runs/local_www_1712345678901_abcd1234/stop",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          teamSlugOrId: "example-team",
          force: false,
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(execaMock).toHaveBeenCalledWith(
      "devsh",
      [
        "orchestrate",
        "stop-local",
        "local_www_1712345678901_abcd1234",
        "--json",
      ],
      { timeout: 10000 }
    );
    await expect(response.json()).resolves.toMatchObject({
      signal: "SIGTERM",
      status: "stopped",
    });
  });

  it("maps unavailable local-run actions to 409", async () => {
    execaMock.mockRejectedValue(new Error("run local_www_1712345678901_abcd1234 is already completed"));

    const response = await createApp().request(
      "/orchestrate/local-runs/local_www_1712345678901_abcd1234/stop",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          teamSlugOrId: "example-team",
          force: false,
        }),
      }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "Local run stop is unavailable",
    });
  });
});
