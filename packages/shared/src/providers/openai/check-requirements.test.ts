import { describe, expect, it } from "vitest";
import { checkOpenAIRequirements } from "./check-requirements";

describe("checkOpenAIRequirements", () => {
  describe("settings-based credentials", () => {
    it("accepts CODEX_AUTH_JSON from context", async () => {
      const result = await checkOpenAIRequirements({
        apiKeys: {
          CODEX_AUTH_JSON: '{"tokens":{"access_token":"token"}}',
        },
      });

      expect(result).toEqual([]);
    });

    it("accepts OPENAI_API_KEY from context", async () => {
      const result = await checkOpenAIRequirements({
        apiKeys: {
          OPENAI_API_KEY: "sk-test",
        },
      });

      expect(result).toEqual([]);
    });

    it("reports missing context credentials when provided keys are blank", async () => {
      const result = await checkOpenAIRequirements({
        apiKeys: {
          CODEX_AUTH_JSON: "   ",
          OPENAI_API_KEY: "",
        },
      });

      expect(result).toEqual(["Codex Auth JSON or OpenAI API Key"]);
    });
  });

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
      for (const item of result) {
        expect(typeof item).toBe("string");
      }
    });

    it("falls back to local file checks when context omits apiKeys", async () => {
      const result = await checkOpenAIRequirements({
        teamSlugOrId: "team-123",
      });

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("error message format", () => {
    it("includes file path in error messages", async () => {
      const result = await checkOpenAIRequirements();
      for (const item of result) {
        expect(item).toMatch(/\.(json|toml)/);
      }
    });
  });
});
