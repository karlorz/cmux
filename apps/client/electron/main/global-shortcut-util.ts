import type { Input } from "electron";

import type {
  GlobalShortcutAction,
  ShortcutBinding,
} from "../../src/lib/global-shortcuts";
import { globalShortcutStore } from "./global-shortcut-store";

function matchesModifiers(binding: ShortcutBinding, input: Input): boolean {
  const meta = Boolean(binding.meta);
  const ctrl = Boolean(binding.ctrl);
  const alt = Boolean(binding.alt);
  const shift = Boolean(binding.shift);
  if (meta !== Boolean(input.meta)) return false;
  if (ctrl !== Boolean(input.control)) return false;
  if (alt !== Boolean(input.alt)) return false;
  if (shift !== Boolean(input.shift)) return false;
  return true;
}

function normalizeKey(value: string | undefined | null): string {
  return (value ?? "").toLowerCase();
}

function matchesKey(binding: ShortcutBinding, input: Input): boolean {
  const bindingCode = binding.code ?? undefined;
  if (bindingCode) {
    return input.code === bindingCode;
  }
  const bindingKey = normalizeKey(binding.key);
  if (!bindingKey) return false;
  const inputKey = normalizeKey(input.key);
  return inputKey === bindingKey;
}

export function matchesBinding(binding: ShortcutBinding, input: Input): boolean {
  if (!matchesModifiers(binding, input)) return false;
  return matchesKey(binding, input);
}

export function matchesShortcutAction(
  action: GlobalShortcutAction,
  input: Input
): boolean {
  const binding = globalShortcutStore.getBinding(action);
  return matchesBinding(binding, input);
}
