import { describe, expect, it } from "vitest";
import {
  mapDomainError,
  extractTeamFromJwt,
  extractTaskRunIdFromJwt,
} from "./_helpers";

describe("orchestrate/_helpers", () => {
  describe("mapDomainError", () => {
    it("returns null for non-Error values", () => {
      expect(mapDomainError("string error")).toBeNull();
      expect(mapDomainError(123)).toBeNull();
      expect(mapDomainError(null)).toBeNull();
      expect(mapDomainError(undefined)).toBeNull();
      expect(mapDomainError({ message: "object" })).toBeNull();
    });

    it("maps Forbidden errors to 403", () => {
      const error = new Error("Forbidden: user lacks permission");
      const result = mapDomainError(error);
      expect(result).toEqual({
        status: 403,
        message: "Forbidden: user lacks permission",
      });
    });

    it("maps not found errors to 404 (lowercase)", () => {
      const error = new Error("Resource not found");
      const result = mapDomainError(error);
      expect(result).toEqual({
        status: 404,
        message: "Resource not found",
      });
    });

    it("maps Not found errors to 404 (capitalized)", () => {
      const error = new Error("Not found: task xyz");
      const result = mapDomainError(error);
      expect(result).toEqual({
        status: 404,
        message: "Not found: task xyz",
      });
    });

    it("returns null for unrecognized Error messages", () => {
      expect(mapDomainError(new Error("Something went wrong"))).toBeNull();
      expect(mapDomainError(new Error("Internal error"))).toBeNull();
      expect(mapDomainError(new Error("Database connection failed"))).toBeNull();
    });

    it("handles Error with empty message", () => {
      expect(mapDomainError(new Error(""))).toBeNull();
    });

    it("prioritizes Forbidden over not found in message", () => {
      // If message contains both, Forbidden check comes first
      const error = new Error("Forbidden: resource not found");
      const result = mapDomainError(error);
      expect(result?.status).toBe(403);
    });
  });

  describe("extractTeamFromJwt", () => {
    // Helper to create a mock JWT with payload
    function createMockJwt(payload: Record<string, unknown>): string {
      const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
      const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const signature = "mock_signature";
      return `${header}.${payloadStr}.${signature}`;
    }

    it("returns undefined for undefined auth header", () => {
      expect(extractTeamFromJwt(undefined)).toBeUndefined();
    });

    it("returns undefined for non-Bearer auth header", () => {
      expect(extractTeamFromJwt("Basic abc123")).toBeUndefined();
      expect(extractTeamFromJwt("abc123")).toBeUndefined();
    });

    it("returns undefined for malformed JWT", () => {
      expect(extractTeamFromJwt("Bearer invalid")).toBeUndefined();
      expect(extractTeamFromJwt("Bearer a.b")).toBeUndefined();
      expect(extractTeamFromJwt("Bearer ")).toBeUndefined();
    });

    it("extracts teamSlugOrId from JWT payload", () => {
      const jwt = createMockJwt({ teamSlugOrId: "my-team" });
      expect(extractTeamFromJwt(`Bearer ${jwt}`)).toBe("my-team");
    });

    it("falls back to teamId if teamSlugOrId not present", () => {
      const jwt = createMockJwt({ teamId: "team_123" });
      expect(extractTeamFromJwt(`Bearer ${jwt}`)).toBe("team_123");
    });

    it("prefers teamSlugOrId over teamId", () => {
      const jwt = createMockJwt({ teamSlugOrId: "slug", teamId: "id" });
      expect(extractTeamFromJwt(`Bearer ${jwt}`)).toBe("slug");
    });

    it("returns undefined if neither team field present", () => {
      const jwt = createMockJwt({ userId: "user_123" });
      expect(extractTeamFromJwt(`Bearer ${jwt}`)).toBeUndefined();
    });

    it("returns undefined for invalid base64 in payload", () => {
      expect(extractTeamFromJwt("Bearer header.!!!invalid!!!.sig")).toBeUndefined();
    });

    it("returns undefined for non-JSON payload", () => {
      const header = Buffer.from("{}").toString("base64url");
      const payload = Buffer.from("not json").toString("base64url");
      expect(extractTeamFromJwt(`Bearer ${header}.${payload}.sig`)).toBeUndefined();
    });
  });

  describe("extractTaskRunIdFromJwt", () => {
    function createMockJwt(payload: Record<string, unknown>): string {
      const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
      const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const signature = "mock_signature";
      return `${header}.${payloadStr}.${signature}`;
    }

    it("returns undefined for undefined auth header", () => {
      expect(extractTaskRunIdFromJwt(undefined)).toBeUndefined();
    });

    it("returns undefined for non-Bearer auth header", () => {
      expect(extractTaskRunIdFromJwt("Basic abc123")).toBeUndefined();
    });

    it("returns undefined for malformed JWT", () => {
      expect(extractTaskRunIdFromJwt("Bearer not.a.valid")).toBeUndefined();
    });

    it("extracts taskRunId from JWT payload", () => {
      const jwt = createMockJwt({ taskRunId: "run_abc123" });
      expect(extractTaskRunIdFromJwt(`Bearer ${jwt}`)).toBe("run_abc123");
    });

    it("returns undefined if taskRunId not present", () => {
      const jwt = createMockJwt({ teamId: "team_123" });
      expect(extractTaskRunIdFromJwt(`Bearer ${jwt}`)).toBeUndefined();
    });

    it("handles empty payload", () => {
      const jwt = createMockJwt({});
      expect(extractTaskRunIdFromJwt(`Bearer ${jwt}`)).toBeUndefined();
    });
  });
});
