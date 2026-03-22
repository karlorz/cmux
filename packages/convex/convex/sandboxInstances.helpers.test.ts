import { describe, expect, it } from "vitest";
import {
  buildSandboxInstanceActivityMetadata,
  buildSandboxInstanceActivityInsert,
} from "./sandboxInstances.helpers";
import { detectProviderFromInstanceId } from "./sandboxInstances";

describe("sandboxInstances", () => {
  describe("detectProviderFromInstanceId", () => {
    it("detects morph provider from morphvm_ prefix", () => {
      expect(detectProviderFromInstanceId("morphvm_abc123")).toBe("morph");
      expect(detectProviderFromInstanceId("morphvm_q11mhv3p")).toBe("morph");
    });

    it("detects pve-lxc provider from pvelxc- prefix", () => {
      expect(detectProviderFromInstanceId("pvelxc-9001")).toBe("pve-lxc");
      expect(detectProviderFromInstanceId("pvelxc-12345")).toBe("pve-lxc");
    });

    it("detects docker provider from docker_ prefix", () => {
      expect(detectProviderFromInstanceId("docker_container123")).toBe("docker");
      expect(detectProviderFromInstanceId("docker_abc")).toBe("docker");
    });

    it("detects daytona provider from daytona_ prefix", () => {
      expect(detectProviderFromInstanceId("daytona_workspace1")).toBe("daytona");
      expect(detectProviderFromInstanceId("daytona_xyz")).toBe("daytona");
    });

    it("returns other for unknown prefixes", () => {
      expect(detectProviderFromInstanceId("unknown_abc")).toBe("other");
      expect(detectProviderFromInstanceId("random-id")).toBe("other");
      expect(detectProviderFromInstanceId("")).toBe("other");
    });

    it("is case-sensitive for prefixes", () => {
      // Uppercase should not match
      expect(detectProviderFromInstanceId("MORPHVM_abc")).toBe("other");
      expect(detectProviderFromInstanceId("Docker_abc")).toBe("other");
    });

    it("requires exact prefix match", () => {
      // Missing underscore
      expect(detectProviderFromInstanceId("morphvmabc123")).toBe("other");
      // Different separator
      expect(detectProviderFromInstanceId("docker-container123")).toBe("other");
    });
  });
});

