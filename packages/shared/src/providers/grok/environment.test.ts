import { describe, expect, it } from "vitest";
import { getGrokEnvironment } from "./environment";

const BASE_CONTEXT = {
  taskRunId: "run_test",
  prompt: "test prompt",
  taskRunJwt: "jwt_test",
  callbackUrl: "http://localhost:9779",
};

describe("getGrokEnvironment", () => {
  it("includes memory startup command in startupCommands", async () => {
    const result = await getGrokEnvironment(BASE_CONTEXT);

    // Check that memory initialization is included
    const hasMemoryInit = result.startupCommands.some((cmd) =>
      cmd.includes("mkdir -p /root/lifecycle/memory")
    );
    expect(hasMemoryInit).toBe(true);
  });

  it("includes GROK.md with memory protocol", async () => {
    const result = await getGrokEnvironment(BASE_CONTEXT);

    const grokMdFile = result.files.find(
      (file) => file.destinationPath === "/root/workspace/GROK.md"
    );
    expect(grokMdFile).toBeDefined();

    const content = Buffer.from(grokMdFile!.contentBase64, "base64").toString("utf-8");
    expect(content).toContain("Agent Memory Protocol");
    expect(content).toContain("/root/lifecycle/memory");
  });

  it("includes session lifecycle hooks", async () => {
    const result = await getGrokEnvironment(BASE_CONTEXT);

    const hookFiles = result.files.filter((f) =>
      f.destinationPath.includes("/root/lifecycle/grok/")
    );
    expect(hookFiles.length).toBeGreaterThanOrEqual(3);

    const hookNames = hookFiles.map((f) => f.destinationPath);
    expect(hookNames).toContain("/root/lifecycle/grok/session-start-hook.sh");
    expect(hookNames).toContain("/root/lifecycle/grok/session-complete-hook.sh");
    expect(hookNames).toContain("/root/lifecycle/grok/error-hook.sh");
  });

  it("sets XAI API key when provided", async () => {
    const result = await getGrokEnvironment({
      ...BASE_CONTEXT,
      apiKeys: { XAI_API_KEY: "test-xai-key" },
    });

    expect(result.env.OPENAI_API_KEY).toBe("test-xai-key");
  });

  it("sets default base URL and model", async () => {
    const result = await getGrokEnvironment(BASE_CONTEXT);

    expect(result.env.OPENAI_BASE_URL).toBe("https://api.x.ai/v1");
    expect(result.env.OPENAI_MODEL).toBe("grok-code-fast-1");
  });
});
