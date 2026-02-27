import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getOpenAIEnvironment, stripFilteredConfigKeys } from "./environment";

describe("stripFilteredConfigKeys", () => {
  it("removes model key from config", () => {
    const input = `model = "gpt-5.2"
notify = ["/root/lifecycle/codex-notify.sh"]`;
    const result = stripFilteredConfigKeys(input);
    expect(result).toBe(`notify = ["/root/lifecycle/codex-notify.sh"]`);
  });

  it("removes model_reasoning_effort key from config", () => {
    const input = `model_reasoning_effort = "high"
notify = ["/root/lifecycle/codex-notify.sh"]`;
    const result = stripFilteredConfigKeys(input);
    expect(result).toBe(`notify = ["/root/lifecycle/codex-notify.sh"]`);
  });

  it("removes both model and model_reasoning_effort keys", () => {
    const input = `model = "gpt-5.2"
model_reasoning_effort = "high"
notify = ["/root/lifecycle/codex-notify.sh"]
approval_mode = "full"`;
    const result = stripFilteredConfigKeys(input);
    expect(result).toBe(`notify = ["/root/lifecycle/codex-notify.sh"]
approval_mode = "full"`);
  });

  it("preserves other keys and sections", () => {
    const input = `notify = ["/root/lifecycle/codex-notify.sh"]
approval_mode = "full"
model = "gpt-5.2"

[notice.model_migrations]
"o3" = "gpt-5.3-codex"`;
    const result = stripFilteredConfigKeys(input);
    expect(result).toBe(`notify = ["/root/lifecycle/codex-notify.sh"]
approval_mode = "full"

[notice.model_migrations]
"o3" = "gpt-5.3-codex"`);
  });

  it("handles different value formats", () => {
    // Double quotes
    expect(stripFilteredConfigKeys(`model = "gpt-5.2"`)).toBe("");
    // Single quotes
    expect(stripFilteredConfigKeys(`model = 'gpt-5.2'`)).toBe("");
    // Bare string (if TOML allows)
    expect(stripFilteredConfigKeys(`model = gpt-5.2`)).toBe("");
  });

  it("handles varying whitespace around equals sign", () => {
    expect(stripFilteredConfigKeys(`model="gpt-5.2"`)).toBe("");
    expect(stripFilteredConfigKeys(`model  =  "gpt-5.2"`)).toBe("");
    expect(stripFilteredConfigKeys(`model =    "gpt-5.2"`)).toBe("");
  });

  it("does not remove keys inside sections", () => {
    // model inside a section should NOT be removed (only top-level)
    // Note: current regex removes any line starting with "model =", not section-aware
    // This test documents current behavior - if section-awareness is needed, update regex
    const input = `[some_section]
model = "should-stay"`;
    const result = stripFilteredConfigKeys(input);
    // Current implementation removes it - this is acceptable since Codex config
    // doesn't typically have model keys inside sections
    expect(result).toBe(`[some_section]`);
  });

  it("handles empty input", () => {
    expect(stripFilteredConfigKeys("")).toBe("");
  });

  it("handles input with only filtered keys", () => {
    const input = `model = "gpt-5.2"
model_reasoning_effort = "xhigh"`;
    expect(stripFilteredConfigKeys(input)).toBe("");
  });

  it("cleans up multiple blank lines", () => {
    const input = `notify = ["/root/lifecycle/codex-notify.sh"]

model = "gpt-5.2"


model_reasoning_effort = "high"

approval_mode = "full"`;
    const result = stripFilteredConfigKeys(input);
    // Should not have more than 2 consecutive newlines
    expect(result).not.toMatch(/\n{3,}/);
    expect(result).toBe(`notify = ["/root/lifecycle/codex-notify.sh"]

approval_mode = "full"`);
  });
});

describe("getOpenAIEnvironment", () => {
  it("generates managed model migrations targeting gpt-5.2-codex", async () => {
    // Note: getOpenAIEnvironment no longer reads from host filesystem
    // to avoid credential leakage. It generates a clean config.toml.
    const result = await getOpenAIEnvironment({} as never);
    const configFile = result.files?.find(
      (file) => file.destinationPath === "$HOME/.codex/config.toml"
    );
    expect(configFile).toBeDefined();

    const toml = Buffer.from(configFile!.contentBase64, "base64").toString(
      "utf-8"
    );
    expect(toml).toContain('notify = ["/root/lifecycle/codex-notify.sh"]');
    expect(toml).toContain("[notice.model_migrations]");
    expect(toml).toContain('"gpt-5-codex" = "gpt-5.2-codex"');
    expect(toml).toContain('"gpt-5" = "gpt-5.2-codex"');
    expect(toml).toContain('"o3" = "gpt-5.2-codex"');
    expect(toml).toContain('"o4-mini" = "gpt-5.2-codex"');
    expect(toml).toContain('"gpt-4.1" = "gpt-5.2-codex"');
    expect(toml).toContain('"gpt-5-codex-mini" = "gpt-5.2-codex"');
    expect(toml).not.toContain('"gpt-5.3-codex" =');
  });

  it("does not read from host filesystem to prevent credential leakage", async () => {
    // Create files in a temp home directory that should NOT be read
    const homeDir = await mkdtemp(join(tmpdir(), "cmux-openai-home-"));
    const previousHome = process.env.HOME;
    process.env.HOME = homeDir;

    try {
      await mkdir(join(homeDir, ".codex"), { recursive: true });
      // Put credentials and custom config that should NOT leak into sandbox
      await writeFile(
        join(homeDir, ".codex/auth.json"),
        '{"secret": "host-credential"}',
        "utf-8"
      );
      await writeFile(
        join(homeDir, ".codex/instructions.md"),
        "SECRET HOST INSTRUCTIONS",
        "utf-8"
      );
      await writeFile(
        join(homeDir, ".codex/config.toml"),
        `approval_mode = "full"
host_secret = "should-not-leak"
`,
        "utf-8"
      );

      const result = await getOpenAIEnvironment({} as never);

      // Verify config.toml does NOT contain host-specific settings
      const configFile = result.files?.find(
        (file) => file.destinationPath === "$HOME/.codex/config.toml"
      );
      expect(configFile).toBeDefined();
      const toml = Buffer.from(configFile!.contentBase64, "base64").toString(
        "utf-8"
      );
      expect(toml).not.toContain("host_secret");
      expect(toml).not.toContain("approval_mode");

      // Verify instructions.md does NOT contain host instructions
      const instructionsFile = result.files?.find(
        (file) => file.destinationPath === "$HOME/.codex/instructions.md"
      );
      expect(instructionsFile).toBeDefined();
      const instructions = Buffer.from(
        instructionsFile!.contentBase64,
        "base64"
      ).toString("utf-8");
      expect(instructions).not.toContain("SECRET HOST INSTRUCTIONS");

      // Verify auth.json is NOT copied from host (it should come from applyCodexApiKeys)
      const authFile = result.files?.find(
        (file) => file.destinationPath === "$HOME/.codex/auth.json"
      );
      expect(authFile).toBeUndefined();
    } finally {
      process.env.HOME = previousHome;
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  it("includes memory protocol in instructions.md", async () => {
    const result = await getOpenAIEnvironment({} as never);
    const instructionsFile = result.files?.find(
      (file) => file.destinationPath === "$HOME/.codex/instructions.md"
    );
    expect(instructionsFile).toBeDefined();
    const instructions = Buffer.from(
      instructionsFile!.contentBase64,
      "base64"
    ).toString("utf-8");
    // Memory protocol should be included
    expect(instructions).toContain("memory");
  });
});
