import { describe, expect, it } from "vitest";
import { extractTaskRunJwt } from "./jwt-helper";

describe("extractTaskRunJwt", () => {
  describe("successful extraction", () => {
    it("extracts JWT from lowercase header", () => {
      const headers = { "x-task-run-jwt": "my-jwt-token" };
      expect(extractTaskRunJwt(headers)).toBe("my-jwt-token");
    });

    it("extracts long JWT tokens", () => {
      const token = "eyJhbGciOiJIUzI1NiJ9." + "a".repeat(100);
      const headers = { "x-task-run-jwt": token };
      expect(extractTaskRunJwt(headers)).toBe(token);
    });
  });

  describe("returns null for missing/invalid headers", () => {
    it("returns null when header is not present", () => {
      const headers = { "content-type": "application/json" };
      expect(extractTaskRunJwt(headers)).toBeNull();
    });

    it("returns null for empty string", () => {
      const headers = { "x-task-run-jwt": "" };
      expect(extractTaskRunJwt(headers)).toBeNull();
    });

    it("returns null for array value", () => {
      const headers = { "x-task-run-jwt": ["token1", "token2"] };
      expect(extractTaskRunJwt(headers)).toBeNull();
    });

    it("returns null for undefined value", () => {
      const headers = { "x-task-run-jwt": undefined };
      expect(extractTaskRunJwt(headers)).toBeNull();
    });

    it("returns null for empty headers object", () => {
      expect(extractTaskRunJwt({})).toBeNull();
    });
  });

  describe("header name handling", () => {
    it("is case-sensitive (standard lowercase)", () => {
      // HTTP headers are case-insensitive by spec, but our function
      // expects the pre-normalized lowercase version
      const headers = { "x-task-run-jwt": "valid" };
      expect(extractTaskRunJwt(headers)).toBe("valid");
    });

    it("does not match Authorization header", () => {
      const headers = { Authorization: "Bearer token" };
      expect(extractTaskRunJwt(headers)).toBeNull();
    });

    it("does not match similar header names", () => {
      const headers = {
        "x-task-run-jwt-old": "token",
        "x-task-jwt": "token",
        "task-run-jwt": "token",
      };
      expect(extractTaskRunJwt(headers)).toBeNull();
    });
  });
});
