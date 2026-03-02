import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getClaudeEnvironment } from "./environment";

const BASE_CONTEXT = {
  taskRunId: "run_test",
  prompt: "test prompt",
  taskRunJwt: "jwt_test",
  callbackUrl: "http://localhost:9779",
};

async function decodeClaudeConfig(args?: { agentName?: string }) {
  const result = await getClaudeEnvironment({
    ...BASE_CONTEXT,
    ...args,
  });
  const configFile = result.files.find(
    (file) => file.destinationPath === "$HOME/.claude.json"
  );
  expect(configFile).toBeDefined();
  return JSON.parse(Buffer.from(configFile!.contentBase64, "base64").toString("utf-8")) as {
    mcpServers: Record<string, { args?: string[] }>;
  };
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

  it("uses fallback devsh-memory MCP args when agentName is not provided", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "cmux-claude-home-"));
    const previousHome = process.env.HOME;
    process.env.HOME = homeDir;

    try {
      await mkdir(join(homeDir, ".claude"), { recursive: true });
      await writeFile(
        join(homeDir, ".claude.json"),
        JSON.stringify({
          mcpServers: {
            "devsh-memory": {
              command: "npx",
              args: ["-y", "devsh-memory-mcp@latest", "--agent", "stale-agent"],
            },
          },
        }),
        "utf-8"
      );

      const config = await decodeClaudeConfig();
      expect(config.mcpServers["devsh-memory"]?.args).toEqual([
        "-y",
        "devsh-memory-mcp@latest",
      ]);
    } finally {
      process.env.HOME = previousHome;
      await rm(homeDir, { recursive: true, force: true });
    }
  });
});
