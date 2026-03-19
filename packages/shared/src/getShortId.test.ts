import { describe, expect, it } from "vitest";
import { getShortId } from "./getShortId";

describe("getShortId", () => {
  it("truncates long IDs to 12 characters", () => {
    expect(getShortId("abc123def456xyz789")).toBe("abc123def456");
  });

  it("returns full ID if shorter than 12 characters", () => {
    expect(getShortId("short")).toBe("short");
  });

  it("returns exactly 12 characters for 12-char input", () => {
    expect(getShortId("123456789012")).toBe("123456789012");
  });

  it("handles empty string", () => {
    expect(getShortId("")).toBe("");
  });

  it("handles string exactly 12 characters", () => {
    const input = "a".repeat(12);
    expect(getShortId(input)).toBe(input);
    expect(getShortId(input).length).toBe(12);
  });

  it("truncates Convex-style IDs", () => {
    // Convex IDs are typically long random strings
    const convexId = "jh7f3g9z2m4xk5q8r1v0y6nb";
    expect(getShortId(convexId)).toBe("jh7f3g9z2m4x");
    expect(getShortId(convexId).length).toBe(12);
  });

  it("preserves special characters in short IDs", () => {
    expect(getShortId("run-123")).toBe("run-123");
    expect(getShortId("task_abc")).toBe("task_abc");
  });

  it("truncates UUIDs correctly", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(getShortId(uuid)).toBe("550e8400-e29");
    expect(getShortId(uuid).length).toBe(12);
  });
});
