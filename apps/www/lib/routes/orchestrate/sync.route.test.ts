import { OpenAPIHono } from "@hono/zod-openapi";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { orchestrateSyncRouter } from "./sync.route";

const {
  getAccessTokenFromRequest,
  getConvex,
  getConvexAdmin,
  extractTaskRunJwtFromRequest,
  verifyTaskRunJwt,
} = vi.hoisted(() => ({
  getAccessTokenFromRequest: vi.fn(),
  getConvex: vi.fn(),
  getConvexAdmin: vi.fn(),
  extractTaskRunJwtFromRequest: vi.fn(),
  verifyTaskRunJwt: vi.fn(),
}));

vi.mock("@/lib/utils/auth", () => ({
  getAccessTokenFromRequest,
}));

vi.mock("@/lib/utils/get-convex", () => ({
  getConvex,
  getConvexAdmin,
}));

vi.mock("@/lib/utils/jwt-task-run", () => ({
  extractTaskRunJwtFromRequest,
  verifyTaskRunJwt,
}));

describe("orchestrateSyncRouter POST /sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts verified task-run JWT auth for heartbeat updates", async () => {
    getAccessTokenFromRequest.mockResolvedValue(null);
    extractTaskRunJwtFromRequest.mockReturnValue(null);
    verifyTaskRunJwt.mockResolvedValue({
      taskRunId: "ns7_task_run_123",
      teamId: "team_123",
      userId: "user_123",
    });

    const adminMutation = vi.fn(async () => ({ ok: true }));
    const adminQuery = vi.fn(async () => []);
    getConvexAdmin.mockReturnValue({
      mutation: adminMutation,
      query: adminQuery,
    });

    const app = new OpenAPIHono();
    app.route("/", orchestrateSyncRouter);

    const response = await app.request(
      "/v1/cmux/orchestration/orch_123/sync",
      {
        method: "POST",
        headers: {
          authorization: "Bearer test-task-run-jwt",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          orchestrationId: "orch_123",
          headAgentStatus: "running",
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(adminMutation).toHaveBeenCalledTimes(1);
    expect(adminMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        teamId: "team_123",
        id: "ns7_task_run_123",
        orchestrationId: "orch_123",
        status: "running",
      })
    );
  });

  it("accepts verified task-run JWT auth for pull sync", async () => {
    getAccessTokenFromRequest.mockResolvedValue(null);
    extractTaskRunJwtFromRequest.mockReturnValue(null);
    verifyTaskRunJwt.mockResolvedValue({
      taskRunId: "ns7_task_run_123",
      teamId: "team_123",
      userId: "user_123",
    });

    const adminQuery = vi
      .fn()
      .mockResolvedValueOnce([
        {
          _id: "task_server_123",
          prompt: "Investigate stale head",
          assignedAgentName: "codex/gpt-5.4",
          status: "running",
          taskRunId: "ns7_worker_123",
          dependencies: [],
          priority: 1,
          result: undefined,
          errorMessage: undefined,
          _creationTime: 1710000000000,
          startedAt: 1710000005000,
          completedAt: undefined,
        },
      ])
      .mockResolvedValueOnce([
        {
          messageId: "msg_123",
          senderName: "head-agent",
          recipientName: "*",
          messageType: "status",
          content: "still running",
          timestamp: "2026-03-26T10:00:00.000Z",
          read: false,
        },
      ])
      .mockResolvedValueOnce({
        depth: 1,
        capacity: 20,
        hasPendingInputs: true,
        oldestInputAt: 1710000010000,
      });
    getConvexAdmin.mockReturnValue({
      mutation: vi.fn(),
      query: adminQuery,
    });

    const app = new OpenAPIHono();
    app.route("/", orchestrateSyncRouter);

    const response = await app.request(
      "/v1/cmux/orchestration/orch_123/sync",
      {
        method: "GET",
        headers: {
          authorization: "Bearer test-task-run-jwt",
          "content-type": "application/json",
        },
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      tasks: [
        {
          id: "task_server_123",
          prompt: "Investigate stale head",
          agentName: "codex/gpt-5.4",
          status: "running",
        },
      ],
      messages: [
        {
          id: "msg_123",
          from: "head-agent",
          to: "*",
          type: "status",
          message: "still running",
        },
      ],
      aggregatedStatus: {
        total: 1,
        completed: 0,
        running: 1,
        failed: 0,
        pending: 0,
      },
      turnState: {
        turnNumber: 0,
        awaitingOperatorInput: true,
        pendingInputs: 1,
        queueCapacity: 20,
      },
    });
  });

  it("rejects invalid JWT bearer auth", async () => {
    getAccessTokenFromRequest.mockResolvedValue(null);
    extractTaskRunJwtFromRequest.mockReturnValue(null);
    verifyTaskRunJwt.mockResolvedValue(null);

    const app = new OpenAPIHono();
    app.route("/", orchestrateSyncRouter);

    const response = await app.request(
      "/v1/cmux/orchestration/orch_123/sync",
      {
        method: "POST",
        headers: {
          authorization: "Bearer invalid-task-run-jwt",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          orchestrationId: "orch_123",
          headAgentStatus: "running",
        }),
      }
    );

    expect(response.status).toBe(401);
    expect(getConvexAdmin).not.toHaveBeenCalled();
  });
});
