import { describe, expect, it } from "vitest";
import {
  buildStoppedTaskRunMetadataPatch,
  collectTaskStopTargets,
  isIgnorableTaskStopError,
  shouldMarkTaskRunStopped,
} from "./taskStopHelpers";

describe("taskStopHelpers", () => {
  it("collects only cloud-backed sandbox targets with instance IDs", () => {
    const targets = collectTaskStopTargets([
      {
        _id: "run_morph",
        status: "running",
        vscode: {
          provider: "morph",
          containerName: "morphvm_123",
          status: "running",
        },
      },
      {
        _id: "run_pve",
        status: "running",
        vscode: {
          provider: "pve-lxc",
          containerName: "cr_123",
          status: "running",
        },
      },
      {
        _id: "run_docker",
        status: "running",
        vscode: {
          provider: "docker",
          containerName: "docker-run",
          status: "running",
        },
      },
      {
        _id: "run_missing",
        status: "pending",
        vscode: {
          provider: "e2b",
          status: "starting",
        },
      },
    ]);

    expect(targets).toEqual([
      {
        runId: "run_morph",
        instanceId: "morphvm_123",
        provider: "morph",
      },
      {
        runId: "run_pve",
        instanceId: "cr_123",
        provider: "pve-lxc",
      },
    ]);
  });

  it("builds a stopped metadata patch that preserves networking ports", () => {
    const patch = buildStoppedTaskRunMetadataPatch(
      {
        vscode: {
          provider: "pve-lxc",
          containerName: "cr_123",
          status: "running",
        },
        networking: [
          {
            status: "running",
            port: 39378,
            url: "https://example.test/code",
          },
        ],
      },
      1234
    );

    expect(patch).toEqual({
      vscode: {
        provider: "pve-lxc",
        status: "stopped",
        stoppedAt: 1234,
      },
      networking: [
        {
          status: "stopped",
          port: 39378,
          url: "https://example.test/code",
        },
      ],
    });
  });

  it("marks only pending and running task runs as user-stopped", () => {
    expect(
      shouldMarkTaskRunStopped({
        status: "pending",
      })
    ).toBe(true);
    expect(
      shouldMarkTaskRunStopped({
        status: "running",
      })
    ).toBe(true);
    expect(
      shouldMarkTaskRunStopped({
        status: "completed",
      })
    ).toBe(false);
    expect(
      shouldMarkTaskRunStopped({
        status: "failed",
      })
    ).toBe(false);
  });

  it("treats already-gone sandbox errors as ignorable", () => {
    expect(isIgnorableTaskStopError(new Error("HTTP 404: instance not found"))).toBe(true);
    expect(isIgnorableTaskStopError(new Error("sandbox already deleted"))).toBe(true);
    expect(isIgnorableTaskStopError(new Error("provider timeout"))).toBe(false);
  });
});
