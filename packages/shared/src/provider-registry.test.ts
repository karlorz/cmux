import { describe, expect, it, beforeEach } from "vitest";
import {
  ProviderRegistry,
  getProviderRegistry,
  getBaseProvider,
  getProviderIdFromAgentName,
  BASE_PROVIDERS,
  type ProviderOverride,
  validateClaudeRoutingOverride,
} from "./provider-registry";
import { CLAUDE_MODEL_SPECS } from "./providers/anthropic/models";

describe("ProviderRegistry", () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  describe("getProviderIds", () => {
    it("returns an array of provider IDs", () => {
      const ids = registry.getProviderIds();
      expect(Array.isArray(ids)).toBe(true);
      expect(ids.length).toBeGreaterThan(0);
    });

    it("includes anthropic and openai providers", () => {
      const ids = registry.getProviderIds();
      expect(ids).toContain("anthropic");
      expect(ids).toContain("openai");
    });
  });

  describe("getBaseProvider", () => {
    it("returns anthropic provider spec", () => {
      const provider = registry.getBaseProvider("anthropic");
      expect(provider).toBeDefined();
      expect(provider?.id).toBe("anthropic");
      expect(provider?.name).toBe("Anthropic");
    });

    it("returns openai provider spec", () => {
      const provider = registry.getBaseProvider("openai");
      expect(provider).toBeDefined();
      expect(provider?.id).toBe("openai");
    });

    it("returns undefined for unknown provider", () => {
      const provider = registry.getBaseProvider("unknown-provider-xyz");
      expect(provider).toBeUndefined();
    });
  });

  describe("resolve", () => {
    it("resolves base provider without override", () => {
      const resolved = registry.resolve("anthropic");
      expect(resolved.id).toBe("anthropic");
      expect(resolved.name).toBe("Anthropic");
      expect(resolved.isOverridden).toBe(false);
      expect(resolved.baseUrl).toBeDefined();
    });

    it("resolves provider with baseUrl override", () => {
      const override: ProviderOverride = {
        teamId: "team-123",
        providerId: "anthropic",
        baseUrl: "https://custom-proxy.example.com",
        enabled: true,
      };
      const resolved = registry.resolve("anthropic", override);
      expect(resolved.baseUrl).toBe("https://custom-proxy.example.com");
      expect(resolved.isOverridden).toBe(true);
    });

    it("resolves provider with apiFormat override", () => {
      const override: ProviderOverride = {
        teamId: "team-123",
        providerId: "anthropic",
        apiFormat: "openai",
        enabled: true,
      };
      const resolved = registry.resolve("anthropic", override);
      expect(resolved.apiFormat).toBe("openai");
      expect(resolved.isOverridden).toBe(true);
    });

    it("resolves provider with Claude routing override", () => {
      const override: ProviderOverride = {
        teamId: "team-123",
        providerId: "anthropic",
        baseUrl: "https://gateway.example.com",
        apiFormat: "anthropic",
        claudeRouting: {
          mode: "anthropic_compatible_gateway",
          opus: { model: "gpt-5.4" },
          subagentModel: "gpt-5.4-mini",
        },
        enabled: true,
      };
      const resolved = registry.resolve("anthropic", override);
      expect(resolved.claudeRouting).toEqual(override.claudeRouting);
    });

    it("throws for unknown provider without override", () => {
      expect(() => registry.resolve("unknown-provider")).toThrow(
        "Unknown provider: unknown-provider"
      );
    });

    it("creates custom provider from override for unknown provider", () => {
      const override: ProviderOverride = {
        teamId: "team-123",
        providerId: "custom-proxy",
        baseUrl: "https://my-proxy.example.com",
        apiFormat: "openai",
        apiKeyEnvVar: "CUSTOM_API_KEY",
        enabled: true,
      };
      const resolved = registry.resolve("custom-proxy", override);
      expect(resolved.id).toBe("custom-proxy");
      expect(resolved.baseUrl).toBe("https://my-proxy.example.com");
      expect(resolved.apiFormat).toBe("openai");
      expect(resolved.authEnvVars).toEqual(["CUSTOM_API_KEY"]);
      expect(resolved.isOverridden).toBe(true);
    });
  });

  describe("getProviderIdForAgent", () => {
    it("returns anthropic for claude agents", () => {
      expect(registry.getProviderIdForAgent("claude/opus-4.6")).toBe(
        "anthropic"
      );
      expect(registry.getProviderIdForAgent("claude/sonnet-4")).toBe(
        "anthropic"
      );
    });

    it("returns openai for codex agents", () => {
      expect(registry.getProviderIdForAgent("codex/gpt-5")).toBe("openai");
    });
  });

  describe("findOverride", () => {
    it("finds matching enabled override", () => {
      const overrides: ProviderOverride[] = [
        {
          teamId: "team-1",
          providerId: "anthropic",
          baseUrl: "https://proxy1.example.com",
          enabled: true,
        },
        {
          teamId: "team-1",
          providerId: "openai",
          baseUrl: "https://proxy2.example.com",
          enabled: true,
        },
      ];
      const found = registry.findOverride("anthropic", overrides);
      expect(found?.baseUrl).toBe("https://proxy1.example.com");
    });

    it("ignores disabled overrides", () => {
      const overrides: ProviderOverride[] = [
        {
          teamId: "team-1",
          providerId: "anthropic",
          baseUrl: "https://proxy.example.com",
          enabled: false,
        },
      ];
      const found = registry.findOverride("anthropic", overrides);
      expect(found).toBeUndefined();
    });

    it("returns undefined when no match", () => {
      const overrides: ProviderOverride[] = [
        {
          teamId: "team-1",
          providerId: "openai",
          enabled: true,
        },
      ];
      const found = registry.findOverride("anthropic", overrides);
      expect(found).toBeUndefined();
    });
  });

  describe("resolveForAgent", () => {
    it("resolves provider for claude agent", () => {
      const resolved = registry.resolveForAgent("claude/opus-4.6", []);
      expect(resolved).toBeDefined();
      expect(resolved?.id).toBe("anthropic");
    });

    it("applies team override for agent", () => {
      const overrides: ProviderOverride[] = [
        {
          teamId: "team-1",
          providerId: "anthropic",
          baseUrl: "https://team-proxy.example.com",
          enabled: true,
        },
      ];
      const resolved = registry.resolveForAgent("claude/opus-4.6", overrides);
      expect(resolved?.baseUrl).toBe("https://team-proxy.example.com");
      expect(resolved?.isOverridden).toBe(true);
    });

    it("returns undefined for unknown agent prefix", () => {
      const resolved = registry.resolveForAgent("unknown/agent", []);
      expect(resolved).toBeUndefined();
    });
  });
});

