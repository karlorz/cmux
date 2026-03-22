import { describe, expect, it } from "vitest";
import { getAmpEnvironment } from "./environment";
import { DEFAULT_AMP_PROXY_PORT, DEFAULT_AMP_PROXY_URL } from "./constants";

const BASE_CONTEXT = {
  taskRunId: "run_test",
  prompt: "test prompt",
  taskRunJwt: "jwt_test",
  callbackUrl: "http://localhost:9779",
};

describe("getAmpEnvironment", () => {
  it("includes memory startup command in startupCommands", async () => {
    const result = await getAmpEnvironment(BASE_CONTEXT);

    // Check that memory initialization is included
    const hasMemoryInit = result.startupCommands.some((cmd) =>
      cmd.includes("mkdir -p /root/lifecycle/memory")
    );
    expect(hasMemoryInit).toBe(true);
  });

  it("includes AMP.md with memory protocol", async () => {
    const result = await getAmpEnvironment(BASE_CONTEXT);

    const ampMdFile = result.files.find(
      (file) => file.destinationPath === "/root/workspace/AMP.md"
    );
    expect(ampMdFile).toBeDefined();

    const content = Buffer.from(ampMdFile!.contentBase64, "base64").toString("utf-8");
    expect(content).toContain("Agent Memory Protocol");
    expect(content).toContain("/root/lifecycle/memory");
  });

  it("includes session lifecycle hooks", async () => {
    const result = await getAmpEnvironment(BASE_CONTEXT);

    const hookFiles = result.files.filter((f) =>
      f.destinationPath.includes("/root/lifecycle/amp/")
    );
    expect(hookFiles.length).toBeGreaterThanOrEqual(3);

    const hookNames = hookFiles.map((f) => f.destinationPath);
    expect(hookNames).toContain("/root/lifecycle/amp/session-start-hook.sh");
    expect(hookNames).toContain("/root/lifecycle/amp/session-complete-hook.sh");
    expect(hookNames).toContain("/root/lifecycle/amp/error-hook.sh");
  });

  it("sets AMP proxy environment variables", async () => {
    const result = await getAmpEnvironment(BASE_CONTEXT);

    expect(result.env.AMP_PROXY_PORT).toBe(String(DEFAULT_AMP_PROXY_PORT));
    expect(result.env.AMP_URL).toBe(DEFAULT_AMP_PROXY_URL);
    expect(result.env.AMP_UPSTREAM_URL).toBe("https://ampcode.com");
  });

  it("sets AMP_API_KEY with taskRunId prefix", async () => {
    const result = await getAmpEnvironment(BASE_CONTEXT);

    expect(result.env.AMP_API_KEY).toBe("taskRunId:run_test");
  });

  it("creates default settings.json when useHostConfig is false", async () => {
    const result = await getAmpEnvironment(BASE_CONTEXT);

    const settingsFile = result.files.find(
      (f) => f.destinationPath === "$HOME/.config/amp/settings.json"
    );
    expect(settingsFile).toBeDefined();

    const content = Buffer.from(settingsFile!.contentBase64, "base64").toString("utf-8");
    const settings = JSON.parse(content);
    expect(settings.model).toBe("anthropic/claude-3-5-sonnet-20241022");
  });
});
