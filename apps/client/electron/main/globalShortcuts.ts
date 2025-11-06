import {
  DEFAULT_GLOBAL_SHORTCUTS,
  GLOBAL_SHORTCUT_DEFINITIONS,
  GLOBAL_SHORTCUT_IDS,
  isAcceleratorValid,
  isGlobalShortcutId,
  resolveAcceleratorForPlatform,
  type GlobalShortcutId,
  type ResolvedAccelerator,
} from "@cmux/shared/global-shortcuts";

type ShortcutRuntime = {
  accelerators: Record<GlobalShortcutId, string>;
  bindings: Record<GlobalShortcutId, ResolvedAccelerator | null>;
};

let runtime: ShortcutRuntime = buildRuntimeConfig({});

function buildRuntimeConfig(
  overrides: Partial<Record<GlobalShortcutId, string>>,
): ShortcutRuntime {
  const accelerators: Record<GlobalShortcutId, string> = {
    ...DEFAULT_GLOBAL_SHORTCUTS,
  };
  const bindings: Record<GlobalShortcutId, ResolvedAccelerator | null> =
    {} as Record<GlobalShortcutId, ResolvedAccelerator | null>;

  for (const id of GLOBAL_SHORTCUT_IDS) {
    const override = overrides[id];
    const value =
      typeof override === "string" && override.trim().length > 0
        ? override.trim()
        : DEFAULT_GLOBAL_SHORTCUTS[id];
    let resolved =
      resolveAcceleratorForPlatform(value, process.platform) ?? null;

    if (!resolved) {
      console.warn(
        "[global-shortcuts] invalid accelerator, falling back to default",
        { id, value }
      );
      const fallback = DEFAULT_GLOBAL_SHORTCUTS[id];
      accelerators[id] = fallback;
      resolved =
        resolveAcceleratorForPlatform(fallback, process.platform) ?? null;
    } else {
      accelerators[id] = value;
    }

    bindings[id] = resolved;
  }

  return { accelerators, bindings };
}

export function getAccelerator(id: GlobalShortcutId): string {
  return runtime.accelerators[id];
}

export function getAllAccelerators(): Record<GlobalShortcutId, string> {
  return { ...runtime.accelerators };
}

export function getShortcutDefinition(
  id: GlobalShortcutId,
): (typeof GLOBAL_SHORTCUT_DEFINITIONS)[number] | undefined {
  return GLOBAL_SHORTCUT_DEFINITIONS.find((def) => def.id === id);
}

export function updateGlobalShortcuts(
  overrides: Record<string, string>,
): ShortcutRuntime {
  const sanitized: Partial<Record<GlobalShortcutId, string>> = {};

  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (!isGlobalShortcutId(key)) continue;
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || !isAcceleratorValid(trimmed)) continue;
    sanitized[key] = trimmed;
  }

  runtime = buildRuntimeConfig(sanitized);
  return runtime;
}

function matchesModifier(required: boolean, actual: boolean): boolean {
  return required ? actual : !actual;
}

function normalizeEventKey(key: string | undefined): string {
  if (!key) return "";
  return key.length === 1 ? key.toLowerCase() : key.toLowerCase();
}

export function matchesShortcutInput(
  id: GlobalShortcutId,
  input: Electron.Input,
): boolean {
  if (!input || input.type !== "keyDown") return false;
  const binding = runtime.bindings[id];
  if (!binding) return false;

  if (!matchesModifier(binding.meta, Boolean(input.meta))) return false;
  if (!matchesModifier(binding.ctrl, Boolean(input.control))) return false;
  if (!matchesModifier(binding.alt, Boolean(input.alt))) return false;
  if (!matchesModifier(binding.shift, Boolean(input.shift))) return false;

  const keyNormalized = normalizeEventKey(input.key);
  return keyNormalized === binding.keyNormalized;
}

export function identifyShortcutFromInput(
  input: Electron.Input,
  restrictTo?: GlobalShortcutId[],
): GlobalShortcutId | null {
  const targets = restrictTo ?? GLOBAL_SHORTCUT_IDS;
  for (const id of targets) {
    if (matchesShortcutInput(id, input)) {
      return id;
    }
  }
  return null;
}