describe("getProviderRegistry", () => {
  it("returns a ProviderRegistry instance", () => {
    const registry = getProviderRegistry();
    expect(registry).toBeInstanceOf(ProviderRegistry);
  });

  it("returns the same singleton instance", () => {
    const registry1 = getProviderRegistry();
    const registry2 = getProviderRegistry();
    expect(registry1).toBe(registry2);
  });
});

describe("getBaseProvider (exported function)", () => {
  it("returns anthropic provider", () => {
    const provider = getBaseProvider("anthropic");
    expect(provider).toBeDefined();
    expect(provider?.id).toBe("anthropic");
  });
});

describe("getProviderIdFromAgentName (exported function)", () => {
  it("maps claude agents to anthropic", () => {
    expect(getProviderIdFromAgentName("claude/opus-4.6")).toBe("anthropic");
  });

  it("maps codex agents to openai", () => {
    expect(getProviderIdFromAgentName("codex/gpt-5")).toBe("openai");
  });
});

describe("validateClaudeRoutingOverride", () => {
  it("allows direct_anthropic without remaps", () => {
    expect(() =>
      validateClaudeRoutingOverride({
        providerId: "anthropic",
        claudeRouting: { mode: "direct_anthropic" },
      }),
    ).not.toThrow();
  });

  it("rejects direct_anthropic remaps", () => {
    expect(() =>
      validateClaudeRoutingOverride({
        providerId: "anthropic",
        claudeRouting: {
          mode: "direct_anthropic",
          opus: { model: "gpt-5.4" },
        },
      }),
    ).toThrow(/direct_anthropic/);
  });

  it("rejects non-anthropic providers", () => {
    expect(() =>
      validateClaudeRoutingOverride({
        providerId: "openai",
        claudeRouting: {
          mode: "anthropic_compatible_gateway",
          opus: { model: "gpt-5.4" },
        },
      }),
    ).toThrow(/only supported for the anthropic provider/);
  });

  it("requires baseUrl for anthropic_compatible_gateway", () => {
    expect(() =>
      validateClaudeRoutingOverride({
        providerId: "anthropic",
        apiFormat: "anthropic",
        claudeRouting: {
          mode: "anthropic_compatible_gateway",
          opus: { model: "gpt-5.4" },
        },
      }),
    ).toThrow(/requires a custom baseUrl/);
  });
});

describe("BASE_PROVIDERS", () => {
  it("is an array of provider specs", () => {
    expect(Array.isArray(BASE_PROVIDERS)).toBe(true);
    expect(BASE_PROVIDERS.length).toBeGreaterThan(0);
  });

  it("all providers have required fields", () => {
    for (const provider of BASE_PROVIDERS) {
      expect(provider.id).toBeDefined();
      expect(provider.name).toBeDefined();
      expect(provider.defaultBaseUrl).toBeDefined();
      expect(provider.apiFormat).toBeDefined();
      expect(Array.isArray(provider.authEnvVars)).toBe(true);
    }
  });
});

describe("CLAUDE_MODEL_SPECS", () => {
  it("maps Claude agent names to stable families and native ids", () => {
    expect(CLAUDE_MODEL_SPECS).toEqual([
      {
        nameSuffix: "opus-4.6",
        family: "opus",
        nativeModelId: "claude-opus-4-6",
      },
      {
        nameSuffix: "sonnet-4.6",
        family: "sonnet",
        nativeModelId: "claude-sonnet-4-6",
      },
      {
        nameSuffix: "opus-4.5",
        family: "opus",
        nativeModelId: "claude-opus-4-5-20251101",
      },
      {
        nameSuffix: "sonnet-4.5",
        family: "sonnet",
        nativeModelId: "claude-sonnet-4-5-20250929",
      },
      {
        nameSuffix: "haiku-4.5",
        family: "haiku",
        nativeModelId: "claude-haiku-4-5-20251001",
      },
    ]);
  });
});
