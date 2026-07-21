import { describe, expect, it } from "vitest";
import {
  buildCreateCloudWorkspaceModeFields,
  buildDevshMirrorLocalCommand,
  buildSandboxesStartModeFields,
  getMirrorLocalUiState,
  resolveWorkspaceStartMode,
  shouldRecordSandboxOwnership,
  shouldRunSetupProviderAuth,
  WORKSPACE_START_MODE_LABELS,
  WORKSPACE_START_MODES,
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
  it("always records", () => {
    expect(shouldRecordSandboxOwnership("default")).toBe(true);
    expect(shouldRecordSandboxOwnership("clean")).toBe(true);
    expect(shouldRecordSandboxOwnership("mirror-local")).toBe(true);
  });
});

describe("getMirrorLocalUiState", () => {
  it("enables only in Electron", () => {
    expect(getMirrorLocalUiState(true)).toEqual({
      enabled: true,
      tooltip: null,
    });
    const browser = getMirrorLocalUiState(false);
    expect(browser.enabled).toBe(false);
    expect(browser.tooltip).toMatch(/Electron/i);
  });
});

describe("buildCreateCloudWorkspaceModeFields", () => {
  it("maps modes for socket emit", () => {
    expect(buildCreateCloudWorkspaceModeFields("default")).toEqual({});
    expect(buildCreateCloudWorkspaceModeFields("clean")).toEqual({
      clean: true,
    });
    expect(buildCreateCloudWorkspaceModeFields("mirror-local")).toEqual({
      clean: true,
      mirrorLocal: true,
    });
  });
});

describe("buildSandboxesStartModeFields", () => {
  it("forwards clean for clean and mirror-local; default empty", () => {
    expect(buildSandboxesStartModeFields({})).toEqual({});
    expect(buildSandboxesStartModeFields({ clean: true })).toEqual({
      clean: true,
    });
    // mirror implies clean on sandboxes start (server cannot pack host FS)
    expect(buildSandboxesStartModeFields({ mirrorLocal: true })).toEqual({
      clean: true,
    });
  });
});

describe("labels and modes for dashboard UI", () => {
  it("exposes Default Clean Mirror local", () => {
    expect(WORKSPACE_START_MODES).toEqual([
      "default",
      "clean",
      "mirror-local",
    ]);
    expect(WORKSPACE_START_MODE_LABELS.default).toBe("Default");
    expect(WORKSPACE_START_MODE_LABELS.clean).toBe("Clean");
    expect(WORKSPACE_START_MODE_LABELS["mirror-local"]).toBe("Mirror local");
  });
});

describe("buildDevshMirrorLocalCommand", () => {
  it("builds host CLI for soft-fail guidance", () => {
    expect(buildDevshMirrorLocalCommand()).toBe(
      "devsh start -p pve-lxc --clean --mirror-local",
    );
  });
});
