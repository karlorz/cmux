import { describe, expect, it, vi } from "vitest";

import { waitForPveExecReady } from "./pve-lxc.resume.helpers";

describe("waitForPveExecReady", () => {
  it("accepts a successful ready probe", async () => {
    const exec = vi.fn(async () => ({
      exit_code: 0,
      stdout: "ready",
      stderr: "",
    }));

    await expect(waitForPveExecReady({ id: "pvelxc-test", exec })).resolves.toBeUndefined();
    expect(exec).toHaveBeenCalledWith("echo ready", { timeoutMs: 10_000 });
  });

  it("surfaces timeout failures", async () => {
    const exec = vi.fn(async () => {
      throw new Error("request timed out");
    });

    await expect(
      waitForPveExecReady({ id: "pvelxc-test", exec }),
    ).rejects.toThrow("PVE exec endpoint not ready for pvelxc-test: request timed out");
  });

  it("rejects non-zero exit codes", async () => {
    const exec = vi.fn(async () => ({
      exit_code: 1,
      stdout: "",
      stderr: "connection refused",
    }));

    await expect(
      waitForPveExecReady({ id: "pvelxc-test", exec }),
    ).rejects.toThrow("readiness probe exited with code 1: connection refused");
  });

  it("rejects probes that never report ready", async () => {
    const exec = vi.fn(async () => ({
      exit_code: 0,
      stdout: "starting",
      stderr: "",
    }));

    await expect(
      waitForPveExecReady({ id: "pvelxc-test", exec }),
    ).rejects.toThrow('readiness probe did not report ready: "starting"');
  });
});
