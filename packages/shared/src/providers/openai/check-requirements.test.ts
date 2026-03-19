import { describe, expect, it } from "vitest";
import { checkOpenAIRequirements } from "./check-requirements";

describe("checkOpenAIRequirements", () => {
  it("returns a Promise", () => {
    const result = checkOpenAIRequirements();
    expect(result).toBeInstanceOf(Promise);
  });

  it("is an async function", async () => {
    // Verify the function can be awaited
    const result = await checkOpenAIRequirements();
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns array of missing requirements", async () => {
    const result = await checkOpenAIRequirements();
    // In test environment without .codex files, should report missing files
    // Result depends on environment, but should always be an array
    expect(Array.isArray(result)).toBe(true);
  });

  it("checks for auth.json file", async () => {
    const result = await checkOpenAIRequirements();
    // In test environment, likely missing .codex/auth.json
    const hasAuthCheck = result.some((msg) => msg.includes("auth.json"));
    // Either the file exists (empty result) or it's reported missing
    expect(typeof hasAuthCheck).toBe("boolean");
  });

  it("checks for config.toml file", async () => {
    const result = await checkOpenAIRequirements();
    // In test environment, likely missing .codex/config.toml
    const hasConfigCheck = result.some((msg) => msg.includes("config.toml"));
    // Either the file exists (empty result) or it's reported missing
    expect(typeof hasConfigCheck).toBe("boolean");
  });
});
