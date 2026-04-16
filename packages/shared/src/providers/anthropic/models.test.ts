import { describe, expect, it } from "vitest";
import {
  hasAnthropicCustomEndpointConfigured,
  requiresAnthropicCustomEndpoint,
} from "./models";

describe("anthropic model helpers", () => {
  it("marks claude/gpt-5.1-codex-mini as requiring a custom endpoint", () => {
    expect(requiresAnthropicCustomEndpoint("claude/gpt-5.1-codex-mini")).toBe(
      true,
    );
    expect(requiresAnthropicCustomEndpoint("claude/opus-4.6")).toBe(false);
  });

  it("accepts bypassed user Anthropic base URLs as custom endpoints", () => {
    expect(
      hasAnthropicCustomEndpointConfigured({
        apiKeys: {
          ANTHROPIC_BASE_URL: "https://gateway.example.com",
        },
        bypassAnthropicProxy: true,
      }),
    ).toBe(true);
  });

  it("accepts enabled anthropic overrides with custom base URLs", () => {
    expect(
      hasAnthropicCustomEndpointConfigured({
        providerOverrides: [
          {
            providerId: "anthropic",
            enabled: true,
            baseUrl: "https://gateway.example.com",
            apiFormat: "anthropic",
          },
        ],
      }),
    ).toBe(true);
  });

  it("rejects unbypassed user Anthropic base URLs", () => {
    expect(
      hasAnthropicCustomEndpointConfigured({
        apiKeys: {
          ANTHROPIC_BASE_URL: "https://gateway.example.com",
        },
        bypassAnthropicProxy: false,
      }),
    ).toBe(false);
  });
});
