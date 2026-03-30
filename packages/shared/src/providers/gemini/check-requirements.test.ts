import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { checkGeminiRequirements } from "./check-requirements";

describe("checkGeminiRequirements", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("returns a Promise", () => {
    const result = checkGeminiRequirements();
    expect(result).toBeInstanceOf(Promise);
  });

  it("is an async function", async () => {
    // Verify the function can be awaited
    const result = await checkGeminiRequirements();
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns no auth error when GEMINI_API_KEY is set", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const result = await checkGeminiRequirements();
    // With API key env var set, authentication check passes
    // Settings.json may still fail depending on local setup
    const hasAuthError = result.some((msg) => msg.includes("authentication"));
    expect(hasAuthError).toBe(false);
  });

  it("returns array of missing requirements based on environment", async () => {
    // Clear GEMINI_API_KEY to ensure consistent baseline
    delete process.env.GEMINI_API_KEY;
    const result = await checkGeminiRequirements();
    // Result depends on local environment:
    // - If ~/.gemini/settings.json exists: may be empty or have auth errors
    // - If ~/.gemini/settings.json missing: will include "settings.json" error
    // We just verify it returns an array and doesn't throw
    expect(Array.isArray(result)).toBe(true);
    // All returned items should be strings
    for (const item of result) {
      expect(typeof item).toBe("string");
    }
  });

  it("passes API key via context", async () => {
    const result = await checkGeminiRequirements({
      apiKeys: { GEMINI_API_KEY: "context-provided-key" },
    });
    // When API key is provided via context, auth check should pass
    const hasAuthError = result.some((msg) => msg.includes("authentication"));
    expect(hasAuthError).toBe(false);
  });
});
