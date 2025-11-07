import { Dropdown } from "@/components/ui/dropdown";
import type { NavigationHistoryEntry } from "@/contexts/navigation-history/context";
import { useNavigationHistory } from "@/contexts/navigation-history/useNavigationHistory";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const MAX_SECTION_ENTRIES = 12;

export function SidebarHistoryControls() {
  const {
    entries,
    currentEntry,
    currentIndex,
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    goToIndex,
    historyMenuRequestId,
  } = useNavigationHistory();

  const [historyMenuOpen, setHistoryMenuOpen] = useState(false);

  useEffect(() => {
    if (historyMenuRequestId === 0) return;
    setHistoryMenuOpen((prev) => !prev);
  }, [historyMenuRequestId]);

  const { backEntries, forwardEntries } = useMemo(() => {
    const withIndex = entries.map((entry, index) => ({ entry, index }));
    const previous = withIndex
      .slice(0, currentIndex)
      .reverse()
      .slice(0, MAX_SECTION_ENTRIES);
    const next = withIndex
      .slice(currentIndex + 1)
      .slice(0, MAX_SECTION_ENTRIES);
    return { backEntries: previous, forwardEntries: next };
  }, [entries, currentIndex]);

  return (
    <div
      className="px-3 pb-2 select-none"
      style={{ WebkitAppRegion: "no-drag" }}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Back"
          onClick={goBack}
          disabled={!canGoBack}
          className={historyButtonClass(canGoBack)}
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Forward"
          onClick={goForward}
          disabled={!canGoForward}
          className={historyButtonClass(canGoForward)}
        >
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
        <Dropdown.Root open={historyMenuOpen} onOpenChange={setHistoryMenuOpen}>
          <Dropdown.Trigger
            className={historyButtonClass(true)}
            aria-label="Show history"
            type="button"
            onClick={(event) => event.stopPropagation()}
          >
            <History className="w-4 h-4" aria-hidden="true" />
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Positioner
              sideOffset={8}
              align="start"
              className="z-[var(--z-popover)]"
            >
              <Dropdown.Popup className="w-[260px] max-h-[75vh] overflow-hidden p-0">
                <Dropdown.Arrow />
                <HistoryMenuContent
                  currentEntry={currentEntry}
                  backEntries={backEntries}
                  forwardEntries={forwardEntries}
                  navigateToIndex={(index) => {
                    goToIndex(index);
                    setHistoryMenuOpen(false);
                  }}
                />
              </Dropdown.Popup>
            </Dropdown.Positioner>
          </Dropdown.Portal>
        </Dropdown.Root>
        <div className="min-w-0 flex-1">
          <p
            className="text-[13px] leading-4 font-medium text-neutral-800 dark:text-neutral-100 truncate"
            title={currentEntry?.label ?? "History"}
          >
            {currentEntry?.label ?? "History"}
          </p>
          <p
            className="text-[11px] leading-4 text-neutral-500 dark:text-neutral-400 truncate"
            title={currentEntry?.description}
          >
            {currentEntry?.description ?? "Keep track of your recent pages"}
          </p>
        </div>
      </div>
    </div>
  );
}

type HistoryEntryWithIndex = {
  entry: NavigationHistoryEntry;
  index: number;
};

type HistoryMenuContentProps = {
  currentEntry: NavigationHistoryEntry | null;
  backEntries: HistoryEntryWithIndex[];
  forwardEntries: HistoryEntryWithIndex[];
  navigateToIndex: (index: number) => void;
};

function HistoryMenuContent({
  currentEntry,
  backEntries,
  forwardEntries,
  navigateToIndex,
}: HistoryMenuContentProps) {
  return (
    <div className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
      <div className="px-3 py-2">
        <p className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Current page
        </p>
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
          {currentEntry?.label ?? "History"}
        </p>
        {currentEntry ? (
          <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
            {currentEntry.description}
          </p>
        ) : null}
      </div>
      {backEntries.length > 0 ? (
        <div className="max-h-[250px] overflow-y-auto py-1">
          <SectionHeader>Back history</SectionHeader>
          {backEntries.map(({ entry, index }) => (
            <Dropdown.Item
              key={`${entry.id}-back`}
              onClick={() => navigateToIndex(index)}
              className="flex flex-col items-start gap-0.5 px-3"
            >
              <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {entry.label}
              </span>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate w-full">
                {entry.description}
              </span>
            </Dropdown.Item>
          ))}
        </div>
      ) : (
        <EmptySection message="No previous locations" />
      )}
      {forwardEntries.length > 0 ? (
        <div className="max-h-[250px] overflow-y-auto py-1">
          <SectionHeader>Forward history</SectionHeader>
          {forwardEntries.map(({ entry, index }) => (
            <Dropdown.Item
              key={`${entry.id}-forward`}
              onClick={() => navigateToIndex(index)}
              className="flex flex-col items-start gap-0.5 px-3"
            >
              <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {entry.label}
              </span>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate w-full">
                {entry.description}
              </span>
            </Dropdown.Item>
          ))}
        </div>
      ) : (
        <EmptySection message="No forward locations" />
      )}
    </div>
  );
}

function SectionHeader({ children }: { children: string }) {
  return (
    <p className="px-3 py-1 text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
      {children}
    </p>
  );
}

function EmptySection({ message }: { message: string }) {
  return (
    <div className="px-3 py-3 text-xs text-neutral-500 dark:text-neutral-400">
      {message}
    </div>
  );
}

function historyButtonClass(enabled: boolean) {
  return clsx(
    "w-8 h-8 rounded-lg border border-neutral-200 dark:border-neutral-800",
    "flex items-center justify-center text-neutral-700 dark:text-neutral-200",
    "bg-white dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800",
    "transition-colors",
    !enabled &&
      "opacity-50 cursor-not-allowed bg-neutral-50 dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-900"
  );
}
