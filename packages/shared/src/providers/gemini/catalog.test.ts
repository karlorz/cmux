import { describe, expect, it } from "vitest";
import { GEMINI_CATALOG } from "./catalog";

describe("GEMINI_CATALOG", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(GEMINI_CATALOG)).toBe(true);
    expect(GEMINI_CATALOG.length).toBeGreaterThan(0);
  });

  it("all entries have required fields", () => {
    for (const entry of GEMINI_CATALOG) {
      expect(entry.name).toBeTruthy();
      expect(entry.displayName).toBeTruthy();
      expect(entry.vendor).toBe("google");
      expect(Array.isArray(entry.requiredApiKeys)).toBe(true);
      expect(entry.tier).toBeTruthy();
    }
  });

  it("all entries require GEMINI_API_KEY", () => {
    for (const entry of GEMINI_CATALOG) {
      expect(entry.requiredApiKeys).toContain("GEMINI_API_KEY");
    }
  });

  it("has unique model names", () => {
    const names = GEMINI_CATALOG.map((e) => e.name);
    const uniqueNames = new Set(names);
    expect(names.length).toBe(uniqueNames.size);
  });

  it("all names follow gemini/ prefix pattern", () => {
    for (const entry of GEMINI_CATALOG) {
      expect(entry.name).toMatch(/^gemini\//);
    }
  });

  it("includes 3.1 Pro Preview as recommended", () => {
    const proPreviews = GEMINI_CATALOG.filter((e) =>
      e.name.includes("3.1-pro-preview")
    );
    expect(proPreviews.length).toBe(1);
    expect(proPreviews[0]?.tags).toContain("recommended");
  });

  it("all tiers are paid", () => {
    for (const entry of GEMINI_CATALOG) {
      expect(entry.tier).toBe("paid");
    }
  });

  it("has at least one entry with latest tag", () => {
    const latestEntries = GEMINI_CATALOG.filter((e) =>
      e.tags?.includes("latest")
    );
    expect(latestEntries.length).toBeGreaterThanOrEqual(1);
  });
});
