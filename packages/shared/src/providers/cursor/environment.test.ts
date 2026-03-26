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

  describe("permission policy (.cursor/cli.json)", () => {
    it("generates .cursor/cli.json with fallback deny rules for task sandboxes", async () => {
      const result = await getCursorEnvironment(BASE_CONTEXT);

      const cliJsonFile = result.files.find(
        (f) => f.destinationPath === "/root/workspace/.cursor/cli.json"
      );

      expect(cliJsonFile).toBeDefined();
      expect(cliJsonFile?.mode).toBe("644");

      const content = Buffer.from(cliJsonFile!.contentBase64, "base64").toString("utf-8");
      const config = JSON.parse(content);

      expect(config.permissions).toBeDefined();
      expect(config.permissions.deny).toBeInstanceOf(Array);
      expect(config.permissions.deny.length).toBeGreaterThan(0);

      // Check for expected fallback rules in Cursor format
      expect(config.permissions.deny).toContain("Shell(gh pr create)");
      expect(config.permissions.deny).toContain("Shell(gh pr merge)");
      expect(config.permissions.deny).toContain("Shell(git push --force)");
    });

    it("skips .cursor/cli.json for head agents (orchestration heads)", async () => {
      const result = await getCursorEnvironment({
        ...BASE_CONTEXT,
        isOrchestrationHead: true,
      });

      const cliJsonFile = result.files.find(
        (f) => f.destinationPath === "/root/workspace/.cursor/cli.json"
      );

      expect(cliJsonFile).toBeUndefined();
    });

    it("skips .cursor/cli.json when no JWT present", async () => {
      const result = await getCursorEnvironment({
        ...BASE_CONTEXT,
        taskRunJwt: "", // Empty JWT
      });

      const cliJsonFile = result.files.find(
        (f) => f.destinationPath === "/root/workspace/.cursor/cli.json"
      );

      expect(cliJsonFile).toBeUndefined();
    });

    it("translates cmux deny rules (Claude format) to Cursor format", async () => {
      const result = await getCursorEnvironment({
        ...BASE_CONTEXT,
        permissionDenyRules: [
          "Bash(gh pr create:*)",
          "Bash(npm publish:*)",
          "Bash(rm -rf:*)",
        ],
      });

      const cliJsonFile = result.files.find(
        (f) => f.destinationPath === "/root/workspace/.cursor/cli.json"
      );

      expect(cliJsonFile).toBeDefined();

      const content = Buffer.from(cliJsonFile!.contentBase64, "base64").toString("utf-8");
      const config = JSON.parse(content);

      // Should be translated to Cursor Shell() format
      expect(config.permissions.deny).toContain("Shell(gh pr create)");
      expect(config.permissions.deny).toContain("Shell(npm publish)");
      expect(config.permissions.deny).toContain("Shell(rm -rf)");

      // Should NOT contain Claude format
      expect(config.permissions.deny).not.toContain("Bash(gh pr create:*)");
    });

    it("passes through rules already in Cursor format", async () => {
      const result = await getCursorEnvironment({
        ...BASE_CONTEXT,
        permissionDenyRules: [
          "Shell(custom-command)",
          "Read(/etc/passwd)",
          "Write(.env*)",
        ],
      });

      const cliJsonFile = result.files.find(
        (f) => f.destinationPath === "/root/workspace/.cursor/cli.json"
      );

      expect(cliJsonFile).toBeDefined();

      const content = Buffer.from(cliJsonFile!.contentBase64, "base64").toString("utf-8");
      const config = JSON.parse(content);

      expect(config.permissions.deny).toContain("Shell(custom-command)");
      expect(config.permissions.deny).toContain("Read(/etc/passwd)");
      expect(config.permissions.deny).toContain("Write(.env*)");
    });
  });
});
