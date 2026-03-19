import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { checkAmpRequirements } from "./check-requirements";

describe("checkAmpRequirements", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns a Promise", () => {
    const result = checkAmpRequirements();
    expect(result).toBeInstanceOf(Promise);
  });

  it("is an async function", async () => {
    // Verify the function can be awaited
    const result = await checkAmpRequirements();
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns empty array when AMP_API_KEY is set", async () => {
    process.env.AMP_API_KEY = "test-amp-key";
    const result = await checkAmpRequirements();
    // With env var set, should pass even without secrets.json
    expect(result).toEqual([]);
  });

  it("returns error about API key when neither secrets.json nor env var exists", async () => {
    delete process.env.AMP_API_KEY;
    const result = await checkAmpRequirements();
    // In test environment without secrets.json, should report missing key
    expect(result.some((msg) => msg.includes("AMP API key"))).toBe(true);
  });
});
