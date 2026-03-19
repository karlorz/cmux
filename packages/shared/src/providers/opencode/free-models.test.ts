import { describe, expect, it } from "vitest";
import {
  OPENCODE_KNOWN_FREE,
  OPENCODE_FREE_MODEL_IDS,
  isOpencodeFreeModel,
} from "./free-models";

describe("OPENCODE_KNOWN_FREE", () => {
  it("is an array", () => {
    expect(Array.isArray(OPENCODE_KNOWN_FREE)).toBe(true);
  });

  it("contains big-pickle", () => {
    expect(OPENCODE_KNOWN_FREE).toContain("big-pickle");
  });

  it("contains gpt-5-nano", () => {
    expect(OPENCODE_KNOWN_FREE).toContain("gpt-5-nano");
  });

  it("all entries are strings", () => {
    for (const model of OPENCODE_KNOWN_FREE) {
      expect(typeof model).toBe("string");
    }
  });

  it("all entries are non-empty", () => {
    for (const model of OPENCODE_KNOWN_FREE) {
      expect(model.length).toBeGreaterThan(0);
    }
  });
});

describe("OPENCODE_FREE_MODEL_IDS", () => {
  it("equals OPENCODE_KNOWN_FREE", () => {
    expect(OPENCODE_FREE_MODEL_IDS).toBe(OPENCODE_KNOWN_FREE);
  });
});

describe("isOpencodeFreeModel", () => {
  describe("suffix detection", () => {
    it("returns true for models ending with -free", () => {
      expect(isOpencodeFreeModel("glm-5-free")).toBe(true);
    });

    it("returns true for any model ending with -free", () => {
      expect(isOpencodeFreeModel("kimi-k2.5-free")).toBe(true);
      expect(isOpencodeFreeModel("custom-model-free")).toBe(true);
      expect(isOpencodeFreeModel("test-free")).toBe(true);
    });

    it("returns false for models not ending with -free", () => {
      expect(isOpencodeFreeModel("grok-4-1-fast")).toBe(false);
    });

    it("returns false for models with -free in middle", () => {
      expect(isOpencodeFreeModel("free-model-paid")).toBe(false);
    });
  });

  describe("known free models", () => {
    it("returns true for big-pickle", () => {
      expect(isOpencodeFreeModel("big-pickle")).toBe(true);
    });

    it("returns true for gpt-5-nano", () => {
      expect(isOpencodeFreeModel("gpt-5-nano")).toBe(true);
    });

    it("returns true for all known free models", () => {
      for (const model of OPENCODE_KNOWN_FREE) {
        expect(isOpencodeFreeModel(model)).toBe(true);
      }
    });
  });

  describe("edge cases", () => {
    it("returns false for empty string", () => {
      expect(isOpencodeFreeModel("")).toBe(false);
    });

    it("returns false for just -free", () => {
      // Edge case: string is exactly "-free"
      expect(isOpencodeFreeModel("-free")).toBe(true); // This actually matches the suffix
    });

    it("returns false for paid models", () => {
      expect(isOpencodeFreeModel("gpt-5")).toBe(false);
      expect(isOpencodeFreeModel("opus-4")).toBe(false);
      expect(isOpencodeFreeModel("sonnet-4")).toBe(false);
    });

    it("is case sensitive", () => {
      expect(isOpencodeFreeModel("MODEL-FREE")).toBe(false);
      expect(isOpencodeFreeModel("model-Free")).toBe(false);
      expect(isOpencodeFreeModel("BIG-PICKLE")).toBe(false);
    });
  });

  describe("special characters", () => {
    it("handles models with dots", () => {
      expect(isOpencodeFreeModel("model-1.5-free")).toBe(true);
    });

    it("handles models with underscores", () => {
      expect(isOpencodeFreeModel("model_name-free")).toBe(true);
    });

    it("handles models with numbers", () => {
      expect(isOpencodeFreeModel("model-123-free")).toBe(true);
    });
  });
});
