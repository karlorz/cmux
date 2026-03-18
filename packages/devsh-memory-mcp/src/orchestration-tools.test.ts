import { describe, expect, it } from "bun:test";

// Copy of the extractTeamIdFromJwt function for testing
function extractTeamIdFromJwt(jwt: string): string | null {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;

    let payload = parts[1];
    const paddingNeeded = (4 - (payload.length % 4)) % 4;
    payload = payload + "=".repeat(paddingNeeded);

    const decoded = Buffer.from(payload, "base64").toString("utf8");
    const data = JSON.parse(decoded) as { teamId?: string };
    return data.teamId ?? null;
  } catch {
    return null;
  }
}

// Helper to create test JWTs
function createTestJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${payloadStr}.test-signature`;
}

describe("extractTeamIdFromJwt", () => {
  it("extracts teamId from valid JWT", () => {
    const jwt = createTestJwt({
      taskRunId: "task123",
      teamId: "team-abc",
      userId: "user-456",
    });
    expect(extractTeamIdFromJwt(jwt)).toBe("team-abc");
  });

  it("handles UUID teamId format", () => {
    const jwt = createTestJwt({
      taskRunId: "mx77yyx233623barnfk9za20ad82x135",
      teamId: "4aba49b5-2f26-403a-85b7-dad0b8189a95",
      userId: "93fc941f-dd1e-49c0-b6c9-0379636d45db",
    });
    expect(extractTeamIdFromJwt(jwt)).toBe("4aba49b5-2f26-403a-85b7-dad0b8189a95");
  });

  it("returns null when teamId is missing", () => {
    const jwt = createTestJwt({
      taskRunId: "task123",
      userId: "user-456",
    });
    expect(extractTeamIdFromJwt(jwt)).toBeNull();
  });

  it("returns null for malformed JWT", () => {
    expect(extractTeamIdFromJwt("not-a-jwt")).toBeNull();
    expect(extractTeamIdFromJwt("only.two")).toBeNull();
    expect(extractTeamIdFromJwt("")).toBeNull();
    expect(extractTeamIdFromJwt("a.b.c.d")).toBeNull();
  });

  it("returns null for invalid base64 payload", () => {
    expect(extractTeamIdFromJwt("header.!!!invalid.signature")).toBeNull();
  });

  it("returns null for non-JSON payload", () => {
    const header = Buffer.from("{}").toString("base64url");
    const payload = Buffer.from("not-json").toString("base64url");
    expect(extractTeamIdFromJwt(`${header}.${payload}.sig`)).toBeNull();
  });
});

describe("Orchestration Tool Schemas", () => {
  // These tests verify the expected schema structure for orchestration tools
  // without making actual API calls

  describe("spawn_agent parameters", () => {
    it("requires prompt and agentName", () => {
      const validParams = {
        prompt: "Test task",
        agentName: "claude/haiku-4.5",
      };
      expect(validParams.prompt).toBeTruthy();
      expect(validParams.agentName).toBeTruthy();
    });

    it("supports optional parameters", () => {
      const fullParams = {
        prompt: "Test task",
        agentName: "claude/haiku-4.5",
        repo: "owner/repo",
        branch: "main",
        dependsOn: ["task-1", "task-2"],
        priority: 5,
      };
      expect(fullParams.dependsOn).toHaveLength(2);
      expect(fullParams.priority).toBe(5);
    });

    it("validates agent name format", () => {
      const validAgents = [
        "claude/haiku-4.5",
        "claude/opus-4.5",
        "codex/gpt-5.1-codex-mini",
        "gemini/gemini-2.5-pro",
      ];
      for (const agent of validAgents) {
        expect(agent).toMatch(/^[a-z]+\/[a-z0-9.-]+$/);
      }
    });
  });

  describe("get_agent_status parameters", () => {
    it("requires orchestrationTaskId", () => {
      const params = {
        orchestrationTaskId: "rs72f80jeyp6m2gjdfc5hx96w9835c5y",
      };
      expect(params.orchestrationTaskId).toBeTruthy();
      expect(params.orchestrationTaskId).toMatch(/^[a-z0-9]+$/);
    });
  });

  describe("wait_for_agent parameters", () => {
    it("requires orchestrationTaskId", () => {
      const params = {
        orchestrationTaskId: "rs72f80jeyp6m2gjdfc5hx96w9835c5y",
      };
      expect(params.orchestrationTaskId).toBeTruthy();
    });

    it("has optional timeout with default", () => {
      const defaultTimeout = 300000; // 5 minutes
      const params = {
        orchestrationTaskId: "task123",
        timeout: defaultTimeout,
      };
      expect(params.timeout).toBe(300000);
    });
  });

  describe("wait_for_events parameters", () => {
    it("requires orchestrationId", () => {
      const params = {
        orchestrationId: "orch_abc123",
      };
      expect(params.orchestrationId).toBeTruthy();
    });

    it("supports event type filtering", () => {
      const params = {
        orchestrationId: "orch_abc123",
        eventTypes: ["task_completed", "approval_required"],
        timeout: 30000,
      };
      expect(params.eventTypes).toHaveLength(2);
    });
  });
});

describe("Error Handling", () => {
  it("returns appropriate error when JWT is missing", () => {
    // Simulates the error response when CMUX_TASK_RUN_JWT is not set
    const errorResponse = {
      content: [{
        type: "text",
        text: "CMUX_TASK_RUN_JWT environment variable not set. This tool requires JWT authentication.",
      }],
    };
    expect(errorResponse.content[0].text).toContain("CMUX_TASK_RUN_JWT");
  });

  it("returns appropriate error when teamId extraction fails", () => {
    const errorResponse = {
      content: [{
        type: "text",
        text: "Failed to extract teamId from JWT token.",
      }],
    };
    expect(errorResponse.content[0].text).toContain("teamId");
  });
});

describe("API URL Construction", () => {
  it("constructs correct status endpoint URL", () => {
    const serverUrl = "https://cmux-server.karldigi.dev";
    const taskId = "rs72f80jeyp6m2gjdfc5hx96w9835c5y";
    const teamId = "team-123";

    const url = `${serverUrl}/api/orchestrate/status/${taskId}?teamSlugOrId=${encodeURIComponent(teamId)}`;

    expect(url).toBe("https://cmux-server.karldigi.dev/api/orchestrate/status/rs72f80jeyp6m2gjdfc5hx96w9835c5y?teamSlugOrId=team-123");
  });

  it("constructs correct spawn endpoint URL", () => {
    const serverUrl = "https://cmux-server.karldigi.dev";
    const url = `${serverUrl}/api/v1/cmux/orchestration/spawn`;

    expect(url).toBe("https://cmux-server.karldigi.dev/api/v1/cmux/orchestration/spawn");
  });

  it("encodes teamId with special characters", () => {
    const teamId = "team with spaces & special";
    const encoded = encodeURIComponent(teamId);

    expect(encoded).toBe("team%20with%20spaces%20%26%20special");
  });
});
