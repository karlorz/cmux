import { describe, expect, it } from "vitest";
import {
  executeAgent,
  executeResume,
  checkDevshAvailable,
} from "./executor.js";
import { SpawnOptionsSchema, ResumeOptionsSchema } from "./types.js";

function jsonResult(value: unknown) {
  return { stdout: JSON.stringify(value), stderr: "", exitCode: 0 };
}

function makeExecaCapture() {
  const calls: { bin: string; args: string[] }[] = [];
  const execaFn = (bin: string, args: string[]) => {
    calls.push({ bin, args: [...args] });
    return Promise.resolve(jsonResult({}));
  };
  return { calls, execaFn: execaFn as never };
}

describe("executeAgent", () => {
  it("routes remote provider to orchestrate spawn", async () => {
    const { calls, execaFn } = makeExecaCapture();
    const options = SpawnOptionsSchema.parse({
      agent: "claude/haiku-4.5",
      prompt: "Fix the bug",
      provider: "pve-lxc",
    });
    await executeAgent(options, execaFn);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toContain("spawn");
    expect(calls[0]?.args).toContain("--provider");
    expect(calls[0]?.args).toContain("pve-lxc");
    expect(calls[0]?.args).toContain("--agent");
    expect(calls[0]?.args).toContain("claude/haiku-4.5");
    expect(calls[0]?.args).toContain("Fix the bug");
  });

  it("routes local provider to run-local", async () => {
    const { calls, execaFn } = makeExecaCapture();
    const options = SpawnOptionsSchema.parse({
      agent: "claude/haiku-4.5",
      prompt: "Quick fix",
      provider: "local",
    });
    await executeAgent(options, execaFn);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toContain("run-local");
    expect(calls[0]?.args).toContain("--persist");
    expect(calls[0]?.args).not.toContain("--provider");
    expect(calls[0]?.args).not.toContain("spawn");
  });

  it("skips repo and branch for local execution", async () => {
    const { calls, execaFn } = makeExecaCapture();
    const options = SpawnOptionsSchema.parse({
      agent: "codex/gpt-5.1-codex-mini",
      prompt: "Quick fix",
      provider: "local",
      repo: "owner/repo",
    });
    await executeAgent(options, execaFn);

    expect(calls[0]?.args).not.toContain("--repo");
    expect(calls[0]?.args).not.toContain("--branch");
  });

  it("includes repo and branch for remote execution", async () => {
    const { calls, execaFn } = makeExecaCapture();
    const options = SpawnOptionsSchema.parse({
      agent: "claude/haiku-4.5",
      prompt: "Fix",
      provider: "morph",
      repo: "owner/repo",
      branch: "feature",
    });
    await executeAgent(options, execaFn);

    expect(calls[0]?.args).toContain("--repo");
    expect(calls[0]?.args).toContain("owner/repo");
    expect(calls[0]?.args).toContain("--branch");
    expect(calls[0]?.args).toContain("feature");
  });

  it("includes Claude Agent SDK options for claude/* agents", async () => {
    const { calls, execaFn } = makeExecaCapture();
    const options = SpawnOptionsSchema.parse({
      agent: "claude/opus-4.6",
      prompt: "Review code",
      provider: "pve-lxc",
      permissionMode: "acceptEdits",
      settingSources: ["user"],
      systemPrompt: { type: "preset", preset: "minimal" },
      allowedTools: ["Read", "Write"],
    });
    await executeAgent(options, execaFn);

    const args = calls[0]?.args ?? [];
    expect(args).toContain("--permission-mode");
    expect(args).toContain("acceptEdits");
    expect(args).toContain("--setting-sources");
    expect(args).toContain("user");
    expect(args).toContain("--system-prompt-preset");
    expect(args).toContain("minimal");
    expect(args).toContain("--allowed-tools");
    expect(args).toContain("Read,Write");
  });

  it("does not include Claude SDK options for non-claude agents", async () => {
    const { calls, execaFn } = makeExecaCapture();
    const options = SpawnOptionsSchema.parse({
      agent: "codex/gpt-5.4",
      prompt: "Fix",
      provider: "pve-lxc",
    });
    await executeAgent(options, execaFn);

    const args = calls[0]?.args ?? [];
    expect(args).not.toContain("--permission-mode");
    expect(args).not.toContain("--setting-sources");
  });
});

describe("executeResume", () => {
  it("routes local_ prefix to inject-local", async () => {
    const { calls, execaFn } = makeExecaCapture();
    const options = ResumeOptionsSchema.parse({
      sessionId: "local_abc123",
      message: "Continue the task",
      devshPath: "devsh",
    });
    await executeResume(options, execaFn);

    expect(calls[0]?.args).toContain("inject-local");
    expect(calls[0]?.args).toContain("local_abc123");
    expect(calls[0]?.args).toContain("Continue the task");
    expect(calls[0]?.args).not.toContain("message");
  });

  it("routes path reference to inject-local", async () => {
    const { calls, execaFn } = makeExecaCapture();
    const options = ResumeOptionsSchema.parse({
      sessionId: "/home/user/.devsh/orchestrations/local_123",
      message: "Continue",
      devshPath: "devsh",
    });
    await executeResume(options, execaFn);

    expect(calls[0]?.args).toContain("inject-local");
  });

  it("routes local provider to inject-local", async () => {
    const { calls, execaFn } = makeExecaCapture();
    const options = ResumeOptionsSchema.parse({
      sessionId: "some_session",
      message: "Continue",
      provider: "local",
      devshPath: "devsh",
    });
    await executeResume(options, execaFn);

    expect(calls[0]?.args).toContain("inject-local");
  });

  it("routes remote task run ID to orchestrate message", async () => {
    const { calls, execaFn } = makeExecaCapture();
    const options = ResumeOptionsSchema.parse({
      sessionId: "taskrun_abc123",
      message: "Continue the task",
      devshPath: "devsh",
    });
    await executeResume(options, execaFn);

    expect(calls[0]?.args).toContain("message");
    expect(calls[0]?.args).toContain("taskrun_abc123");
    expect(calls[0]?.args).toContain("Continue the task");
    expect(calls[0]?.args).toContain("--type");
    expect(calls[0]?.args).toContain("request");
    expect(calls[0]?.args).not.toContain("inject-local");
  });
});

describe("checkDevshAvailable", () => {
  it("returns available when devsh responds", async () => {
    const execaFn = (_bin: string, _args: string[]) =>
      Promise.resolve({ stdout: "devsh 0.1.0", stderr: "", exitCode: 0 });
    const result = await checkDevshAvailable("devsh", execaFn as never);
    expect(result.available).toBe(true);
    expect(result.version).toBe("devsh 0.1.0");
  });

  it("returns unavailable when devsh throws", async () => {
    const execaFn = () => Promise.reject(new Error("command not found"));
    const result = await checkDevshAvailable("devsh", execaFn as never);
    expect(result.available).toBe(false);
    expect(result.error).toContain("command not found");
  });
});
