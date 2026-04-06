import { OpenAPIHono } from "@hono/zod-openapi";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runControlRouter } from "./run-control.route";

const { getAccessTokenFromRequest, getConvex, verifyTeamAccess } = vi.hoisted(
  () => ({
    getAccessTokenFromRequest: vi.fn(),
    getConvex: vi.fn(),
    verifyTeamAccess: vi.fn(),
  }),
);

vi.mock("@/lib/utils/auth", () => ({
  getAccessTokenFromRequest,
}));

vi.mock("@/lib/utils/get-convex", () => ({
  getConvex,
}));

vi.mock("@/lib/utils/team-verification", () => ({
  verifyTeamAccess,
}));

const baseSummary = {
  taskRunId: "run_123",
  taskId: "task_123",
  orchestrationId: "orch_123",
  agentName: "codex/gpt-5.4",
  provider: "codex",
  runStatus: "running" as const,
  lifecycle: {
    status: "active" as const,
    interrupted: false,
    interruptionStatus: "none" as const,
  },
  approvals: {
    pendingCount: 0,
    pendingRequestIds: [],
  },
  actions: {
    availableActions: ["continue_session"] as const,
    canResolveApproval: false,
    canContinueSession: true,
    canResumeCheckpoint: false,
    canAppendInstruction: false,
  },
  continuation: {
    mode: "session_continuation" as const,
    providerThreadId: "thread_123",
    hasActiveBinding: true,
  },
  timeout: {
    inactivityTimeoutMinutes: 45,
    status: "active" as const,
    lastActivityAt: 1_000,
    lastActivitySource: "spawn" as const,
    nextTimeoutAt: 2_000,
  },
};

