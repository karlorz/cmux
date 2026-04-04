import { OpenAPIHono } from "@hono/zod-openapi";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { execaMock, randomUUIDMock, homedirMock } = vi.hoisted(() => ({
  execaMock: vi.fn(),
  randomUUIDMock: vi.fn(),
  homedirMock: vi.fn(),
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
        agent: "claude/haiku-4.5",
        prompt: "Normalize the local run contract",
        workspace: "/Users/tester/Desktop/code/cmux",
        timeout: "45m",
      }),
    });

    expect(response.status).toBe(200);
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
      }),
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
      },
    );

    expect(response.status).toBe(200);
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
    expect(body.runs[0]).not.toHaveProperty("id");
    expect(body.runs[0]).not.toHaveProperty("createdAt");
  });
});
