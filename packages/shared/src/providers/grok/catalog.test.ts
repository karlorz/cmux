import { describe, expect, it } from "vitest";
import { GROK_CATALOG } from "./catalog";

describe("GROK_CATALOG", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(GROK_CATALOG)).toBe(true);
    expect(GROK_CATALOG.length).toBeGreaterThan(0);
  });

  it("all entries have required fields", () => {
    for (const entry of GROK_CATALOG) {
      expect(entry.name).toBeTruthy();
      expect(entry.displayName).toBeTruthy();
      expect(entry.vendor).toBe("xai");
      expect(Array.isArray(entry.requiredApiKeys)).toBe(true);
      expect(entry.tier).toBeTruthy();
    }
  });

  it("all entries require XAI_API_KEY", () => {
    for (const entry of GROK_CATALOG) {
      expect(entry.requiredApiKeys).toContain("XAI_API_KEY");
    }
  });

  it("has unique model names", () => {
    const names = GROK_CATALOG.map((e) => e.name);
    const uniqueNames = new Set(names);
    expect(names.length).toBe(uniqueNames.size);
  });

  it("all names follow grok/ prefix pattern", () => {
    for (const entry of GROK_CATALOG) {
      expect(entry.name).toMatch(/^grok\//);
    }
  });

  it("includes grok-code-fast-1 as default", () => {
    const fast = GROK_CATALOG.find((e) => e.name === "grok/grok-code-fast-1");
    expect(fast).toBeDefined();
    expect(fast?.tags).toContain("default");
  });

  it("includes grok-4-latest with latest tag", () => {
    const latest = GROK_CATALOG.find((e) => e.name === "grok/grok-4-latest");
    expect(latest).toBeDefined();
    expect(latest?.tags).toContain("latest");
  });

  it("all tiers are paid", () => {
    for (const entry of GROK_CATALOG) {
      expect(entry.tier).toBe("paid");
    }
  });
});
