import { describe, expect, it } from "vitest";
import {
  resolveControlPlaneProvider,
  resolveControlPlaneModel,
  listProviders,
  listModels,
  computeDiscoveryFreshness,
  type StoredApiKeys,
  type StoredModel,
  type ControlPlaneContext,
} from "./service";
import type { ProviderSpec } from "../base-providers";
import type { ProviderOverride } from "../../provider-registry";

// Test fixtures
const mockAnthropicSpec: ProviderSpec = {
  id: "anthropic",
  name: "Anthropic",
  defaultBaseUrl: "https://api.anthropic.com",
  apiFormat: "anthropic",
  authEnvVars: ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"],
  apiKeys: [
    {
      envVar: "CLAUDE_CODE_OAUTH_TOKEN",
      displayName: "Claude OAuth Token",
      description: "OAuth token from Claude Code CLI",
    },
    {
      envVar: "ANTHROPIC_API_KEY",
      displayName: "Anthropic API Key",
      description: "Anthropic API Key",
    },
  ],
  baseUrlKey: {
    envVar: "ANTHROPIC_BASE_URL",
    displayName: "Anthropic Base URL",
    description: "Custom API endpoint for Anthropic",
  },
};

const mockOpenAISpec: ProviderSpec = {
  id: "openai",
  name: "OpenAI",
  defaultBaseUrl: "https://api.openai.com/v1",
  apiFormat: "openai",
  authEnvVars: ["OPENAI_API_KEY", "CODEX_AUTH_JSON"],
  apiKeys: [
    {
      envVar: "OPENAI_API_KEY",
      displayName: "OpenAI API Key",
      description: "OpenAI API Key",
    },
    {
      envVar: "CODEX_AUTH_JSON",
      displayName: "Codex Auth JSON",
      description: "Contents of ~/.codex/auth.json",
    },
  ],
};

const mockOpencodeSpec: ProviderSpec = {
  id: "opencode",
  name: "OpenCode",
  defaultBaseUrl: "https://openrouter.ai/api/v1",
  apiFormat: "openai",
  authEnvVars: ["OPENCODE_AUTH_JSON", "OPENROUTER_API_KEY"],
  apiKeys: [
    {
      envVar: "OPENCODE_AUTH_JSON",
      displayName: "OpenCode Auth JSON",
      description: "Contents of ~/.local/share/opencode/auth.json",
    },
    {
      envVar: "OPENROUTER_API_KEY",
      displayName: "OpenRouter API Key",
      description: "OpenRouter API Key",
    },
  ],
};

const mockModelStudioSpec: ProviderSpec = {
  id: "modelstudio",
  name: "Alibaba ModelStudio",
  defaultBaseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  apiFormat: "openai",
  authEnvVars: ["MODEL_STUDIO_API_KEY"],
  apiKeys: [
    {
      envVar: "MODEL_STUDIO_API_KEY",
      displayName: "ModelStudio API Key",
      description: "Alibaba ModelStudio API key",
    },
  ],
};

const mockBaseProviders: ProviderSpec[] = [
  mockAnthropicSpec,
  mockOpenAISpec,
  mockOpencodeSpec,
  mockModelStudioSpec,
];

const mockModels: StoredModel[] = [
  {
    name: "claude/opus-4.6",
    displayName: "Opus 4.6",
    vendor: "anthropic",
    source: "curated",
    requiredApiKeys: ["ANTHROPIC_API_KEY"],
    tier: "paid",
    tags: ["reasoning", "latest"],
    enabled: true,
    sortOrder: 0,
  },
  {
    name: "claude/sonnet-4.6",
    displayName: "Sonnet 4.6",
    vendor: "anthropic",
    source: "curated",
    requiredApiKeys: ["ANTHROPIC_API_KEY"],
    tier: "paid",
    tags: ["balanced"],
    enabled: true,
    sortOrder: 1,
  },
  {
    name: "codex/gpt-5.4",
    displayName: "GPT 5.4",
    vendor: "openai",
    source: "curated",
    requiredApiKeys: ["OPENAI_API_KEY"],
    tier: "paid",
    tags: ["reasoning"],
    enabled: true,
    sortOrder: 0,
  },
  {
    name: "opencode/big-pickle",
    displayName: "Big Pickle",
    vendor: "opencode",
    source: "discovered",
    discoveredAt: Date.now() - 1000 * 60 * 60, // 1 hour ago
    discoveredFrom: "opencode-zen",
    requiredApiKeys: [],
    tier: "free",
    tags: ["free"],
    enabled: true,
    sortOrder: 0,
  },
  {
    name: "qwen/qwen3-coder:free",
    displayName: "Qwen3 Coder (Free)",
    vendor: "qwen",
    source: "curated",
    requiredApiKeys: ["OPENROUTER_API_KEY"],
    tier: "free",
    tags: ["free"],
    enabled: true,
    sortOrder: 2,
  },
];

