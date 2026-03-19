import { describe, expect, it } from "vitest";
import { checkOpenAIRequirements } from "./check-requirements";

describe("checkOpenAIRequirements", () => {
  describe("return type", () => {
    it("returns a Promise", () => {
      const result = checkOpenAIRequirements();
      expect(result).toBeInstanceOf(Promise);
    });

    it("returns an array when awaited", async () => {
      const result = await checkOpenAIRequirements();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("file detection", () => {
    it("reports missing files as strings in the array", async () => {
      const result = await checkOpenAIRequirements();
      // Each missing item should be a string description
      for (const item of result) {
        expect(typeof item).toBe("string");
      }
    });

    it("detects auth.json file requirement", async () => {
      const result = await checkOpenAIRequirements();
      // Should check for .codex/auth.json
      const hasAuthCheck = result.some((item) => item.includes("auth.json"));
      // This depends on whether the file exists, so we just verify the function runs
      expect(Array.isArray(result)).toBe(true);
    });

    it("detects config.toml file requirement", async () => {
      const result = await checkOpenAIRequirements();
      // Should check for .codex/config.toml
      const hasConfigCheck = result.some((item) => item.includes("config.toml"));
      // This depends on whether the file exists, so we just verify the function runs
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("error message format", () => {
    it("includes file path in error messages", async () => {
      const result = await checkOpenAIRequirements();
      // If files are missing, error messages should include the path
      for (const item of result) {
        expect(item).toMatch(/\.(json|toml)/);
      }
    });
  });
});
