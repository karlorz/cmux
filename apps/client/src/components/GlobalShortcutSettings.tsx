import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  SHORTCUT_DEFINITIONS,
  SHORTCUT_ORDER,
  bindingsEqual,
  formatBindingForDisplay,
  getDefaultBinding,
  type GlobalShortcutAction,
  type ShortcutBinding,
} from "@/lib/global-shortcuts";
import { isElectron } from "@/lib/electron";

type ShortcutState = {
  bindings: Record<GlobalShortcutAction, ShortcutBinding> | null;
  overrides: Partial<Record<GlobalShortcutAction, ShortcutBinding>>;
};

type ShortcutConfigPayload = {
  overrides: Partial<Record<GlobalShortcutAction, ShortcutBinding>>;
  effective: Record<GlobalShortcutAction, ShortcutBinding>;
};

type ShortcutMutationResult =
  | ({ ok: true } & ShortcutConfigPayload)
  | { ok: false; reason: string };

const MODIFIER_KEYS = new Set(["shift", "control", "alt", "meta"]);

function eventToBinding(event: KeyboardEvent): ShortcutBinding | null {
  const key = event.key;
  if (!key) return null;
  const lower = key.toLowerCase();
  if (MODIFIER_KEYS.has(lower)) {
    return null;
  }
  const hasModifier =
    event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;
  if (!hasModifier) {
    return null;
  }
  return {
    key: key.length === 1 ? key.toLowerCase() : key,
    code: event.code,
    meta: event.metaKey,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
  };
}

function getShortcutsBridge() {
  if (typeof window === "undefined") return undefined;
  return window.cmux?.shortcuts;
}

function applyMutationResult(
  result: ShortcutMutationResult,
  setState: (payload: ShortcutConfigPayload) => void
) {
  if (!result.ok) {
    throw new Error(result.reason || "Failed to update shortcuts");
  }
  setState({
    overrides: result.overrides ?? {},
    effective: result.effective,
  });
}