describe("control-plane/service", () => {
  describe("resolveControlPlaneProvider", () => {
    it("resolves disconnected provider with no stored keys", () => {
      const result = resolveControlPlaneProvider(
        mockAnthropicSpec,
        {},
        [],
        mockModels,
        undefined,
      );

      expect(result.id).toBe("anthropic");
      expect(result.name).toBe("Anthropic");
      expect(result.connectionState.isConnected).toBe(false);
      expect(result.connectionState.source).toBe(null);
      expect(result.connectionState.configuredEnvVars).toEqual([]);
      expect(result.isOverridden).toBe(false);
    });

    it("resolves connected provider with stored API key", () => {
      const storedKeys: StoredApiKeys = {
        ANTHROPIC_API_KEY: "sk-test-key",
      };

      const result = resolveControlPlaneProvider(
        mockAnthropicSpec,
        storedKeys,
        [],
        mockModels,
        undefined,
      );

      expect(result.connectionState.isConnected).toBe(true);
      expect(result.connectionState.source).toBe("stored_api_key");
      expect(result.connectionState.configuredEnvVars).toEqual([
        "ANTHROPIC_API_KEY",
      ]);
    });

    it("resolves connected provider with OAuth token", () => {
      const storedKeys: StoredApiKeys = {
        CLAUDE_CODE_OAUTH_TOKEN: "oauth-token-value",
      };

      const result = resolveControlPlaneProvider(
        mockAnthropicSpec,
        storedKeys,
        [],
        mockModels,
        undefined,
      );

      expect(result.connectionState.isConnected).toBe(true);
      expect(result.connectionState.source).toBe("stored_oauth_token");
    });

    it("resolves connected provider with JSON blob", () => {
      const storedKeys: StoredApiKeys = {
        CODEX_AUTH_JSON: '{"access_token": "test"}',
      };

      const result = resolveControlPlaneProvider(
        mockOpenAISpec,
        storedKeys,
        [],
        mockModels,
        undefined,
      );

      expect(result.connectionState.isConnected).toBe(true);
      expect(result.connectionState.source).toBe("stored_json_blob");
    });

    it("resolves provider with override", () => {
      const override: ProviderOverride = {
        teamId: "team-1",
        providerId: "anthropic",
        baseUrl: "https://custom-proxy.example.com",
        enabled: true,
      };

      const result = resolveControlPlaneProvider(
        mockAnthropicSpec,
        {},
        [override],
        mockModels,
        undefined,
      );

      expect(result.connectionState.isConnected).toBe(true);
      expect(result.connectionState.source).toBe("override");
      expect(result.isOverridden).toBe(true);
      expect(result.effectiveBaseUrl).toBe("https://custom-proxy.example.com");
    });

    it("resolves OpenCode with free tier", () => {
      const result = resolveControlPlaneProvider(
        mockOpencodeSpec,
        {},
        [],
        mockModels,
        undefined,
      );

      expect(result.connectionState.isConnected).toBe(true);
      expect(result.connectionState.source).toBe("free");
      expect(result.connectionState.hasFreeModels).toBe(true);
    });

    it("does not treat credentialed free models as auth-free providers", () => {
      const result = resolveControlPlaneProvider(
        mockModelStudioSpec,
        {},
        [],
        mockModels,
        undefined,
      );

      expect(result.connectionState.isConnected).toBe(false);
      expect(result.connectionState.source).toBe(null);
      expect(result.connectionState.hasFreeModels).toBe(false);
    });

    it("generates auth methods from API keys", () => {
      const result = resolveControlPlaneProvider(
        mockAnthropicSpec,
        {},
        [],
        mockModels,
        undefined,
      );

      expect(result.authMethods).toHaveLength(3); // 2 API keys + 1 custom endpoint

      const oauthMethod = result.authMethods.find(
        (m) => m.type === "oauth_token",
      );
      expect(oauthMethod).toBeDefined();
      expect(oauthMethod?.preferred).toBe(true);

      const apiKeyMethod = result.authMethods.find((m) => m.type === "api_key");
      expect(apiKeyMethod).toBeDefined();

      const endpointMethod = result.authMethods.find(
        (m) => m.type === "custom_endpoint",
      );
      expect(endpointMethod).toBeDefined();
    });

    it("includes default model when connected", () => {
      const storedKeys: StoredApiKeys = {
        ANTHROPIC_API_KEY: "sk-test",
      };
      const defaultModel = {
        name: "claude/opus-4.6",
        displayName: "Opus 4.6",
      };

      const result = resolveControlPlaneProvider(
        mockAnthropicSpec,
        storedKeys,
        [],
        mockModels,
        defaultModel,
      );

      expect(result.defaultModel).toEqual(defaultModel);
    });

    it("excludes default model when disconnected", () => {
      const defaultModel = {
        name: "claude/opus-4.6",
        displayName: "Opus 4.6",
      };

      const result = resolveControlPlaneProvider(
        mockAnthropicSpec,
        {},
        [],
        mockModels,
        defaultModel,
      );

      expect(result.defaultModel).toBeUndefined();
    });
  });

  describe("resolveControlPlaneModel", () => {
    it("marks model as available when provider is connected", () => {
      const connectedProviders = new Set(["anthropic"]);
      const model = mockModels[0]; // claude/opus-4.6

      const result = resolveControlPlaneModel(model, connectedProviders);

      expect(result.isAvailable).toBe(true);
      expect(result.name).toBe("claude/opus-4.6");
      expect(result.providerId).toBe("anthropic");
    });

    it("surfaces catalog-defined variants and defaultVariant", () => {
      const connectedProviders = new Set(["anthropic"]);
      const model = mockModels[0]; // claude/opus-4.6

      const result = resolveControlPlaneModel(model, connectedProviders);

      expect(result.defaultVariant).toBe("medium");
      expect(result.variants?.map((variant) => variant.id)).toEqual([
        "low",
        "medium",
        "high",
        "max",
      ]);
    });

    it("does not inherit stored variants when the catalog leaves effort undefined", () => {
      const connectedProviders = new Set(["anthropic"]);
      const result = resolveControlPlaneModel(
        {
          name: "claude/opus-4.5",
          displayName: "Opus 4.5",
          vendor: "anthropic",
          source: "curated",
          requiredApiKeys: ["ANTHROPIC_API_KEY"],
          tier: "paid",
          tags: ["reasoning"],
          enabled: true,
          sortOrder: 10,
          variants: [{ id: "default", displayName: "Default" }],
          defaultVariant: "default",
        },
        connectedProviders,
      );

      expect(result.variants).toEqual([]);
      expect(result.defaultVariant).toBeUndefined();
    });

    it("marks model as unavailable when provider is disconnected", () => {
      const connectedProviders = new Set<string>();
      const model = mockModels[0]; // claude/opus-4.6

      const result = resolveControlPlaneModel(model, connectedProviders);

      expect(result.isAvailable).toBe(false);
    });

    it("marks free tier model as available regardless of connection", () => {
      const connectedProviders = new Set<string>();
      const model = mockModels[3]; // opencode/big-pickle (free)

      const result = resolveControlPlaneModel(model, connectedProviders);

      expect(result.isAvailable).toBe(true);
      expect(result.tier).toBe("free");
    });

    it("keeps credentialed free models unavailable when disconnected", () => {
      const connectedProviders = new Set<string>();
      const model = mockModels[4]; // qwen/qwen3-coder:free

      const result = resolveControlPlaneModel(model, connectedProviders);

      expect(result.isAvailable).toBe(false);
      expect(result.providerId).toBe("modelstudio");
      expect(result.tier).toBe("free");
    });
  });

  describe("listProviders", () => {
    it("lists all providers with connection states", () => {
      const ctx: ControlPlaneContext = {
        storedApiKeys: { ANTHROPIC_API_KEY: "sk-test" },
        providerOverrides: [],
        models: mockModels,
      };

      const result = listProviders(mockBaseProviders, ctx);

      expect(result.providers).toHaveLength(4);
      expect(result.generatedAt).toBeDefined();

      const anthropic = result.providers.find((p) => p.id === "anthropic");
      expect(anthropic?.connectionState.isConnected).toBe(true);
      expect(anthropic?.defaultModel?.name).toBe("claude/opus-4.6");

      const openai = result.providers.find((p) => p.id === "openai");
      expect(openai?.connectionState.isConnected).toBe(false);

      const modelstudio = result.providers.find((p) => p.id === "modelstudio");
      expect(modelstudio?.connectionState.isConnected).toBe(false);
    });
  });

  describe("listModels", () => {
    it("lists connected models by default", () => {
      const ctx: ControlPlaneContext = {
        storedApiKeys: { ANTHROPIC_API_KEY: "sk-test" },
        providerOverrides: [],
        models: mockModels,
      };

      const result = listModels(mockBaseProviders, ctx);

      expect(result.view).toBe("connected");
      // Should include anthropic models (connected) and opencode free model
      const names = result.models.map((m) => m.name);
      expect(names).toContain("claude/opus-4.6");
      expect(names).toContain("opencode/big-pickle");
      expect(names).not.toContain("codex/gpt-5.4"); // openai not connected
      expect(names).not.toContain("qwen/qwen3-coder:free");
    });

    it("lists all models when view is all", () => {
      const ctx: ControlPlaneContext = {
        storedApiKeys: {},
        providerOverrides: [],
        models: mockModels,
      };

      const result = listModels(mockBaseProviders, ctx, { view: "all" });

      expect(result.view).toBe("all");
      expect(result.models).toHaveLength(5);
    });

    it("filters by vendor when view is vendor", () => {
      const ctx: ControlPlaneContext = {
        storedApiKeys: {},
        providerOverrides: [],
        models: mockModels,
      };

      const result = listModels(mockBaseProviders, ctx, {
        view: "vendor",
        providerId: "anthropic",
      });

      expect(result.view).toBe("vendor");
      expect(result.filter).toBe("anthropic");
      expect(result.models.every((m) => m.vendor === "anthropic")).toBe(true);
    });

    it("includes defaults by provider", () => {
      const ctx: ControlPlaneContext = {
        storedApiKeys: {},
        providerOverrides: [],
        models: mockModels,
      };

      const result = listModels(mockBaseProviders, ctx, { view: "all" });

      expect(result.defaultsByProvider["anthropic"]).toBeDefined();
      expect(result.defaultsByProvider["anthropic"].name).toBe(
        "claude/opus-4.6",
      );
      expect(result.defaultsByProvider["openai"]).toBeDefined();
      expect(result.defaultsByProvider["opencode"]).toBeDefined();
    });

    it("includes variant metadata in model list responses", () => {
      const ctx: ControlPlaneContext = {
        storedApiKeys: { ANTHROPIC_API_KEY: "sk-test" },
        providerOverrides: [],
        models: mockModels,
      };

      const result = listModels(mockBaseProviders, ctx);
      const opus = result.models.find(
        (model) => model.name === "claude/opus-4.6",
      );

      expect(opus?.defaultVariant).toBe("medium");
      expect(opus?.variants?.some((variant) => variant.id === "max")).toBe(
        true,
      );
    });
  });

  describe("computeDiscoveryFreshness", () => {
    it("marks provider as stale with no discovered models", () => {
      const ctx: ControlPlaneContext = {
        storedApiKeys: {},
        providerOverrides: [],
        models: mockModels.filter((m) => m.vendor !== "opencode"),
      };

      const result = computeDiscoveryFreshness(mockBaseProviders, ctx);
      const opencode = result.find((r) => r.providerId === "opencode");

      expect(opencode?.isStale).toBe(true);
      expect(opencode?.modelCount).toBe(0);
    });

    it("marks provider as fresh with recent discovered models", () => {
      const ctx: ControlPlaneContext = {
        storedApiKeys: {},
        providerOverrides: [],
        models: mockModels,
      };

      const result = computeDiscoveryFreshness(mockBaseProviders, ctx);
      const opencode = result.find((r) => r.providerId === "opencode");

      expect(opencode?.isStale).toBe(false);
      expect(opencode?.modelCount).toBe(1);
    });

    it("marks provider as stale with old discovered models", () => {
      const oldModels = mockModels.map((m) => {
        if (m.name === "opencode/big-pickle") {
          return {
            ...m,
            discoveredAt: Date.now() - 48 * 60 * 60 * 1000, // 48 hours ago
          };
        }
        return m;
      });

      const ctx: ControlPlaneContext = {
        storedApiKeys: {},
        providerOverrides: [],
        models: oldModels,
      };

      const result = computeDiscoveryFreshness(mockBaseProviders, ctx);
      const opencode = result.find((r) => r.providerId === "opencode");

      expect(opencode?.isStale).toBe(true);
    });

    it("only reports discovery-capable providers", () => {
      const ctx: ControlPlaneContext = {
        storedApiKeys: {},
        providerOverrides: [],
        models: mockModels,
      };

      const result = computeDiscoveryFreshness(mockBaseProviders, ctx);

      // Only opencode supports discovery in our test fixtures
      expect(result).toHaveLength(1);
      expect(result[0].providerId).toBe("opencode");
    });
  });
});
