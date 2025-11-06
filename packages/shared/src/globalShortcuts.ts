export type GlobalShortcutAction =
  | "commandPalette"
  | "sidebarToggle"
  | "previewReload"
  | "previewBack"
  | "previewForward"
  | "previewFocusAddress";

export interface GlobalShortcutEntry {
  accelerator: string | null;
}

export type GlobalShortcutState = Record<
  GlobalShortcutAction,
  GlobalShortcutEntry
>;

export type PersistedGlobalShortcuts = Record<
  string,
  { accelerator?: string | null }
>;

export interface GlobalShortcutDefinition {
  action: GlobalShortcutAction;
  label: string;
  description: string;
  defaultAccelerator: string;
}

export const GLOBAL_SHORTCUT_DEFINITIONS: GlobalShortcutDefinition[] = [
  {
    action: "commandPalette",
    label: "Open Command Palette",
    description: "Toggle the floating command palette overlay.",
    defaultAccelerator: "CommandOrControl+K",
  },
  {
    action: "sidebarToggle",
    label: "Toggle Sidebar",
    description: "Show or hide the navigation sidebar.",
    defaultAccelerator: "Control+Shift+S",
  },
  {
    action: "previewReload",
    label: "Reload Preview",
    description: "Reload the active preview pane or iframe.",
    defaultAccelerator: "CommandOrControl+R",
  },
  {
    action: "previewBack",
    label: "Preview Back",
    description: "Navigate back within the preview history.",
    defaultAccelerator: "CommandOrControl+[",
  },
  {
    action: "previewForward",
    label: "Preview Forward",
    description: "Navigate forward within the preview history.",
    defaultAccelerator: "CommandOrControl+]",
  },
  {
    action: "previewFocusAddress",
    label: "Focus Preview Address Bar",
    description: "Focus and select the preview URL input field.",
    defaultAccelerator: "CommandOrControl+L",
  },
];

export function normalizeGlobalShortcuts(
  overrides?: PersistedGlobalShortcuts | null | undefined
): GlobalShortcutState {
  const baseline: GlobalShortcutState = GLOBAL_SHORTCUT_DEFINITIONS.reduce(
    (acc, def) => {
      acc[def.action] = { accelerator: def.defaultAccelerator };
      return acc;
    },
    {} as GlobalShortcutState
  );

  if (!overrides) {
    return baseline;
  }

  for (const def of GLOBAL_SHORTCUT_DEFINITIONS) {
    const raw = overrides[def.action];
    if (!raw) continue;
    if (raw.accelerator === undefined) continue;

    const trimmed = raw.accelerator?.trim() ?? "";
    baseline[def.action] = {
      accelerator: trimmed.length === 0 ? null : trimmed,
    };
  }

  return baseline;
}

export function areShortcutSettingsEqual(
  a: GlobalShortcutState,
  b: GlobalShortcutState
): boolean {
  for (const { action } of GLOBAL_SHORTCUT_DEFINITIONS) {
    const left = a[action]?.accelerator?.trim() ?? "";
    const right = b[action]?.accelerator?.trim() ?? "";
    if (left !== right) {
      return false;
    }
  }
  return true;
}

export function serializeShortcutSettings(
  settings: GlobalShortcutState
): PersistedGlobalShortcuts {
  const result: PersistedGlobalShortcuts = {};
  for (const { action } of GLOBAL_SHORTCUT_DEFINITIONS) {
    const accel = settings[action]?.accelerator?.trim() ?? "";
    result[action] = { accelerator: accel.length === 0 ? null : accel };
  }
  return result;
}

export function formatAcceleratorForDisplay(
  accelerator: string | null
): string {
  if (!accelerator) return "Disabled";
  return accelerator;
}
