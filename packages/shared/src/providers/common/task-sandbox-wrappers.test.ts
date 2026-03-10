import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { getTaskSandboxWrapperFiles } from "./task-sandbox-wrappers";

describe("getTaskSandboxWrapperFiles", () => {
  it("returns gh and git wrapper files", () => {
    const files = getTaskSandboxWrapperFiles(Buffer);

    expect(files).toHaveLength(2);
    expect(files[0].destinationPath).toBe("/usr/local/bin/gh");
    expect(files[0].mode).toBe("755");
    expect(files[1].destinationPath).toBe("/usr/local/bin/git");
    expect(files[1].mode).toBe("755");
  });

  it("gh wrapper blocks pr create, merge, close, and workflow run", async () => {
    const files = getTaskSandboxWrapperFiles(Buffer);
    const ghContent = Buffer.from(files[0].contentBase64, "base64").toString("utf-8");
    const tempDir = await mkdtemp(join(tmpdir(), "cmux-wrapper-test-"));

    try {
      const wrapperPath = join(tempDir, "gh");
      await writeFile(wrapperPath, ghContent, "utf-8");
      await chmod(wrapperPath, 0o755);

      const jwtEnv = { ...process.env, CMUX_TASK_RUN_JWT: "test-jwt" };

      for (const [sub, cmd] of [
        ["pr", "create"],
        ["pr", "merge"],
        ["pr", "close"],
        ["workflow", "run"],
      ]) {
        const result = spawnSync(wrapperPath, [sub, cmd], {
          env: jwtEnv,
          encoding: "utf-8",
        });
        expect(result.status, `gh ${sub} ${cmd} should be blocked`).toBe(1);
        expect(result.stderr).toContain("blocked in cmux sandboxes");
      }

      // Non-blocked command should pass through
      const passthrough = spawnSync(wrapperPath, ["--version"], {
        env: process.env,
        encoding: "utf-8",
      });
      expect(passthrough.status).toBe(0);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("git wrapper blocks force push flags", async () => {
    const files = getTaskSandboxWrapperFiles(Buffer);
    const gitContent = Buffer.from(files[1].contentBase64, "base64").toString("utf-8");
    const tempDir = await mkdtemp(join(tmpdir(), "cmux-wrapper-test-"));

    try {
      const wrapperPath = join(tempDir, "git");
      await writeFile(wrapperPath, gitContent, "utf-8");
      await chmod(wrapperPath, 0o755);

      const jwtEnv = { ...process.env, CMUX_TASK_RUN_JWT: "test-jwt" };

      for (const flag of ["--force", "--force-with-lease", "-f"]) {
        const result = spawnSync(wrapperPath, ["push", flag, "origin", "main"], {
          env: jwtEnv,
          encoding: "utf-8",
        });
        expect(result.status, `git push ${flag} should be blocked`).toBe(1);
        expect(result.stderr).toContain("git force push is blocked");
      }

      // Normal push should not be blocked by wrapper
      const normalPush = spawnSync(wrapperPath, ["push", "-u", "origin", "feature/test"], {
        env: jwtEnv,
        encoding: "utf-8",
      });
      expect(normalPush.stderr).not.toContain("git force push is blocked");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("wrappers pass through when CMUX_TASK_RUN_JWT is unset", async () => {
    const files = getTaskSandboxWrapperFiles(Buffer);
    const ghContent = Buffer.from(files[0].contentBase64, "base64").toString("utf-8");
    const tempDir = await mkdtemp(join(tmpdir(), "cmux-wrapper-test-"));

    try {
      const wrapperPath = join(tempDir, "gh");
      await writeFile(wrapperPath, ghContent, "utf-8");
      await chmod(wrapperPath, 0o755);

      // Without CMUX_TASK_RUN_JWT, commands should pass through
      const envWithoutJwt = { ...process.env };
      delete envWithoutJwt.CMUX_TASK_RUN_JWT;

      const result = spawnSync(wrapperPath, ["--version"], {
        env: envWithoutJwt,
        encoding: "utf-8",
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("gh version");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
