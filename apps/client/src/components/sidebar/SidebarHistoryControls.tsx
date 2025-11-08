import { useNavigationHistory } from "@/contexts/navigation-history/NavigationHistoryContext";
import type { NavigationHistoryEntry } from "@/contexts/navigation-history/types";
import { isElectron } from "@/lib/electron";
import { cn } from "@/lib/utils";
import * as Popover from "@radix-ui/react-popover";
import { History } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";

const HISTORY_MENU_LIMIT = 20;

const BUTTON_BASE_CLASSES =
  "h-[30px] border border-neutral-200 dark:border-neutral-800 rounded-lg flex items-center gap-1.5 px-3 text-sm font-medium text-neutral-700 dark:text-neutral-200 bg-white dark:bg-neutral-950 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-900 disabled:opacity-40 disabled:cursor-not-allowed";

export function SidebarHistoryControls() {
  if (!isElectron) return null;

  const {
    entries,
    currentEntry,
    currentHistoryIndex,
    goBack,
    goForward,
    goToEntry,
  } = useNavigationHistory();
  const [open, setOpen] = useState(false);

  const orderedEntries = useMemo(() => {
    return [...entries]
      .sort((a, b) => b.timestamp - a.timestamp)
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
    if (typeof window === "undefined") return;
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
      className="flex items-center"
      style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
    >
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className={BUTTON_BASE_CLASSES}
            aria-label="Recent history"
            title="Recent (Cmd+Ctrl+Y)"
            disabled={entries.length === 0}
          >
            <History className="w-4 h-4" aria-hidden="true" />
            <span>Recent</span>
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
              Most recent
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
                  const { teamLabel, pathLabel } = formatEntryLabels(entry);
                  const searchLabel = formatSearchLabel(entry.searchStr);
                  const meta = [teamLabel, searchLabel]
                    .filter(Boolean)
                    .join(" • ");
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
                      <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-100">
                        {pathLabel}
                      </div>
                      {meta && (
                        <div className="mt-0.5 text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                          {meta}
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
  const [teamLabel, ...rest] = segments;
  const pathSegments = rest.length > 0 ? rest : segments;
  const lastSegment = pathSegments[pathSegments.length - 1] ?? "";
  return {
    teamLabel: teamLabel ?? "",
    pathLabel: lastSegment || "/",
  };
}

function formatSearchLabel(searchStr?: string) {
  if (!searchStr || searchStr === "?") return "";
  return searchStr.startsWith("?") ? searchStr.slice(1) : searchStr;
}
