import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { checkGrokRequirements } from "./check-requirements";

describe("checkGrokRequirements", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns empty array when XAI_API_KEY is set", async () => {
    process.env.XAI_API_KEY = "test-xai-key";
    const result = await checkGrokRequirements();
    expect(result).toEqual([]);
  });

  it("returns error when XAI_API_KEY is not set", async () => {
    delete process.env.XAI_API_KEY;
    const result = await checkGrokRequirements();
    expect(result).toContain("XAI_API_KEY is not set");
  });

  it("returns error when XAI_API_KEY is empty string", async () => {
    process.env.XAI_API_KEY = "";
    const result = await checkGrokRequirements();
    expect(result).toContain("XAI_API_KEY is not set");
  });

  it("returns a Promise", () => {
    process.env.XAI_API_KEY = "test-key";
    const result = checkGrokRequirements();
    expect(result).toBeInstanceOf(Promise);
  });
});
