/**
 * Workspace start modes for Start Workspace (hybrid Clean / Mirror-local).
 *
 * Locked preflight decisions:
 * - Clean: ownership still recorded; skip setup-providers auth injection
 * - Mirror-local: Electron/host only (local devsh pack+push); pure browser disabled
 * - Templates: CLI-only (no UI picker)
 * - Morph/E2B: mirror-local unsupported
 */

export type WorkspaceStartMode = "default" | "clean" | "mirror-local";

export type WorkspaceStartModeInput = {
  clean?: boolean;
  mirrorLocal?: boolean;
};

export type SandboxProviderKind = "morph" | "pve-lxc" | "e2b" | string;

/** Resolve exclusive start mode. mirrorLocal wins over clean (implies clean for auth). */
export function resolveWorkspaceStartMode(
  input: WorkspaceStartModeInput,
): WorkspaceStartMode {
  if (input.mirrorLocal) return "mirror-local";
  if (input.clean) return "clean";
  return "default";
}

/** setup-providers injection should run only in default mode. */
export function shouldRunSetupProviderAuth(mode: WorkspaceStartMode): boolean {
  return mode === "default";
}

/**
 * Ownership recording (RecordSandboxCreate / team sandbox records) stays on for
 * clean and mirror-local; default also records as today.
 */
export function shouldRecordSandboxOwnership(
  _mode: WorkspaceStartMode,
): boolean {
  return true;
}

export function isMirrorLocalSupportedForProvider(
  provider: SandboxProviderKind | undefined | null,
): boolean {
  if (!provider) return true; // unknown: allow UI to attempt host path
  const p = provider.toLowerCase();
  if (p === "morph" || p === "e2b") return false;
  return true;
}

export type MirrorLocalUiState = {
  enabled: boolean;
  tooltip: string | null;
};

export function getMirrorLocalUiState(isElectron: boolean): MirrorLocalUiState {
  if (isElectron) {
    return { enabled: true, tooltip: null };
  }
  return {
    enabled: false,
    tooltip:
      "Mirror local agent config requires the Electron app (local devsh on this machine). Use Clean in the browser, or open cmux desktop.",
  };
}

export type StartSandboxModeFields = {
  clean?: boolean;
  mirrorLocal?: boolean;
};

/** Fields to merge into POST /api/sandboxes/start body for the selected mode. */
export function buildStartSandboxModeFields(
  mode: WorkspaceStartMode,
): StartSandboxModeFields {
  switch (mode) {
    case "clean":
      return { clean: true };
    case "mirror-local":
      // Server still skips setup-providers; host pack is Electron/devsh.
      return { clean: true, mirrorLocal: true };
    default:
      return {};
  }
}

export type DevshStartCommandOptions = {
  provider?: string;
  snapshotId?: string;
  path?: string;
};

/** Local CLI invocation for Electron host path (pve-lxc reference). */
export function buildDevshStartCommand(
  mode: WorkspaceStartMode,
  options: DevshStartCommandOptions = {},
): string {
  const parts = ["devsh", "start"];
  const provider = options.provider?.trim() || "pve-lxc";
  parts.push("-p", provider);
  if (mode === "clean") {
    parts.push("--clean");
  } else if (mode === "mirror-local") {
    parts.push("--clean", "--mirror-local");
  }
  if (options.snapshotId?.trim()) {
    parts.push("--snapshot", options.snapshotId.trim());
  }
  if (options.path?.trim()) {
    parts.push(options.path.trim());
  }
  return parts.join(" ");
}

/**
 * Server-side validation for mirrorLocal on the API path.
 * Returns an error message when the request must be rejected; null if OK.
 */
export function validateMirrorLocalApiRequest(params: {
  mirrorLocal: boolean;
  provider?: SandboxProviderKind | null;
}): string | null {
  if (!params.mirrorLocal) return null;
  if (!isMirrorLocalSupportedForProvider(params.provider)) {
    return `mirrorLocal is not supported for provider ${params.provider ?? "unknown"} (pve-lxc host/Electron only)`;
  }
  // API cannot pack host ~/.claude; Electron should use local devsh.
  return "mirrorLocal requires the Electron app with local devsh (host filesystem). Use clean=true for server-side skip of provider auth, or run: devsh start -p pve-lxc --clean --mirror-local";
}

/** Detect Electron in browser/www (mirrors apps/client/src/lib/electron.ts). */
export function detectIsElectron(
  globalObj: {
    window?: {
      cmux?: unknown;
      electron?: unknown;
      process?: { type?: string };
    };
    navigator?: { userAgent?: string };
  } = globalThis as {
    window?: {
      cmux?: unknown;
      electron?: unknown;
      process?: { type?: string };
    };
    navigator?: { userAgent?: string };
  },
): boolean {
  const w = globalObj.window;
  if (w) {
    if (w.cmux || w.electron) return true;
    if (typeof w.process === "object" && w.process?.type === "renderer") {
      return true;
    }
  }
  const ua = globalObj.navigator?.userAgent;
  if (typeof ua === "string" && ua.includes("Electron")) return true;
  return false;
}

export const WORKSPACE_START_MODE_LABELS: Record<WorkspaceStartMode, string> = {
  default: "Default",
  clean: "Clean",
  "mirror-local": "Mirror local",
};

/**
 * Auto-provision on mount would start with mode=default before the user can
 * pick Clean / Mirror local. Start Workspace defers until explicit Continue/Retry.
 */
export function shouldAutoProvisionOnMount(): boolean {
  return false;
}

/** Continue / Retry should call provision when no sandbox instance exists yet. */
export function shouldProvisionOnUserStart(params: {
  hasInstance: boolean;
  isProvisioning: boolean;
}): boolean {
  return !params.hasInstance && !params.isProvisioning;
}

export type StartSandboxRequestBody = {
  teamSlugOrId: string;
  repoUrl: string;
  branch: string;
  ttlSeconds: number;
  snapshotId?: string;
  clean?: boolean;
  mirrorLocal?: boolean;
};

/** Full JSON body for POST /api/sandboxes/start including mode fields. */
export function buildStartSandboxRequestBody(params: {
  teamSlugOrId: string;
  repoUrl: string;
  mode: WorkspaceStartMode;
  branch?: string;
  ttlSeconds?: number;
  snapshotId?: string;
}): StartSandboxRequestBody {
  const body: StartSandboxRequestBody = {
    teamSlugOrId: params.teamSlugOrId,
    repoUrl: params.repoUrl,
    branch: params.branch ?? "main",
    ttlSeconds: params.ttlSeconds ?? 3600,
    ...buildStartSandboxModeFields(params.mode),
  };
  if (params.snapshotId?.trim()) {
    body.snapshotId = params.snapshotId.trim();
  }
  return body;
}

/**
 * Whether Continue should advance into workspace-config after a provision attempt.
 * API starts need an instance; Electron mirror-local uses host devsh (no API instance).
 */
export function shouldAdvanceAfterProvision(params: {
  mode: WorkspaceStartMode;
  hasInstance: boolean;
  provisionSucceeded: boolean;
}): boolean {
  if (!params.provisionSucceeded) return false;
  if (params.mode === "mirror-local") {
    // Host path: user continues in terminal; stay on setup unless an instance appeared.
    return params.hasInstance;
  }
  return params.hasInstance;
}
