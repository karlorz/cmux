import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/theme/use-theme";
import { isElectron } from "@/lib/electron";
import { prepareDiffFiles } from "./adapter";
import { MemoDiffFileRow } from "./diff-file-row";
import { kitties } from "../kitties";
import {
  type GitDiffViewerProps,
  AUTO_COLLAPSE_THRESHOLD,
} from "./types";

function debugLog(message: string, payload?: Record<string, unknown>) {
  if (!isElectron && import.meta.env.PROD) {
    return;
  }
  if (payload) {
    console.info("[git-diff-viewer]", message, payload);
  } else {
    console.info("[git-diff-viewer]", message);
  }
}

/**
 * Standalone GitDiffViewer without sidebar.
 * Uses @git-diff-view/react for lightweight, purpose-built diff rendering.
 */
function GitDiffViewer({
  diffs,
  isLoading,
  onControlsChange,
  classNames,
  onFileToggle,
}: GitDiffViewerProps) {
  const { theme } = useTheme();
  const diffTheme = theme === "dark" ? "dark" : "light";

  const kitty = useMemo(() => {
    return kitties[Math.floor(Math.random() * kitties.length)];
  }, []);

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

  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    getInitialExpandedFiles
  );

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

  // Viewed files state (for marking files as reviewed)
  const [viewedFiles, setViewedFiles] = useState<Set<string>>(() => new Set());

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

  // Loading state
  if (isLoading) {
    return (
      <div className="grow flex flex-col bg-white dark:bg-neutral-900 min-h-0">
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
    );
  }

  // Empty state
  if (diffs.length === 0) {
    return (
      <div className="grow flex flex-col bg-white dark:bg-neutral-900 min-h-0">
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

  return (
    <div className="grow flex flex-col bg-white dark:bg-neutral-900 min-h-0">
      <div className="flex flex-col">
        {preparedFiles.map((prepared) => (
          <MemoDiffFileRow
            key={`gdv:${prepared.entry.filePath}`}
            prepared={prepared}
            isExpanded={expandedFiles.has(prepared.entry.filePath)}
            isViewed={viewedFiles.has(prepared.entry.filePath)}
            onToggle={() => toggleFile(prepared.entry.filePath)}
            onToggleViewed={() => handleToggleViewed(prepared.entry.filePath)}
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
  );
}

const MemoGitDiffViewer = memo(GitDiffViewer);

export { GitDiffViewer, MemoGitDiffViewer };
