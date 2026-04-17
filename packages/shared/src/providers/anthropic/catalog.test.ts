import { describe, expect, it } from "vitest";
import { CLAUDE_CATALOG } from "./catalog";

describe("CLAUDE_CATALOG", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(CLAUDE_CATALOG)).toBe(true);
    expect(CLAUDE_CATALOG.length).toBeGreaterThan(0);
  });

  it("all entries have required fields", () => {
    for (const entry of CLAUDE_CATALOG) {
      expect(entry.name).toBeTruthy();
      expect(entry.displayName).toBeTruthy();
      expect(entry.vendor).toBe("anthropic");
      expect(Array.isArray(entry.requiredApiKeys)).toBe(true);
      expect(entry.tier).toBeTruthy();
    }
  });

  it("all entries require CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY", () => {
    for (const entry of CLAUDE_CATALOG) {
      const hasClaudeToken = entry.requiredApiKeys.includes(
        "CLAUDE_CODE_OAUTH_TOKEN",
      );
      const hasAnthropicKey =
        entry.requiredApiKeys.includes("ANTHROPIC_API_KEY");
      expect(hasClaudeToken || hasAnthropicKey).toBe(true);
    }
  });

  it("has unique model names", () => {
    const names = CLAUDE_CATALOG.map((e) => e.name);
    const uniqueNames = new Set(names);
    expect(names.length).toBe(uniqueNames.size);
  });

  it("all names follow claude/ prefix pattern", () => {
    for (const entry of CLAUDE_CATALOG) {
      expect(entry.name).toMatch(/^claude\//);
    }
  });

  it("includes Opus 4.6 as latest and recommended", () => {
    const opus46 = CLAUDE_CATALOG.find((e) => e.name === "claude/opus-4.6");
    expect(opus46).toBeDefined();
    expect(opus46?.tags).toContain("latest");
    expect(opus46?.tags).toContain("recommended");
  });

  it("includes Haiku 4.5 with fast tag", () => {
    const haiku = CLAUDE_CATALOG.find((e) => e.name === "claude/haiku-4.5");
    expect(haiku).toBeDefined();
    expect(haiku?.tags).toContain("fast");
  });

  it("includes GPT-5.1 Codex Mini as a proxy-backed Claude model", () => {
    const model = CLAUDE_CATALOG.find(
      (e) => e.name === "claude/gpt-5.1-codex-mini",
    );
    expect(model).toBeDefined();
    expect(model?.requiredApiKeys).toEqual(["ANTHROPIC_API_KEY"]);
    expect(model?.tags).toContain("proxy");
  });

  it("all tiers are paid", () => {
    for (const entry of CLAUDE_CATALOG) {
      expect(entry.tier).toBe("paid");
    }
  });
});