describe("runControlRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated inspect requests", async () => {
    getAccessTokenFromRequest.mockResolvedValue(null);

    const app = new OpenAPIHono();
    app.route("/", runControlRouter);

    const response = await app.request("/run-control/inspect/run_123", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        teamSlugOrId: "example-team",
      }),
    });

    expect(response.status).toBe(401);
    expect(getConvex).not.toHaveBeenCalled();
  });

  it("returns wrapped run-control summary for inspect", async () => {
    getAccessTokenFromRequest.mockResolvedValue("token_123");
    verifyTeamAccess.mockResolvedValue({
      uuid: "team_uuid",
      slug: "example-team",
      displayName: "Example Team",
      name: "Example Team",
    });

    const query = vi.fn(async () => baseSummary);
    getConvex.mockReturnValue({ query });

    const app = new OpenAPIHono();
    app.route("/", runControlRouter);

    const response = await app.request("/run-control/inspect/run_123", {
      method: "POST",
      headers: {
        authorization: "Bearer token_123",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        teamSlugOrId: "example-team",
      }),
    });

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      action: "inspect",
      summary: {
        taskRunId: "run_123",
        timeout: {
          inactivityTimeoutMinutes: 45,
          status: "active",
        },
      },
    });
  });

  it("resolves local orchestration IDs before continuing a bridged run", async () => {
    getAccessTokenFromRequest.mockResolvedValue("token_123");
    verifyTeamAccess.mockResolvedValue({
      uuid: "team_uuid",
      slug: "example-team",
      displayName: "Example Team",
      name: "Example Team",
    });

    const query = vi.fn(async (_ref, args) => {
      if (args?.orchestrationId === "local_www_123") {
        return { taskRunId: "run_123" };
      }
      throw new Error(`Unexpected query args: ${JSON.stringify(args)}`);
    });
    const mutation = vi.fn(async () => ({
      success: true,
      action: "continue",
      queuedInputId: "input_123",
      queueDepth: 1,
      summary: baseSummary,
    }));
    getConvex.mockReturnValue({ query, mutation });

    const app = new OpenAPIHono();
    app.route("/", runControlRouter);

    const response = await app.request("/run-control/continue/local_www_123", {
      method: "POST",
      headers: {
        authorization: "Bearer token_123",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        teamSlugOrId: "example-team",
        instruction: "Continue with the bridged local run.",
        priority: "high",
      }),
    });

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(expect.anything(), {
      teamSlugOrId: "example-team",
      orchestrationId: "local_www_123",
    });
    expect(mutation).toHaveBeenCalledWith(expect.anything(), {
      teamSlugOrId: "example-team",
      taskRunId: "run_123",
      instruction: "Continue with the bridged local run.",
      priority: "high",
    });
  });

  it("falls back to local continue for unbridged local runs", async () => {
    getAccessTokenFromRequest.mockResolvedValue("token_123");
    verifyTeamAccess.mockResolvedValue({
      uuid: "team_uuid",
      slug: "example-team",
      displayName: "Example Team",
      name: "Example Team",
    });

    const query = vi.fn(async (_ref, args) => {
      if (args?.orchestrationId === "local_www_continue") {
        return { taskRunId: undefined };
      }
      throw new Error(`Unexpected query args: ${JSON.stringify(args)}`);
    });
    getConvex.mockReturnValue({ query, mutation: vi.fn() });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/orchestrate/local-runs/local_www_continue?")) {
        return {
          ok: true,
          status: 200,
          json: vi.fn(async () => ({
            sessionId: "session_456",
          })),
        };
      }
      if (url.includes("/api/orchestrate/local-runs/local_www_continue/inject")) {
        return {
          ok: true,
          status: 200,
          json: vi.fn(async () => ({ mode: "active" })),
        };
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const app = new OpenAPIHono();
    app.route("/", runControlRouter);

    const response = await app.request("/run-control/continue/local_www_continue", {
      method: "POST",
      headers: {
        authorization: "Bearer token_123",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        teamSlugOrId: "example-team",
        instruction: "Continue with the current task.",
        priority: "high",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      action: "continue",
      summary: {
        actions: {
          canContinueSession: true,
        },
        continuation: {
          mode: "session_continuation",
          providerSessionId: "session_456",
        },
      },
    });
  });

  it("falls back to local inspect summary for unbridged local runs", async () => {
    getAccessTokenFromRequest.mockResolvedValue("token_123");
    verifyTeamAccess.mockResolvedValue({
      uuid: "team_uuid",
      slug: "example-team",
      displayName: "Example Team",
      name: "Example Team",
    });

    const query = vi.fn(async (_ref, args) => {
      if (args?.orchestrationId === "local_www_inspect") {
        return { taskRunId: undefined };
      }
      throw new Error(`Unexpected query args: ${JSON.stringify(args)}`);
    });
    getConvex.mockReturnValue({ query, mutation: vi.fn() });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/orchestrate/local-runs/local_www_inspect?")) {
        return {
          ok: true,
          status: 200,
          json: vi.fn(async () => ({
            orchestrationId: "local_www_inspect",
            agent: "claude/haiku-4.5",
            status: "running",
            sessionId: "session_123",
            checkpointRef: "cp_local_www_inspect_1",
            checkpointGeneration: 1,
          })),
        };
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const app = new OpenAPIHono();
    app.route("/", runControlRouter);

    const response = await app.request("/run-control/inspect/local_www_inspect", {
      method: "POST",
      headers: {
        authorization: "Bearer token_123",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        teamSlugOrId: "example-team",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      action: "inspect",
      summary: {
        orchestrationId: "local_www_inspect",
        actions: {
          canResumeCheckpoint: true,
        },
        continuation: {
          mode: "checkpoint_restore",
          checkpointRef: "cp_local_www_inspect_1",
          checkpointGeneration: 1,
        },
      },
    });
  });

  it("falls back to local append for unbridged local runs", async () => {
    getAccessTokenFromRequest.mockResolvedValue("token_123");
    verifyTeamAccess.mockResolvedValue({
      uuid: "team_uuid",
      slug: "example-team",
      displayName: "Example Team",
      name: "Example Team",
    });

    const query = vi.fn(async (_ref, args) => {
      if (args?.orchestrationId === "local_www_append") {
        return { taskRunId: undefined };
      }
      throw new Error(`Unexpected query args: ${JSON.stringify(args)}`);
    });
    getConvex.mockReturnValue({ query, mutation: vi.fn() });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/orchestrate/local-runs/local_www_append?")) {
        return {
          ok: true,
          status: 200,
          json: vi.fn(async () => ({
            orchestrationId: "local_www_append",
            status: "running",
          })),
        };
      }
      if (url.includes("/api/orchestrate/local-runs/local_www_append/inject")) {
        return {
          ok: true,
          status: 200,
          json: vi.fn(async () => ({ mode: "passive" })),
        };
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const app = new OpenAPIHono();
    app.route("/", runControlRouter);

    const response = await app.request("/run-control/append-instruction/local_www_append", {
      method: "POST",
      headers: {
        authorization: "Bearer token_123",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        teamSlugOrId: "example-team",
        instruction: "Append this follow-up.",
        priority: "high",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      action: "append_instruction",
      summary: {
        actions: {
          canAppendInstruction: true,
        },
        continuation: {
          mode: "append_instruction",
        },
      },
    });
  });

  it("falls back to local checkpoint resume for unbridged local runs", async () => {
    getAccessTokenFromRequest.mockResolvedValue("token_123");
    verifyTeamAccess.mockResolvedValue({
      uuid: "team_uuid",
      slug: "example-team",
      displayName: "Example Team",
      name: "Example Team",
    });

    const query = vi.fn(async (_ref, args) => {
      if (args?.orchestrationId === "local_www_resume") {
        return { taskRunId: undefined };
      }
      throw new Error(`Unexpected query args: ${JSON.stringify(args)}`);
    });
    getConvex.mockReturnValue({ query, mutation: vi.fn() });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/orchestrate/local-runs/local_www_resume?")) {
        return {
          ok: true,
          status: 200,
          json: vi.fn(async () => ({
            checkpointRef: "cp_local_www_resume_2",
            checkpointGeneration: 2,
          })),
        };
      }
      if (url.includes("/api/orchestrate/local-runs/local_www_resume/resume")) {
        return {
          ok: true,
          status: 200,
          json: vi.fn(async () => ({
            mode: "checkpoint_restore",
            checkpointRef: "cp_local_www_resume_2",
            checkpointGeneration: 2,
          })),
        };
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const app = new OpenAPIHono();
    app.route("/", runControlRouter);

    const response = await app.request("/run-control/resume/local_www_resume", {
      method: "POST",
      headers: {
        authorization: "Bearer token_123",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        teamSlugOrId: "example-team",
        instruction: "Resume the interrupted task.",
        priority: "high",
      }),
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:9779/api/orchestrate/local-runs/local_www_resume?teamSlugOrId=example-team&logs=false&events=false",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token_123",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:9779/api/orchestrate/local-runs/local_www_resume/resume",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token_123",
          "Content-Type": "application/json",
        }),
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      action: "resume",
      summary: {
        continuation: {
          mode: "checkpoint_restore",
          checkpointRef: "cp_local_www_resume_2",
          checkpointGeneration: 2,
        },
      },
    });
  });
});
