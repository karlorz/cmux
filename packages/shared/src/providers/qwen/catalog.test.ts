import { describe, expect, it } from "vitest";
import { QWEN_CATALOG } from "./catalog";

describe("QWEN_CATALOG", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(QWEN_CATALOG)).toBe(true);
    expect(QWEN_CATALOG.length).toBeGreaterThan(0);
  });

  it("all entries have required fields", () => {
    for (const entry of QWEN_CATALOG) {
      expect(entry.name).toBeTruthy();
      expect(entry.displayName).toBeTruthy();
      expect(entry.vendor).toBe("qwen");
      expect(Array.isArray(entry.requiredApiKeys)).toBe(true);
      expect(entry.tier).toBeTruthy();
    }
  });

  it("has unique model names", () => {
    const names = QWEN_CATALOG.map((e) => e.name);
    const uniqueNames = new Set(names);
    expect(names.length).toBe(uniqueNames.size);
  });

  it("all names follow qwen/ prefix pattern", () => {
    for (const entry of QWEN_CATALOG) {
      expect(entry.name).toMatch(/^qwen\//);
    }
  });

  it("includes free tier model", () => {
    const freeModels = QWEN_CATALOG.filter((e) => e.tier === "free");
    expect(freeModels.length).toBeGreaterThan(0);
  });

  it("free model uses OPENROUTER_API_KEY", () => {
    const freeModel = QWEN_CATALOG.find((e) => e.tier === "free");
    expect(freeModel?.requiredApiKeys).toContain("OPENROUTER_API_KEY");
  });

  it("paid model uses MODEL_STUDIO_API_KEY", () => {
    const paidModel = QWEN_CATALOG.find((e) => e.tier === "paid");
    expect(paidModel?.requiredApiKeys).toContain("MODEL_STUDIO_API_KEY");
  });

  it("free model has free tag", () => {
    const freeModel = QWEN_CATALOG.find((e) => e.tier === "free");
    expect(freeModel?.tags).toContain("free");
  });
});
