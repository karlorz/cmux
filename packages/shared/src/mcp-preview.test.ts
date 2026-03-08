import { describe, expect, it } from "vitest";
import {
  buildMergedClaudeConfig,
  buildMergedClaudePreview,
  buildMergedCodexConfigToml,
  buildMergedCodexPreview,
  previewOpencodeMcpServers,
} from "./mcp-preview";
import type { McpServerConfig } from "./mcp-server-config";

const STDIO_CONFIG: McpServerConfig = {
  name: "context7",
  type: "stdio",
  command: "npx",
  args: ["-y", "@upstash/context7-mcp@latest"],
  envVars: { CONTEXT7_API_KEY: "token" },
};

const REMOTE_CONFIG: McpServerConfig = {
  name: "remote-api",
  type: "http",
  url: "https://example.com/mcp",
  headers: { Authorization: "Bearer secret" },
  envVars: { MCP_SESSION: "session-token" },
};

describe("buildMergedClaudeConfig", () => {
  it("preserves unrelated host config and merges managed MCP servers", () => {
    const result = buildMergedClaudeConfig({
      hostConfigText: JSON.stringify({
        theme: "dark",
        mcpServers: {
          localtools: {
            command: "node",
            args: ["server.js"],
          },
          context7: {
            command: "old",
            args: ["stale"],
          },
          "devsh-memory": {
            command: "echo",
            args: ["hijacked"],
          },
        },
      }),
      mcpServerConfigs: [STDIO_CONFIG, REMOTE_CONFIG],
      agentName: "claude/opus-4.6",
    });

    expect(result.theme).toBe("dark");
    expect(result.mcpServers).toEqual({
      localtools: {
        command: "node",
        args: ["server.js"],
      },
      context7: {
        command: "npx",
        args: ["-y", "@upstash/context7-mcp@latest"],
        env: { CONTEXT7_API_KEY: "token" },
      },
      "remote-api": {
        type: "http",
        url: "https://example.com/mcp",
        headers: { Authorization: "Bearer secret" },
        env: { MCP_SESSION: "session-token" },
      },
      "devsh-memory": {
        command: "npx",
        args: ["-y", "devsh-memory-mcp@latest", "--agent", "claude/opus-4.6"],
      },
    });
  });

  it("falls back cleanly when host config is missing or invalid", () => {
    expect(
      JSON.parse(
        buildMergedClaudePreview({
          hostConfigText: "{not json",
          mcpServerConfigs: [STDIO_CONFIG],
        }),
      ),
    ).toEqual({
      mcpServers: {
        context7: {
          command: "npx",
          args: ["-y", "@upstash/context7-mcp@latest"],
          env: { CONTEXT7_API_KEY: "[REDACTED]" },
        },
        "devsh-memory": {
          command: "npx",
          args: ["-y", "devsh-memory-mcp@latest"],
        },
      },
    });
  });

  it("redacts sensitive Claude preview values while preserving MCP structure", () => {
    expect(
      JSON.parse(
        buildMergedClaudePreview({
          hostConfigText: JSON.stringify({
            theme: "dark",
            projects: {
              "/tmp/project": {
                apiKeyHelper: "/tmp/helper",
              },
            },
            mcpServers: {
              existing: {
                command: "node",
                args: ["server.js", "--api-key", "secret-key"],
                env: {
                  API_TOKEN: "abc123",
                },
              },
            },
          }),
          mcpServerConfigs: [REMOTE_CONFIG],
        }),
      ),
    ).toEqual({
      mcpServers: {
        existing: {
          command: "node",
          args: ["server.js", "--api-key", "[REDACTED]"],
          env: {
            API_TOKEN: "[REDACTED]",
          },
        },
        "remote-api": {
          type: "http",
          url: "https://example.com/mcp",
          headers: {
            Authorization: "Bearer [REDACTED]",
          },
          env: {
            MCP_SESSION: "[REDACTED]",
          },
        },
        "devsh-memory": {
          command: "npx",
          args: ["-y", "devsh-memory-mcp@latest"],
        },
      },
    });
  });
});

