import { describe, expect, it } from "vitest";
import { computeApiKeyModelsByEnv, API_KEY_MODELS_BY_ENV } from "./model-usage";
import type { AgentCatalogEntry } from "./agent-catalog";

// Helper to create a minimal AgentCatalogEntry for testing
function makeEntry(
  name: string,
  requiredApiKeys: string[]
): AgentCatalogEntry {
  return {
    name,
    displayName: name.split("/")[1] ?? name,
    vendor: "anthropic",
    requiredApiKeys,
    tier: "free",
  };
}

describe("computeApiKeyModelsByEnv", () => {
  it("returns empty object for empty entries", () => {
    const result = computeApiKeyModelsByEnv([]);
    expect(result).toEqual({});
  });

  it("returns empty object when no entries have required API keys", () => {
    const entries: AgentCatalogEntry[] = [makeEntry("test/agent", [])];
    const result = computeApiKeyModelsByEnv(entries);
    expect(result).toEqual({});
  });

  it("maps single API key to single agent", () => {
    const entries: AgentCatalogEntry[] = [
      makeEntry("claude/opus-4", ["ANTHROPIC_API_KEY"]),
    ];
    const result = computeApiKeyModelsByEnv(entries);
    expect(result).toEqual({
      ANTHROPIC_API_KEY: ["claude/opus-4"],
    });
  });

  it("maps single API key to multiple agents", () => {
    const entries: AgentCatalogEntry[] = [
      makeEntry("claude/opus-4", ["ANTHROPIC_API_KEY"]),
      makeEntry("claude/sonnet-4", ["ANTHROPIC_API_KEY"]),
    ];
    const result = computeApiKeyModelsByEnv(entries);
    expect(result).toEqual({
      ANTHROPIC_API_KEY: ["claude/opus-4", "claude/sonnet-4"],
    });
  });

  it("maps multiple API keys from single agent", () => {
    const entries: AgentCatalogEntry[] = [
      makeEntry("multi/agent", ["API_KEY_A", "API_KEY_B"]),
    ];
    const result = computeApiKeyModelsByEnv(entries);
    expect(result).toEqual({
      API_KEY_A: ["multi/agent"],
      API_KEY_B: ["multi/agent"],
    });
  });

  it("sorts agent names alphabetically", () => {
    const entries: AgentCatalogEntry[] = [
      makeEntry("zulu/agent", ["SHARED_KEY"]),
      makeEntry("alpha/agent", ["SHARED_KEY"]),
      makeEntry("mike/agent", ["SHARED_KEY"]),
    ];
    const result = computeApiKeyModelsByEnv(entries);
    expect(result.SHARED_KEY).toEqual([
      "alpha/agent",
      "mike/agent",
      "zulu/agent",
    ]);
  });
});

describe("API_KEY_MODELS_BY_ENV", () => {
  it("is an object with string arrays as values", () => {
    expect(typeof API_KEY_MODELS_BY_ENV).toBe("object");
    for (const [key, value] of Object.entries(API_KEY_MODELS_BY_ENV)) {
      expect(typeof key).toBe("string");
      expect(Array.isArray(value)).toBe(true);
      for (const item of value) {
        expect(typeof item).toBe("string");
      }
    }
  });

  it("contains ANTHROPIC_API_KEY for Claude agents", () => {
    expect(API_KEY_MODELS_BY_ENV.ANTHROPIC_API_KEY).toBeDefined();
    const claudeAgents = API_KEY_MODELS_BY_ENV.ANTHROPIC_API_KEY.filter((name) =>
      name.startsWith("claude/")
    );
    expect(claudeAgents.length).toBeGreaterThan(0);
  });

  it("contains OPENAI_API_KEY for OpenAI/Codex agents", () => {
    expect(API_KEY_MODELS_BY_ENV.OPENAI_API_KEY).toBeDefined();
    expect(API_KEY_MODELS_BY_ENV.OPENAI_API_KEY.length).toBeGreaterThan(0);
  });
});
