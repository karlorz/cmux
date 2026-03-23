import { describe, expect, it } from "vitest";
import {
  RUNTIME_PROVIDERS,
  SNAPSHOT_PROVIDERS,
  DEVBOX_PROVIDERS,
  CONFIG_PROVIDERS,
  DEFAULT_SANDBOX_PROVIDER,
  type RuntimeProvider,
  type SnapshotProvider,
  type DevboxProvider,
  type ConfigProvider,
} from "./provider-types";

describe("provider-types", () => {
  describe("RUNTIME_PROVIDERS", () => {
    it("contains expected providers", () => {
      expect(RUNTIME_PROVIDERS).toContain("docker");
      expect(RUNTIME_PROVIDERS).toContain("morph");
      expect(RUNTIME_PROVIDERS).toContain("e2b");
      expect(RUNTIME_PROVIDERS).toContain("daytona");
      expect(RUNTIME_PROVIDERS).toContain("pve-lxc");
      expect(RUNTIME_PROVIDERS).toContain("other");
    });

    it("has no duplicates", () => {
      const unique = new Set(RUNTIME_PROVIDERS);
      expect(unique.size).toBe(RUNTIME_PROVIDERS.length);
    });

    it("is a readonly array", () => {
      // TypeScript would catch this, but verify runtime behavior
      expect(Array.isArray(RUNTIME_PROVIDERS)).toBe(true);
    });
  });

  describe("SNAPSHOT_PROVIDERS", () => {
    it("contains all runtime providers", () => {
      for (const provider of RUNTIME_PROVIDERS) {
        expect(SNAPSHOT_PROVIDERS).toContain(provider);
      }
    });

    it("contains pve-vm", () => {
      expect(SNAPSHOT_PROVIDERS).toContain("pve-vm");
    });

    it("has no duplicates", () => {
      const unique = new Set(SNAPSHOT_PROVIDERS);
      expect(unique.size).toBe(SNAPSHOT_PROVIDERS.length);
    });
  });

  describe("DEVBOX_PROVIDERS", () => {
    it("contains expected providers", () => {
      expect(DEVBOX_PROVIDERS).toContain("morph");
      expect(DEVBOX_PROVIDERS).toContain("e2b");
      expect(DEVBOX_PROVIDERS).toContain("modal");
      expect(DEVBOX_PROVIDERS).toContain("daytona");
      expect(DEVBOX_PROVIDERS).toContain("pve-lxc");
    });

    it("does not contain docker", () => {
      expect(DEVBOX_PROVIDERS).not.toContain("docker");
    });

    it("has no duplicates", () => {
      const unique = new Set(DEVBOX_PROVIDERS);
      expect(unique.size).toBe(DEVBOX_PROVIDERS.length);
    });
  });

  describe("CONFIG_PROVIDERS", () => {
    it("contains morph, pve-lxc, pve-vm, e2b", () => {
      expect(CONFIG_PROVIDERS).toContain("morph");
      expect(CONFIG_PROVIDERS).toContain("pve-lxc");
      expect(CONFIG_PROVIDERS).toContain("pve-vm");
      expect(CONFIG_PROVIDERS).toContain("e2b");
    });

    it("has exactly 4 providers", () => {
      expect(CONFIG_PROVIDERS.length).toBe(4);
    });

    it("has no duplicates", () => {
      const unique = new Set(CONFIG_PROVIDERS);
      expect(unique.size).toBe(CONFIG_PROVIDERS.length);
    });
  });

  describe("DEFAULT_SANDBOX_PROVIDER", () => {
    it("is pve-lxc", () => {
      expect(DEFAULT_SANDBOX_PROVIDER).toBe("pve-lxc");
    });

    it("is included in RUNTIME_PROVIDERS", () => {
      expect(RUNTIME_PROVIDERS).toContain(DEFAULT_SANDBOX_PROVIDER);
    });

    it("is included in CONFIG_PROVIDERS", () => {
      expect(CONFIG_PROVIDERS).toContain(DEFAULT_SANDBOX_PROVIDER);
    });
  });

  describe("type compatibility", () => {
    it("RuntimeProvider includes all RUNTIME_PROVIDERS values", () => {
      // This is a compile-time check, but we verify the arrays are compatible
      const checkProvider = (provider: RuntimeProvider) => provider;
      for (const p of RUNTIME_PROVIDERS) {
        expect(() => checkProvider(p)).not.toThrow();
      }
    });

    it("SnapshotProvider includes all SNAPSHOT_PROVIDERS values", () => {
      const checkProvider = (provider: SnapshotProvider) => provider;
      for (const p of SNAPSHOT_PROVIDERS) {
        expect(() => checkProvider(p)).not.toThrow();
      }
    });

    it("DevboxProvider includes all DEVBOX_PROVIDERS values", () => {
      const checkProvider = (provider: DevboxProvider) => provider;
      for (const p of DEVBOX_PROVIDERS) {
        expect(() => checkProvider(p)).not.toThrow();
      }
    });

    it("ConfigProvider includes all CONFIG_PROVIDERS values", () => {
      const checkProvider = (provider: ConfigProvider) => provider;
      for (const p of CONFIG_PROVIDERS) {
        expect(() => checkProvider(p)).not.toThrow();
      }
    });
  });
});
