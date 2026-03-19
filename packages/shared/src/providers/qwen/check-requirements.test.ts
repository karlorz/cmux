import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  checkQwenOpenRouterRequirements,
  checkQwenModelStudioRequirements,
} from "./check-requirements";

describe("checkQwenOpenRouterRequirements", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns empty array when OPENROUTER_API_KEY is set", async () => {
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    const result = await checkQwenOpenRouterRequirements();
    expect(result).toEqual([]);
  });

  it("returns error when OPENROUTER_API_KEY is not set", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const result = await checkQwenOpenRouterRequirements();
    expect(result).toContain("OPENROUTER_API_KEY is not set");
  });

  it("returns a Promise", () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const result = checkQwenOpenRouterRequirements();
    expect(result).toBeInstanceOf(Promise);
  });
});

describe("checkQwenModelStudioRequirements", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns empty array when MODEL_STUDIO_API_KEY is set", async () => {
    process.env.MODEL_STUDIO_API_KEY = "test-model-studio-key";
    const result = await checkQwenModelStudioRequirements();
    expect(result).toEqual([]);
  });

  it("returns error when MODEL_STUDIO_API_KEY is not set", async () => {
    delete process.env.MODEL_STUDIO_API_KEY;
    const result = await checkQwenModelStudioRequirements();
    expect(result).toContain("MODEL_STUDIO_API_KEY is not set");
  });

  it("returns a Promise", () => {
    process.env.MODEL_STUDIO_API_KEY = "test-key";
    const result = checkQwenModelStudioRequirements();
    expect(result).toBeInstanceOf(Promise);
  });
});
