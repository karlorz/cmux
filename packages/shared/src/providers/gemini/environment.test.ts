import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getGeminiEnvironment } from "./environment";
import { getCrossToolSymlinkCommands } from "../../agent-memory-protocol";

const BASE_CONTEXT = {
  taskRunId: "run_test",
  prompt: "test prompt",
  taskRunJwt: "jwt_test",
  callbackUrl: "http://localhost:9779",
};

describe("getGeminiEnvironment", () => {
  it("includes cross-tool symlink commands in startupCommands", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "cmux-gemini-home-"));
    const previousHome = process.env.HOME;
    process.env.HOME = homeDir;

    try {
      await mkdir(join(homeDir, ".gemini"), { recursive: true });

      const result = await getGeminiEnvironment(BASE_CONTEXT);

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

  it("includes GEMINI.md at user-level path", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "cmux-gemini-home-"));
    const previousHome = process.env.HOME;
    process.env.HOME = homeDir;

    try {
      await mkdir(join(homeDir, ".gemini"), { recursive: true });

      const result = await getGeminiEnvironment(BASE_CONTEXT);

      // Should include GEMINI.md file at ~/.gemini/GEMINI.md
      const geminiMdFile = result.files.find(
        (file) => file.destinationPath === "$HOME/.gemini/GEMINI.md"
      );
      expect(geminiMdFile).toBeDefined();

      // Decode and verify content includes memory protocol
      const content = Buffer.from(geminiMdFile!.contentBase64, "base64").toString("utf-8");
      expect(content).toContain("Agent Memory Protocol");
      expect(content).toContain("/root/lifecycle/memory");
    } finally {
      process.env.HOME = previousHome;
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  it("includes memory startup command", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "cmux-gemini-home-"));
    const previousHome = process.env.HOME;
    process.env.HOME = homeDir;

    try {
      await mkdir(join(homeDir, ".gemini"), { recursive: true });

      const result = await getGeminiEnvironment(BASE_CONTEXT);

      // Should include mkdir command for memory directories
      expect(result.startupCommands?.some((cmd) =>
        cmd.includes("mkdir -p") && cmd.includes("/root/lifecycle/memory")
      )).toBe(true);
    } finally {
      process.env.HOME = previousHome;
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  it("sets telemetry output path from task run ID", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "cmux-gemini-home-"));
    const previousHome = process.env.HOME;
    process.env.HOME = homeDir;

    try {
      await mkdir(join(homeDir, ".gemini"), { recursive: true });

      const result = await getGeminiEnvironment(BASE_CONTEXT);

      // Should include settings.json file
      const settingsFile = result.files.find(
        (file) => file.destinationPath === "$HOME/.gemini/settings.json"
      );
      expect(settingsFile).toBeDefined();

      // Decode and verify telemetry path contains task run ID
      const content = Buffer.from(settingsFile!.contentBase64, "base64").toString("utf-8");
      const settings = JSON.parse(content) as { telemetry?: { outfile?: string } };
      expect(settings.telemetry?.outfile).toContain("run_test");
    } finally {
      process.env.HOME = previousHome;
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  it("includes MCP servers in settings.json when configured", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "cmux-gemini-home-"));
    const previousHome = process.env.HOME;
    process.env.HOME = homeDir;

    try {
      await mkdir(join(homeDir, ".gemini"), { recursive: true });

      const result = await getGeminiEnvironment({
        ...BASE_CONTEXT,
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
            type: "sse",
            url: "https://example.com/sse",
            headers: {
              Authorization: "Bearer token",
            },
          },
        ],
      });

      const settingsFile = result.files.find(
        (file) => file.destinationPath === "$HOME/.gemini/settings.json"
      );
      expect(settingsFile).toBeDefined();

      const settings = JSON.parse(
        Buffer.from(settingsFile!.contentBase64, "base64").toString("utf-8")
      ) as {
        mcpServers?: Record<string, unknown>;
      };

      expect(settings.mcpServers).toEqual({
        context7: {
          command: "npx",
          args: ["-y", "@upstash/context7-mcp@latest"],
          env: {
            CONTEXT7_API_KEY: "token",
          },
        },
        "remote-api": {
          type: "sse",
          url: "https://example.com/sse",
          headers: {
            Authorization: "Bearer token",
          },
        },
      });
    } finally {
      process.env.HOME = previousHome;
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  it("injects gh and git wrappers for task-backed sandboxes", async () => {
    const result = await getGeminiEnvironment({
      ...BASE_CONTEXT,
      enableShellWrappers: true,
    });

    const ghWrapper = result.files.find(
      (file) => file.destinationPath === "/usr/local/bin/gh"
    );
    const gitWrapper = result.files.find(
      (file) => file.destinationPath === "/usr/local/bin/git"
    );

    expect(ghWrapper).toBeDefined();
    expect(gitWrapper).toBeDefined();

    const ghContent = Buffer.from(ghWrapper!.contentBase64, "base64").toString("utf-8");
    expect(ghContent).toContain("pr:create)");
    expect(ghContent).toContain("pr:merge)");
    expect(ghContent).toContain("workflow:run)");

    const gitContent = Buffer.from(gitWrapper!.contentBase64, "base64").toString("utf-8");
    expect(gitContent).toContain("--force|--force-with-lease|-f)");
  });

  it("does not inject wrappers when task JWT is absent", async () => {
    const result = await getGeminiEnvironment({
      ...BASE_CONTEXT,
      taskRunJwt: "",
      enableShellWrappers: true,
    });

    expect(
      result.files.find((f) => f.destinationPath === "/usr/local/bin/gh")
    ).toBeUndefined();
    expect(
      result.files.find((f) => f.destinationPath === "/usr/local/bin/git")
    ).toBeUndefined();
  });

  it("does not inject wrappers when enableShellWrappers is false", async () => {
    const result = await getGeminiEnvironment({
      ...BASE_CONTEXT,
      enableShellWrappers: false,
    });

    expect(
      result.files.find((f) => f.destinationPath === "/usr/local/bin/gh")
    ).toBeUndefined();
    expect(
      result.files.find((f) => f.destinationPath === "/usr/local/bin/git")
    ).toBeUndefined();
  });

  it("does not inject wrappers when enableShellWrappers is not set", async () => {
    const result = await getGeminiEnvironment(BASE_CONTEXT);

    expect(
      result.files.find((f) => f.destinationPath === "/usr/local/bin/gh")
    ).toBeUndefined();
    expect(
      result.files.find((f) => f.destinationPath === "/usr/local/bin/git")
    ).toBeUndefined();
  });
});
