import { describe, expect, it } from "vitest";
import type { McpServerConfig } from "@/lib/mcp-form-helpers";
import {
  deriveEffectiveMcpConfigs,
  getWorkspacePreviewProjects,
} from "./mcp-preview-helpers";

function createConfig(
  config: Omit<McpServerConfig, "_id" | "_creationTime" | "createdAt" | "updatedAt" | "teamId" | "userId">,
): McpServerConfig {
  return {
    _id: `${config.scope}-${config.name}` as McpServerConfig["_id"],
    _creationTime: 1,
    createdAt: 1,
    updatedAt: 1,
    teamId: "team-1",
    userId: "user-1",
    ...config,
  };
}

const configs: McpServerConfig[] = [
  createConfig({
    name: "context7",
    displayName: "Context7",
    type: "stdio",
    command: "npx",
    args: ["-y", "context7"],
    enabledClaude: true,
    enabledCodex: true,
    enabledGemini: false,
    enabledOpencode: true,
    scope: "global",
  }),
  createConfig({
    name: "docs",
    displayName: "Docs",
    type: "http",
    url: "https://example.com/mcp",
    enabledClaude: false,
    enabledCodex: true,
    enabledGemini: false,
    enabledOpencode: true,
    scope: "global",
  }),
  createConfig({
    name: "context7",
    displayName: "Workspace Context7",
    type: "stdio",
    command: "bunx",
    args: ["workspace-context7"],
    enabledClaude: true,
    enabledCodex: false,
    enabledGemini: false,
    enabledOpencode: true,
    scope: "workspace",
    projectFullName: "owner/repo-a",
  }),
  createConfig({
    name: "search",
    displayName: "Search",
    type: "stdio",
    command: "npx",
    args: ["search"],
    enabledClaude: true,
    enabledCodex: true,
    enabledGemini: false,
    enabledOpencode: true,
    scope: "workspace",
    projectFullName: "owner/repo-a",
  }),
  createConfig({
    name: "zeta",
    displayName: "Zeta",
    type: "stdio",
    command: "npx",
    args: ["zeta"],
    enabledClaude: true,
    enabledCodex: true,
    enabledGemini: false,
    enabledOpencode: true,
    scope: "workspace",
    projectFullName: "owner/repo-b",
  }),
];

describe("getWorkspacePreviewProjects", () => {
  it("returns sorted workspace projects", () => {
    expect(getWorkspacePreviewProjects(configs)).toEqual([
      "owner/repo-a",
      "owner/repo-b",
    ]);
  });
});

describe("deriveEffectiveMcpConfigs", () => {
  it("returns built-ins plus enabled global configs for global scope", () => {
    expect(
      deriveEffectiveMcpConfigs(configs, "global", "claude", undefined, {
        includeBuiltins: true,
      }).map((config) => config.name),
    ).toEqual(["context7"]);

    expect(
      deriveEffectiveMcpConfigs(configs, "global", "codex", undefined, {
        includeBuiltins: true,
      }).map((config) => config.name),
    ).toEqual(["context7", "docs"]);

    expect(
      deriveEffectiveMcpConfigs(configs, "global", "opencode", undefined, {
        includeBuiltins: true,
      }).map((config) => config.name),
    ).toEqual(["context7", "docs"]);
  });

  it("applies workspace overrides on top of global configs", () => {
    const workspaceClaudeConfigs = deriveEffectiveMcpConfigs(
      configs,
      "workspace",
      "claude",
      "owner/repo-a",
      { includeBuiltins: true },
    );

    expect(workspaceClaudeConfigs.map((config) => config.name)).toEqual([
      "context7",
      "search",
    ]);
    expect(workspaceClaudeConfigs[0]).toEqual({
      name: "context7",
      type: "stdio",
      command: "bunx",
      args: ["workspace-context7"],
    });
  });

  it("falls back cleanly when no workspace project is selected", () => {
    expect(
      deriveEffectiveMcpConfigs(configs, "workspace", "claude", undefined, {
        includeBuiltins: true,
      }).map((config) => config.name),
    ).toEqual(["context7"]);
  });

  it("normalizes configs for preview builders", () => {
    const [remoteConfig] = deriveEffectiveMcpConfigs(configs, "global", "codex").filter(
      (config) => config.name === "docs",
    );

    expect(remoteConfig).toEqual({
      name: "docs",
      type: "http",
      url: "https://example.com/mcp",
    });
  });
});
