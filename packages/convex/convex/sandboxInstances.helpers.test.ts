import { describe, expect, it } from "vitest";
import {
  buildSandboxInstanceActivityMetadata,
  buildSandboxInstanceActivityInsert,
} from "./sandboxInstances.helpers";

describe("buildSandboxInstanceActivityMetadata", () => {
  it("returns empty object for empty input", () => {
    const result = buildSandboxInstanceActivityMetadata({});
    expect(result).toEqual({});
  });

  it("includes vmid when provided", () => {
    const result = buildSandboxInstanceActivityMetadata({ vmid: 123 });
    expect(result).toEqual({ vmid: 123 });
  });

  it("includes hostname when provided", () => {
    const result = buildSandboxInstanceActivityMetadata({
      hostname: "test-host",
    });
    expect(result).toEqual({ hostname: "test-host" });
  });

  it("includes snapshotId when provided", () => {
    const result = buildSandboxInstanceActivityMetadata({
      snapshotId: "snap_123",
    });
    expect(result).toEqual({ snapshotId: "snap_123" });
  });

  it("includes snapshotProvider when provided", () => {
    const result = buildSandboxInstanceActivityMetadata({
      snapshotProvider: "morph",
    });
    expect(result).toEqual({ snapshotProvider: "morph" });
  });

  it("includes templateVmid when provided", () => {
    const result = buildSandboxInstanceActivityMetadata({
      templateVmid: 9000,
    });
    expect(result).toEqual({ templateVmid: 9000 });
  });

  it("includes teamId when provided", () => {
    const result = buildSandboxInstanceActivityMetadata({ teamId: "team_abc" });
    expect(result).toEqual({ teamId: "team_abc" });
  });

  it("includes userId when provided", () => {
    const result = buildSandboxInstanceActivityMetadata({ userId: "user_xyz" });
    expect(result).toEqual({ userId: "user_xyz" });
  });

  it("includes isCloudWorkspace when provided", () => {
    const result = buildSandboxInstanceActivityMetadata({
      isCloudWorkspace: true,
    });
    expect(result).toEqual({ isCloudWorkspace: true });
  });

  it("includes all fields when all provided", () => {
    const input = {
      vmid: 100,
      hostname: "host",
      snapshotId: "snap",
      snapshotProvider: "pve-lxc" as const,
      templateVmid: 9000,
      teamId: "team",
      userId: "user",
      isCloudWorkspace: false,
    };
    const result = buildSandboxInstanceActivityMetadata(input);
    expect(result).toEqual(input);
  });

  it("excludes undefined fields", () => {
    const result = buildSandboxInstanceActivityMetadata({
      vmid: 100,
      hostname: undefined,
    });
    expect(result).toEqual({ vmid: 100 });
    expect("hostname" in result).toBe(false);
  });
});

describe("buildSandboxInstanceActivityInsert", () => {
  it("builds insert with required fields", () => {
    const result = buildSandboxInstanceActivityInsert(
      { instanceId: "inst_123", provider: "morph" },
      1000
    );
    expect(result).toEqual({
      instanceId: "inst_123",
      provider: "morph",
      createdAt: 1000,
    });
  });

  it("includes metadata fields", () => {
    const result = buildSandboxInstanceActivityInsert(
      {
        instanceId: "inst_123",
        provider: "pve-lxc",
        vmid: 200,
        hostname: "test-host",
        teamId: "team_abc",
      },
      2000
    );
    expect(result).toEqual({
      instanceId: "inst_123",
      provider: "pve-lxc",
      vmid: 200,
      hostname: "test-host",
      teamId: "team_abc",
      createdAt: 2000,
    });
  });

  it("preserves all metadata fields", () => {
    const result = buildSandboxInstanceActivityInsert(
      {
        instanceId: "inst",
        provider: "e2b",
        vmid: 100,
        hostname: "host",
        snapshotId: "snap",
        snapshotProvider: "morph",
        templateVmid: 9000,
        teamId: "team",
        userId: "user",
        isCloudWorkspace: true,
      },
      3000
    );
    expect(result.instanceId).toBe("inst");
    expect(result.provider).toBe("e2b");
    expect(result.vmid).toBe(100);
    expect(result.hostname).toBe("host");
    expect(result.snapshotId).toBe("snap");
    expect(result.snapshotProvider).toBe("morph");
    expect(result.templateVmid).toBe(9000);
    expect(result.teamId).toBe("team");
    expect(result.userId).toBe("user");
    expect(result.isCloudWorkspace).toBe(true);
    expect(result.createdAt).toBe(3000);
  });
});
