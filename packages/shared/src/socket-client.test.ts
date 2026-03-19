import { describe, expect, it } from "vitest";
import { buildMainClientQuery } from "./socket-client";

describe("buildMainClientQuery", () => {
  it("includes auth token", () => {
    const result = buildMainClientQuery({
      authToken: "test-token",
    });

    expect(result.auth).toBe("test-token");
  });

  it("includes team when provided", () => {
    const result = buildMainClientQuery({
      authToken: "token",
      teamSlugOrId: "my-team",
    });

    expect(result.auth).toBe("token");
    expect(result.team).toBe("my-team");
  });

  it("omits team when not provided", () => {
    const result = buildMainClientQuery({
      authToken: "token",
    });

    expect(result).not.toHaveProperty("team");
  });

  it("includes auth_json when authJson is provided", () => {
    const authJson = { userId: "123", role: "admin" };
    const result = buildMainClientQuery({
      authToken: "token",
      authJson,
    });

    expect(result.auth_json).toBe(JSON.stringify(authJson));
  });

  it("includes auth_json for null value", () => {
    const result = buildMainClientQuery({
      authToken: "token",
      authJson: null,
    });

    expect(result.auth_json).toBe("null");
  });

  it("omits auth_json when undefined", () => {
    const result = buildMainClientQuery({
      authToken: "token",
      authJson: undefined,
    });

    expect(result).not.toHaveProperty("auth_json");
  });

  it("handles all parameters together", () => {
    const result = buildMainClientQuery({
      authToken: "my-auth-token",
      teamSlugOrId: "team-123",
      authJson: { extra: "data" },
    });

    expect(result.auth).toBe("my-auth-token");
    expect(result.team).toBe("team-123");
    expect(result.auth_json).toBe('{"extra":"data"}');
  });

  it("returns Record<string, string> type", () => {
    const result = buildMainClientQuery({
      authToken: "token",
    });

    // All values should be strings
    for (const value of Object.values(result)) {
      expect(typeof value).toBe("string");
    }
  });
});
