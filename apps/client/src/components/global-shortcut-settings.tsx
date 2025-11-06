import { useCallback, useMemo } from "react";
import {
  DEFAULT_GLOBAL_SHORTCUTS,
  GLOBAL_SHORTCUT_DEFINITIONS,
  type GlobalShortcutId,
  formatAcceleratorForDisplay,
  eventKeyToAcceleratorToken,
  isAcceleratorValid,
} from "@cmux/shared/global-shortcuts";

type GlobalShortcutSettingsProps = {
  values: Record<GlobalShortcutId, string>;
  onChange: (id: GlobalShortcutId, value: string) => void;
  onReset: (id: GlobalShortcutId) => void;
  onInvalid?: (id: GlobalShortcutId, attempted: string | null) => void;
};

function detectPlatform(): "darwin" | "win32" | "linux" {
  if (typeof navigator === "undefined") {
    return "darwin";
  }

  const platform = navigator.platform ?? "";
  if (/mac/i.test(platform)) return "darwin";
  if (/win/i.test(platform)) return "win32";
  return "linux";
}

function buildAcceleratorFromKeyboardEvent(
  event: React.KeyboardEvent<HTMLButtonElement>,
): string | null {
  const key = event.key;

  if (
    key === "Meta" ||
    key === "Control" ||
    key === "Shift" ||
    key === "Alt"
  ) {
    return null;
  }

  const token = eventKeyToAcceleratorToken(key);
  if (!token) {
    return null;
  }

  const parts: string[] = [];
  if (event.metaKey) parts.push("Command");
  if (event.ctrlKey) parts.push("Control");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  parts.push(token);
  return parts.join("+");
}

type ShortcutCaptureProps = {
  id: GlobalShortcutId;
  value: string;
  platform: "darwin" | "win32" | "linux";
  onChange: (id: GlobalShortcutId, accelerator: string) => void;
  onInvalid?: (id: GlobalShortcutId, attempted: string | null) => void;
};

function ShortcutCaptureButton({
  id,
  value,
  platform,
  onChange,
  onInvalid,
}: ShortcutCaptureProps) {
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Tab") {
        return;
      }

      if (event.key === "Escape") {
        event.currentTarget.blur();
        return;
      }

      const accelerator = buildAcceleratorFromKeyboardEvent(event);
      if (!accelerator) {
        onInvalid?.(id, null);
        return;
      }

      if (!isAcceleratorValid(accelerator)) {
        onInvalid?.(id, accelerator);
        return;
      }

      onChange(id, accelerator);
    },
    [id, onChange, onInvalid],
  );

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      // Prevent the settings page button handlers from stealing focus
      event.preventDefault();
      (event.currentTarget as HTMLButtonElement).focus();
    },
    [],
  );

  const label = formatAcceleratorForDisplay(value, platform);

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="min-w-[160px] px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm font-medium text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-left"
    >
      {label}
    </button>
  );
}

export function GlobalShortcutSettings({
  values,
  onChange,
  onReset,
  onInvalid,
}: GlobalShortcutSettingsProps) {
  const platform = useMemo(() => detectPlatform(), []);

  const sections = useMemo(
    () => [
      {
        title: "General",
        shortcuts: GLOBAL_SHORTCUT_DEFINITIONS.filter(
          (def) => def.category === "general",
        ),
      },
      {
        title: "Preview",
        shortcuts: GLOBAL_SHORTCUT_DEFINITIONS.filter(
          (def) => def.category === "preview",
        ),
      },
    ],
    [],
  );

  return (
    <div className="bg-white dark:bg-neutral-950 rounded-lg border border-neutral-200 dark:border-neutral-800">
      <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
        <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          Global Shortcuts
        </h2>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Configure the keyboard shortcuts that work anywhere in cmux.
        </p>
      </div>
      <div className="p-4 space-y-6">
        {sections.map((section) => (
          <div key={section.title} className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              {section.title}
            </h3>
            <div className="space-y-4">
              {section.shortcuts.map((def) => {
                const value =
                  values[def.id] ?? DEFAULT_GLOBAL_SHORTCUTS[def.id];
                const defaultAccelerator = DEFAULT_GLOBAL_SHORTCUTS[def.id];
                const isDefault = value === defaultAccelerator;

                return (
                  <div
                    key={def.id}
                    className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {def.label}
                      </p>
                      {def.description ? (
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          {def.description}
                        </p>
                      ) : null}
                      {!isDefault ? (
                        <p className="text-xs text-neutral-400 dark:text-neutral-500">
                          Default:{" "}
                          {formatAcceleratorForDisplay(
                            defaultAccelerator,
                            platform,
                          )}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-3">
                      <ShortcutCaptureButton
                        id={def.id}
                        value={value}
                        platform={platform}
                        onChange={onChange}
                        onInvalid={onInvalid}
                      />
                      <button
                        type="button"
                        onClick={() => onReset(def.id)}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                        disabled={isDefault}
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
