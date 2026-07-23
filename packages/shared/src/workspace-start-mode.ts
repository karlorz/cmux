/**
 * Cloud workspace start modes for team dashboard create-cloud-workspace.
 * Clean: skip setup-providers auth; keep ownership.
 * Mirror-local: implies clean; host pack only (Electron); browser disabled.
 */

export type WorkspaceStartMode = "default" | "clean" | "mirror-local";

export const MIRROR_LOCAL_STATES = [
  "packing",
  "starting-sandbox",
  "uploading",
  "applying",
  "applied",
  "empty",
  "unsupported",
  "failed",
] as const;

export type MirrorLocalState = (typeof MIRROR_LOCAL_STATES)[number];

export const MIRROR_LOCAL_STATUS_MESSAGES: Record<MirrorLocalState, string> = {
  packing: "Packing local agent configuration…",
  "starting-sandbox": "Starting PVE LXC workspace…",
  uploading: "Uploading agent configuration…",
  applying: "Applying agent configuration…",
  applied: "Mirror local workspace ready",
  empty:
    "Workspace started clean; no allowlisted local agent configuration was found.",
  unsupported:
    "Workspace started clean; Mirror local supports PVE LXC sandboxes only.",
  failed:
    "Workspace started, but local agent configuration could not be mirrored. The workspace is usable as a Clean workspace.",
};

export type WorkspaceStartModeInput = {
  clean?: boolean;
  mirrorLocal?: boolean;
};

/** Resolve exclusive start mode. mirrorLocal wins over clean. */
export function resolveWorkspaceStartMode(
  input: WorkspaceStartModeInput,
): WorkspaceStartMode {
  if (input.mirrorLocal) return "mirror-local";
  if (input.clean) return "clean";
  return "default";
}

/** setup-providers injection runs only in default mode. */
export function shouldRunSetupProviderAuth(mode: WorkspaceStartMode): boolean {
  return mode === "default";
}

export function shouldRecordSandboxOwnership(
  _mode: WorkspaceStartMode,
): boolean {
  return true;
}

export type MirrorLocalUiState = {
  enabled: boolean;
  tooltip: string | null;
};

export type MirrorLocalUiStateInput = {
  isElectron: boolean;
  provider?: string | null;
};

export function getMirrorLocalUiState({
  isElectron,
  provider,
}: MirrorLocalUiStateInput): MirrorLocalUiState {
  if (!isElectron) {
    return {
      enabled: false,
      tooltip:
        "Mirror local agent config requires the Electron app (host filesystem). Use Clean in the browser, or open the desktop app.",
    };
  }

  if (!provider) {
    return {
      enabled: false,
      tooltip:
        "Select a PVE LXC environment to use Mirror local in the Electron app.",
    };
  }

  if (provider === "pve-lxc") {
    return { enabled: true, tooltip: null };
  }

  return {
    enabled: false,
    tooltip: `Mirror local currently supports PVE LXC environments only (selected provider: ${provider}).`,
  };
}

export type CreateCloudWorkspaceModeFields = {
  clean?: boolean;
  mirrorLocal?: boolean;
};

/**
 * Fields to merge into create-cloud-workspace emit / sandboxes start body.
 * mirror-local implies clean for auth skip; pack is host-side.
 */
export function buildCreateCloudWorkspaceModeFields(
  mode: WorkspaceStartMode,
): CreateCloudWorkspaceModeFields {
  switch (mode) {
    case "clean":
      return { clean: true };
    case "mirror-local":
      return { clean: true, mirrorLocal: true };
    default:
      return {};
  }
}

/** Sandboxes start body fields derived from create-cloud-workspace flags. */
export function buildSandboxesStartModeFields(input: WorkspaceStartModeInput): {
  clean?: boolean;
} {
  const mode = resolveWorkspaceStartMode(input);
  if (mode === "default") return {};
  // Server API never packs host FS; mirrorLocal is client/host only.
  // Always forward clean when clean or mirror-local.
  return { clean: true };
}

export const WORKSPACE_START_MODE_LABELS: Record<WorkspaceStartMode, string> = {
  default: "Default",
  clean: "Clean",
  "mirror-local": "Mirror local",
};

export const WORKSPACE_START_MODES: readonly WorkspaceStartMode[] = [
  "default",
  "clean",
  "mirror-local",
] as const;
