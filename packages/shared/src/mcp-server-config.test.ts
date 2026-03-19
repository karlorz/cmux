import { describe, expect, it } from "vitest";
import {
  isRemoteMcpServerConfig,
  isStdioMcpServerConfig,
  normalizeMcpServerConfig,
  type McpServerConfig,
} from "./mcp-server-config";

describe("isRemoteMcpServerConfig", () => {
  it("returns true for http type", () => {
    const config: McpServerConfig = {
      name: "test",
      type: "http",
      url: "https://example.com",
    };
    expect(isRemoteMcpServerConfig(config)).toBe(true);
  });

  it("returns true for sse type", () => {
    const config: McpServerConfig = {
      name: "test",
      type: "sse",
      url: "https://example.com/sse",
    };
    expect(isRemoteMcpServerConfig(config)).toBe(true);
  });

  it("returns false for stdio type", () => {
    const config: McpServerConfig = {
      name: "test",
      type: "stdio",
      command: "node",
      args: ["server.js"],
    };
    expect(isRemoteMcpServerConfig(config)).toBe(false);
  });
});

describe("isStdioMcpServerConfig", () => {
  it("returns true for stdio type", () => {
    const config: McpServerConfig = {
      name: "test",
      type: "stdio",
      command: "python",
      args: ["-m", "mcp_server"],
    };
    expect(isStdioMcpServerConfig(config)).toBe(true);
  });

  it("returns false for http type", () => {
    const config: McpServerConfig = {
      name: "test",
      type: "http",
      url: "https://example.com",
    };
    expect(isStdioMcpServerConfig(config)).toBe(false);
  });

  it("returns false for sse type", () => {
    const config: McpServerConfig = {
      name: "test",
      type: "sse",
      url: "https://example.com/sse",
    };
    expect(isStdioMcpServerConfig(config)).toBe(false);
  });
});

describe("normalizeMcpServerConfig", () => {
  describe("stdio configs", () => {
    it("normalizes stdio config with all fields", () => {
      const result = normalizeMcpServerConfig({
        name: "my-server",
        type: "stdio",
        command: "node",
        args: ["server.js", "--port", "3000"],
        envVars: { NODE_ENV: "production" },
      });
      expect(result).toEqual({
        name: "my-server",
        type: "stdio",
        command: "node",
        args: ["server.js", "--port", "3000"],
        envVars: { NODE_ENV: "production" },
      });
    });

    it("defaults to stdio when type not specified", () => {
      const result = normalizeMcpServerConfig({
        name: "server",
        command: "python",
      });
      expect(result.type).toBe("stdio");
    });

    it("defaults command to empty string", () => {
      const result = normalizeMcpServerConfig({
        name: "server",
        type: "stdio",
      });
      expect((result as { command: string }).command).toBe("");
    });

    it("defaults args to empty array", () => {
      const result = normalizeMcpServerConfig({
        name: "server",
        type: "stdio",
        command: "node",
      });
      expect((result as { args: string[] }).args).toEqual([]);
    });

    it("omits envVars when not provided", () => {
      const result = normalizeMcpServerConfig({
        name: "server",
        type: "stdio",
        command: "node",
        args: [],
      });
      expect("envVars" in result).toBe(false);
    });
  });

  describe("http configs", () => {
    it("normalizes http config with all fields", () => {
      const result = normalizeMcpServerConfig({
        name: "remote-server",
        type: "http",
        url: "https://api.example.com",
        headers: { Authorization: "Bearer token" },
        envVars: { API_KEY: "secret" },
      });
      expect(result).toEqual({
        name: "remote-server",
        type: "http",
        url: "https://api.example.com",
        headers: { Authorization: "Bearer token" },
        envVars: { API_KEY: "secret" },
      });
    });

    it("defaults url to empty string", () => {
      const result = normalizeMcpServerConfig({
        name: "server",
        type: "http",
      });
      expect((result as { url: string }).url).toBe("");
    });

    it("omits headers when not provided", () => {
      const result = normalizeMcpServerConfig({
        name: "server",
        type: "http",
        url: "https://example.com",
      });
      expect("headers" in result).toBe(false);
    });
  });

  describe("sse configs", () => {
    it("normalizes sse config", () => {
      const result = normalizeMcpServerConfig({
        name: "sse-server",
        type: "sse",
        url: "https://example.com/events",
      });
      expect(result).toEqual({
        name: "sse-server",
        type: "sse",
        url: "https://example.com/events",
      });
    });

    it("includes headers for sse config", () => {
      const result = normalizeMcpServerConfig({
        name: "sse-server",
        type: "sse",
        url: "https://example.com/events",
        headers: { "X-Custom": "header" },
      });
      expect((result as { headers?: Record<string, string> }).headers).toEqual({
        "X-Custom": "header",
      });
    });
  });
});
