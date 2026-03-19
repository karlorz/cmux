import { describe, expect, it } from "vitest";
import { OPENCODE_CATALOG } from "./catalog";
import { OPENCODE_KNOWN_FREE } from "./free-models";

describe("OPENCODE_CATALOG", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(OPENCODE_CATALOG)).toBe(true);
    expect(OPENCODE_CATALOG.length).toBeGreaterThan(0);
  });

  it("has same length as OPENCODE_KNOWN_FREE", () => {
    expect(OPENCODE_CATALOG.length).toBe(OPENCODE_KNOWN_FREE.length);
  });

  it("all entries have required fields", () => {
    for (const entry of OPENCODE_CATALOG) {
      expect(entry.name).toBeTruthy();
      expect(entry.displayName).toBeTruthy();
      expect(entry.vendor).toBe("opencode");
      expect(Array.isArray(entry.requiredApiKeys)).toBe(true);
      expect(entry.tier).toBe("free");
    }
  });

  it("all entries require no API keys (free models)", () => {
    for (const entry of OPENCODE_CATALOG) {
      expect(entry.requiredApiKeys).toHaveLength(0);
    }
  });

  it("all names follow opencode/ prefix pattern", () => {
    for (const entry of OPENCODE_CATALOG) {
      expect(entry.name).toMatch(/^opencode\//);
    }
  });

  it("all entries have free tag", () => {
    for (const entry of OPENCODE_CATALOG) {
      expect(entry.tags).toContain("free");
    }
  });

  it("includes big-pickle", () => {
    const bigPickle = OPENCODE_CATALOG.find(
      (e) => e.name === "opencode/big-pickle"
    );
    expect(bigPickle).toBeDefined();
    expect(bigPickle?.tier).toBe("free");
  });

  it("includes gpt-5-nano", () => {
    const gpt5Nano = OPENCODE_CATALOG.find(
      (e) => e.name === "opencode/gpt-5-nano"
    );
    expect(gpt5Nano).toBeDefined();
    expect(gpt5Nano?.tier).toBe("free");
  });

  it("generates entries from OPENCODE_KNOWN_FREE", () => {
    for (const modelId of OPENCODE_KNOWN_FREE) {
      const entry = OPENCODE_CATALOG.find(
        (e) => e.name === `opencode/${modelId}`
      );
      expect(entry).toBeDefined();
    }
  });
});
