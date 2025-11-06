export type GlobalShortcutAction =
  | "commandPalette"
  | "sidebarToggle"
  | "previewReload"
  | "previewBack"
  | "previewForward"
  | "previewFocusAddress";

export type ShortcutBinding = {
  key: string;
  code?: string | null;
  meta?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
};

export type ShortcutDefinition = {
  id: GlobalShortcutAction;
  label: string;
  description?: string;
  defaultFactory: (platform?: NodeJS.Platform | "browser") => ShortcutBinding;
};

const DEFAULT_PLATFORM: NodeJS.Platform | "browser" =
  typeof process !== "undefined" &&
  typeof process.platform === "string" &&
  process.platform
    ? (process.platform as NodeJS.Platform)
    : "browser";

function isMac(platform: NodeJS.Platform | "browser" = DEFAULT_PLATFORM) {
  if (platform === "browser") {
    if (typeof navigator !== "undefined") {
      return /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    }
    return false;
  }
  return platform === "darwin";
}

const LETTER_KEY = (letter: string): ShortcutBinding => ({
  key: letter.toLowerCase(),
  code: `Key${letter.toUpperCase()}`,
  meta: false,
  ctrl: false,
  alt: false,
  shift: false,
});

const SHORTCUT_DEFINITIONS_ARRAY: ShortcutDefinition[] = [
  {
    id: "commandPalette",
    label: "Command Palette",
    description: "Open and close the command bar for quick actions.",
    defaultFactory: (platform) => {
      const base = LETTER_KEY("k");
      const mac = isMac(platform);
      return {
        ...base,
        meta: mac,
        ctrl: !mac,
      };
    },
  },
  {
    id: "sidebarToggle",
    label: "Toggle Sidebar",
    description: "Show or hide the task sidebar.",
    defaultFactory: () => ({
      ...LETTER_KEY("s"),
      ctrl: true,
      shift: true,
    }),
  },
  {
    id: "previewReload",
    label: "Reload Preview",
    description: "Reload the active preview pane.",
    defaultFactory: (platform) => {
      const mac = isMac(platform);
      return {
        ...LETTER_KEY("r"),
        meta: mac,
        ctrl: !mac,
      };
    },
  },
  {
    id: "previewBack",
    label: "Preview Back",
    description: "Navigate back in the preview history.",
    defaultFactory: (platform) => {
      const mac = isMac(platform);
      return {
        key: "[",
        code: "BracketLeft",
        meta: mac,
        ctrl: !mac,
      };
    },
  },
  {
    id: "previewForward",
    label: "Preview Forward",
    description: "Navigate forward in the preview history.",
    defaultFactory: (platform) => {
      const mac = isMac(platform);
      return {
        key: "]",
        code: "BracketRight",
        meta: mac,
        ctrl: !mac,
      };
    },
  },
  {
    id: "previewFocusAddress",
    label: "Preview Focus Address Bar",
    description: "Focus the preview browser address input.",
    defaultFactory: (platform) => {
      const mac = isMac(platform);
      return {
        ...LETTER_KEY("l"),
        meta: mac,
        ctrl: !mac,
      };
    },
  },
];

export const SHORTCUT_DEFINITIONS: Record<
  GlobalShortcutAction,
  ShortcutDefinition
> = Object.fromEntries(
  SHORTCUT_DEFINITIONS_ARRAY.map((def) => [def.id, def])
) as Record<GlobalShortcutAction, ShortcutDefinition>;

export const SHORTCUT_ORDER: GlobalShortcutAction[] =
  SHORTCUT_DEFINITIONS_ARRAY.map((def) => def.id);

export function getDefaultBinding(
  action: GlobalShortcutAction,
  platform?: NodeJS.Platform | "browser"
): ShortcutBinding {
  const def = SHORTCUT_DEFINITIONS[action];
  if (!def) {
    throw new Error(`Unknown shortcut action: ${action}`);
  }
  return normalizeBinding(def.defaultFactory(platform));
}

export function normalizeBinding(binding: ShortcutBinding): ShortcutBinding {
  return {
    key: binding.key.toLowerCase(),
    code: binding.code ?? null,
    meta: Boolean(binding.meta),
    ctrl: Boolean(binding.ctrl),
    alt: Boolean(binding.alt),
    shift: Boolean(binding.shift),
  };
}

function booleanEqual(a?: boolean, b?: boolean) {
  return Boolean(a) === Boolean(b);
}

export function bindingsEqual(
  a: ShortcutBinding | null | undefined,
  b: ShortcutBinding | null | undefined
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    booleanEqual(a.meta, b.meta) &&
    booleanEqual(a.ctrl, b.ctrl) &&
    booleanEqual(a.alt, b.alt) &&
    booleanEqual(a.shift, b.shift) &&
    (a.code ?? null) === (b.code ?? null) &&
    a.key.toLowerCase() === b.key.toLowerCase()
  );
}

