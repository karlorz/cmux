import { describe, expect, it } from "vitest";
import { AMP_CATALOG } from "./catalog";

describe("AMP_CATALOG", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(AMP_CATALOG)).toBe(true);
    expect(AMP_CATALOG.length).toBeGreaterThan(0);
  });

  it("all entries have required fields", () => {
    for (const entry of AMP_CATALOG) {
      expect(entry.name).toBeTruthy();
      expect(entry.displayName).toBeTruthy();
      expect(entry.vendor).toBe("amp");
      expect(Array.isArray(entry.requiredApiKeys)).toBe(true);
      expect(entry.tier).toBeTruthy();
    }
  });

  it("all entries require AMP_API_KEY", () => {
    for (const entry of AMP_CATALOG) {
      expect(entry.requiredApiKeys).toContain("AMP_API_KEY");
    }
  });

  it("has unique model names", () => {
    const names = AMP_CATALOG.map((e) => e.name);
    const uniqueNames = new Set(names);
    expect(names.length).toBe(uniqueNames.size);
  });

  it("includes base amp entry", () => {
    const base = AMP_CATALOG.find((e) => e.name === "amp");
    expect(base).toBeDefined();
    expect(base?.displayName).toBe("AMP");
  });

  it("includes amp/gpt-5 variant", () => {
    const gpt5 = AMP_CATALOG.find((e) => e.name === "amp/gpt-5");
    expect(gpt5).toBeDefined();
  });

  it("all tiers are paid", () => {
    for (const entry of AMP_CATALOG) {
      expect(entry.tier).toBe("paid");
    }
  });
});
