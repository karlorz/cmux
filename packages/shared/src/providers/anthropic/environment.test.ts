import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getClaudeEnvironment } from "./environment";
import { getCrossToolSymlinkCommands } from "../../agent-memory-protocol";

const BASE_CONTEXT = {
  taskRunId: "run_test",
  prompt: "test prompt",
  taskRunJwt: "jwt_test",
  callbackUrl: "http://localhost:9779",
};

async function decodeClaudeConfig(args?: {
  agentName?: string;
  useHostConfig?: boolean;
  mcpServerConfigs?: Array<
    | {
        name: string;
        type: "stdio";
        command: string;
        args: string[];
        envVars?: Record<string, string>;
      }
    | {
        name: string;
        type: "http" | "sse";
        url: string;
        headers?: Record<string, string>;
        envVars?: Record<string, string>;
      }
  >;
}) {
  const result = await getClaudeEnvironment({
    ...BASE_CONTEXT,
    ...args,
  });
  const configFile = result.files.find(
    (file) => file.destinationPath === "$HOME/.claude.json",
  );
  expect(configFile).toBeDefined();
  return JSON.parse(
    Buffer.from(configFile!.contentBase64, "base64").toString("utf-8"),
  ) as {
    mcpServers: Record<
      string,
      {
        type?: "stdio" | "http" | "sse";
        command?: string;
        args?: string[];
        url?: string;
        headers?: Record<string, string>;
        env?: Record<string, string>;
      }
    >;
  };
}

async function decodeClaudeSettings(
  overrides?: Partial<Parameters<typeof getClaudeEnvironment>[0]>,
) {
  const result = await getClaudeEnvironment({
    ...BASE_CONTEXT,
    ...overrides,
  });
  const settingsFile = result.files.find(
    (file) => file.destinationPath === "$HOME/.claude/settings.json",
  );
  expect(settingsFile).toBeDefined();
  return JSON.parse(
    Buffer.from(settingsFile!.contentBase64, "base64").toString("utf-8"),
  ) as {
    env?: Record<string, string>;
    permissions?: {
      defaultMode?: string;
      deny?: string[];
    };
  };
}

async function getClaudeEnvVars(
  overrides?: Partial<Parameters<typeof getClaudeEnvironment>[0]>,
) {
  const settings = await decodeClaudeSettings(overrides);
  return settings.env ?? {};
}

