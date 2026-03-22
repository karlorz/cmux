import { describe, expect, it } from "vitest";
import { getQwenOpenRouterEnvironment, getQwenModelStudioEnvironment } from "./environment";

const BASE_CONTEXT = {
  taskRunId: "run_test",
  prompt: "test prompt",
  taskRunJwt: "jwt_test",
  callbackUrl: "http://localhost:9779",
};

describe("getQwenOpenRouterEnvironment", () => {
  it("includes memory startup command in startupCommands", async () => {
    const result = await getQwenOpenRouterEnvironment(BASE_CONTEXT);

    // Check that memory initialization is included
    const hasMemoryInit = result.startupCommands.some((cmd) =>
      cmd.includes("mkdir -p /root/lifecycle/memory")
    );
    expect(hasMemoryInit).toBe(true);
  });

  it("includes QWEN.md with memory protocol", async () => {
    const result = await getQwenOpenRouterEnvironment(BASE_CONTEXT);

    const qwenMdFile = result.files.find(
      (file) => file.destinationPath === "/root/workspace/QWEN.md"
    );
    expect(qwenMdFile).toBeDefined();

    const content = Buffer.from(qwenMdFile!.contentBase64, "base64").toString("utf-8");
    expect(content).toContain("Agent Memory Protocol");
    expect(content).toContain("/root/lifecycle/memory");
  });

  it("includes session lifecycle hooks", async () => {
    const result = await getQwenOpenRouterEnvironment(BASE_CONTEXT);

    const hookFiles = result.files.filter((f) =>
      f.destinationPath.includes("/root/lifecycle/qwen/")
    );
    expect(hookFiles.length).toBeGreaterThanOrEqual(3);

    const hookNames = hookFiles.map((f) => f.destinationPath);
    expect(hookNames).toContain("/root/lifecycle/qwen/session-start-hook.sh");
    expect(hookNames).toContain("/root/lifecycle/qwen/session-complete-hook.sh");
    expect(hookNames).toContain("/root/lifecycle/qwen/error-hook.sh");
  });

  it("sets OpenRouter base URL and model", async () => {
    const result = await getQwenOpenRouterEnvironment(BASE_CONTEXT);

    expect(result.env.OPENAI_BASE_URL).toBe("https://openrouter.ai/api/v1");
    expect(result.env.OPENAI_MODEL).toBe("qwen/qwen3-coder:free");
  });

  it("creates settings.json with OpenAI auth type", async () => {
    const result = await getQwenOpenRouterEnvironment(BASE_CONTEXT);

    const settingsFile = result.files.find(
      (f) => f.destinationPath === "$HOME/.qwen/settings.json"
    );
    expect(settingsFile).toBeDefined();

    const content = Buffer.from(settingsFile!.contentBase64, "base64").toString("utf-8");
    const settings = JSON.parse(content);
    expect(settings.selectedAuthType).toBe("openai");
    expect(settings.useExternalAuth).toBe(false);
  });
});

describe("getQwenModelStudioEnvironment", () => {
  it("sets DashScope base URL and model", async () => {
    const result = await getQwenModelStudioEnvironment(BASE_CONTEXT);

    expect(result.env.OPENAI_BASE_URL).toBe("https://dashscope-intl.aliyuncs.com/compatible-mode/v1");
    expect(result.env.OPENAI_MODEL).toBe("qwen3-coder-plus");
  });

  it("includes QWEN.md with memory protocol", async () => {
    const result = await getQwenModelStudioEnvironment(BASE_CONTEXT);

    const qwenMdFile = result.files.find(
      (file) => file.destinationPath === "/root/workspace/QWEN.md"
    );
    expect(qwenMdFile).toBeDefined();
  });
});
