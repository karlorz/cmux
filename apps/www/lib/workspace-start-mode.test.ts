import { describe, expect, it } from "vitest";
import {
  buildDevshStartCommand,
  buildStartSandboxModeFields,
  detectIsElectron,
  getMirrorLocalUiState,
  isMirrorLocalSupportedForProvider,
  resolveWorkspaceStartMode,
  shouldRecordSandboxOwnership,
  shouldRunSetupProviderAuth,
  validateMirrorLocalApiRequest,
  WORKSPACE_START_MODE_LABELS,
} from "./workspace-start-mode";

describe("resolveWorkspaceStartMode", () => {
  it("defaults when no flags", () => {
    expect(resolveWorkspaceStartMode({})).toBe("default");
  });

  it("selects clean", () => {
    expect(resolveWorkspaceStartMode({ clean: true })).toBe("clean");
  });

  it("mirrorLocal wins over clean", () => {
    expect(
      resolveWorkspaceStartMode({ clean: true, mirrorLocal: true }),
    ).toBe("mirror-local");
  });
});

describe("shouldRunSetupProviderAuth", () => {
  it("runs only for default", () => {
    expect(shouldRunSetupProviderAuth("default")).toBe(true);
    expect(shouldRunSetupProviderAuth("clean")).toBe(false);
    expect(shouldRunSetupProviderAuth("mirror-local")).toBe(false);
  });
});

describe("shouldRecordSandboxOwnership", () => {
  it("always records ownership (clean preserves ownership)", () => {
    expect(shouldRecordSandboxOwnership("default")).toBe(true);
    expect(shouldRecordSandboxOwnership("clean")).toBe(true);
    expect(shouldRecordSandboxOwnership("mirror-local")).toBe(true);
  });
});

describe("isMirrorLocalSupportedForProvider", () => {
  it("rejects morph and e2b", () => {
    expect(isMirrorLocalSupportedForProvider("morph")).toBe(false);
    expect(isMirrorLocalSupportedForProvider("e2b")).toBe(false);
    expect(isMirrorLocalSupportedForProvider("E2B")).toBe(false);
  });

  it("allows pve-lxc", () => {
    expect(isMirrorLocalSupportedForProvider("pve-lxc")).toBe(true);
  });
});

describe("getMirrorLocalUiState", () => {
  it("enables mirror-local only in Electron", () => {
    expect(getMirrorLocalUiState(true)).toEqual({
      enabled: true,
      tooltip: null,
    });
    const browser = getMirrorLocalUiState(false);
    expect(browser.enabled).toBe(false);
    expect(browser.tooltip).toMatch(/Electron/i);
  });
});

describe("buildStartSandboxModeFields", () => {
  it("maps modes to API body fields", () => {
    expect(buildStartSandboxModeFields("default")).toEqual({});
    expect(buildStartSandboxModeFields("clean")).toEqual({ clean: true });
    expect(buildStartSandboxModeFields("mirror-local")).toEqual({
      clean: true,
      mirrorLocal: true,
    });
  });
});

describe("buildDevshStartCommand", () => {
  it("builds clean and mirror-local CLI for pve-lxc", () => {
    expect(buildDevshStartCommand("clean")).toBe(
      "devsh start -p pve-lxc --clean",
    );
    expect(buildDevshStartCommand("mirror-local")).toBe(
      "devsh start -p pve-lxc --clean --mirror-local",
    );
    expect(
      buildDevshStartCommand("mirror-local", {
        snapshotId: "snapshot_d2a97ee6",
      }),
    ).toBe(
      "devsh start -p pve-lxc --clean --mirror-local --snapshot snapshot_d2a97ee6",
    );
  });

  it("default has no clean flags", () => {
    expect(buildDevshStartCommand("default")).toBe("devsh start -p pve-lxc");
  });
});

describe("validateMirrorLocalApiRequest", () => {
  it("allows non-mirror requests", () => {
    expect(
      validateMirrorLocalApiRequest({ mirrorLocal: false, provider: "morph" }),
    ).toBeNull();
  });

  it("rejects morph/e2b with clear error", () => {
    const msg = validateMirrorLocalApiRequest({
      mirrorLocal: true,
      provider: "morph",
    });
    expect(msg).toMatch(/not supported/i);
    expect(msg).toMatch(/morph/i);
  });

  it("rejects server API mirror-local even for pve-lxc (host pack required)", () => {
    const msg = validateMirrorLocalApiRequest({
      mirrorLocal: true,
      provider: "pve-lxc",
    });
    expect(msg).toMatch(/Electron|devsh/i);
  });
});

describe("detectIsElectron", () => {
  it("detects cmux bridge and userAgent", () => {
    expect(detectIsElectron({ window: { cmux: {} } })).toBe(true);
    expect(
      detectIsElectron({ navigator: { userAgent: "Mozilla Electron/1.0" } }),
    ).toBe(true);
    expect(
      detectIsElectron({
        window: {},
        navigator: { userAgent: "Mozilla/5.0 Chrome" },
      }),
    ).toBe(false);
  });
});

describe("WORKSPACE_START_MODE_LABELS", () => {
  it("exposes Clean and Mirror local labels for UI", () => {
    expect(WORKSPACE_START_MODE_LABELS.clean).toBe("Clean");
    expect(WORKSPACE_START_MODE_LABELS["mirror-local"]).toBe("Mirror local");
    expect(WORKSPACE_START_MODE_LABELS.default).toBe("Default");
  });
});