export function GlobalShortcutSettings(): JSX.Element {
  const [state, setState] = useState<ShortcutState>({
    bindings: null,
    overrides: {},
  });
  const [loading, setLoading] = useState(() => isElectron);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState<GlobalShortcutAction | null>(null);
  const [pendingAction, setPendingAction] = useState<
    GlobalShortcutAction | "reset-all" | null
  >(null);

  const updateState = useCallback((payload: ShortcutConfigPayload) => {
    setState({
      bindings: payload.effective,
      overrides: payload.overrides ?? {},
    });
    setError(null);
  }, []);

  const load = useCallback(async () => {
    if (!isElectron) {
      setLoading(false);
      return;
    }
    const bridge = getShortcutsBridge();
    if (!bridge) {
      setLoading(false);
      setError("Shortcut bridge unavailable in this environment.");
      return;
    }
    setLoading(true);
    try {
      const result = (await bridge.getAll()) as ShortcutMutationResult;
      applyMutationResult(result, updateState);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load shortcuts.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [updateState]);

  useEffect(() => {
    if (!isElectron) return;
    void load();
    const bridge = getShortcutsBridge();
    if (!bridge?.onUpdate) return;
    const dispose = bridge.onUpdate((payload) => {
      updateState(payload);
    });
    return () => {
      if (typeof dispose === "function") dispose();
    };
  }, [load, updateState]);

  const updateBinding = useCallback(
    async (action: GlobalShortcutAction, binding: ShortcutBinding | null) => {
      if (!isElectron) {
        toast.error("Configuring shortcuts is only available in the desktop app.");
        return;
      }
      const bridge = getShortcutsBridge();
      if (!bridge) {
        toast.error("Shortcut bridge unavailable.");
        return;
      }
      setPendingAction(action);
      try {
        const result = (await bridge.setBinding(
          action,
          binding
        )) as ShortcutMutationResult;
        applyMutationResult(result, updateState);
        toast.success("Shortcut updated.");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update shortcut.";
        toast.error(message);
      } finally {
        setPendingAction(null);
      }
    },
    [updateState]
  );

  const resetAction = useCallback(
    async (action: GlobalShortcutAction) => {
      await updateBinding(action, null);
    },
    [updateBinding]
  );

  const resetAll = useCallback(async () => {
    if (!isElectron) {
      toast.error("Configuring shortcuts is only available in the desktop app.");
      return;
    }
    const bridge = getShortcutsBridge();
    if (!bridge) {
      toast.error("Shortcut bridge unavailable.");
      return;
    }
    setPendingAction("reset-all");
    try {
      const result = (await bridge.resetAll()) as ShortcutMutationResult;
      applyMutationResult(result, updateState);
      toast.success("Shortcuts reset to defaults.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to reset shortcuts.";
      toast.error(message);
    } finally {
      setPendingAction(null);
    }
  }, [updateState]);

  useEffect(() => {
    if (!capturing) return;
    const handler = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!capturing) return;
      if (event.key === "Escape") {
        setCapturing(null);
        return;
      }
      const binding = eventToBinding(event);
      if (!binding) {
        toast.info("Please include a modifier key with your shortcut.");
        return;
      }
      setCapturing(null);
      void updateBinding(capturing, binding);
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => {
      window.removeEventListener("keydown", handler, { capture: true });
    };
  }, [capturing, updateBinding]);

  const currentBindings = state.bindings;

  const rows = useMemo(() => {
    if (!currentBindings) return [];
    return SHORTCUT_ORDER.map((action) => {
      const binding = currentBindings[action];
      const def = SHORTCUT_DEFINITIONS[action];
      const defaultBinding = getDefaultBinding(action);
      const isDefault = bindingsEqual(binding, defaultBinding);
      const isPending =
        pendingAction === action || (capturing !== null && capturing === action);
      const display = formatBindingForDisplay(binding);
      return {
        action,
        binding,
        definition: def,
        display,
        isDefault,
        isPending,
        defaultDisplay: formatBindingForDisplay(defaultBinding),
      };
    });
  }, [capturing, currentBindings, pendingAction]);

  if (!isElectron) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Global shortcut customization is available in the desktop app.
      </p>
    );
  }

  if (loading) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Loading shortcuts…
      </p>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
        <button
          type="button"
          onClick={() => {
            void load();
          }}
          className="text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!currentBindings) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        No shortcuts available.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Update desktop shortcuts to match your workflow.
        </p>
        <button
          type="button"
          onClick={() => {
            void resetAll();
          }}
          disabled={pendingAction === "reset-all"}
          className={`text-sm font-medium px-3 py-1.5 rounded-md border transition ${
            pendingAction === "reset-all"
              ? "border-neutral-300 text-neutral-400 dark:border-neutral-700 dark:text-neutral-500 cursor-not-allowed"
              : "border-neutral-300 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          }`}
        >
          Reset All
        </button>
      </div>

      <div className="divide-y divide-neutral-200 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded-md overflow-hidden">
        {rows.map((row, index) => (
          <div
            key={row.action}
            className={`flex flex-col gap-3 p-4 ${
              index % 2 === 0
                ? "bg-white dark:bg-neutral-950"
                : "bg-neutral-50 dark:bg-neutral-900"
            } md:flex-row md:items-center md:justify-between`}
          >
            <div>
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {row.definition.label}
              </p>
              {row.definition.description ? (
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  {row.definition.description}
                </p>
              ) : null}
              <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                Default: {row.defaultDisplay}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setCapturing(row.action);
                }}
                disabled={pendingAction !== null || capturing === row.action}
                className={`min-w-[150px] px-3 py-1.5 rounded-md border text-sm transition ${
                  capturing === row.action
                    ? "border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/10"
                    : "border-neutral-300 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                }`}
              >
                {capturing === row.action
                  ? "Press keys (Esc to cancel)"
                  : row.display}
              </button>
              <button
                type="button"
                onClick={() => {
                  void resetAction(row.action);
                }}
                disabled={row.isDefault || pendingAction !== null}
                className={`text-sm px-3 py-1.5 rounded-md transition ${
                  row.isDefault || pendingAction !== null
                    ? "text-neutral-400 dark:text-neutral-600 cursor-not-allowed"
                    : "text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-500/10"
                }`}
              >
                Reset
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