const DISPLAY_KEY_OVERRIDES: Record<string, string> = {
  " ": "Space",
  Space: "Space",
  Enter: "Enter",
  Escape: "Esc",
  Esc: "Esc",
  Backspace: "Backspace",
  Tab: "Tab",
  ArrowUp: "Arrow Up",
  ArrowDown: "Arrow Down",
  ArrowLeft: "Arrow Left",
  ArrowRight: "Arrow Right",
  BracketLeft: "[",
  BracketRight: "]",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  Slash: "/",
  Backslash: "\\",
  Quote: "'",
  Semicolon: ";",
  Comma: ",",
  Period: ".",
};

function resolveDisplayKey(binding: ShortcutBinding): string {
  const code = binding.code ?? undefined;
  if (code && DISPLAY_KEY_OVERRIDES[code]) {
    return DISPLAY_KEY_OVERRIDES[code];
  }
  const rawKey = binding.key;
  if (!rawKey) {
    return "";
  }
  if (DISPLAY_KEY_OVERRIDES[rawKey]) {
    return DISPLAY_KEY_OVERRIDES[rawKey];
  }
  if (rawKey.length === 1) {
    return rawKey.toUpperCase();
  }
  const upper = rawKey.charAt(0).toUpperCase() + rawKey.slice(1);
  return upper;
}

function modifierLabel(
  modifier: "meta" | "ctrl" | "alt" | "shift",
  platform: NodeJS.Platform | "browser" = DEFAULT_PLATFORM
): string {
  const mac = isMac(platform);
  switch (modifier) {
    case "meta":
      return mac ? "Cmd" : "Meta";
    case "ctrl":
      return mac ? "Ctrl" : "Ctrl";
    case "alt":
      return mac ? "Option" : "Alt";
    case "shift":
      return "Shift";
  }
}

export function formatBindingForDisplay(
  binding: ShortcutBinding,
  platform?: NodeJS.Platform | "browser"
): string {
  const parts: string[] = [];
  if (binding.meta) parts.push(modifierLabel("meta", platform));
  if (binding.ctrl) parts.push(modifierLabel("ctrl", platform));
  if (binding.alt) parts.push(modifierLabel("alt", platform));
  if (binding.shift) parts.push(modifierLabel("shift", platform));
  const keyPart = resolveDisplayKey(binding);
  if (keyPart) parts.push(keyPart);
  return parts.join(" + ");
}

const ACCELERATOR_KEY_OVERRIDES: Record<string, string> = {
  BracketLeft: "[",
  BracketRight: "]",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  Slash: "/",
  Backslash: "\\",
  Quote: "'",
  Semicolon: ";",
  Comma: ",",
  Period: ".",
  Space: "Space",
};

function resolveAcceleratorKey(binding: ShortcutBinding): string | null {
  const code = binding.code ?? undefined;
  if (code && ACCELERATOR_KEY_OVERRIDES[code]) {
    return ACCELERATOR_KEY_OVERRIDES[code];
  }

  const rawKey = binding.key;
  if (!rawKey) return null;
  if (ACCELERATOR_KEY_OVERRIDES[rawKey]) {
    return ACCELERATOR_KEY_OVERRIDES[rawKey];
  }
  if (rawKey.length === 1) {
    return rawKey.toUpperCase();
  }
  return rawKey.length ? rawKey[0].toUpperCase() + rawKey.slice(1) : null;
}

export function bindingToElectronAccelerator(
  binding: ShortcutBinding,
  platform?: NodeJS.Platform | "browser"
): string | null {
  const parts: string[] = [];
  if (binding.meta) parts.push(isMac(platform) ? "Command" : "Meta");
  if (binding.ctrl) parts.push("Ctrl");
  if (binding.alt) parts.push(isMac(platform) ? "Option" : "Alt");
  if (binding.shift) parts.push("Shift");
  const keyPart = resolveAcceleratorKey(binding);
  if (!keyPart) return null;
  parts.push(keyPart);
  return parts.join("+");
}

export type ShortcutConfig = {
  overrides: Partial<Record<GlobalShortcutAction, ShortcutBinding>>;
};

export function buildEffectiveBindings(
  config: ShortcutConfig,
  platform?: NodeJS.Platform | "browser"
): Record<GlobalShortcutAction, ShortcutBinding> {
  const result = {} as Record<GlobalShortcutAction, ShortcutBinding>;
  for (const action of SHORTCUT_ORDER) {
    const override = config.overrides[action];
    result[action] = override
      ? normalizeBinding(override)
      : getDefaultBinding(action, platform);
  }
  return result;
}
