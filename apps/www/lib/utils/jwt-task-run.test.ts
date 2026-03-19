import { describe, expect, it } from "vitest";
import { extractTaskRunJwtFromRequest } from "./jwt-task-run";

describe("extractTaskRunJwtFromRequest", () => {
  it("extracts token from x-cmux-token header", () => {
    const request = new Request("https://example.com", {
      headers: { "x-cmux-token": "test-jwt-token" },
    });

    const result = extractTaskRunJwtFromRequest(request);
    expect(result).toBe("test-jwt-token");
  });

  it("extracts token from x-task-run-jwt header", () => {
    const request = new Request("https://example.com", {
      headers: { "x-task-run-jwt": "task-run-token" },
    });

    const result = extractTaskRunJwtFromRequest(request);
    expect(result).toBe("task-run-token");
  });

  it("prefers x-cmux-token over x-task-run-jwt", () => {
    const request = new Request("https://example.com", {
      headers: {
        "x-cmux-token": "cmux-token",
        "x-task-run-jwt": "task-run-token",
      },
    });

    const result = extractTaskRunJwtFromRequest(request);
    expect(result).toBe("cmux-token");
  });

  it("returns null when no token headers present", () => {
    const request = new Request("https://example.com", {
      headers: { "content-type": "application/json" },
    });

    const result = extractTaskRunJwtFromRequest(request);
    expect(result).toBeNull();
  });

  it("returns null for empty x-cmux-token header", () => {
    const request = new Request("https://example.com", {
      headers: { "x-cmux-token": "" },
    });

    const result = extractTaskRunJwtFromRequest(request);
    expect(result).toBeNull();
  });

  it("returns null for empty x-task-run-jwt header", () => {
    const request = new Request("https://example.com", {
      headers: { "x-task-run-jwt": "" },
    });

    const result = extractTaskRunJwtFromRequest(request);
    expect(result).toBeNull();
  });

  it("falls back to x-task-run-jwt when x-cmux-token is empty", () => {
    const request = new Request("https://example.com", {
      headers: {
        "x-cmux-token": "",
        "x-task-run-jwt": "fallback-token",
      },
    });

    const result = extractTaskRunJwtFromRequest(request);
    expect(result).toBe("fallback-token");
  });

  it("handles case-insensitive headers", () => {
    // Headers are case-insensitive per HTTP spec
    const request = new Request("https://example.com", {
      headers: { "X-Cmux-Token": "case-insensitive-token" },
    });

    const result = extractTaskRunJwtFromRequest(request);
    expect(result).toBe("case-insensitive-token");
  });

  it("returns null when both headers are empty", () => {
    const request = new Request("https://example.com", {
      headers: {
        "x-cmux-token": "",
        "x-task-run-jwt": "",
      },
    });

    const result = extractTaskRunJwtFromRequest(request);
    expect(result).toBeNull();
  });
});