describe("sandboxInstances.helpers", () => {
  describe("buildSandboxInstanceActivityMetadata", () => {
    it("returns empty object for empty input", () => {
      const result = buildSandboxInstanceActivityMetadata({});
      expect(result).toEqual({});
    });

    it("includes vmid when provided", () => {
      const result = buildSandboxInstanceActivityMetadata({
        vmid: 9001,
      });
      expect(result).toEqual({ vmid: 9001 });
    });

    it("includes hostname when provided", () => {
      const result = buildSandboxInstanceActivityMetadata({
        hostname: "sandbox-123.example.com",
      });
      expect(result).toEqual({ hostname: "sandbox-123.example.com" });
    });

    it("includes snapshotId when provided", () => {
      const result = buildSandboxInstanceActivityMetadata({
        snapshotId: "snap_abc123",
      });
      expect(result).toEqual({ snapshotId: "snap_abc123" });
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
      const result = buildSandboxInstanceActivityMetadata({
        teamId: "team_xyz",
      });
      expect(result).toEqual({ teamId: "team_xyz" });
    });

    it("includes userId when provided", () => {
      const result = buildSandboxInstanceActivityMetadata({
        userId: "user_abc",
      });
      expect(result).toEqual({ userId: "user_abc" });
    });

    it("includes isCloudWorkspace when provided", () => {
      const result = buildSandboxInstanceActivityMetadata({
        isCloudWorkspace: true,
      });
      expect(result).toEqual({ isCloudWorkspace: true });
    });

    it("includes isCloudWorkspace false when explicitly set", () => {
      const result = buildSandboxInstanceActivityMetadata({
        isCloudWorkspace: false,
      });
      expect(result).toEqual({ isCloudWorkspace: false });
    });

    it("includes all fields when all provided", () => {
      const result = buildSandboxInstanceActivityMetadata({
        vmid: 9001,
        hostname: "sandbox.example.com",
        snapshotId: "snap_123",
        snapshotProvider: "pve-lxc",
        templateVmid: 9000,
        teamId: "team_abc",
        userId: "user_xyz",
        isCloudWorkspace: true,
      });
      expect(result).toEqual({
        vmid: 9001,
        hostname: "sandbox.example.com",
        snapshotId: "snap_123",
        snapshotProvider: "pve-lxc",
        templateVmid: 9000,
        teamId: "team_abc",
        userId: "user_xyz",
        isCloudWorkspace: true,
      });
    });

    it("excludes undefined values", () => {
      const result = buildSandboxInstanceActivityMetadata({
        vmid: undefined,
        hostname: "test.com",
      });
      expect(result).toEqual({ hostname: "test.com" });
      expect("vmid" in result).toBe(false);
    });

    it("handles vmid of 0 as valid", () => {
      const result = buildSandboxInstanceActivityMetadata({
        vmid: 0,
      });
      expect(result).toEqual({ vmid: 0 });
    });

    it("handles empty string hostname as valid", () => {
      const result = buildSandboxInstanceActivityMetadata({
        hostname: "",
      });
      expect(result).toEqual({ hostname: "" });
    });
  });

  describe("buildSandboxInstanceActivityInsert", () => {
    it("includes required fields and createdAt", () => {
      const result = buildSandboxInstanceActivityInsert(
        {
          instanceId: "morphvm_abc123",
          provider: "morph",
        },
        1700000000000
      );
      expect(result).toEqual({
        instanceId: "morphvm_abc123",
        provider: "morph",
        createdAt: 1700000000000,
      });
    });

    it("merges metadata fields", () => {
      const result = buildSandboxInstanceActivityInsert(
        {
          instanceId: "pvelxc-9001",
          provider: "pve-lxc",
          vmid: 9001,
          hostname: "sandbox.local",
          teamId: "team_123",
        },
        1700000000000
      );
      expect(result).toEqual({
        instanceId: "pvelxc-9001",
        provider: "pve-lxc",
        vmid: 9001,
        hostname: "sandbox.local",
        teamId: "team_123",
        createdAt: 1700000000000,
      });
    });

    it("includes all optional metadata fields", () => {
      const result = buildSandboxInstanceActivityInsert(
        {
          instanceId: "docker_xyz",
          provider: "docker",
          vmid: 100,
          hostname: "docker-host",
          snapshotId: "snap_001",
          snapshotProvider: "docker",
          templateVmid: 50,
          teamId: "team_a",
          userId: "user_b",
          isCloudWorkspace: false,
        },
        1234567890000
      );
      expect(result).toEqual({
        instanceId: "docker_xyz",
        provider: "docker",
        vmid: 100,
        hostname: "docker-host",
        snapshotId: "snap_001",
        snapshotProvider: "docker",
        templateVmid: 50,
        teamId: "team_a",
        userId: "user_b",
        isCloudWorkspace: false,
        createdAt: 1234567890000,
      });
    });

    it("handles different provider types", () => {
      const providers = ["morph", "pve-lxc", "docker", "daytona", "other"] as const;
      for (const provider of providers) {
        const result = buildSandboxInstanceActivityInsert(
          {
            instanceId: `${provider}_test`,
            provider,
          },
          Date.now()
        );
        expect(result.provider).toBe(provider);
      }
    });

    it("excludes undefined optional fields", () => {
      const result = buildSandboxInstanceActivityInsert(
        {
          instanceId: "test_123",
          provider: "morph",
          vmid: undefined,
          teamId: "team_1",
        },
        1000
      );
      expect(result).toEqual({
        instanceId: "test_123",
        provider: "morph",
        teamId: "team_1",
        createdAt: 1000,
      });
      expect("vmid" in result).toBe(false);
    });
  });
});
