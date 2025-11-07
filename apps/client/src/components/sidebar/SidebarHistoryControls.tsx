import { useNavigationHistory } from "@/contexts/navigation-history/NavigationHistoryContext";
import { isElectron } from "@/lib/electron";
import { cn } from "@/lib/utils";
import * as Popover from "@radix-ui/react-popover";
import { History, ArrowLeft, ArrowRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import type { NavigationHistoryEntry } from "@/contexts/navigation-history/types";

const HISTORY_MENU_LIMIT = 20;

const BUTTON_BASE_CLASSES =
  "w-[30px] h-[30px] border border-neutral-200 dark:border-neutral-800 rounded-lg flex items-center justify-center text-neutral-700 dark:text-neutral-200 bg-white dark:bg-neutral-950 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-900 disabled:opacity-40 disabled:cursor-not-allowed";

export function SidebarHistoryControls() {
  const {
    entries,
    currentEntry,
    currentHistoryIndex,
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    goToEntry,
  } = useNavigationHistory();
  const [open, setOpen] = useState(false);

  const orderedEntries = useMemo(() => {
    return [...entries]
      .sort((a, b) => b.historyIndex - a.historyIndex)
      .slice(0, HISTORY_MENU_LIMIT);
  }, [entries]);

  const closeMenu = useCallback(() => {
    setOpen(false);
  }, []);

  const handleSelectEntry = useCallback(
    (entry: NavigationHistoryEntry) => {
      if (currentEntry?.historyIndex === entry.historyIndex) {
        closeMenu();
        return;
      }
      closeMenu();
      goToEntry(entry);
    },
    [closeMenu, currentEntry?.historyIndex, goToEntry]
  );

  useEffect(() => {
    if (isElectron) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey || !event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "[") {
        event.preventDefault();
        goBack();
        return;
      }
      if (key === "]") {
        event.preventDefault();
        goForward();
        return;
      }
      if (key === "y") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [goBack, goForward]);

  useEffect(() => {
    if (!isElectron) return;
    const cmux = window.cmux;
    if (!cmux?.on) return;
    const unsubBack = cmux.on("shortcut:navigation-back", () => goBack());
    const unsubForward = cmux.on("shortcut:navigation-forward", () => {
      goForward();
    });
    const unsubToggle = cmux.on("shortcut:navigation-history", () => {
      setOpen((prev) => !prev);
    });
    return () => {
      try {
        unsubBack?.();
      } catch {
        // ignore
      }
      try {
        unsubForward?.();
      } catch {
        // ignore
      }
      try {
        unsubToggle?.();
      } catch {
        // ignore
      }
    };
  }, [goBack, goForward]);

  return (
    <div
      className="flex items-center gap-1 mr-2"
      style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
    >
      <button
        type="button"
        onClick={goBack}
        className={BUTTON_BASE_CLASSES}
        disabled={!canGoBack}
        aria-label="Back"
        title="Back (Cmd+Ctrl+[)"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={goForward}
        className={BUTTON_BASE_CLASSES}
        disabled={!canGoForward}
        aria-label="Forward"
        title="Forward (Cmd+Ctrl+])"
      >
        <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </button>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className={BUTTON_BASE_CLASSES}
            aria-label="Show history"
            title="History (Cmd+Ctrl+Y)"
            disabled={entries.length === 0}
          >
            <History className="w-4 h-4" aria-hidden="true" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            side="bottom"
            sideOffset={8}
            className="z-[60] w-72 max-h-80 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-2 shadow-xl focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
          >
            <div className="px-1 pb-1 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Recent pages
            </div>
            {orderedEntries.length === 0 ? (
              <p className="px-1 py-2 text-sm text-neutral-500 dark:text-neutral-400">
                Nothing to show yet.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {orderedEntries.map((entry) => {
                  const isCurrent =
                    currentEntry?.historyIndex === entry.historyIndex;
                  const distance = entry.historyIndex - currentHistoryIndex;
                  const statusLabel =
                    distance === 0
                      ? "Current"
                      : distance < 0
                      ? `${Math.abs(distance)} back`
                      : `${distance} forward`;
                  const { teamLabel, pathLabel } = formatEntryLabels(entry);
                  const searchLabel =
                    entry.searchStr && entry.searchStr !== "?"
                      ? entry.searchStr
                      : "";
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => handleSelectEntry(entry)}
                      disabled={isCurrent}
                      title={entry.href}
                      className={cn(
                        "w-full rounded-lg px-3 py-2 text-left transition-colors",
                        isCurrent
                          ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-50"
                          : "bg-transparent text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium truncate">
                          {pathLabel}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                          {statusLabel}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                        {teamLabel && (
                          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                            {teamLabel}
                          </span>
                        )}
                        <span className="truncate">{entry.pathname}</span>
                      </div>
                      {searchLabel && (
                        <div className="mt-0.5 text-[10px] text-neutral-400 dark:text-neutral-500">
                          {searchLabel}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

function formatEntryLabels(entry: NavigationHistoryEntry) {
  const segments = entry.pathname.split("/").filter(Boolean);
  if (segments.length <= 1) {
    return {
      teamLabel: segments[0] ?? "",
      pathLabel: "/",
    };
  }
  const [teamLabel, ...rest] = segments;
  const pathLabel = `/${rest.join("/") || ""}`;
  return {
    teamLabel,
    pathLabel,
  };
}
