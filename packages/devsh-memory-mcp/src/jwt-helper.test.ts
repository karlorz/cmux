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

describe("extractTeamIdFromJwt", () => {
  it("extracts teamId from valid JWT", () => {
    // JWT with payload: {"taskRunId":"abc","teamId":"team-123","userId":"user-456"}
    const payload = Buffer.from(
      JSON.stringify({ taskRunId: "abc", teamId: "team-123", userId: "user-456" })
    ).toString("base64url");
    const jwt = `header.${payload}.signature`;

    expect(extractTeamIdFromJwt(jwt)).toBe("team-123");
  });

  it("returns null for JWT without teamId", () => {
    const payload = Buffer.from(
      JSON.stringify({ taskRunId: "abc", userId: "user-456" })
    ).toString("base64url");
    const jwt = `header.${payload}.signature`;

    expect(extractTeamIdFromJwt(jwt)).toBeNull();
  });

  it("returns null for invalid JWT format", () => {
    expect(extractTeamIdFromJwt("invalid")).toBeNull();
    expect(extractTeamIdFromJwt("only.two")).toBeNull();
    expect(extractTeamIdFromJwt("")).toBeNull();
  });

  it("returns null for invalid base64 payload", () => {
    const jwt = "header.!!!invalid!!!.signature";
    expect(extractTeamIdFromJwt(jwt)).toBeNull();
  });

  it("handles real CMUX JWT format", () => {
    // Real format JWT (with proper padding)
    const realPayload = {
      taskRunId: "mx77yyx233623barnfk9za20ad82x135",
      teamId: "4aba49b5-2f26-403a-85b7-dad0b8189a95",
      userId: "93fc941f-dd1e-49c0-b6c9-0379636d45db",
      iat: 1773509789,
      exp: 1774114589,
    };
    const payload = Buffer.from(JSON.stringify(realPayload)).toString("base64url");
    const jwt = `eyJhbGciOiJIUzI1NiJ9.${payload}.signature`;

    expect(extractTeamIdFromJwt(jwt)).toBe("4aba49b5-2f26-403a-85b7-dad0b8189a95");
  });
});
