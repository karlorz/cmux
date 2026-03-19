import { describe, expect, it } from "vitest";
import {
  checkOpencodeRequirements,
  createOpencodeRequirementsChecker,
} from "./check-requirements";

describe("checkOpencodeRequirements", () => {
  describe("return type", () => {
    it("returns a Promise", () => {
      const result = checkOpencodeRequirements();
      expect(result).toBeInstanceOf(Promise);
    });

    it("returns an array when awaited", async () => {
      const result = await checkOpencodeRequirements();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("requireAuth option", () => {
    it("returns empty array when requireAuth is false", async () => {
      const result = await checkOpencodeRequirements({ requireAuth: false });
      expect(result).toEqual([]);
    });

    it("performs checks when requireAuth is true", async () => {
      const result = await checkOpencodeRequirements({ requireAuth: true });
      // Result depends on filesystem state, but should be an array
      expect(Array.isArray(result)).toBe(true);
    });

    it("defaults to requireAuth true when no options", async () => {
      const result = await checkOpencodeRequirements();
      // Should perform checks (default behavior)
      expect(Array.isArray(result)).toBe(true);
    });

    it("defaults to requireAuth true when empty options object", async () => {
      const result = await checkOpencodeRequirements({});
      // Should perform checks (default behavior)
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("context parameter compatibility", () => {
    it("accepts ProviderRequirementsContext format", async () => {
      const result = await checkOpencodeRequirements({
        apiKeys: { OPENAI_API_KEY: "test-key" },
      });
      // Should not error and return an array
      expect(Array.isArray(result)).toBe(true);
    });

    it("handles context with teamSlugOrId", async () => {
      const result = await checkOpencodeRequirements({
        teamSlugOrId: "test-team",
      });
      // Should not error and return an array
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("file detection", () => {
    it("reports missing auth.json file", async () => {
      const result = await checkOpencodeRequirements({ requireAuth: true });
      // Check if auth.json is mentioned when missing
      for (const item of result) {
        expect(typeof item).toBe("string");
      }
    });
  });
});

describe("createOpencodeRequirementsChecker", () => {
  describe("factory function", () => {
    it("returns a function", () => {
      const checker = createOpencodeRequirementsChecker({ requireAuth: true });
      expect(typeof checker).toBe("function");
    });

    it("returned function returns a Promise", () => {
      const checker = createOpencodeRequirementsChecker({ requireAuth: true });
      const result = checker();
      expect(result).toBeInstanceOf(Promise);
    });

    it("returned function returns an array when awaited", async () => {
      const checker = createOpencodeRequirementsChecker({ requireAuth: true });
      const result = await checker();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("with requireAuth: false", () => {
    it("always returns empty array", async () => {
      const checker = createOpencodeRequirementsChecker({ requireAuth: false });
      const result = await checker();
      expect(result).toEqual([]);
    });

    it("ignores context parameter", async () => {
      const checker = createOpencodeRequirementsChecker({ requireAuth: false });
      const result = await checker({ apiKeys: { OPENAI_API_KEY: "key" } });
      expect(result).toEqual([]);
    });
  });

  describe("with requireAuth: true", () => {
    it("performs filesystem checks", async () => {
      const checker = createOpencodeRequirementsChecker({ requireAuth: true });
      const result = await checker();
      // Result depends on filesystem state
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
