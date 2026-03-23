import { describe, expect, it } from "vitest";
import {
  normalizeProviderUrl,
  normalizeAnthropicUrl,
  normalizeOpenAIUrl,
  normalizeGoogleUrl,
  toAiSdkUrl,
  toCliUrl,
} from "./provider-url-normalizer";

describe("provider-url-normalizer", () => {
  describe("normalizeProviderUrl", () => {
    describe("anthropic", () => {
      it("bare origin: CLI gets no suffix, SDK gets /v1", () => {
        const result = normalizeProviderUrl("https://proxy.example.com", "anthropic");
        expect(result.forCliOrRawFetch()).toBe("https://proxy.example.com");
        expect(result.forAiSdk()).toBe("https://proxy.example.com/v1");
        expect(result.hasCustomPath).toBe(false);
      });

      it("origin with /v1: strips for CLI, keeps for SDK", () => {
        const result = normalizeProviderUrl("https://proxy.example.com/v1", "anthropic");
        expect(result.forCliOrRawFetch()).toBe("https://proxy.example.com");
        expect(result.forAiSdk()).toBe("https://proxy.example.com/v1");
        expect(result.hasCustomPath).toBe(false);
      });

      it("origin with trailing slash: normalizes correctly", () => {
        const result = normalizeProviderUrl("https://proxy.example.com/", "anthropic");
        expect(result.forCliOrRawFetch()).toBe("https://proxy.example.com");
        expect(result.forAiSdk()).toBe("https://proxy.example.com/v1");
      });

      it("custom path: preserves path, CLI gets no suffix, SDK adds /v1", () => {
        const result = normalizeProviderUrl(
          "https://proxy.example.com/custom/anthropic",
          "anthropic"
        );
        expect(result.forCliOrRawFetch()).toBe("https://proxy.example.com/custom/anthropic");
        expect(result.forAiSdk()).toBe("https://proxy.example.com/custom/anthropic/v1");
        expect(result.hasCustomPath).toBe(true);
      });

      it("custom path with trailing /v1: strips suffix for CLI", () => {
        const result = normalizeProviderUrl(
          "https://proxy.example.com/custom/anthropic/v1",
          "anthropic"
        );
        expect(result.forCliOrRawFetch()).toBe("https://proxy.example.com/custom/anthropic");
        expect(result.forAiSdk()).toBe("https://proxy.example.com/custom/anthropic/v1");
        expect(result.hasCustomPath).toBe(true);
      });

      it("preserves port in origin", () => {
        const result = normalizeProviderUrl("https://localhost:8080", "anthropic");
        expect(result.forCliOrRawFetch()).toBe("https://localhost:8080");
        expect(result.forAiSdk()).toBe("https://localhost:8080/v1");
        expect(result.getOrigin()).toBe("https://localhost:8080");
      });

      it("trims whitespace", () => {
        const result = normalizeProviderUrl("  https://proxy.example.com  ", "anthropic");
        expect(result.original).toBe("https://proxy.example.com");
        expect(result.forCliOrRawFetch()).toBe("https://proxy.example.com");
      });
    });

    describe("openai", () => {
      it("bare origin: both CLI and SDK get /v1", () => {
        const result = normalizeProviderUrl("https://proxy.example.com", "openai");
        expect(result.forCliOrRawFetch()).toBe("https://proxy.example.com/v1");
        expect(result.forAiSdk()).toBe("https://proxy.example.com/v1");
        expect(result.hasCustomPath).toBe(false);
      });

      it("origin with /v1: preserves for both", () => {
        const result = normalizeProviderUrl("https://proxy.example.com/v1", "openai");
        expect(result.forCliOrRawFetch()).toBe("https://proxy.example.com/v1");
        expect(result.forAiSdk()).toBe("https://proxy.example.com/v1");
        expect(result.hasCustomPath).toBe(false);
      });

      it("origin with wrong version (/v1beta): normalizes to /v1", () => {
        const result = normalizeProviderUrl("https://proxy.example.com/v1beta", "openai");
        expect(result.forAiSdk()).toBe("https://proxy.example.com/v1");
        expect(result.hasCustomPath).toBe(false);
      });

      it("custom path: preserves path and adds /v1", () => {
        const result = normalizeProviderUrl(
          "https://proxy.example.com/custom/openai",
          "openai"
        );
        expect(result.forCliOrRawFetch()).toBe("https://proxy.example.com/custom/openai/v1");
        expect(result.forAiSdk()).toBe("https://proxy.example.com/custom/openai/v1");
        expect(result.hasCustomPath).toBe(true);
      });

      it("custom path with /v1: normalizes correctly", () => {
        const result = normalizeProviderUrl(
          "https://proxy.example.com/custom/openai/v1",
          "openai"
        );
        expect(result.forAiSdk()).toBe("https://proxy.example.com/custom/openai/v1");
      });
    });

    describe("google", () => {
      it("bare origin: SDK gets /v1beta", () => {
        const result = normalizeProviderUrl("https://proxy.example.com", "google");
        expect(result.forAiSdk()).toBe("https://proxy.example.com/v1beta");
        expect(result.hasCustomPath).toBe(false);
      });

      it("origin with /v1beta: preserves for SDK", () => {
        const result = normalizeProviderUrl("https://proxy.example.com/v1beta", "google");
        expect(result.forAiSdk()).toBe("https://proxy.example.com/v1beta");
        expect(result.hasCustomPath).toBe(false);
      });

      it("origin with wrong version (/v1): normalizes to /v1beta", () => {
        const result = normalizeProviderUrl("https://proxy.example.com/v1", "google");
        expect(result.forAiSdk()).toBe("https://proxy.example.com/v1beta");
        expect(result.hasCustomPath).toBe(false);
      });

      it("custom path: preserves path and adds /v1beta", () => {
        const result = normalizeProviderUrl(
          "https://proxy.example.com/custom/gemini",
          "google"
        );
        expect(result.forAiSdk()).toBe("https://proxy.example.com/custom/gemini/v1beta");
        expect(result.hasCustomPath).toBe(true);
      });

      it("custom path with /v1: normalizes to /v1beta", () => {
        const result = normalizeProviderUrl(
          "https://proxy.example.com/custom/gemini/v1",
          "google"
        );
        expect(result.forAiSdk()).toBe("https://proxy.example.com/custom/gemini/v1beta");
      });

      it("custom path with /v1beta: preserves", () => {
        const result = normalizeProviderUrl(
          "https://proxy.example.com/custom/gemini/v1beta",
          "google"
        );
        expect(result.forAiSdk()).toBe("https://proxy.example.com/custom/gemini/v1beta");
      });
    });

    describe("error handling", () => {
      it("throws for empty string", () => {
        expect(() => normalizeProviderUrl("", "anthropic")).toThrow(
          "Provider URL cannot be empty"
        );
      });

      it("throws for whitespace-only string", () => {
        expect(() => normalizeProviderUrl("   ", "anthropic")).toThrow(
          "Provider URL cannot be empty"
        );
      });

      it("throws for invalid URL", () => {
        expect(() => normalizeProviderUrl("not-a-url", "anthropic")).toThrow(
          "Invalid provider URL"
        );
      });

      it("throws for relative URL", () => {
        expect(() => normalizeProviderUrl("/v1/messages", "anthropic")).toThrow(
          "Invalid provider URL"
        );
      });
    });

    describe("edge cases", () => {
      it("handles multiple trailing slashes", () => {
        const result = normalizeProviderUrl("https://proxy.example.com///", "anthropic");
        expect(result.forCliOrRawFetch()).toBe("https://proxy.example.com");
        expect(result.forAiSdk()).toBe("https://proxy.example.com/v1");
      });

      it("handles /v1/ with trailing slash", () => {
        const result = normalizeProviderUrl("https://proxy.example.com/v1/", "anthropic");
        expect(result.forCliOrRawFetch()).toBe("https://proxy.example.com");
        expect(result.forAiSdk()).toBe("https://proxy.example.com/v1");
      });

      it("handles http protocol", () => {
        const result = normalizeProviderUrl("http://localhost:8080", "openai");
        expect(result.forAiSdk()).toBe("http://localhost:8080/v1");
        expect(result.getOrigin()).toBe("http://localhost:8080");
      });

      it("handles URL with username/password (strips auth)", () => {
        // URL constructor strips auth in origin
        const result = normalizeProviderUrl("https://user:pass@proxy.example.com", "openai");
        expect(result.getOrigin()).toBe("https://proxy.example.com");
      });

      it("preserves original input in result", () => {
        const input = "  https://proxy.example.com/v1  ";
        const result = normalizeProviderUrl(input, "openai");
        expect(result.original).toBe("https://proxy.example.com/v1");
      });
    });
  });

  describe("convenience functions", () => {
    describe("normalizeAnthropicUrl", () => {
      it("normalizes anthropic URLs", () => {
        const result = normalizeAnthropicUrl("https://proxy.example.com");
        expect(result.provider).toBe("anthropic");
        expect(result.forCliOrRawFetch()).toBe("https://proxy.example.com");
        expect(result.forAiSdk()).toBe("https://proxy.example.com/v1");
      });
    });

    describe("normalizeOpenAIUrl", () => {
      it("normalizes openai URLs", () => {
        const result = normalizeOpenAIUrl("https://proxy.example.com");
        expect(result.provider).toBe("openai");
        expect(result.forAiSdk()).toBe("https://proxy.example.com/v1");
      });
    });

    describe("normalizeGoogleUrl", () => {
      it("normalizes google URLs", () => {
        const result = normalizeGoogleUrl("https://proxy.example.com");
        expect(result.provider).toBe("google");
        expect(result.forAiSdk()).toBe("https://proxy.example.com/v1beta");
      });
    });

    describe("toAiSdkUrl", () => {
      it("returns AI SDK URL directly", () => {
        expect(toAiSdkUrl("https://proxy.example.com", "anthropic")).toBe(
          "https://proxy.example.com/v1"
        );
        expect(toAiSdkUrl("https://proxy.example.com", "openai")).toBe(
          "https://proxy.example.com/v1"
        );
        expect(toAiSdkUrl("https://proxy.example.com", "google")).toBe(
          "https://proxy.example.com/v1beta"
        );
      });
    });

    describe("toCliUrl", () => {
      it("returns CLI URL directly", () => {
        expect(toCliUrl("https://proxy.example.com", "anthropic")).toBe(
          "https://proxy.example.com"
        );
        expect(toCliUrl("https://proxy.example.com", "openai")).toBe(
          "https://proxy.example.com/v1"
        );
        expect(toCliUrl("https://proxy.example.com", "google")).toBe(
          "https://proxy.example.com/v1beta"
        );
      });
    });
  });

  describe("real-world scenarios", () => {
    it("newapi.ai bare origin for Anthropic", () => {
      const result = normalizeAnthropicUrl("https://api.newapi.ai");
      expect(result.forCliOrRawFetch()).toBe("https://api.newapi.ai");
      expect(result.forAiSdk()).toBe("https://api.newapi.ai/v1");
    });

    it("newapi.ai with /v1 for Anthropic", () => {
      const result = normalizeAnthropicUrl("https://api.newapi.ai/v1");
      expect(result.forCliOrRawFetch()).toBe("https://api.newapi.ai");
      expect(result.forAiSdk()).toBe("https://api.newapi.ai/v1");
    });

    it("karldigi gateway for OpenAI", () => {
      const result = normalizeOpenAIUrl("https://new.karldigi.dev");
      expect(result.forAiSdk()).toBe("https://new.karldigi.dev/v1");
    });

    it("karldigi gateway for Gemini (wrong /v1 suffix)", () => {
      const result = normalizeGoogleUrl("https://new.karldigi.dev/v1");
      expect(result.forAiSdk()).toBe("https://new.karldigi.dev/v1beta");
    });

    it("generativelanguage.googleapis.com default", () => {
      const result = normalizeGoogleUrl(
        "https://generativelanguage.googleapis.com/v1beta"
      );
      expect(result.forAiSdk()).toBe(
        "https://generativelanguage.googleapis.com/v1beta"
      );
    });

    it("api.anthropic.com default", () => {
      const result = normalizeAnthropicUrl("https://api.anthropic.com");
      expect(result.forCliOrRawFetch()).toBe("https://api.anthropic.com");
      expect(result.forAiSdk()).toBe("https://api.anthropic.com/v1");
    });

    it("api.openai.com default", () => {
      const result = normalizeOpenAIUrl("https://api.openai.com/v1");
      expect(result.forAiSdk()).toBe("https://api.openai.com/v1");
    });

    it("custom proxy with path routing", () => {
      // Scenario: Proxy routes /anthropic to Anthropic, /openai to OpenAI
      const anthropicResult = normalizeAnthropicUrl(
        "https://proxy.internal.com/api/anthropic"
      );
      expect(anthropicResult.forCliOrRawFetch()).toBe(
        "https://proxy.internal.com/api/anthropic"
      );
      expect(anthropicResult.forAiSdk()).toBe(
        "https://proxy.internal.com/api/anthropic/v1"
      );

      const openaiResult = normalizeOpenAIUrl(
        "https://proxy.internal.com/api/openai"
      );
      expect(openaiResult.forAiSdk()).toBe(
        "https://proxy.internal.com/api/openai/v1"
      );
    });
  });
});
