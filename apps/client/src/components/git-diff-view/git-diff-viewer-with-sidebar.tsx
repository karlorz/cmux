import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Flame, PanelLeftClose, PanelLeft } from "lucide-react";
import { useTheme } from "@/components/theme/use-theme";
import { isElectron } from "@/lib/electron";
import { prepareDiffFiles } from "./adapter";
import { MemoDiffFileRow } from "./diff-file-row";
import { DiffSidebarFilter } from "../monaco/diff-sidebar-filter";
import { kitties } from "../kitties";
import {
  type GitDiffViewerWithSidebarProps,
  AUTO_COLLAPSE_THRESHOLD,
} from "./types";

function debugLog(message: string, payload?: Record<string, unknown>) {
  if (!isElectron && import.meta.env.PROD) {
    return;
  }
  if (payload) {
    console.info("[git-diff-viewer-with-sidebar]", message, payload);
  } else {
    console.info("[git-diff-viewer-with-sidebar]", message);
  }
}

/**
 * GitDiffViewerWithSidebar - Full-featured diff viewer with file navigation sidebar.
 * Uses @git-diff-view/react for lightweight, purpose-built diff rendering.
 * Preserves all features from MonacoGitDiffViewerWithSidebar.
 */
function GitDiffViewerWithSidebar({
  diffs,
  isLoading,
  onControlsChange,
  classNames,
  onFileToggle,
  isHeatmapActive,
  onToggleHeatmap,
}: GitDiffViewerWithSidebarProps) {
  const { theme } = useTheme();
  const diffTheme = theme === "dark" ? "dark" : "light";

  const kitty = useMemo(() => {
    return kitties[Math.floor(Math.random() * kitties.length)];
  }, []);

  // Sidebar collapsed state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Prepare diff files with DiffFile instances
  const preparedFiles = useMemo(() => {
    return prepareDiffFiles(diffs);
  }, [diffs]);

  // Determine initial collapse state based on file size
  const getInitialExpandedFiles = useCallback(() => {
    const expanded = new Set<string>();
    for (const prepared of preparedFiles) {
      const { entry, totalLines } = prepared;
      // Auto-collapse large files, deleted files, and renamed files
      const shouldCollapse =
        totalLines > AUTO_COLLAPSE_THRESHOLD ||
        entry.status === "deleted" ||
        entry.status === "renamed";
      if (!shouldCollapse) {
        expanded.add(entry.filePath);
      }
    }
    return expanded;
  }, [preparedFiles]);

  // All files expanded by default (respecting auto-collapse threshold)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    getInitialExpandedFiles
  );

  // Viewed files state
  const [viewedFiles, setViewedFiles] = useState<Set<string>>(() => new Set());

  // Active path for sidebar navigation
  const [activePath, setActivePath] = useState<string>(() => {
    return diffs[0]?.filePath ?? "";
  });

  // Sync expanded files when diffs change
  useEffect(() => {
    if (diffs.length > 0) {
      setExpandedFiles((prev) => {
        const newSet = new Set(prev);
        for (const prepared of preparedFiles) {
          const { entry, totalLines } = prepared;
          // Add new files if they shouldn't be auto-collapsed
          if (!prev.has(entry.filePath)) {
            const shouldCollapse =
              totalLines > AUTO_COLLAPSE_THRESHOLD ||
              entry.status === "deleted" ||
              entry.status === "renamed";
            if (!shouldCollapse) {
              newSet.add(entry.filePath);
            }
          }
        }
        return newSet;
      });
    }
  }, [diffs, preparedFiles]);

  // Keyboard shortcut: F to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        setIsSidebarCollapsed((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const expandAll = useCallback(() => {
    debugLog("expandAll invoked", { fileCount: preparedFiles.length });
    setExpandedFiles(new Set(preparedFiles.map((p) => p.entry.filePath)));
  }, [preparedFiles]);

  const collapseAll = useCallback(() => {
    debugLog("collapseAll invoked", { fileCount: preparedFiles.length });
    setExpandedFiles(new Set());
  }, [preparedFiles]);

  const toggleFile = useCallback(
    (filePath: string) => {
      setExpandedFiles((prev) => {
        const next = new Set(prev);
        const wasExpanded = next.has(filePath);
        if (wasExpanded) {
          next.delete(filePath);
        } else {
          next.add(filePath);
        }
        try {
          onFileToggle?.(filePath, !wasExpanded);
        } catch {
          // ignore
        }
        return next;
      });
    },
    [onFileToggle]
  );

  const handleToggleViewed = useCallback((filePath: string) => {
    setViewedFiles((prev) => {
      const next = new Set(prev);
      const wasViewed = next.has(filePath);
      if (wasViewed) {
        next.delete(filePath);
        // When un-viewing, expand the file
        setExpandedFiles((expanded) => {
          const updated = new Set(expanded);
          updated.add(filePath);
          return updated;
        });
      } else {
        next.add(filePath);
        // When marking as viewed, collapse the file
        setExpandedFiles((expanded) => {
          const updated = new Set(expanded);
          updated.delete(filePath);
          return updated;
        });
      }
      return next;
    });
  }, []);

  const handleSelectFile = useCallback((filePath: string) => {
    setActivePath(filePath);

    // Scroll to the file
    if (typeof window !== "undefined") {
      const element = document.getElementById(filePath);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, []);

  // Calculate totals
  const totalAdditions = diffs.reduce((sum, diff) => sum + diff.additions, 0);
  const totalDeletions = diffs.reduce((sum, diff) => sum + diff.deletions, 0);

  // Expose controls
  const controlsHandlerRef = useRef<typeof onControlsChange>(null);

  useEffect(() => {
    controlsHandlerRef.current = onControlsChange ?? null;
  }, [onControlsChange]);

  useEffect(() => {
    controlsHandlerRef.current?.({
      expandAll,
      collapseAll,
      totalAdditions,
      totalDeletions,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalAdditions, totalDeletions, diffs.length]);

  // Loading state - show skeleton
  if (isLoading) {
    return (
      <div className="grow flex flex-col bg-white dark:bg-neutral-900 min-h-0">
        {/* Header bar skeleton */}
        <div className="flex-shrink-0 flex items-center gap-2 px-2 py-1.5 border-b border-neutral-200/80 dark:border-neutral-800/70">
          <div className="flex items-center gap-1.5 px-2 py-1">
            <div className="w-4 h-4 bg-neutral-100 dark:bg-neutral-800 rounded animate-pulse" />
            <div className="w-10 h-4 bg-neutral-100 dark:bg-neutral-800 rounded animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-4 bg-neutral-100 dark:bg-neutral-800 rounded animate-pulse" />
            <div className="w-6 h-4 bg-neutral-100 dark:bg-neutral-800 rounded animate-pulse" />
          </div>
        </div>

        {/* Content area */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar skeleton */}
          <div className="w-[280px] h-full border-r border-neutral-200/80 dark:border-neutral-800/70">
            <div className="p-2">
              <div className="h-8 bg-neutral-100 dark:bg-neutral-800 rounded-md animate-pulse" />
            </div>
            <div className="space-y-0.5 px-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1">
                  <div className="w-4 h-4 bg-neutral-100 dark:bg-neutral-800 rounded animate-pulse" />
                  <div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded flex-1 animate-pulse" />
                </div>
              ))}
            </div>
          </div>
          {/* Content skeleton */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-col">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="border-b border-neutral-200/80 dark:border-neutral-800/70"
                >
                  <div className="flex items-center gap-2 px-4 py-3">
                    <div className="w-4 h-4 bg-neutral-100 dark:bg-neutral-800 rounded animate-pulse" />
                    <div className="h-4 w-48 bg-neutral-100 dark:bg-neutral-800 rounded animate-pulse" />
                    <div className="ml-auto flex gap-2">
                      <div className="h-4 w-8 bg-neutral-100 dark:bg-neutral-800 rounded animate-pulse" />
                      <div className="h-4 w-8 bg-neutral-100 dark:bg-neutral-800 rounded animate-pulse" />
                    </div>
                  </div>
                  <div className="h-32 bg-neutral-50 dark:bg-neutral-900/50 animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No diff detected - show header with empty state message
  if (diffs.length === 0) {
    return (
      <div className="grow flex flex-col bg-white dark:bg-neutral-900 min-h-0">
        {/* Header row */}
        <div className="px-2 py-1.5 flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 text-[13px] font-medium text-neutral-600 dark:text-neutral-400">
            <PanelLeft className="w-3.5 h-3.5" />
            <span>Files</span>
          </div>
        </div>
        <div className="grow flex flex-col items-center justify-center px-3 pb-3">
          <p className="text-xs text-neutral-500 dark:text-neutral-400 py-1">
            No diff detected
          </p>
          <pre className="mt-2 select-none text-left text-[8px] font-mono text-neutral-500 dark:text-neutral-400">
            {kitty}
          </pre>
        </div>
      </div>
    );
  }

  // Has diffs - show full UI with sidebar
  return (
    <div className="grow flex flex-col bg-white dark:bg-neutral-900 min-h-0">
      {/* Header bar */}
      <div className="flex-shrink-0 flex items-center gap-2 px-2 py-1.5 border-b border-neutral-200/80 dark:border-neutral-800/70">
        <button
          type="button"
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[13px] font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          title={isSidebarCollapsed ? "Show files (F)" : "Hide files (F)"}
        >
          {isSidebarCollapsed ? (
            <PanelLeft className="w-3.5 h-3.5" />
          ) : (
            <PanelLeftClose className="w-3.5 h-3.5" />
          )}
          <span>Files</span>
        </button>
        <div className="flex items-center gap-2 text-[11px] font-medium">
          <span className="text-green-600 dark:text-green-400">
            +{totalAdditions}
          </span>
          <span className="text-red-600 dark:text-red-400">
            -{totalDeletions}
          </span>
        </div>
        {onToggleHeatmap && (
          <button
            type="button"
            onClick={onToggleHeatmap}
            className="flex items-center gap-1.5 text-[11px] font-medium ml-auto text-neutral-500 dark:text-neutral-400"
            title={
              isHeatmapActive
                ? "Switch to standard diff"
                : "Switch to heatmap diff"
            }
          >
            <Flame className="w-3 h-3" />
            <span>Diff Heatmap</span>
          </button>
        )}
      </div>

      {/* Content area */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        {!isSidebarCollapsed && (
          <div className="flex-shrink-0 self-stretch border-r border-neutral-200/80 dark:border-neutral-800/70">
            <DiffSidebarFilter
              diffs={diffs}
              viewedFiles={viewedFiles}
              activePath={activePath}
              onSelectFile={handleSelectFile}
              onToggleViewed={handleToggleViewed}
              className="sticky top-[var(--cmux-diff-header-offset,0px)] h-[calc(100vh-var(--cmux-diff-header-offset,0px)-41px)]"
            />
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-col">
            {preparedFiles.map((prepared) => (
              <MemoDiffFileRow
                key={`gdv:${prepared.entry.filePath}`}
                prepared={prepared}
                isExpanded={expandedFiles.has(prepared.entry.filePath)}
                isViewed={viewedFiles.has(prepared.entry.filePath)}
                onToggle={() => toggleFile(prepared.entry.filePath)}
                onToggleViewed={() =>
                  handleToggleViewed(prepared.entry.filePath)
                }
                theme={diffTheme}
                anchorId={prepared.entry.filePath}
                className={classNames?.fileDiffRow?.container}
              />
            ))}
            <div className="px-3 py-6 text-center">
              <span className="select-none text-xs text-neutral-500 dark:text-neutral-400">
                You've reached the end of the diff!
              </span>
              <div className="grid place-content-center">
                <pre className="mt-2 pb-12 select-none text-left text-[8px] font-mono text-neutral-500 dark:text-neutral-400">
                  {kitty}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const MemoGitDiffViewerWithSidebar = memo(GitDiffViewerWithSidebar);

export { GitDiffViewerWithSidebar, MemoGitDiffViewerWithSidebar };