describe("buildMergedCodexConfigToml", () => {
  it("strips filtered keys, preserves unrelated sections, replaces stale devsh-memory, and appends managed MCP blocks", () => {
    const toml = buildMergedCodexConfigToml({
      hostConfigText: `model = "gpt-5"
model_reasoning_effort = "high"
approval_policy = "on-request"
notify = ["/tmp/notify.sh"]

[profiles.default]
color = "blue"

[mcp_servers.context7]
type = "stdio"
command = "echo"
args = ["stale"]

[mcp_servers.devsh-memory]
type = "stdio"
command = "echo"
args = ["stale-memory"]

[mcp_servers.devsh-memory.env]
TOKEN = "stale"
`,
      mcpServerConfigs: [STDIO_CONFIG, REMOTE_CONFIG],
      agentName: "codex/gpt-5.3-codex-xhigh",
    });

    expect(toml).not.toContain('model = "gpt-5"');
    expect(toml).not.toContain('model_reasoning_effort = "high"');
    expect(toml).toContain('approval_policy = "never"');
    expect(toml).toContain('notify = ["/tmp/notify.sh"]');
    expect(toml).toContain('[profiles.default]');
    expect(toml).toContain('color = "blue"');
    expect(toml).toContain('[notice.model_migrations]');
    expect(toml).toContain('[mcp_servers.devsh-memory]');
    expect(toml).toContain(
      'args = ["-y","devsh-memory-mcp@latest","--agent","codex/gpt-5.3-codex-xhigh"]',
    );
    expect(toml).not.toContain('stale-memory');
    expect(toml).not.toContain('TOKEN = "stale"');
    expect(toml).toContain('[mcp_servers.context7]');
    expect(toml).toContain('command = "npx"');
    expect(toml).toContain('[mcp_servers."remote-api"]');
    expect(toml).toContain('[mcp_servers."remote-api".headers]');
    expect(toml.match(/\[mcp_servers\.context7\]/g)).toHaveLength(1);
  });
});

describe("buildMergedCodexPreview", () => {
  it("redacts sensitive Codex preview values and limits output to MCP sections", () => {
    const toml = buildMergedCodexPreview({
      hostConfigText: `approval_policy = "on-request"
notify = ["/tmp/notify.sh"]

[profiles.default]
color = "blue"

[mcp_servers.context7]
type = "stdio"
command = "echo"
args = ["stale", "--api-key=secret"]

[mcp_servers."remote-api"]
type = "http"
url = "https://example.com/mcp"

[mcp_servers."remote-api".headers]
Authorization = "Bearer host-secret"
`,
      mcpServerConfigs: [STDIO_CONFIG, REMOTE_CONFIG],
      agentName: "codex/gpt-5.3-codex-xhigh",
    });

    expect(toml).not.toContain('approval_policy = "never"');
    expect(toml).not.toContain('[profiles.default]');
    expect(toml).toContain('[mcp_servers.devsh-memory]');
    expect(toml).toContain(
      'args = ["-y","devsh-memory-mcp@latest","--agent","codex/gpt-5.3-codex-xhigh"]',
    );
    expect(toml).toContain('[mcp_servers.context7]');
    expect(toml).toContain('command = "npx"');
    expect(toml).toContain('[mcp_servers."remote-api".headers]');
    expect(toml).toContain('Authorization = "Bearer [REDACTED]"');
    expect(toml).toContain('MCP_SESSION = "[REDACTED]"');
    expect(toml).not.toContain('host-secret');
    expect(toml).not.toContain('session-token');
  });

  it("falls back to managed preview when the host file is missing", () => {
    const toml = buildMergedCodexPreview({
      hostConfigText: undefined,
      mcpServerConfigs: [],
    });

    expect(toml).toContain('[mcp_servers.devsh-memory]');
    expect(toml).not.toContain('notify = ["/root/lifecycle/codex-notify.sh"]');
    expect(toml).not.toContain('approval_policy = "never"');
  });
});

describe("previewOpencodeMcpServers", () => {
  it("returns empty object for empty configs", () => {
    expect(previewOpencodeMcpServers([])).toEqual({});
  });

  it("converts stdio to local and remote to remote", () => {
    const result = previewOpencodeMcpServers([STDIO_CONFIG, REMOTE_CONFIG]);
    expect(result.context7).toEqual({
      type: "local",
      command: ["npx", "-y", "@upstash/context7-mcp@latest"],
      enabled: true,
      environment: { CONTEXT7_API_KEY: "token" },
    });
    expect(result["remote-api"]).toEqual({
      type: "remote",
      url: "https://example.com/mcp",
      headers: { Authorization: "Bearer secret" },
      enabled: true,
      environment: { MCP_SESSION: "session-token" },
    });
  });
});
