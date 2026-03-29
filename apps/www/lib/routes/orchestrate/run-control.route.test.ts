import { OpenAPIHono } from "@hono/zod-openapi";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { orchestrateRunControlRouter } from "./run-control.route";

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

describe("orchestrateRunControlRouter GET /v1/cmux/orchestration/run-control/:taskRunId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated requests", async () => {
    getAccessTokenFromRequest.mockResolvedValue(null);

    const app = new OpenAPIHono();
    app.route("/", orchestrateRunControlRouter);

    const response = await app.request(
      "/v1/cmux/orchestration/run-control/run_123?teamSlugOrId=example-team",
      { method: "GET" },
    );

    expect(response.status).toBe(401);
    expect(getConvex).not.toHaveBeenCalled();
  });

  it("returns the shared run-control summary for authorized requests", async () => {
    getAccessTokenFromRequest.mockResolvedValue("token_123");
    verifyTeamAccess.mockResolvedValue({
      uuid: "team_uuid",
      slug: "example-team",
      displayName: "Example Team",
      name: "Example Team",
    });

    const query = vi.fn(async () => ({
      taskRunId: "run_123",
      taskId: "task_123",
      orchestrationId: "orch_123",
      agentName: "codex/gpt-5.1-codex",
      provider: "codex",
      runStatus: "running",
      lifecycle: {
        status: "interrupted",
        interrupted: true,
        interruptionStatus: "user_input_required",
      },
      approvals: {
        pendingCount: 0,
        pendingRequestIds: [],
      },
      actions: {
        availableActions: ["continue_session"],
        canResolveApproval: false,
        canContinueSession: true,
        canResumeCheckpoint: false,
        canAppendInstruction: false,
      },
      continuation: {
        mode: "session_continuation",
        providerThreadId: "thread_123",
        hasActiveBinding: true,
      },
      timeout: {
        inactivityTimeoutMinutes: 45,
        status: "active",
        lastActivityAt: 100,
        lastActivitySource: "spawn",
        nextTimeoutAt: 200,
      },
    }));
    getConvex.mockReturnValue({ query });

    const app = new OpenAPIHono();
    app.route("/", orchestrateRunControlRouter);

    const response = await app.request(
      "/v1/cmux/orchestration/run-control/run_123?teamSlugOrId=example-team",
      {
        method: "GET",
        headers: {
          authorization: "Bearer token_123",
        },
      },
    );

    expect(response.status).toBe(200);
    expect(verifyTeamAccess).toHaveBeenCalledWith({
      req: expect.any(Request),
      accessToken: "token_123",
      teamSlugOrId: "example-team",
    });
    expect(query).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toMatchObject({
      taskRunId: "run_123",
      provider: "codex",
      actions: {
        availableActions: ["continue_session"],
      },
      continuation: {
        mode: "session_continuation",
        providerThreadId: "thread_123",
      },
    });
  });

  it("returns 404 when the task run is not found", async () => {
    getAccessTokenFromRequest.mockResolvedValue("token_123");
    verifyTeamAccess.mockResolvedValue({
      uuid: "team_uuid",
      slug: "example-team",
      displayName: "Example Team",
      name: "Example Team",
    });
    getConvex.mockReturnValue({
      query: vi.fn(async () => null),
    });

    const app = new OpenAPIHono();
    app.route("/", orchestrateRunControlRouter);

    const response = await app.request(
      "/v1/cmux/orchestration/run-control/run_missing?teamSlugOrId=example-team",
      {
        method: "GET",
        headers: {
          authorization: "Bearer token_123",
        },
      },
    );

    expect(response.status).toBe(404);
  });

  it("maps domain authorization errors to 403", async () => {
    getAccessTokenFromRequest.mockResolvedValue("token_123");
    verifyTeamAccess.mockRejectedValue(new Error("Forbidden: team mismatch"));

    const app = new OpenAPIHono();
    app.route("/", orchestrateRunControlRouter);

    const response = await app.request(
      "/v1/cmux/orchestration/run-control/run_123?teamSlugOrId=example-team",
      {
        method: "GET",
        headers: {
          authorization: "Bearer token_123",
        },
      },
    );

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toContain("Forbidden: team mismatch");
    expect(getConvex).not.toHaveBeenCalled();
  });

  it("returns 500 for unexpected errors", async () => {
    getAccessTokenFromRequest.mockResolvedValue("token_123");
    verifyTeamAccess.mockResolvedValue({
      uuid: "team_uuid",
      slug: "example-team",
      displayName: "Example Team",
      name: "Example Team",
    });
    getConvex.mockReturnValue({
      query: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    });

    const app = new OpenAPIHono();
    app.route("/", orchestrateRunControlRouter);

    const response = await app.request(
      "/v1/cmux/orchestration/run-control/run_123?teamSlugOrId=example-team",
      {
        method: "GET",
        headers: {
          authorization: "Bearer token_123",
        },
      },
    );

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe("Failed to get run-control summary");
  });
});
