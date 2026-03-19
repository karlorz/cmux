import { describe, expect, it } from "vitest";
import { CODEX_CATALOG } from "./catalog";

describe("CODEX_CATALOG", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(CODEX_CATALOG)).toBe(true);
    expect(CODEX_CATALOG.length).toBeGreaterThan(0);
  });

  it("all entries have required fields", () => {
    for (const entry of CODEX_CATALOG) {
      expect(entry.name).toBeTruthy();
      expect(entry.displayName).toBeTruthy();
      expect(entry.vendor).toBe("openai");
      expect(Array.isArray(entry.requiredApiKeys)).toBe(true);
      expect(entry.tier).toBeTruthy();
    }
  });

  it("all entries require OPENAI_API_KEY and CODEX_AUTH_JSON", () => {
    for (const entry of CODEX_CATALOG) {
      expect(entry.requiredApiKeys).toContain("OPENAI_API_KEY");
      expect(entry.requiredApiKeys).toContain("CODEX_AUTH_JSON");
    }
  });

  it("has unique model names", () => {
    const names = CODEX_CATALOG.map((e) => e.name);
    const uniqueNames = new Set(names);
    expect(names.length).toBe(uniqueNames.size);
  });

  it("all names follow codex/ prefix pattern", () => {
    for (const entry of CODEX_CATALOG) {
      expect(entry.name).toMatch(/^codex\//);
    }
  });

  it("includes GPT-5.4 xhigh as latest", () => {
    const gpt54xhigh = CODEX_CATALOG.find(
      (e) => e.name === "codex/gpt-5.4-xhigh"
    );
    expect(gpt54xhigh).toBeDefined();
    expect(gpt54xhigh?.tags).toContain("latest");
  });

  it("includes GPT-5.1 codex mini", () => {
    const mini = CODEX_CATALOG.find((e) => e.name === "codex/gpt-5.1-codex-mini");
    expect(mini).toBeDefined();
    expect(mini?.displayName).toBe("GPT-5.1 Codex Mini");
  });

  it("all tiers are paid", () => {
    for (const entry of CODEX_CATALOG) {
      expect(entry.tier).toBe("paid");
    }
  });

  it("models with reasoning tag have xhigh, high, medium, or low suffix", () => {
    for (const entry of CODEX_CATALOG) {
      if (entry.tags?.includes("reasoning")) {
        const hasReasoningSuffix =
          entry.name.endsWith("-xhigh") ||
          entry.name.endsWith("-high") ||
          entry.name.endsWith("-medium") ||
          entry.name.endsWith("-low");
        expect(hasReasoningSuffix).toBe(true);
      }
    }
  });
});
