import { describe, expect, it } from "vitest";
import { getCursorEnvironment } from "./environment";

const BASE_CONTEXT = {
  taskRunId: "run_test",
  prompt: "test prompt",
  taskRunJwt: "jwt_test",
  callbackUrl: "http://localhost:9779",
};

describe("getCursorEnvironment", () => {
  it("includes memory startup command in startupCommands", async () => {
    const result = await getCursorEnvironment(BASE_CONTEXT);

    // Check that memory initialization is included
    const hasMemoryInit = result.startupCommands.some((cmd) =>
      cmd.includes("mkdir -p /root/lifecycle/memory")
    );
    expect(hasMemoryInit).toBe(true);
  });

  it("includes Cursor rules file with memory protocol", async () => {
    const result = await getCursorEnvironment(BASE_CONTEXT);

    const cursorRulesFile = result.files.find(
      (file) => file.destinationPath === "/root/workspace/.cursor/rules/cmux-memory-protocol.mdc"
    );
    expect(cursorRulesFile).toBeDefined();

    const content = Buffer.from(cursorRulesFile!.contentBase64, "base64").toString("utf-8");
    expect(content).toContain("Agent Memory Protocol");
    expect(content).toContain("/root/lifecycle/memory");
  });

  it("includes session lifecycle hooks", async () => {
    const result = await getCursorEnvironment(BASE_CONTEXT);

    const hookFiles = result.files.filter((f) =>
      f.destinationPath.includes("/root/lifecycle/cursor/")
    );
    expect(hookFiles.length).toBeGreaterThanOrEqual(3);

    const hookNames = hookFiles.map((f) => f.destinationPath);
    expect(hookNames).toContain("/root/lifecycle/cursor/session-start-hook.sh");
    expect(hookNames).toContain("/root/lifecycle/cursor/session-complete-hook.sh");
    expect(hookNames).toContain("/root/lifecycle/cursor/error-hook.sh");
  });

  it("creates necessary directories on startup", async () => {
    const result = await getCursorEnvironment(BASE_CONTEXT);

    expect(result.startupCommands).toContain("mkdir -p ~/.cursor");
    expect(result.startupCommands).toContain("mkdir -p ~/.config/cursor");
    expect(result.startupCommands).toContain("mkdir -p /root/workspace/.cursor/rules");
    expect(result.startupCommands).toContain("mkdir -p /root/lifecycle/cursor");
  });

  it("fires session start hook on startup", async () => {
    const result = await getCursorEnvironment(BASE_CONTEXT);

    expect(result.startupCommands).toContain("/root/lifecycle/cursor/session-start-hook.sh &");
  });
});
