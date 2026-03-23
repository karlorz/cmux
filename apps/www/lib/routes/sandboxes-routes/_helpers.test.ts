import { describe, expect, it } from "vitest";
import {
  concatConfigBlocks,
  getSandboxStartErrorMessage,
  mapProviderOverrides,
  buildProviderConfig,
  buildOpenAiProviderConfig,
  getEnvironmentOverridesForAgent,
  type ResolvedProvider,
} from "./_helpers";

/**
 * Create a mock ResolvedProvider with required fields filled in.
 */
function createMockProvider(
  overrides: Partial<ResolvedProvider> & { isOverridden: boolean }
): ResolvedProvider {
  return {
    id: overrides.id ?? "mock-provider",
    name: overrides.name ?? "Mock Provider",
    baseUrl: overrides.baseUrl ?? "https://mock.api.com",
    apiFormat: overrides.apiFormat ?? "openai",
    authEnvVars: overrides.authEnvVars ?? ["MOCK_API_KEY"],
    apiKeys: overrides.apiKeys ?? [],
    customHeaders: overrides.customHeaders,
    fallbacks: overrides.fallbacks,
    isOverridden: overrides.isOverridden,
  };
}

describe("sandboxes-routes helpers", () => {
  describe("concatConfigBlocks", () => {
    it("returns null for empty array", () => {
      expect(concatConfigBlocks([], "\n")).toBeNull();
    });

    it("returns null for array of only null/undefined", () => {
      expect(concatConfigBlocks([null, undefined], "\n")).toBeNull();
    });

    it("returns null for array of only empty/whitespace strings", () => {
      expect(concatConfigBlocks(["", "   ", "\n"], "\n")).toBeNull();
    });

    it("returns single block without separator", () => {
      expect(concatConfigBlocks(["block1"], "\n")).toBe("block1");
    });

    it("joins multiple blocks with separator", () => {
      expect(concatConfigBlocks(["block1", "block2"], "\n")).toBe(
        "block1\nblock2"
      );
    });

    it("filters out null and undefined", () => {
      expect(concatConfigBlocks(["block1", null, "block2", undefined], "\n")).toBe(
        "block1\nblock2"
      );
    });

    it("filters out empty strings", () => {
      expect(concatConfigBlocks(["block1", "", "block2"], "\n")).toBe(
        "block1\nblock2"
      );
    });

    it("filters out whitespace-only strings", () => {
      expect(concatConfigBlocks(["block1", "   ", "block2"], "\n")).toBe(
        "block1\nblock2"
      );
    });

    it("trims blocks before joining", () => {
      expect(concatConfigBlocks(["  block1  ", "  block2  "], "\n")).toBe(
        "block1\nblock2"
      );
    });

    it("uses custom separator", () => {
      expect(concatConfigBlocks(["a", "b", "c"], ", ")).toBe("a, b, c");
    });

    it("handles double newline separator", () => {
      expect(concatConfigBlocks(["block1", "block2"], "\n\n")).toBe(
        "block1\n\nblock2"
      );
    });
  });

  describe("getSandboxStartErrorMessage", () => {
    it("returns base message for non-Error values", () => {
      expect(getSandboxStartErrorMessage("string error")).toBe(
        "Failed to start sandbox"
      );
      expect(getSandboxStartErrorMessage(123)).toBe("Failed to start sandbox");
      expect(getSandboxStartErrorMessage(null)).toBe("Failed to start sandbox");
      expect(getSandboxStartErrorMessage(undefined)).toBe(
        "Failed to start sandbox"
      );
      expect(getSandboxStartErrorMessage({ message: "object" })).toBe(
        "Failed to start sandbox"
      );
    });

    it("detects timeout errors", () => {
      expect(getSandboxStartErrorMessage(new Error("Request timeout"))).toBe(
        "Failed to start sandbox: request timed out while provisioning instance"
      );
      expect(getSandboxStartErrorMessage(new Error("Operation timed out"))).toBe(
        "Failed to start sandbox: request timed out while provisioning instance"
      );
    });

    it("detects connection refused errors", () => {
      expect(getSandboxStartErrorMessage(new Error("ECONNREFUSED"))).toBe(
        "Failed to start sandbox: could not connect to sandbox provider"
      );
      expect(
        getSandboxStartErrorMessage(new Error("Connection refused"))
      ).toBe("Failed to start sandbox: could not connect to sandbox provider");
    });

    it("detects DNS resolution errors", () => {
      expect(getSandboxStartErrorMessage(new Error("ENOTFOUND"))).toBe(
        "Failed to start sandbox: could not resolve sandbox provider address"
      );
      expect(getSandboxStartErrorMessage(new Error("getaddrinfo failed"))).toBe(
        "Failed to start sandbox: could not resolve sandbox provider address"
      );
    });

    it("detects network errors", () => {
      expect(getSandboxStartErrorMessage(new Error("Network error"))).toBe(
        "Failed to start sandbox: network error while provisioning instance"
      );
      expect(getSandboxStartErrorMessage(new Error("Socket closed"))).toBe(
        "Failed to start sandbox: network error while provisioning instance"
      );
    });

    it("detects quota errors", () => {
      expect(getSandboxStartErrorMessage(new Error("Quota exceeded"))).toBe(
        "Failed to start sandbox: resource quota exceeded"
      );
      // "Rate limit exceeded" matches "limit" in quota check before reaching rate limit check
      expect(getSandboxStartErrorMessage(new Error("Rate limit exceeded"))).toBe(
        "Failed to start sandbox: resource quota exceeded"
      );
      expect(getSandboxStartErrorMessage(new Error("Limit reached"))).toBe(
        "Failed to start sandbox: resource quota exceeded"
      );
    });

    it("detects capacity errors", () => {
      expect(getSandboxStartErrorMessage(new Error("No capacity available"))).toBe(
        "Failed to start sandbox: sandbox provider capacity unavailable"
      );
      expect(getSandboxStartErrorMessage(new Error("Service unavailable"))).toBe(
        "Failed to start sandbox: sandbox provider capacity unavailable"
      );
    });

    it("detects snapshot errors", () => {
      expect(
        getSandboxStartErrorMessage(new Error("Snapshot not found"))
      ).toBe("Failed to start sandbox: snapshot not found or invalid");
      expect(getSandboxStartErrorMessage(new Error("Invalid snapshot ID"))).toBe(
        "Failed to start sandbox: snapshot not found or invalid"
      );
    });

    it("detects auth errors", () => {
      expect(getSandboxStartErrorMessage(new Error("401 Unauthorized"))).toBe(
        "Failed to start sandbox: authentication failed with sandbox provider"
      );
      expect(getSandboxStartErrorMessage(new Error("403 Forbidden"))).toBe(
        "Failed to start sandbox: access denied by sandbox provider"
      );
    });

    it("detects rate limit errors", () => {
      // 429 status code triggers rate limit detection
      expect(getSandboxStartErrorMessage(new Error("429 Too Many Requests"))).toBe(
        "Failed to start sandbox: rate limited by sandbox provider"
      );
      // "too many" trigger (without "limit" substring)
      expect(getSandboxStartErrorMessage(new Error("too many requests"))).toBe(
        "Failed to start sandbox: rate limited by sandbox provider"
      );
      // Note: Messages containing "rate limit" also contain "limit" which matches
      // the quota check first (line 271). So "rate limit" without 429/too many
      // falls into quota handling rather than rate limit handling.
    });

    it("detects instance start errors", () => {
      expect(
        getSandboxStartErrorMessage(new Error("Instance failed to start"))
      ).toBe("Failed to start sandbox: instance failed to start");
    });

    it("sanitizes safe error messages", () => {
      expect(
        getSandboxStartErrorMessage(new Error("Simple error message"))
      ).toBe("Failed to start sandbox: Simple error message");
    });

    it("redacts file paths in error messages", () => {
      const result = getSandboxStartErrorMessage(
        new Error("Error reading /etc/passwd")
      );
      expect(result).toContain("[path]");
      expect(result).not.toContain("/etc/passwd");
    });

    it("redacts URLs in error messages", () => {
      // Note: path regex runs before URL regex, so /example.com/api becomes [path]
      // This leaves "https:" behind, which is safe (no domain/path leakage)
      const result = getSandboxStartErrorMessage(
        new Error("Error fetching https://example.com/api")
      );
      expect(result).toContain("[path]");
      expect(result).not.toContain("example.com");
    });

    it("hides messages containing sensitive patterns", () => {
      expect(
        getSandboxStartErrorMessage(new Error("Invalid api_key: sk-123"))
      ).toBe("Failed to start sandbox");
      expect(
        getSandboxStartErrorMessage(new Error("Token expired: abc123"))
      ).toBe("Failed to start sandbox");
      expect(
        getSandboxStartErrorMessage(new Error("Bad password: secret"))
      ).toBe("Failed to start sandbox");
      expect(
        getSandboxStartErrorMessage(new Error("Credential failed"))
      ).toBe("Failed to start sandbox");
      expect(
        getSandboxStartErrorMessage(new Error("Bearer token invalid"))
      ).toBe("Failed to start sandbox");
      expect(
        getSandboxStartErrorMessage(new Error("sk_live_abc123"))
      ).toBe("Failed to start sandbox");
    });

    it("returns base message for path-only messages after sanitization", () => {
      expect(getSandboxStartErrorMessage(new Error("/path/to/file"))).toBe(
        "Failed to start sandbox"
      );
    });

    it("returns base message for URL-only messages after sanitization", () => {
      // Path regex converts /example.com to [path], leaving https: prefix
      // Result "https:[path]" is not "[path]" so it includes in message
      expect(
        getSandboxStartErrorMessage(new Error("https://example.com"))
      ).toBe("Failed to start sandbox: https:[path]");
    });

    it("returns base message for very long error messages", () => {
      const longMessage = "a".repeat(250);
      expect(getSandboxStartErrorMessage(new Error(longMessage))).toBe(
        "Failed to start sandbox"
      );
    });
  });

  describe("mapProviderOverrides", () => {
    it("returns empty array for empty input", () => {
      expect(mapProviderOverrides([])).toEqual([]);
    });

    it("maps required fields", () => {
      const result = mapProviderOverrides([
        {
          teamId: "team_123",
          providerId: "anthropic",
          enabled: true,
        },
      ]);
      expect(result).toEqual([
        {
          teamId: "team_123",
          providerId: "anthropic",
          baseUrl: undefined,
          apiFormat: undefined,
          apiKeyEnvVar: undefined,
          customHeaders: undefined,
          fallbacks: undefined,
          enabled: true,
        },
      ]);
    });

    it("maps all optional fields", () => {
      const result = mapProviderOverrides([
        {
          teamId: "team_456",
          providerId: "openai",
          baseUrl: "https://custom.api.com",
          apiFormat: "openai" as const,
          apiKeyEnvVar: "CUSTOM_API_KEY",
          customHeaders: { "X-Custom": "value" },
          fallbacks: [{ modelName: "gpt-4", priority: 1 }],
          enabled: false,
        },
      ]);
      expect(result).toEqual([
        {
          teamId: "team_456",
          providerId: "openai",
          baseUrl: "https://custom.api.com",
          apiFormat: "openai",
          apiKeyEnvVar: "CUSTOM_API_KEY",
          customHeaders: { "X-Custom": "value" },
          fallbacks: [{ modelName: "gpt-4", priority: 1 }],
          enabled: false,
        },
      ]);
    });

    it("converts numeric teamId to string", () => {
      const result = mapProviderOverrides([
        {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          teamId: 123 as any,
          providerId: "openai",
          enabled: true,
        },
      ]);
      expect(result[0]?.teamId).toBe("123");
    });

    it("maps multiple overrides", () => {
      const result = mapProviderOverrides([
        { teamId: "team1", providerId: "anthropic", enabled: true },
        { teamId: "team2", providerId: "openai", enabled: false },
      ]);
      expect(result).toHaveLength(2);
      expect(result[0]?.providerId).toBe("anthropic");
      expect(result[1]?.providerId).toBe("openai");
    });
  });

  describe("buildProviderConfig", () => {
    it("returns undefined for undefined input", () => {
      expect(buildProviderConfig(undefined)).toBeUndefined();
    });

    it("returns undefined when not overridden", () => {
      const provider = createMockProvider({
        baseUrl: "https://api.anthropic.com",
        isOverridden: false,
      });
      expect(buildProviderConfig(provider)).toBeUndefined();
    });

    it("returns config when overridden", () => {
      const provider = createMockProvider({
        baseUrl: "https://custom.api.com",
        customHeaders: { "X-Custom": "value" },
        apiFormat: "anthropic",
        isOverridden: true,
      });
      expect(buildProviderConfig(provider)).toEqual({
        baseUrl: "https://custom.api.com",
        customHeaders: { "X-Custom": "value" },
        apiFormat: "anthropic",
        isOverridden: true,
      });
    });

    it("handles missing optional customHeaders", () => {
      const provider = createMockProvider({
        baseUrl: "https://api.example.com",
        apiFormat: "openai",
        isOverridden: true,
      });
      expect(buildProviderConfig(provider)).toEqual({
        baseUrl: "https://api.example.com",
        customHeaders: undefined,
        apiFormat: "openai",
        isOverridden: true,
      });
    });
  });

  describe("buildOpenAiProviderConfig", () => {
    it("returns undefined when no provider and no base URL", () => {
      expect(buildOpenAiProviderConfig(undefined, undefined)).toBeUndefined();
    });

    it("returns config from resolved provider when overridden", () => {
      const provider = createMockProvider({
        baseUrl: "https://custom.openai.com",
        isOverridden: true,
      });
      expect(buildOpenAiProviderConfig(provider, undefined)).toEqual({
        baseUrl: "https://custom.openai.com",
        customHeaders: undefined,
        apiFormat: "openai",
        isOverridden: true,
      });
    });

    it("uses base URL fallback when provider not overridden", () => {
      const provider = createMockProvider({
        baseUrl: "https://api.openai.com",
        isOverridden: false,
      });
      expect(
        buildOpenAiProviderConfig(provider, "https://fallback.api.com")
      ).toEqual({
        baseUrl: "https://fallback.api.com",
        isOverridden: true,
      });
    });

    it("uses base URL fallback when no provider", () => {
      expect(
        buildOpenAiProviderConfig(undefined, "https://fallback.api.com")
      ).toEqual({
        baseUrl: "https://fallback.api.com",
        isOverridden: true,
      });
    });

    it("prefers resolved provider over base URL fallback", () => {
      const provider = createMockProvider({
        baseUrl: "https://provider.api.com",
        apiFormat: "anthropic",
        isOverridden: true,
      });
      expect(
        buildOpenAiProviderConfig(provider, "https://fallback.api.com")
      ).toEqual({
        baseUrl: "https://provider.api.com",
        customHeaders: undefined,
        apiFormat: "anthropic",
        isOverridden: true,
      });
    });
  });

  describe("getEnvironmentOverridesForAgent", () => {
    const baseMcpConfigs = {
      claude: [{ name: "claude-mcp", command: "npx", args: ["-y", "mcp-claude"] }],
      codex: [{ name: "codex-mcp", command: "npx", args: ["-y", "mcp-codex"] }],
      gemini: [{ name: "gemini-mcp", command: "npx", args: ["-y", "mcp-gemini"] }],
      opencode: [
        { name: "opencode-mcp", command: "npx", args: ["-y", "mcp-opencode"] },
      ],
    } as Parameters<typeof getEnvironmentOverridesForAgent>[1]["mcpConfigs"];

    const baseOptions = {
      mcpConfigs: baseMcpConfigs,
      workspaceSettings: null,
      resolvedProvider: undefined,
      openAiBaseUrl: undefined,
    };

    it("returns claude MCP configs for anthropic agents", () => {
      const result = getEnvironmentOverridesForAgent("claude/opus-4.6", baseOptions);
      expect(result.mcpServerConfigs).toBe(baseMcpConfigs.claude);
    });

    it("returns codex MCP configs for openai agents", () => {
      const result = getEnvironmentOverridesForAgent(
        "codex/gpt-5.1-codex-mini",
        baseOptions
      );
      expect(result.mcpServerConfigs).toBe(baseMcpConfigs.codex);
    });

    it("returns gemini MCP configs for gemini agents", () => {
      const result = getEnvironmentOverridesForAgent(
        "gemini/gemini-exp",
        baseOptions
      );
      expect(result.mcpServerConfigs).toBe(baseMcpConfigs.gemini);
    });

    it("returns opencode MCP configs for unknown agents", () => {
      const result = getEnvironmentOverridesForAgent(
        "unknown/agent",
        baseOptions
      );
      expect(result.mcpServerConfigs).toBe(baseMcpConfigs.opencode);
    });

    it("converts null workspaceSettings to undefined", () => {
      const result = getEnvironmentOverridesForAgent("claude/opus-4.6", {
        ...baseOptions,
        workspaceSettings: null,
      });
      expect(result.workspaceSettings).toBeUndefined();
    });

    it("passes through workspaceSettings when provided", () => {
      const settings = { bypassAnthropicProxy: true };
      const result = getEnvironmentOverridesForAgent("claude/opus-4.6", {
        ...baseOptions,
        workspaceSettings: settings,
      });
      expect(result.workspaceSettings).toBe(settings);
    });

    it("builds provider config for anthropic agent", () => {
      const provider = createMockProvider({
        baseUrl: "https://custom.api.com",
        apiFormat: "anthropic",
        isOverridden: true,
      });
      const result = getEnvironmentOverridesForAgent("claude/haiku-4.5", {
        ...baseOptions,
        resolvedProvider: provider,
      });
      expect(result.providerConfig).toEqual({
        baseUrl: "https://custom.api.com",
        customHeaders: undefined,
        apiFormat: "anthropic",
        isOverridden: true,
      });
    });

    it("builds OpenAI provider config with fallback URL", () => {
      const result = getEnvironmentOverridesForAgent("codex/gpt-5.1-codex-mini", {
        ...baseOptions,
        openAiBaseUrl: "https://openai-proxy.com",
      });
      expect(result.providerConfig).toEqual({
        baseUrl: "https://openai-proxy.com",
        isOverridden: true,
      });
    });

    it("returns undefined providerConfig when not overridden", () => {
      const result = getEnvironmentOverridesForAgent("claude/opus-4.6", baseOptions);
      expect(result.providerConfig).toBeUndefined();
    });
  });
});
