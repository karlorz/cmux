import { describe, expect, it } from "vitest";
import {
  OPENCODE_KNOWN_FREE,
  isOpencodeFreeModel,
  OPENCODE_FREE_MODEL_IDS,
} from "./free-models";

describe("OPENCODE_KNOWN_FREE", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(OPENCODE_KNOWN_FREE)).toBe(true);
    expect(OPENCODE_KNOWN_FREE.length).toBeGreaterThan(0);
  });

  it("contains big-pickle", () => {
    expect(OPENCODE_KNOWN_FREE).toContain("big-pickle");
  });

  it("contains gpt-5-nano", () => {
    expect(OPENCODE_KNOWN_FREE).toContain("gpt-5-nano");
  });
});

describe("isOpencodeFreeModel", () => {
  describe("returns true for free models", () => {
    it("matches models with -free suffix", () => {
      expect(isOpencodeFreeModel("glm-5-free")).toBe(true);
      expect(isOpencodeFreeModel("kimi-k2.5-free")).toBe(true);
      expect(isOpencodeFreeModel("some-model-free")).toBe(true);
    });

    it("matches known free models without suffix", () => {
      expect(isOpencodeFreeModel("big-pickle")).toBe(true);
      expect(isOpencodeFreeModel("gpt-5-nano")).toBe(true);
    });
  });

  describe("returns false for paid models", () => {
    it("rejects models without -free suffix", () => {
      expect(isOpencodeFreeModel("glm-5")).toBe(false);
      expect(isOpencodeFreeModel("gpt-5")).toBe(false);
    });

    it("rejects models with free elsewhere in name", () => {
      expect(isOpencodeFreeModel("free-model")).toBe(false);
      expect(isOpencodeFreeModel("model-freedom")).toBe(false);
    });

    it("rejects empty string", () => {
      expect(isOpencodeFreeModel("")).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles case sensitivity", () => {
      // -free suffix is lowercase
      expect(isOpencodeFreeModel("model-FREE")).toBe(false);
      expect(isOpencodeFreeModel("BIG-PICKLE")).toBe(false);
    });

    it("handles partial suffix match", () => {
      expect(isOpencodeFreeModel("model-fre")).toBe(false);
      expect(isOpencodeFreeModel("modelfree")).toBe(false);
    });
  });
});

describe("OPENCODE_FREE_MODEL_IDS", () => {
  it("is same as OPENCODE_KNOWN_FREE for backwards compatibility", () => {
    expect(OPENCODE_FREE_MODEL_IDS).toBe(OPENCODE_KNOWN_FREE);
  });
});
