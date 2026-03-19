import { describe, expect, it } from "vitest";
import { CURSOR_CATALOG } from "./catalog";

describe("CURSOR_CATALOG", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(CURSOR_CATALOG)).toBe(true);
    expect(CURSOR_CATALOG.length).toBeGreaterThan(0);
  });

  it("all entries have required fields", () => {
    for (const entry of CURSOR_CATALOG) {
      expect(entry.name).toBeTruthy();
      expect(entry.displayName).toBeTruthy();
      expect(entry.vendor).toBe("cursor");
      expect(Array.isArray(entry.requiredApiKeys)).toBe(true);
      expect(entry.tier).toBeTruthy();
    }
  });

  it("all entries require CURSOR_API_KEY", () => {
    for (const entry of CURSOR_CATALOG) {
      expect(entry.requiredApiKeys).toContain("CURSOR_API_KEY");
    }
  });

  it("has unique model names", () => {
    const names = CURSOR_CATALOG.map((e) => e.name);
    const uniqueNames = new Set(names);
    expect(names.length).toBe(uniqueNames.size);
  });

  it("all names follow cursor/ prefix pattern", () => {
    for (const entry of CURSOR_CATALOG) {
      expect(entry.name).toMatch(/^cursor\//);
    }
  });

  it("includes sonnet-4-thinking with reasoning tag", () => {
    const thinking = CURSOR_CATALOG.find(
      (e) => e.name === "cursor/sonnet-4-thinking"
    );
    expect(thinking).toBeDefined();
    expect(thinking?.tags).toContain("reasoning");
  });

  it("all tiers are paid", () => {
    for (const entry of CURSOR_CATALOG) {
      expect(entry.tier).toBe("paid");
    }
  });
});
