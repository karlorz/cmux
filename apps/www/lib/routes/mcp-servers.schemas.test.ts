import { describe, expect, it } from "vitest";
import {
  formatMcpServerConfigList,
  formatMcpServerPresetList,
  ScopeSchema,
  McpServerConfigSchema,
  UpsertMcpServerBody,
} from "./mcp-servers.schemas";

describe("mcp-servers.schemas", () => {
  describe("formatMcpServerPresetList", () => {
    it("returns presets array", () => {
      const presets = formatMcpServerPresetList();
      expect(Array.isArray(presets)).toBe(true);
      expect(presets.length).toBeGreaterThan(0);
    });

    it("each preset has required fields", () => {
      const presets = formatMcpServerPresetList();
      for (const preset of presets) {
        expect(preset).toHaveProperty("name");
        expect(preset).toHaveProperty("displayName");
        expect(preset).toHaveProperty("description");
        expect(preset).toHaveProperty("command");
        expect(preset).toHaveProperty("args");
        expect(preset).toHaveProperty("tags");
        expect(preset).toHaveProperty("supportedAgents");
      }
    });
  });

  describe("formatMcpServerConfigList", () => {
    it("returns empty array for empty input", () => {
      const result = formatMcpServerConfigList([]);
      expect(result).toEqual([]);
    });

    it("formats stdio config correctly", () => {
      const result = formatMcpServerConfigList([
        {
          _id: "config_123",
          name: "test-server",
          displayName: "Test Server",
          type: "stdio",
          command: "node",
          args: ["server.js"],
          enabledClaude: true,
          enabledCodex: false,
          enabledGemini: true,
          enabledOpencode: false,
          scope: "global",
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
        },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        _id: "config_123",
        name: "test-server",
        displayName: "Test Server",
        type: "stdio",
        command: "node",
        args: ["server.js"],
        hasEnvVars: false,
        envVarKeys: [],
        description: undefined,
        tags: undefined,
        enabledClaude: true,
        enabledCodex: false,
        enabledGemini: true,
        enabledOpencode: false,
        scope: "global",
        projectFullName: undefined,
        sourcePresetId: undefined,
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      });
    });

    it("formats http config correctly", () => {
      const result = formatMcpServerConfigList([
        {
          _id: "config_456",
          name: "remote-server",
          displayName: "Remote Server",
          type: "http",
          url: "https://example.com/mcp",
          headers: { Authorization: "Bearer token" },
          enabledClaude: true,
          enabledCodex: true,
          enabledGemini: false,
          enabledOpencode: false,
          scope: "workspace",
          projectFullName: "owner/repo",
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
        },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        _id: "config_456",
        type: "http",
        url: "https://example.com/mcp",
        headers: { Authorization: "Bearer token" },
        scope: "workspace",
        projectFullName: "owner/repo",
      });
    });

    it("formats sse config correctly", () => {
      const result = formatMcpServerConfigList([
        {
          _id: "config_789",
          name: "sse-server",
          displayName: "SSE Server",
          type: "sse",
          url: "https://example.com/sse",
          enabledClaude: false,
          enabledCodex: false,
          enabledGemini: true,
          enabledOpencode: true,
          scope: "global",
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
        },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        _id: "config_789",
        type: "sse",
        url: "https://example.com/sse",
      });
    });

    it("extracts envVarKeys from envVars", () => {
      const result = formatMcpServerConfigList([
        {
          _id: "config_env",
          name: "env-server",
          displayName: "Env Server",
          type: "stdio",
          command: "node",
          args: [],
          envVars: {
            API_KEY: "secret",
            DATABASE_URL: "postgres://localhost",
          },
          enabledClaude: true,
          enabledCodex: true,
          enabledGemini: true,
          enabledOpencode: true,
          scope: "global",
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
        },
      ]);

      expect(result[0]?.hasEnvVars).toBe(true);
      expect(result[0]?.envVarKeys).toContain("API_KEY");
      expect(result[0]?.envVarKeys).toContain("DATABASE_URL");
      expect(result[0]?.envVarKeys).toHaveLength(2);
    });

    it("handles missing optional fields for stdio", () => {
      const result = formatMcpServerConfigList([
        {
          _id: "config_min",
          name: "minimal",
          displayName: "Minimal",
          type: "stdio",
          // command and args missing
          enabledClaude: false,
          enabledCodex: false,
          enabledGemini: false,
          enabledOpencode: false,
          scope: "global",
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
        },
      ]);

      expect(result[0]).toMatchObject({
        type: "stdio",
        command: "",
        args: [],
      });
    });

    it("handles missing url for http/sse", () => {
      const result = formatMcpServerConfigList([
        {
          _id: "config_nourl",
          name: "no-url",
          displayName: "No URL",
          type: "http",
          // url missing
          enabledClaude: true,
          enabledCodex: true,
          enabledGemini: true,
          enabledOpencode: true,
          scope: "global",
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
        },
      ]);

      expect(result[0]).toMatchObject({
        type: "http",
        url: "",
      });
    });

    it("processes multiple configs", () => {
      const result = formatMcpServerConfigList([
        {
          _id: "1",
          name: "server1",
          displayName: "Server 1",
          type: "stdio",
          command: "cmd1",
          args: [],
          enabledClaude: true,
          enabledCodex: false,
          enabledGemini: false,
          enabledOpencode: false,
          scope: "global",
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
        },
        {
          _id: "2",
          name: "server2",
          displayName: "Server 2",
          type: "http",
          url: "https://example.com",
          enabledClaude: false,
          enabledCodex: true,
          enabledGemini: false,
          enabledOpencode: false,
          scope: "workspace",
          projectFullName: "org/repo",
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
        },
      ]);

      expect(result).toHaveLength(2);
      expect(result[0]?.type).toBe("stdio");
      expect(result[1]?.type).toBe("http");
    });
  });

  describe("ScopeSchema", () => {
    it("accepts valid scopes", () => {
      expect(ScopeSchema.safeParse("global").success).toBe(true);
      expect(ScopeSchema.safeParse("workspace").success).toBe(true);
    });

    it("rejects invalid scopes", () => {
      expect(ScopeSchema.safeParse("invalid").success).toBe(false);
      expect(ScopeSchema.safeParse("").success).toBe(false);
      expect(ScopeSchema.safeParse(123).success).toBe(false);
    });
  });

  describe("McpServerConfigSchema", () => {
    it("validates stdio config", () => {
      const result = McpServerConfigSchema.safeParse({
        _id: "config_123",
        name: "test",
        displayName: "Test",
        type: "stdio",
        command: "node",
        args: ["index.js"],
        enabledClaude: true,
        enabledCodex: true,
        enabledGemini: true,
        enabledOpencode: true,
        scope: "global",
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      });
      expect(result.success).toBe(true);
    });

    it("validates http config", () => {
      const result = McpServerConfigSchema.safeParse({
        _id: "config_456",
        name: "remote",
        displayName: "Remote",
        type: "http",
        url: "https://example.com/mcp",
        enabledClaude: true,
        enabledCodex: true,
        enabledGemini: true,
        enabledOpencode: true,
        scope: "workspace",
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      });
      expect(result.success).toBe(true);
    });

    it("validates sse config", () => {
      const result = McpServerConfigSchema.safeParse({
        _id: "config_789",
        name: "sse",
        displayName: "SSE",
        type: "sse",
        url: "https://example.com/sse",
        enabledClaude: true,
        enabledCodex: true,
        enabledGemini: true,
        enabledOpencode: true,
        scope: "global",
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid type", () => {
      const result = McpServerConfigSchema.safeParse({
        _id: "config_bad",
        name: "bad",
        displayName: "Bad",
        type: "invalid",
        enabledClaude: true,
        enabledCodex: true,
        enabledGemini: true,
        enabledOpencode: true,
        scope: "global",
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("UpsertMcpServerBody", () => {
    it("validates stdio upsert body", () => {
      const result = UpsertMcpServerBody.safeParse({
        name: "new-server",
        displayName: "New Server",
        type: "stdio",
        command: "npx",
        args: ["-y", "mcp-server"],
        enabledClaude: true,
        enabledCodex: true,
        enabledGemini: true,
        enabledOpencode: true,
        scope: "global",
      });
      expect(result.success).toBe(true);
    });

    it("validates http upsert body", () => {
      const result = UpsertMcpServerBody.safeParse({
        name: "http-server",
        displayName: "HTTP Server",
        type: "http",
        url: "https://api.example.com/mcp",
        enabledClaude: true,
        enabledCodex: false,
        enabledGemini: false,
        enabledOpencode: false,
        scope: "workspace",
        projectFullName: "owner/repo",
      });
      expect(result.success).toBe(true);
    });

    it("validates sse upsert body", () => {
      const result = UpsertMcpServerBody.safeParse({
        name: "sse-server",
        displayName: "SSE Server",
        type: "sse",
        url: "https://stream.example.com/mcp",
        enabledClaude: true,
        enabledCodex: true,
        enabledGemini: true,
        enabledOpencode: true,
        scope: "global",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing required fields", () => {
      const result = UpsertMcpServerBody.safeParse({
        name: "incomplete",
        // missing other required fields
      });
      expect(result.success).toBe(false);
    });

    it("accepts optional envVars", () => {
      const result = UpsertMcpServerBody.safeParse({
        name: "with-env",
        displayName: "With Env",
        type: "stdio",
        command: "node",
        args: [],
        envVars: { SECRET: "value" },
        enabledClaude: true,
        enabledCodex: true,
        enabledGemini: true,
        enabledOpencode: true,
        scope: "global",
      });
      expect(result.success).toBe(true);
    });
  });
});