describe("getClaudeEnvironment", () => {
  it("includes --agent in devsh-memory MCP args when agentName is provided", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "cmux-claude-home-"));
    const previousHome = process.env.HOME;
    process.env.HOME = homeDir;

    try {
      await mkdir(join(homeDir, ".claude"), { recursive: true });

      const config = await decodeClaudeConfig({
        agentName: "codex/gpt-5.1-codex-mini",
      });
      expect(config.mcpServers["devsh-memory"]?.args).toEqual([
        "-y",
        "devsh-memory-mcp@latest",
        "--agent",
        "codex/gpt-5.1-codex-mini",
      ]);
    } finally {
      process.env.HOME = previousHome;
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  it("does not read host config in server mode by default", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "cmux-claude-home-"));
    const previousHome = process.env.HOME;
    process.env.HOME = homeDir;

    try {
      await mkdir(join(homeDir, ".claude"), { recursive: true });
      await writeFile(
        join(homeDir, ".claude.json"),
        JSON.stringify({
          mcpServers: {
            stale: {
              command: "echo",
              args: ["host-only"],
            },
            "devsh-memory": {
              command: "npx",
              args: ["-y", "devsh-memory-mcp@latest", "--agent", "stale-agent"],
            },
          },
        }),
        "utf-8",
      );

      const config = await decodeClaudeConfig();
      expect(config.mcpServers.stale).toBeUndefined();
      expect(config.mcpServers["devsh-memory"]?.args).toEqual([
        "-y",
        "devsh-memory-mcp@latest",
      ]);
    } finally {
      process.env.HOME = previousHome;
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  it("reads host config in desktop mode when useHostConfig is true", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "cmux-claude-home-"));
    const previousHome = process.env.HOME;
    process.env.HOME = homeDir;

    try {
      await mkdir(join(homeDir, ".claude"), { recursive: true });
      await writeFile(
        join(homeDir, ".claude.json"),
        JSON.stringify({
          theme: "dark",
          mcpServers: {
            localtools: {
              command: "node",
              args: ["server.js"],
            },
          },
        }),
        "utf-8",
      );

      const config = await decodeClaudeConfig({ useHostConfig: true });
      expect(config.mcpServers.localtools).toEqual({
        command: "node",
        args: ["server.js"],
      });
      expect(config.mcpServers["devsh-memory"]).toBeDefined();
    } finally {
      process.env.HOME = previousHome;
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  it("includes cross-tool symlink commands in startupCommands", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "cmux-claude-home-"));
    const previousHome = process.env.HOME;
    process.env.HOME = homeDir;

    try {
      await mkdir(join(homeDir, ".claude"), { recursive: true });

      const result = await getClaudeEnvironment(BASE_CONTEXT);

      // Should include all symlink commands from getCrossToolSymlinkCommands
      const symlinkCommands = getCrossToolSymlinkCommands();
      for (const cmd of symlinkCommands) {
        expect(result.startupCommands).toContain(cmd);
      }
    } finally {
      process.env.HOME = previousHome;
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  it("includes CLAUDE.md at user-level path", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "cmux-claude-home-"));
    const previousHome = process.env.HOME;
    process.env.HOME = homeDir;

    try {
      await mkdir(join(homeDir, ".claude"), { recursive: true });

      const result = await getClaudeEnvironment(BASE_CONTEXT);

      // Should include CLAUDE.md file at ~/.claude/CLAUDE.md
      const claudeMdFile = result.files.find(
        (file) => file.destinationPath === "$HOME/.claude/CLAUDE.md",
      );
      expect(claudeMdFile).toBeDefined();

      // Decode and verify content includes memory protocol
      const content = Buffer.from(
        claudeMdFile!.contentBase64,
        "base64",
      ).toString("utf-8");
      expect(content).toContain("Agent Memory Protocol");
      expect(content).toContain("/root/lifecycle/memory");
    } finally {
      process.env.HOME = previousHome;
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  it("merges user MCP servers into .claude.json", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "cmux-claude-home-"));
    const previousHome = process.env.HOME;
    process.env.HOME = homeDir;

    try {
      await mkdir(join(homeDir, ".claude"), { recursive: true });

      const config = await decodeClaudeConfig({
        mcpServerConfigs: [
          {
            name: "context7",
            type: "stdio",
            command: "npx",
            args: ["-y", "@upstash/context7-mcp@latest"],
            envVars: {
              CONTEXT7_API_KEY: "token",
            },
          },
          {
            name: "remote-api",
            type: "http",
            url: "https://example.com/mcp",
            headers: {
              Authorization: "Bearer secret",
            },
          },
        ],
      });

      expect(config.mcpServers.context7).toEqual({
        command: "npx",
        args: ["-y", "@upstash/context7-mcp@latest"],
        env: {
          CONTEXT7_API_KEY: "token",
        },
      });
      expect(config.mcpServers["remote-api"]).toEqual({
        type: "http",
        url: "https://example.com/mcp",
        headers: {
          Authorization: "Bearer secret",
        },
      });
      expect(config.mcpServers["devsh-memory"]).toBeDefined();
    } finally {
      process.env.HOME = previousHome;
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  it("includes provided permission deny rules for task-backed sandboxes", async () => {
    const settings = await decodeClaudeSettings({
      permissionDenyRules: ["WebFetch", "WebSearch"],
    });

    const deny = settings.permissions?.deny;
    expect(deny).toEqual(["WebFetch", "WebSearch"]);
  });

  it("includes provided permission deny rules for orchestration heads when cloud workspace rules are configured", async () => {
    const settings = await decodeClaudeSettings({
      isOrchestrationHead: true,
      permissionDenyRules: ["WebFetch", "WebSearch"],
    });

    const deny = settings.permissions?.deny;
    expect(deny).toEqual(["WebFetch", "WebSearch"]);
  });

  it("omits deny rules when task-backed sandbox rules are unavailable", async () => {
    const settings = await decodeClaudeSettings();

    expect(settings.permissions).toBeDefined();
    expect(settings.permissions.defaultMode).toBe("bypassPermissions");
    expect(settings.permissions.deny).toBeUndefined();
  });

  it("does not deny commands when task JWT is absent", async () => {
    const settings = await decodeClaudeSettings({ taskRunJwt: "" });

    // Always set defaultMode for bypass permissions, but no deny rules without JWT
    expect(settings.permissions).toBeDefined();
    expect(settings.permissions.defaultMode).toBe("bypassPermissions");
    expect(settings.permissions.deny).toBeUndefined();
  });

  it("does not fall back to legacy deny rules when Convex returns an empty list", async () => {
    const settings = await decodeClaudeSettings({
      permissionDenyRules: [],
    });

    expect(settings.permissions).toBeDefined();
    expect(settings.permissions.defaultMode).toBe("bypassPermissions");
    expect(settings.permissions.deny).toBeUndefined();
  });

  it("permission hook includes risk classification function", async () => {
    const result = await getClaudeEnvironment(BASE_CONTEXT);

    const permissionHook = result.files.find(
      (f) => f.destinationPath === "/root/lifecycle/claude/permission-hook.sh",
    );
    expect(permissionHook).toBeDefined();

    const script = Buffer.from(
      permissionHook!.contentBase64,
      "base64",
    ).toString("utf-8");

    // Verify classify_risk function exists
    expect(script).toContain("classify_risk()");
    expect(script).toContain("RISK_LEVEL=$(classify_risk");

    // Verify risk patterns are covered
    expect(script).toContain("git\\s+push\\s+(-f|--force)");
    expect(script).toContain("rm\\s+(-rf|--recursive)");
    expect(script).toContain("sudo\\s");

    // Verify low-risk patterns
    expect(script).toContain("Read|Glob|Grep");
    expect(script).toContain("git\\s+(status|log|diff|show|branch|tag)");

    // Verify $RISK_LEVEL is used in the approval request
    expect(script).toContain('--arg risk "$RISK_LEVEL"');
    expect(script).toContain("riskLevel: $risk");
  });

  it("injects routed alias env vars for anthropic-compatible gateways", async () => {
    const env = await getClaudeEnvVars({
      agentName: "claude/opus-4.6",
      providerConfig: {
        baseUrl: "https://gateway.example.com",
        apiFormat: "anthropic",
        claudeRouting: {
          mode: "anthropic_compatible_gateway",
          opus: {
            model: "gpt-5.4",
            name: "GPT 5.4",
            description: "Gateway-routed opus target",
            supportedCapabilities: ["interleaved_thinking", "tool_use"],
          },
          sonnet: { model: "gpt-5.4-mini" },
          subagentModel: "gpt-5.4-nano",
        },
        isOverridden: true,
      },
    });

    expect(env.ANTHROPIC_BASE_URL).toBe("https://gateway.example.com");
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("gpt-5.4");
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL_NAME).toBe("GPT 5.4");
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL_DESCRIPTION).toBe(
      "Gateway-routed opus target",
    );
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES).toBe(
      "interleaved_thinking,tool_use",
    );
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("gpt-5.4-mini");
    expect(env.CLAUDE_CODE_SUBAGENT_MODEL).toBe("gpt-5.4-nano");
  });

  it("does not inject routed alias env vars for OAuth sessions", async () => {
    const env = await getClaudeEnvVars({
      agentName: "claude/opus-4.6",
      apiKeys: {
        CLAUDE_CODE_OAUTH_TOKEN: "oauth-token",
      },
      providerConfig: {
        baseUrl: "https://gateway.example.com",
        apiFormat: "anthropic",
        claudeRouting: {
          mode: "anthropic_compatible_gateway",
          opus: { model: "gpt-5.4" },
        },
        isOverridden: true,
      },
    });

    expect(env.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBeUndefined();
  });

  it("does not inject routed alias env vars for non-anthropic formats", async () => {
    const env = await getClaudeEnvVars({
      agentName: "claude/opus-4.6",
      providerConfig: {
        baseUrl: "https://gateway.example.com",
        apiFormat: "openai",
        claudeRouting: {
          mode: "anthropic_compatible_gateway",
          opus: { model: "gpt-5.4" },
        },
        isOverridden: true,
      },
    });

    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBeUndefined();
  });

  it("injects custom model option env vars for proxy-only Claude models", async () => {
    const env = await getClaudeEnvVars({
      agentName: "claude/gpt-5.1-codex-mini",
      apiKeys: {
        ANTHROPIC_API_KEY: "sk-ant-api-key-123",
        ANTHROPIC_BASE_URL: "https://gateway.example.com",
      },
      workspaceSettings: {
        bypassAnthropicProxy: true,
      },
    });

    expect(env.ANTHROPIC_BASE_URL).toBe("https://gateway.example.com");
    expect(env.ANTHROPIC_CUSTOM_MODEL_OPTION).toBe("gpt-5.1-codex-mini");
    expect(env.ANTHROPIC_CUSTOM_MODEL_OPTION_NAME).toBe("gpt-5.1-codex-mini");
  });

  it("rejects proxy-only Claude models without a custom endpoint", async () => {
    await expect(
      getClaudeEnvironment({
        ...BASE_CONTEXT,
        agentName: "claude/gpt-5.1-codex-mini",
        apiKeys: {
          ANTHROPIC_API_KEY: "sk-ant-api-key-123",
        },
      }),
    ).rejects.toThrow(/requires an Anthropic-compatible custom endpoint/);
  });

  it("rejects proxy-only Claude models without an Anthropic API key", async () => {
    await expect(
      getClaudeEnvironment({
        ...BASE_CONTEXT,
        agentName: "claude/gpt-5.1-codex-mini",
        apiKeys: {
          ANTHROPIC_BASE_URL: "https://gateway.example.com",
        },
        workspaceSettings: {
          bypassAnthropicProxy: true,
        },
      }),
    ).rejects.toThrow(/requires an Anthropic API key/);
  });

  it("rejects effort selection for routed third-party targets", async () => {
    await expect(
      getClaudeEnvironment({
        ...BASE_CONTEXT,
        agentName: "claude/opus-4.6",
        selectedVariant: "max",
        providerConfig: {
          baseUrl: "https://gateway.example.com",
          apiFormat: "anthropic",
          claudeRouting: {
            mode: "anthropic_compatible_gateway",
            opus: { model: "gpt-5.4" },
          },
          isOverridden: true,
        },
      }),
    ).rejects.toThrow(/does not support effort selection/);
  });

  describe("thin hook stubs (Phase 2 Hook Portability)", () => {
    it("generates thin stub hooks that contain /api/hooks/dispatch URL", async () => {
      const result = await getClaudeEnvironment(BASE_CONTEXT);

      // Check several hooks that should be thin stubs
      const thinStubHooks = [
        "/root/lifecycle/claude/subagent-start-hook.sh",
        "/root/lifecycle/claude/subagent-stop-hook.sh",
        "/root/lifecycle/claude/user-prompt-hook.sh",
        "/root/lifecycle/claude/notification-hook.sh",
        "/root/lifecycle/claude/task-created-hook.sh",
        "/root/lifecycle/claude/postcompact-hook.sh",
        "/root/lifecycle/claude/plan-hook.sh",
        "/root/lifecycle/claude/simplify-track-hook.sh",
        "/root/lifecycle/claude/activity-hook.sh",
        "/root/lifecycle/claude/error-hook.sh",
      ];

      for (const hookPath of thinStubHooks) {
        const hookFile = result.files.find(
          (f) => f.destinationPath === hookPath,
        );
        expect(hookFile, `Hook ${hookPath} should exist`).toBeDefined();

        const script = Buffer.from(hookFile!.contentBase64, "base64").toString(
          "utf-8",
        );

        // Thin stubs should reference the dispatch endpoint
        expect(
          script,
          `Hook ${hookPath} should contain dispatch URL`,
        ).toContain("/api/hooks/dispatch");

        // Thin stubs should have cache handling
        expect(script, `Hook ${hookPath} should have cache file`).toContain(
          "CACHE_FILE=",
        );
      }
    });

    it("generates critical hooks with fallback functions", async () => {
      const result = await getClaudeEnvironment(BASE_CONTEXT);

      // Critical hooks that need fallback
      const criticalHooks = [
        {
          path: "/root/lifecycle/claude/stop-hook.sh",
          mustContain: ["run_fallback()", "done.txt"],
        },
        {
          path: "/root/lifecycle/claude/precompact-hook.sh",
          mustContain: ["run_fallback()", '{"continue": true}'],
        },
        {
          path: "/root/lifecycle/claude/simplify-gate-hook.sh",
          mustContain: ["run_fallback()"],
        },
      ];

      for (const { path, mustContain } of criticalHooks) {
        const hookFile = result.files.find((f) => f.destinationPath === path);
        expect(hookFile, `Critical hook ${path} should exist`).toBeDefined();

        const script = Buffer.from(hookFile!.contentBase64, "base64").toString(
          "utf-8",
        );

        for (const content of mustContain) {
          expect(
            script,
            `Critical hook ${path} should contain "${content}"`,
          ).toContain(content);
        }
      }
    });

    it("stop hook fallback includes memory sync and completion marker", async () => {
      const result = await getClaudeEnvironment(BASE_CONTEXT);

      const stopHook = result.files.find(
        (f) => f.destinationPath === "/root/lifecycle/claude/stop-hook.sh",
      );
      expect(stopHook).toBeDefined();

      const script = Buffer.from(stopHook!.contentBase64, "base64").toString(
        "utf-8",
      );

      // Fallback should include memory sync
      expect(script).toContain("memory/sync.sh");

      // Fallback should create completion marker
      expect(script).toContain("done.txt");
    });

    it("precompact hook fallback returns continue:true", async () => {
      const result = await getClaudeEnvironment(BASE_CONTEXT);

      const precompactHook = result.files.find(
        (f) =>
          f.destinationPath === "/root/lifecycle/claude/precompact-hook.sh",
      );
      expect(precompactHook).toBeDefined();

      const script = Buffer.from(
        precompactHook!.contentBase64,
        "base64",
      ).toString("utf-8");

      // Fallback should output JSON to allow compaction
      expect(script).toContain('{"continue": true}');
    });
  });
});
