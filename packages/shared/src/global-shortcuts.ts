export const GLOBAL_SHORTCUT_IDS = [
  "cmd-k",
  "sidebar-toggle",
  "preview-reload",
  "preview-back",
  "preview-forward",
  "preview-focus-address",
] as const;

export type GlobalShortcutId = (typeof GLOBAL_SHORTCUT_IDS)[number];

export type GlobalShortcutCategory = "general" | "preview";

export type GlobalShortcutDefinition = {
  id: GlobalShortcutId;
  label: string;
  description?: string;
  category: GlobalShortcutCategory;
  defaultAccelerator: string;
};

export const GLOBAL_SHORTCUT_DEFINITIONS: readonly GlobalShortcutDefinition[] =
  [
    {
      id: "cmd-k",
      label: "Command Palette",
      description: "Toggle the command palette overlay",
      category: "general",
      defaultAccelerator: "CommandOrControl+K",
    },
    {
      id: "sidebar-toggle",
      label: "Toggle Sidebar",
      description: "Show or hide the left-hand sidebar",
      category: "general",
      defaultAccelerator: "Control+Shift+S",
    },
    {
      id: "preview-reload",
      label: "Reload Preview",
      description: "Reload the embedded browser preview",
      category: "preview",
      defaultAccelerator: "CommandOrControl+R",
    },
    {
      id: "preview-back",
      label: "Preview Back",
      description: "Navigate back in the preview history",
      category: "preview",
      defaultAccelerator: "CommandOrControl+[",
    },
    {
      id: "preview-forward",
      label: "Preview Forward",
      description: "Navigate forward in the preview history",
      category: "preview",
      defaultAccelerator: "CommandOrControl+]",
    },
    {
      id: "preview-focus-address",
      label: "Focus Preview Address Bar",
      description: "Focus the preview address input",
      category: "preview",
      defaultAccelerator: "CommandOrControl+L",
    },
  ] as const;

export const DEFAULT_GLOBAL_SHORTCUTS: Record<
  GlobalShortcutId,
  string
> = Object.freeze(
  GLOBAL_SHORTCUT_DEFINITIONS.reduce((acc, def) => {
    acc[def.id] = def.defaultAccelerator;
    return acc;
  }, {} as Record<GlobalShortcutId, string>)
);

export type GlobalShortcutSettings = Partial<
  Record<GlobalShortcutId, string | null | undefined>
>;

export type PlatformKey = "darwin" | "win32" | "linux" | string;

export type ResolvedAccelerator = {
  key: string;
  keyNormalized: string;
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
};

const MODIFIER_TOKENS: Record<string, "meta" | "ctrl" | "alt" | "shift" | null> =
  {
    command: "meta",
    cmd: "meta",
    super: "meta",
    meta: "meta",
    control: "ctrl",
    ctrl: "ctrl",
    option: "alt",
    alt: "alt",
    shift: "shift",
  };

const OPTIONAL_MODIFIER_TOKENS = new Set(["commandorcontrol", "cmdorctrl"]);

const KEY_TOKEN_MAP: Record<string, string> = {
  plus: "+",
  minus: "-",
  equal: "=",
  equals: "=",
  comma: ",",
  period: ".",
  dot: ".",
  slash: "/",
  backslash: "\\",
  bracketleft: "[",
  bracketright: "]",
  semicolon: ";",
  colon: ":",
  quote: "'",
  apostrophe: "'",
  grave: "`",
  space: " ",
  tab: "Tab",
  escape: "Escape",
  esc: "Escape",
  enter: "Enter",
  return: "Enter",
  backspace: "Backspace",
  delete: "Delete",
  del: "Delete",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
  insert: "Insert",
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
};

const KEY_VALUE_TO_TOKEN_MAP: Record<string, string> = Object.entries(
  KEY_TOKEN_MAP,
).reduce((acc, [token, key]) => {
  acc[key.toLowerCase()] = token;
  return acc;
}, {} as Record<string, string>);

function normalizeKeyToken(token: string): { key: string; normalized: string } {
  const trimmed = token.trim();
  if (!trimmed) {
    return { key: "", normalized: "" };
  }

  const lower = trimmed.toLowerCase();
  const mapped = KEY_TOKEN_MAP[lower];
  if (mapped) {
    return { key: mapped, normalized: mapped.toLowerCase() };
  }

  if (trimmed.length === 1) {
    return { key: trimmed, normalized: trimmed.toLowerCase() };
  }

  // Fallback to using the token as-is.
  return { key: trimmed, normalized: trimmed.toLowerCase() };
}

export function isGlobalShortcutId(value: unknown): value is GlobalShortcutId {
  return typeof value === "string"
    ? (GLOBAL_SHORTCUT_IDS as readonly string[]).includes(value)
    : false;
}

