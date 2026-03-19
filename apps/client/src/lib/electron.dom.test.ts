/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

describe("electron utilities", () => {
  // We need to reset modules for each test since isElectron is computed at import time
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    // Clean up window properties
    const w = window as unknown as { cmux?: unknown; electron?: unknown; process?: { type?: string } };
    delete w.cmux;
    delete w.electron;
    delete w.process;
  });

  describe("getIsElectron", () => {
    it("returns false in standard browser environment", async () => {
      const { getIsElectron } = await import("./electron");
      expect(getIsElectron()).toBe(false);
    });

    it("returns true when window.cmux is present", async () => {
      const w = window as unknown as { cmux?: unknown };
      w.cmux = { some: "api" };

      const { getIsElectron } = await import("./electron");
      expect(getIsElectron()).toBe(true);
    });

    it("returns true when window.electron is present", async () => {
      const w = window as unknown as { electron?: unknown };
      w.electron = { ipcRenderer: {} };

      const { getIsElectron } = await import("./electron");
      expect(getIsElectron()).toBe(true);
    });

    it("returns true when process.type is renderer", async () => {
      const w = window as unknown as { process?: { type?: string } };
      w.process = { type: "renderer" };

      const { getIsElectron } = await import("./electron");
      expect(getIsElectron()).toBe(true);
    });

    it("returns true when userAgent includes Electron", async () => {
      // Mock navigator.userAgent
      const originalNavigator = window.navigator;
      const mockNavigator = {
        ...originalNavigator,
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Electron/22.0.0",
      };
      Object.defineProperty(window, "navigator", {
        value: mockNavigator,
        writable: true,
        configurable: true,
      });

      const { getIsElectron } = await import("./electron");
      expect(getIsElectron()).toBe(true);

      // Restore
      Object.defineProperty(window, "navigator", {
        value: originalNavigator,
        writable: true,
        configurable: true,
      });
    });
  });

  describe("getElectronBridge", () => {
    it("returns undefined in non-Electron environment", async () => {
      const { getElectronBridge } = await import("./electron");
      expect(getElectronBridge()).toBeUndefined();
    });

    it("returns window.cmux when in Electron with bridge", async () => {
      const mockBridge = {
        openExternal: vi.fn(),
        getAppVersion: vi.fn(),
      };
      const w = window as unknown as { cmux?: unknown };
      w.cmux = mockBridge;

      const { getElectronBridge } = await import("./electron");
      const bridge = getElectronBridge();

      expect(bridge).toBe(mockBridge);
    });
  });

  describe("isElectron constant", () => {
    it("is computed at module load time", async () => {
      const { isElectron } = await import("./electron");
      // In jsdom without electron setup, should be false
      expect(typeof isElectron).toBe("boolean");
    });
  });
});
