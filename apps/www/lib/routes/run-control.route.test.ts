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

  it("passes continue commands through to Convex", async () => {
    getAccessTokenFromRequest.mockResolvedValue("token_123");
    verifyTeamAccess.mockResolvedValue({
      uuid: "team_uuid",
      slug: "example-team",
      displayName: "Example Team",
      name: "Example Team",
    });

    const mutation = vi.fn(async () => ({
      success: true,
      action: "continue",
      queuedInputId: "input_123",
      queueDepth: 1,
      summary: {
        ...baseSummary,
        timeout: {
          ...baseSummary.timeout,
          lastActivitySource: "session_continue",
          lastActivityAt: 3_000,
          nextTimeoutAt: 4_000,
        },
      },
    }));
    getConvex.mockReturnValue({ mutation });

    const app = new OpenAPIHono();
    app.route("/", runControlRouter);

    const response = await app.request("/run-control/continue/run_123", {
      method: "POST",
      headers: {
        authorization: "Bearer token_123",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        teamSlugOrId: "example-team",
        instruction: "Continue and finish the refactor.",
        priority: "high",
      }),
    });

    expect(response.status).toBe(200);
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(mutation).toHaveBeenCalledWith(expect.anything(), {
      teamSlugOrId: "example-team",
      taskRunId: "run_123",
      instruction: "Continue and finish the refactor.",
      priority: "high",
    });
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      action: "continue",
      queuedInputId: "input_123",
      summary: {
        timeout: {
          lastActivitySource: "session_continue",
        },
      },
    });
  });
});
