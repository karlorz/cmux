import type { ProviderControlPlaneProvider } from "@cmux/shared/providers/control-plane";
import { describe, expect, it } from "vitest";

import { toLegacyProviderStatus } from "./providers.status.list.route";

function createProvider(
  overrides: Partial<ProviderControlPlaneProvider>
): ProviderControlPlaneProvider {
  return {
    id: "openai",
    name: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    effectiveBaseUrl: "https://api.openai.com/v1",
    apiFormat: "openai",
    authMethods: [
      {
        id: "openai-OPENAI_API_KEY",
        type: "api_key",
        displayName: "OpenAI API Key",
        apiKey: {
          envVar: "OPENAI_API_KEY",
          displayName: "OpenAI API Key",
        },
      },
      {
        id: "openai-CODEX_AUTH_JSON",
        type: "json_blob",
        displayName: "Codex Auth JSON",
        apiKey: {
          envVar: "CODEX_AUTH_JSON",
          displayName: "Codex Auth JSON",
        },
      },
      {
        id: "openai-custom-endpoint",
        type: "custom_endpoint",
        displayName: "Custom Endpoint",
        apiKey: {
          envVar: "OPENAI_BASE_URL",
          displayName: "OpenAI Base URL",
        },
      },
    ],
    connectionState: {
      isConnected: false,
      source: null,
      configuredEnvVars: [],
      hasFreeModels: false,
    },
    isOverridden: false,
    ...overrides,
  };
}

describe("toLegacyProviderStatus", () => {
  it("maps stored JSON auth into the legacy oauth source and omits custom endpoints", () => {
    const provider = createProvider({
      connectionState: {
        isConnected: true,
        source: "stored_json_blob",
        configuredEnvVars: ["CODEX_AUTH_JSON"],
        hasFreeModels: false,
      },
    });

    expect(toLegacyProviderStatus(provider)).toEqual({
      id: "openai",
      name: "OpenAI",
      isAvailable: true,
      source: "oauth",
      configuredKeys: ["CODEX_AUTH_JSON"],
      requiredKeys: ["OPENAI_API_KEY", "CODEX_AUTH_JSON"],
    });
  });

  it("preserves free-tier availability in the legacy response", () => {
    const provider = createProvider({
      id: "gemini",
      name: "Google Gemini",
      connectionState: {
        isConnected: true,
        source: "free",
        configuredEnvVars: [],
        hasFreeModels: true,
      },
      authMethods: [
        {
          id: "gemini-GEMINI_API_KEY",
          type: "api_key",
          displayName: "Gemini API Key",
          apiKey: {
            envVar: "GEMINI_API_KEY",
            displayName: "Gemini API Key",
          },
        },
      ],
    });

    expect(toLegacyProviderStatus(provider)).toEqual({
      id: "gemini",
      name: "Google Gemini",
      isAvailable: true,
      source: "free",
      configuredKeys: [],
      requiredKeys: ["GEMINI_API_KEY"],
    });
  });
});
