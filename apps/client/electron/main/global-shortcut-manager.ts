import type { Input } from "electron";
import {
  GLOBAL_SHORTCUT_DEFINITIONS,
  type GlobalShortcutAction,
  type GlobalShortcutState,
  type PersistedGlobalShortcuts,
  normalizeGlobalShortcuts,
} from "@cmux/shared";

type ShortcutMatcher = (input: Input) => boolean;

interface ParsedShortcut {
  accelerator: string;
  match: ShortcutMatcher;
}

interface ShortcutSpec {
  key: string;
  requireMeta: boolean;
  requireCtrl: boolean;
  requireAlt: boolean;
  requireShift: boolean;
  requireCommandOrControl: boolean;
}

const isMac = process.platform === "darwin";

let currentShortcuts: GlobalShortcutState = normalizeGlobalShortcuts();
const parsedShortcuts = new Map<GlobalShortcutAction, ParsedShortcut | null>();

function normalizeKeyToken(token: string): string | null {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();

  switch (lower) {
    case "return":
      return "enter";
    case "esc":
      return "escape";
    case "space":
    case "spacebar":
      return " ";
    case "plus":
      return "+";
    case "minus":
      return "-";
    case "comma":
      return ",";
    case "period":
      return ".";
    case "slash":
      return "/";
    case "backslash":
      return "\\";
    case "semicolon":
      return ";";
    case "apostrophe":
    case "quote":
      return "'";
    case "bracketleft":
      return "[";
    case "bracketright":
      return "]";
    case "pageup":
      return "pageup";
    case "pagedown":
      return "pagedown";
    case "arrowup":
    case "up":
      return "arrowup";
    case "arrowdown":
    case "down":
      return "arrowdown";
    case "arrowleft":
    case "left":
      return "arrowleft";
    case "arrowright":
    case "right":
      return "arrowright";
    default: {
      if (lower.startsWith("f") && /^\d+$/.test(lower.slice(1))) {
        return lower;
      }
      if (lower.length === 1) {
        return lower;
      }
      return lower;
    }
  }
}

function normalizeInputKey(input: Input): string {
  const value = input.key ?? "";
  const normalized = normalizeKeyToken(value);
  return normalized ?? "";
}

function parseAccelerator(accelerator: string): ShortcutSpec | null {
  const tokens = accelerator
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean);

  const spec: ShortcutSpec = {
    key: "",
    requireMeta: false,
    requireCtrl: false,
    requireAlt: false,
    requireShift: false,
    requireCommandOrControl: false,
  };

  for (const rawToken of tokens) {
    const token = rawToken.toLowerCase();
    if (
      token === "commandorcontrol" ||
      token === "cmdorctrl" ||
      token === "cmd+ctrl" ||
      token === "command+control" ||
      token === "commandcontrol"
    ) {
      spec.requireCommandOrControl = true;
      continue;
    }
    if (token === "cmd" || token === "command" || token === "meta" || token === "super") {
      spec.requireMeta = true;
      continue;
    }
    if (token === "ctrl" || token === "control" || token === "ctl") {
      spec.requireCtrl = true;
      continue;
    }
    if (token === "shift") {
      spec.requireShift = true;
      continue;
    }
    if (token === "alt" || token === "option" || token === "opt") {
      spec.requireAlt = true;
      continue;
    }
    const key = normalizeKeyToken(rawToken);
    if (!key) {
      return null;
    }
    if (spec.key) {
      // Only support a single non-modifier key per shortcut.
      return null;
    }
    spec.key = key;
  }

  if (!spec.key) {
    return null;
  }

  return spec;
}

function buildMatcherFromSpec(spec: ShortcutSpec): ShortcutMatcher {
  return (input) => {
    const key = normalizeInputKey(input);
    if (!key) return false;

    // Modifiers must match exactly with the spec.
    if (spec.requireCommandOrControl) {
      if (isMac) {
        if (!input.meta) return false;
        if (input.control) return false;
      } else {
        if (!input.control) return false;
        if (input.meta) return false;
      }
    } else {
      if (spec.requireMeta !== Boolean(input.meta)) return false;
      if (spec.requireCtrl !== Boolean(input.control)) return false;
    }

    if (spec.requireAlt !== Boolean(input.alt)) return false;
    if (spec.requireShift !== Boolean(input.shift)) return false;

    return key === spec.key;
  };
}

function rebuildParsedShortcuts(): void {
  for (const { action } of GLOBAL_SHORTCUT_DEFINITIONS) {
    const accelerator = currentShortcuts[action]?.accelerator ?? null;
    if (!accelerator) {
      parsedShortcuts.set(action, null);
      continue;
    }
    const spec = parseAccelerator(accelerator);
    if (!spec) {
      parsedShortcuts.set(action, null);
      continue;
    }
    parsedShortcuts.set(action, {
      accelerator,
      match: buildMatcherFromSpec(spec),
    });
  }
}

rebuildParsedShortcuts();

export function getShortcutAccelerator(
  action: GlobalShortcutAction
): string | null {
  return currentShortcuts[action]?.accelerator ?? null;
}

export function matchesGlobalShortcut(
  action: GlobalShortcutAction,
  input: Input
): boolean {
  const parsed = parsedShortcuts.get(action);
  if (!parsed) return false;
  return parsed.match(input);
}

export function updateGlobalShortcuts(
  overrides: PersistedGlobalShortcuts | null | undefined
): GlobalShortcutState {
  currentShortcuts = normalizeGlobalShortcuts(overrides);
  rebuildParsedShortcuts();
  return currentShortcuts;
}

export function getCurrentGlobalShortcuts(): GlobalShortcutState {
  return currentShortcuts;
}
