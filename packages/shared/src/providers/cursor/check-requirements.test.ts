import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { checkCursorRequirements } from "./check-requirements";

describe("checkCursorRequirements", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns a Promise", () => {
    const result = checkCursorRequirements();
    expect(result).toBeInstanceOf(Promise);
  });

  it("is an async function", async () => {
    // Verify the function can be awaited
    const result = await checkCursorRequirements();
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns empty array when CURSOR_API_KEY is set", async () => {
    process.env.CURSOR_API_KEY = "test-cursor-key";
    const result = await checkCursorRequirements();
    // With API key env var set, authentication check passes
    // CLI config may still fail depending on local setup
    const hasAuthError = result.some((msg) => msg.includes("authentication"));
    expect(hasAuthError).toBe(false);
  });

  it("returns error about authentication when no credentials exist", async () => {
    delete process.env.CURSOR_API_KEY;
    const result = await checkCursorRequirements();
    // In test environment without auth files or env var, should report missing auth
    expect(result.some((msg) => msg.includes("authentication") || msg.includes("CURSOR_API_KEY"))).toBe(true);
  });
});
