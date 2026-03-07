import type { McpServerConfig } from "./mcp-server-config";

export interface McpServerPresetSupportedAgents {
  claude: boolean;
  codex: boolean;
  gemini: boolean;
  opencode: boolean;
}

export interface McpServerPreset extends McpServerConfig {
  displayName: string;
  description: string;
  tags: string[];
  supportedAgents: McpServerPresetSupportedAgents;
}

export const MCP_SERVER_PRESETS: readonly McpServerPreset[] = [
  {
    name: "context7",
    displayName: "Context7",
    description: "Library and framework documentation lookup via Context7.",
    command: "npx",
    args: ["-y", "@upstash/context7-mcp@latest"],
    tags: ["docs", "reference", "libraries"],
    supportedAgents: {
      claude: true,
      codex: true,
      gemini: true,
      opencode: true,
    },
  },
  {
    name: "github",
    displayName: "GitHub",
    description: "GitHub repository, issue, and pull request operations.",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github@latest"],
    tags: ["github", "git", "pull-requests"],
    supportedAgents: {
      claude: true,
      codex: true,
      gemini: true,
      opencode: true,
    },
  },
  {
    name: "filesystem",
    displayName: "Filesystem",
    description: "Filesystem access scoped to the sandbox workspace.",
    command: "npx",
    args: [
      "-y",
      "@modelcontextprotocol/server-filesystem@latest",
      "/root/workspace",
    ],
    tags: ["filesystem", "workspace", "local"],
    supportedAgents: {
      claude: true,
      codex: true,
      gemini: true,
      opencode: true,
    },
  },
];