export function resolveAcceleratorForPlatform(
  accelerator: string,
  platform: PlatformKey,
): ResolvedAccelerator | null {
  if (!accelerator || typeof accelerator !== "string") {
    return null;
  }

  const parts = accelerator
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  let meta = false;
  let ctrl = false;
  let alt = false;
  let shift = false;
  let keyToken: string | null = null;

  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;

    const lower = part.toLowerCase();

    if (OPTIONAL_MODIFIER_TOKENS.has(lower)) {
      if (platform === "darwin") {
        meta = true;
        ctrl = false;
      } else {
        ctrl = true;
        meta = false;
      }
      continue;
    }

    const modifier = MODIFIER_TOKENS[lower];
    if (modifier) {
      if (modifier === "meta") meta = true;
      if (modifier === "ctrl") ctrl = true;
      if (modifier === "alt") alt = true;
      if (modifier === "shift") shift = true;
      continue;
    }

    keyToken = part;
  }

  if (!keyToken) {
    return null;
  }

  const { key, normalized } = normalizeKeyToken(keyToken);
  if (!key) {
    return null;
  }

  return {
    key,
    keyNormalized: normalized,
    meta,
    ctrl,
    alt,
    shift,
  };
}

export function isAcceleratorValid(accelerator: string): boolean {
  if (!accelerator) return false;
  // Ensure the accelerator can be resolved on at least one supported platform.
  return (
    resolveAcceleratorForPlatform(accelerator, "darwin") !== null ||
    resolveAcceleratorForPlatform(accelerator, "win32") !== null ||
    resolveAcceleratorForPlatform(accelerator, "linux") !== null
  );
}

export function mergeShortcutSettings(
  overrides: GlobalShortcutSettings | null | undefined,
): Record<GlobalShortcutId, string> {
  const merged: Record<GlobalShortcutId, string> = {
    ...DEFAULT_GLOBAL_SHORTCUTS,
  };

  if (!overrides) {
    return merged;
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (!isGlobalShortcutId(key)) continue;
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    merged[key] = trimmed;
  }

  return merged;
}

export function normalizeShortcutOverrides(
  overrides: GlobalShortcutSettings | null | undefined,
): Partial<Record<GlobalShortcutId, string>> {
  if (!overrides) {
    return {};
  }

  const result: Partial<Record<GlobalShortcutId, string>> = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (!isGlobalShortcutId(key)) continue;
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    result[key] = trimmed;
  }
  return result;
}

export function eventKeyToAcceleratorToken(key: string): string | null {
  if (!key) return null;

  if (key.length === 1) {
    const lower = key.toLowerCase();
    const mapped = KEY_VALUE_TO_TOKEN_MAP[lower];
    if (mapped) return mapped;

    switch (lower) {
      case "+":
        return "Plus";
      case "-":
        return "Minus";
      case "=":
        return "Equal";
      case ",":
        return "Comma";
      case ".":
        return "Period";
      case "`":
        return "Grave";
      case ";":
        return "Semicolon";
      case "'":
        return "Quote";
      case "[":
        return "BracketLeft";
      case "]":
        return "BracketRight";
      case "\\":
        return "Backslash";
    }

    return key.toUpperCase();
  }

  const lower = key.toLowerCase();
  const mapped = KEY_VALUE_TO_TOKEN_MAP[lower];
  if (mapped) {
    return mapped[0].toUpperCase() + mapped.slice(1);
  }

  switch (lower) {
    case "arrowup":
      return "Up";
    case "arrowdown":
      return "Down";
    case "arrowleft":
      return "Left";
    case "arrowright":
      return "Right";
    case " ":
    case "space":
    case "spacebar":
      return "Space";
    case "escape":
    case "esc":
      return "Escape";
    case "backspace":
      return "Backspace";
    case "delete":
    case "del":
      return "Delete";
    case "enter":
    case "return":
      return "Enter";
    case "tab":
      return "Tab";
  }

  if (/^f[0-9]{1,2}$/i.test(key)) {
    return key.toUpperCase();
  }

  return key
    .split(/[\s_-]+/)
    .map((part) =>
      part.length > 0 ? part[0].toUpperCase() + part.slice(1).toLowerCase() : "",
    )
    .join("");
}

export function formatAcceleratorForDisplay(
  accelerator: string,
  platform: PlatformKey,
): string {
  const platformLower = platform.toLowerCase();
  const parts = accelerator
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((token, index, arr) => {
      const lower = token.toLowerCase();
      if (OPTIONAL_MODIFIER_TOKENS.has(lower)) {
        return platformLower === "darwin" ? "Cmd" : "Ctrl";
      }

      switch (lower) {
        case "command":
        case "cmd":
          return "Cmd";
        case "super":
        case "meta":
          return platformLower === "darwin" ? "Cmd" : "Win";
        case "control":
        case "ctrl":
          return "Ctrl";
        case "option":
          return platformLower === "darwin" ? "Option" : "Alt";
        case "alt":
          return "Alt";
        case "shift":
          return "Shift";
        default: {
          const { key } = normalizeKeyToken(token);
          if (!key) return token;
          if (key.length === 1) {
            return key.toUpperCase();
          }
          if (KEY_VALUE_TO_TOKEN_MAP[key.toLowerCase()]) {
            return key.length === 1 ? key.toUpperCase() : key;
          }
          // Use the resolved key for the final token and the original for modifiers with custom names.
          const isLast = index === arr.length - 1;
          return isLast ? key : token;
        }
      }
    });

  return parts.join(" + ");
}
