import { describe, expect, it } from "vitest";
import {
  BASE_PROVIDERS,
  BASE_PROVIDER_MAP,
  getBaseProvider,
  getProviderIdFromAgentName,
  type ProviderSpec,
} from "./base-providers";

describe("base-providers", () => {
  describe("BASE_PROVIDERS", () => {
    it("contains expected providers", () => {
      const providerIds = BASE_PROVIDERS.map((p) => p.id);
      expect(providerIds).toContain("anthropic");
      expect(providerIds).toContain("openai");
      expect(providerIds).toContain("gemini");
      expect(providerIds).toContain("openrouter");
      expect(providerIds).toContain("xai");
      expect(providerIds).toContain("modelstudio");
      expect(providerIds).toContain("amp");
      expect(providerIds).toContain("cursor");
    });

    it("anthropic provider has correct configuration", () => {
      const anthropic = BASE_PROVIDERS.find((p) => p.id === "anthropic");
      expect(anthropic).toBeDefined();
      expect(anthropic?.name).toBe("Anthropic");
      expect(anthropic?.defaultBaseUrl).toBe("https://api.anthropic.com");
      expect(anthropic?.apiFormat).toBe("anthropic");
      expect(anthropic?.authEnvVars).toContain("ANTHROPIC_API_KEY");
      expect(anthropic?.authEnvVars).toContain("CLAUDE_CODE_OAUTH_TOKEN");
    });

    it("openai provider has correct configuration", () => {
      const openai = BASE_PROVIDERS.find((p) => p.id === "openai");
      expect(openai).toBeDefined();
      expect(openai?.name).toBe("OpenAI");
      expect(openai?.defaultBaseUrl).toBe("https://api.openai.com/v1");
      expect(openai?.apiFormat).toBe("openai");
      expect(openai?.authEnvVars).toContain("OPENAI_API_KEY");
    });

    it("gemini provider has correct configuration", () => {
      const gemini = BASE_PROVIDERS.find((p) => p.id === "gemini");
      expect(gemini).toBeDefined();
      expect(gemini?.name).toBe("Google Gemini");
      expect(gemini?.apiFormat).toBe("openai");
      expect(gemini?.authEnvVars).toContain("GEMINI_API_KEY");
    });

    it("openrouter provider has correct configuration", () => {
      const openrouter = BASE_PROVIDERS.find((p) => p.id === "openrouter");
      expect(openrouter).toBeDefined();
      expect(openrouter?.defaultBaseUrl).toBe("https://openrouter.ai/api/v1");
      expect(openrouter?.apiFormat).toBe("openai");
    });

    it("xai provider has correct configuration", () => {
      const xai = BASE_PROVIDERS.find((p) => p.id === "xai");
      expect(xai).toBeDefined();
      expect(xai?.name).toBe("xAI");
      expect(xai?.defaultBaseUrl).toBe("https://api.x.ai/v1");
      expect(xai?.apiFormat).toBe("openai");
    });

    it("amp provider has passthrough api format", () => {
      const amp = BASE_PROVIDERS.find((p) => p.id === "amp");
      expect(amp).toBeDefined();
      expect(amp?.apiFormat).toBe("passthrough");
    });

    it("cursor provider has passthrough api format", () => {
      const cursor = BASE_PROVIDERS.find((p) => p.id === "cursor");
      expect(cursor).toBeDefined();
      expect(cursor?.apiFormat).toBe("passthrough");
    });

    it("all providers have required fields", () => {
      for (const provider of BASE_PROVIDERS) {
        expect(provider.id).toBeTruthy();
        expect(provider.name).toBeTruthy();
        expect(provider.defaultBaseUrl).toBeTruthy();
        expect(provider.apiFormat).toBeTruthy();
        expect(provider.authEnvVars.length).toBeGreaterThan(0);
        expect(provider.apiKeys.length).toBeGreaterThan(0);
      }
    });

    it("all base URLs are valid HTTPS URLs", () => {
      for (const provider of BASE_PROVIDERS) {
        expect(provider.defaultBaseUrl).toMatch(/^https:\/\//);
      }
    });
  });

  describe("BASE_PROVIDER_MAP", () => {
    it("has an entry for each provider", () => {
      expect(Object.keys(BASE_PROVIDER_MAP).length).toBe(BASE_PROVIDERS.length);
    });

    it("maps provider IDs to their specs", () => {
      expect(BASE_PROVIDER_MAP["anthropic"]?.name).toBe("Anthropic");
      expect(BASE_PROVIDER_MAP["openai"]?.name).toBe("OpenAI");
      expect(BASE_PROVIDER_MAP["gemini"]?.name).toBe("Google Gemini");
    });

    it("returns undefined for unknown providers", () => {
      expect(BASE_PROVIDER_MAP["nonexistent"]).toBeUndefined();
    });
  });

  describe("getBaseProvider", () => {
    it("returns provider spec for valid provider ID", () => {
      const anthropic = getBaseProvider("anthropic");
      expect(anthropic).toBeDefined();
      expect(anthropic?.id).toBe("anthropic");
      expect(anthropic?.name).toBe("Anthropic");
    });

    it("returns undefined for unknown provider ID", () => {
      expect(getBaseProvider("unknown")).toBeUndefined();
      expect(getBaseProvider("")).toBeUndefined();
    });

    it("returns correct provider for all known IDs", () => {
      for (const provider of BASE_PROVIDERS) {
        const result = getBaseProvider(provider.id);
        expect(result).toBeDefined();
        expect(result?.id).toBe(provider.id);
      }
    });
  });

  describe("getProviderIdFromAgentName", () => {
    describe("claude agents", () => {
      it("maps claude prefix to anthropic", () => {
        expect(getProviderIdFromAgentName("claude/opus-4.6")).toBe("anthropic");
        expect(getProviderIdFromAgentName("claude/opus-4.5")).toBe("anthropic");
        expect(getProviderIdFromAgentName("claude/sonnet-4.5")).toBe("anthropic");
        expect(getProviderIdFromAgentName("claude/haiku-4.5")).toBe("anthropic");
      });
    });

    describe("codex agents", () => {
      it("maps codex prefix to openai", () => {
        expect(getProviderIdFromAgentName("codex/gpt-5.1")).toBe("openai");
        expect(getProviderIdFromAgentName("codex/gpt-5.1-codex-mini")).toBe("openai");
      });
    });

    describe("gemini agents", () => {
      it("maps gemini prefix to gemini", () => {
        expect(getProviderIdFromAgentName("gemini/2.5-pro")).toBe("gemini");
        expect(getProviderIdFromAgentName("gemini/2.0-flash")).toBe("gemini");
      });
    });

    describe("grok agents", () => {
      it("maps grok prefix to xai", () => {
        expect(getProviderIdFromAgentName("grok/grok-3")).toBe("xai");
        expect(getProviderIdFromAgentName("grok/grok-2")).toBe("xai");
      });
    });

    describe("opencode agents", () => {
      it("maps opencode prefix to opencode provider", () => {
        // OpenCode has its own provider plugin (uses OpenRouter as backend)
        expect(getProviderIdFromAgentName("opencode/big-pickle")).toBe("opencode");
        expect(getProviderIdFromAgentName("opencode/zen-v1")).toBe("opencode");
      });
    });

    describe("amp agents", () => {
      it("maps amp prefix to amp", () => {
        expect(getProviderIdFromAgentName("amp/amp-agent")).toBe("amp");
      });
    });

    describe("cursor agents", () => {
      it("maps cursor prefix to cursor", () => {
        expect(getProviderIdFromAgentName("cursor/cursor-agent")).toBe("cursor");
      });
    });

    describe("qwen agents", () => {
      it("maps qwen prefix to modelstudio", () => {
        expect(getProviderIdFromAgentName("qwen/qwen-72b")).toBe("modelstudio");
      });
    });

    describe("edge cases", () => {
      it("returns undefined for unknown prefix", () => {
        expect(getProviderIdFromAgentName("unknown/model")).toBeUndefined();
      });

      it("returns undefined for empty string", () => {
        expect(getProviderIdFromAgentName("")).toBeUndefined();
      });

      it("returns provider for agent name without slash (prefix only)", () => {
        // The function uses split("/")[0], so just the prefix works too
        expect(getProviderIdFromAgentName("claude")).toBe("anthropic");
        expect(getProviderIdFromAgentName("codex")).toBe("openai");
      });

      it("handles agent names with multiple slashes", () => {
        // Should only use the first part
        expect(getProviderIdFromAgentName("claude/opus-4.6/variant")).toBe("anthropic");
      });
    });
  });
});
