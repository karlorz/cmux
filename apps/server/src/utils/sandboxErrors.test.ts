import { describe, expect, it } from "vitest";
import { extractSandboxStartError } from "./sandboxErrors";

describe("extractSandboxStartError", () => {
  describe("specific HTTP status codes", () => {
    it("handles 401 unauthorized", () => {
      const result = extractSandboxStartError({
        response: { status: 401, statusText: "Unauthorized" } as Response,
      });
      expect(result).toBe("Failed to start sandbox: authentication failed");
    });

    it("handles 403 forbidden", () => {
      const result = extractSandboxStartError({
        response: { status: 403, statusText: "Forbidden" } as Response,
      });
      expect(result).toBe("Failed to start sandbox: access denied");
    });

    it("handles 429 rate limit", () => {
      const result = extractSandboxStartError({
        response: { status: 429, statusText: "Too Many Requests" } as Response,
      });
      expect(result).toBe("Failed to start sandbox: rate limited");
    });

    it("handles 502 bad gateway", () => {
      const result = extractSandboxStartError({
        response: { status: 502, statusText: "Bad Gateway" } as Response,
      });
      expect(result).toBe(
        "Failed to start sandbox: sandbox provider unavailable (502)"
      );
    });

    it("handles 503 service unavailable", () => {
      const result = extractSandboxStartError({
        response: { status: 503, statusText: "Service Unavailable" } as Response,
      });
      expect(result).toBe(
        "Failed to start sandbox: sandbox provider unavailable (503)"
      );
    });

    it("handles 504 gateway timeout", () => {
      const result = extractSandboxStartError({
        response: { status: 504, statusText: "Gateway Timeout" } as Response,
      });
      expect(result).toBe(
        "Failed to start sandbox: sandbox provider unavailable (504)"
      );
    });
  });

  describe("error field extraction", () => {
    it("extracts short string error", () => {
      const result = extractSandboxStartError({
        error: "Sandbox quota exceeded",
      });
      expect(result).toBe("Failed to start sandbox: Sandbox quota exceeded");
    });

    it("ignores empty string error", () => {
      const result = extractSandboxStartError({
        error: "",
        response: { status: 500, statusText: "Internal Server Error" } as Response,
      });
      expect(result).toBe(
        "Failed to start sandbox: 500 Internal Server Error"
      );
    });

    it("ignores overly long error strings (security)", () => {
      const longError = "A".repeat(250);
      const result = extractSandboxStartError({
        error: longError,
        response: { status: 500, statusText: "Error" } as Response,
      });
      expect(result).toBe("Failed to start sandbox: 500 Error");
    });

    it("ignores non-string error", () => {
      const result = extractSandboxStartError({
        error: { message: "something" },
        response: { status: 400, statusText: "Bad Request" } as Response,
      });
      expect(result).toBe("Failed to start sandbox: 400 Bad Request");
    });
  });

  describe("generic HTTP errors", () => {
    it("handles 400 with status text", () => {
      const result = extractSandboxStartError({
        response: { status: 400, statusText: "Bad Request" } as Response,
      });
      expect(result).toBe("Failed to start sandbox: 400 Bad Request");
    });

    it("handles 500 with status text", () => {
      const result = extractSandboxStartError({
        response: { status: 500, statusText: "Internal Server Error" } as Response,
      });
      expect(result).toBe(
        "Failed to start sandbox: 500 Internal Server Error"
      );
    });

    it("handles error status without status text", () => {
      const result = extractSandboxStartError({
        response: { status: 500, statusText: "" } as Response,
      });
      expect(result).toBe("Failed to start sandbox: HTTP 500");
    });
  });

  describe("fallback behavior", () => {
    it("returns base message when no details available", () => {
      const result = extractSandboxStartError({});
      expect(result).toBe("Failed to start sandbox");
    });

    it("returns base message for success status codes", () => {
      const result = extractSandboxStartError({
        response: { status: 200, statusText: "OK" } as Response,
      });
      expect(result).toBe("Failed to start sandbox");
    });

    it("returns base message for undefined response", () => {
      const result = extractSandboxStartError({
        response: undefined,
      });
      expect(result).toBe("Failed to start sandbox");
    });
  });

  describe("priority order", () => {
    it("prioritizes specific status codes over error field", () => {
      const result = extractSandboxStartError({
        error: "Some error message",
        response: { status: 401, statusText: "Unauthorized" } as Response,
      });
      expect(result).toBe("Failed to start sandbox: authentication failed");
    });

    it("uses error field when status is not special case", () => {
      const result = extractSandboxStartError({
        error: "Custom error",
        response: { status: 500, statusText: "Error" } as Response,
      });
      expect(result).toBe("Failed to start sandbox: Custom error");
    });
  });
});
