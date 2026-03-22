import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { checkGeminiRequirements } from "./check-requirements";

describe("checkGeminiRequirements", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
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

  it("returns error about settings when .gemini/settings.json is missing", async () => {
    const result = await checkGeminiRequirements();
    // In test environment without settings.json, should report it missing
    expect(result.some((msg) => msg.includes("settings.json"))).toBe(true);
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
