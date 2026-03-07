import { describe, expect, it } from "vitest";
import {
  buildClaudeMcpServers,
  buildCodexMcpToml,
  buildGeminiMcpServers,
  buildOpencodeMcpConfig,
} from "./mcp-injection";
import type { McpServerConfig } from "./mcp-server-config";

describe("mcp-injection", () => {
  it("returns empty outputs for empty config arrays", () => {
    expect(buildClaudeMcpServers([])).toEqual({});
    expect(buildGeminiMcpServers([])).toEqual({});
    expect(buildCodexMcpToml([])).toBe("");
    expect(buildOpencodeMcpConfig([])).toEqual({});
  });

  it("builds Claude and Gemini MCP server maps", () => {
    const configs: McpServerConfig[] = [
      {
        name: "context7",
        command: "npx",
        args: ["-y", "@upstash/context7-mcp@latest"],
        envVars: {
          CONTEXT7_API_KEY: "token",
        },
      },
    ];

    const expected = {
      context7: {
        command: "npx",
        args: ["-y", "@upstash/context7-mcp@latest"],
        env: {
          CONTEXT7_API_KEY: "token",
        },
      },
    };

    expect(buildClaudeMcpServers(configs)).toEqual(expected);
    expect(buildGeminiMcpServers(configs)).toEqual(expected);
  });

  it("builds Codex TOML blocks for multiple MCP servers", () => {
    const configs: McpServerConfig[] = [
      {
        name: "context7",
        command: "npx",
        args: ["-y", "@upstash/context7-mcp@latest"],
      },
      {
        name: "my-server",
        command: "bunx",
        args: ["local-mcp"],
        envVars: {
          API_TOKEN: "secret",
        },
      },
    ];

    const toml = buildCodexMcpToml(configs);

    expect(toml).toContain("[mcp_servers.context7]");
    expect(toml).toContain('command = "npx"');
    expect(toml).toContain('args = ["-y","@upstash/context7-mcp@latest"]');
    expect(toml).toContain('[mcp_servers."my-server"]');
    expect(toml).toContain('[mcp_servers."my-server".env]');
    expect(toml).toContain('API_TOKEN = "secret"');
  });

  it("builds Opencode MCP config with command arrays and env vars", () => {
    const configs: McpServerConfig[] = [
      {
        name: "github",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github@latest"],
        envVars: {
          GITHUB_TOKEN: "ghp_test",
        },
      },
      {
        name: "filesystem",
        command: "npx",
        args: [
          "-y",
          "@modelcontextprotocol/server-filesystem@latest",
          "/root/workspace",
        ],
      },
    ];

    expect(buildOpencodeMcpConfig(configs)).toEqual({
      github: {
        type: "local",
        command: ["npx", "-y", "@modelcontextprotocol/server-github@latest"],
        enabled: true,
        env: {
          GITHUB_TOKEN: "ghp_test",
        },
      },
      filesystem: {
        type: "local",
        command: [
          "npx",
          "-y",
          "@modelcontextprotocol/server-filesystem@latest",
          "/root/workspace",
        ],
        enabled: true,
      },
    });
  });
});
