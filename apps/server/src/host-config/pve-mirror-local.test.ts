import { describe, expect, it, vi } from "vitest";
import type { MirrorLocalPack } from "./mirror-local-pack";
import { applyMirrorLocalPackToPve } from "./pve-mirror-local";

const pack: MirrorLocalPack = {
  archive: Buffer.from("abcdefghij", "utf8"),
  sha256: "a".repeat(64),
  policyVersion: "cmux-mirror-local/v1",
  fileCount: 2,
  expandedBytes: 10,
  compressedBytes: 10,
};

describe("applyMirrorLocalPackToPve", () => {
  it("uploads bounded chunks, verifies checksum and paths, extracts under /root, and cleans up", async () => {
    const commands: string[] = [];
    const exec = vi.fn(async ({ command }: { command: string }) => {
      commands.push(command);
      return { stdout: "", stderr: "", exitCode: 0 };
    });
    const progress: string[] = [];

    await applyMirrorLocalPackToPve({
      instanceId: "pvelxc-123",
      teamSlugOrId: "team-1",
      pack,
      exec,
      chunkSize: 4,
      remoteNonce: "fixed",
      onProgress: (state) => progress.push(state),
    });

    expect(exec).toHaveBeenCalledTimes(6);
    expect(commands[0]).toContain("umask 077");
    expect(commands.slice(1, 5)).toHaveLength(4);
    expect(
      commands.slice(1, 5).every((command) => command.includes("base64 -d")),
    ).toBe(true);
    expect(commands[5]).toContain(pack.sha256);
    expect(commands[5]).toContain("tar -tzf");
    expect(commands[5]).toContain("auth.json");
    expect(commands[5]).toContain("--no-same-owner");
    expect(commands[5]).toContain("--no-same-permissions");
    expect(commands[5]).toContain("-C /root");
    expect(commands[5]).toContain("trap cleanup EXIT");
    expect(progress).toEqual(["uploading", "applying"]);
  });

  it("removes the remote archive when an upload chunk fails", async () => {
    const commands: string[] = [];
    const exec = vi.fn(async ({ command }: { command: string }) => {
      commands.push(command);
      if (commands.length === 2) {
        return { stdout: "", stderr: "upload failed", exitCode: 17 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    });

    await expect(
      applyMirrorLocalPackToPve({
        instanceId: "pvelxc-123",
        teamSlugOrId: "team-1",
        pack,
        exec,
        chunkSize: 4,
        remoteNonce: "fixed",
      }),
    ).rejects.toThrow(/upload failed/i);

    expect(commands.at(-1)).toContain("rm -f");
    expect(commands.at(-1)).toContain("cmux-mirror-fixed.tar.gz");
  });
});
