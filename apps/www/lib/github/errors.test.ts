import { describe, expect, it } from "vitest";
import { GithubApiError, isGithubApiError } from "./errors";

describe("github/errors", () => {
  describe("GithubApiError", () => {
    it("creates error with status", () => {
      const error = new GithubApiError("Not found", { status: 404 });
      expect(error.message).toBe("Not found");
      expect(error.status).toBe(404);
      expect(error.name).toBe("GithubApiError");
    });

    it("creates error with status and documentation URL", () => {
      const error = new GithubApiError("Rate limited", {
        status: 403,
        documentationUrl: "https://docs.github.com/rest/rate-limit",
      });
      expect(error.message).toBe("Rate limited");
      expect(error.status).toBe(403);
      expect(error.documentationUrl).toBe("https://docs.github.com/rest/rate-limit");
    });

    it("creates error without documentation URL", () => {
      const error = new GithubApiError("Server error", { status: 500 });
      expect(error.documentationUrl).toBeUndefined();
    });

    it("is an instance of Error", () => {
      const error = new GithubApiError("Test", { status: 400 });
      expect(error).toBeInstanceOf(Error);
    });

    it("has correct name property", () => {
      const error = new GithubApiError("Test", { status: 400 });
      expect(error.name).toBe("GithubApiError");
    });

    it("supports different HTTP status codes", () => {
      const codes = [400, 401, 403, 404, 422, 500, 502, 503];
      for (const status of codes) {
        const error = new GithubApiError(`Status ${status}`, { status });
        expect(error.status).toBe(status);
      }
    });
  });

  describe("isGithubApiError", () => {
    it("returns true for GithubApiError instance", () => {
      const error = new GithubApiError("Test", { status: 404 });
      expect(isGithubApiError(error)).toBe(true);
    });

    it("returns false for regular Error", () => {
      const error = new Error("Regular error");
      expect(isGithubApiError(error)).toBe(false);
    });

    it("returns false for null", () => {
      expect(isGithubApiError(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isGithubApiError(undefined)).toBe(false);
    });

    it("returns false for string", () => {
      expect(isGithubApiError("error")).toBe(false);
    });

    it("returns false for number", () => {
      expect(isGithubApiError(404)).toBe(false);
    });

    it("returns false for plain object", () => {
      expect(isGithubApiError({ message: "error", status: 404 })).toBe(false);
    });

    it("returns false for object with GithubApiError-like properties", () => {
      const fakeError = {
        name: "GithubApiError",
        message: "Test",
        status: 404,
      };
      expect(isGithubApiError(fakeError)).toBe(false);
    });

    it("returns false for TypeError", () => {
      expect(isGithubApiError(new TypeError("type error"))).toBe(false);
    });

    it("returns false for SyntaxError", () => {
      expect(isGithubApiError(new SyntaxError("syntax error"))).toBe(false);
    });
  });
});
