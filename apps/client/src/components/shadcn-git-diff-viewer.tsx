import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createTwoFilesPatch } from "diff";
import type { ReplaceDiffEntry } from "@cmux/shared/diff-types";
import { Diff, Hunk, parseDiff, type DiffFile } from "@/ui/diff";
import type { GitDiffViewerProps } from "./codemirror-git-diff-viewer";
import { FileDiffHeader } from "./file-diff-header";
import { cn } from "@/lib/utils";
export type { GitDiffViewerProps } from "./codemirror-git-diff-viewer";

function buildPatchFromEntry(entry: ReplaceDiffEntry): string {
  if (entry.patch && entry.patch.trim().length > 0) {
    return entry.patch;
  }

  const oldLabel = entry.oldPath ?? entry.filePath;
  const newLabel = entry.filePath;

  return createTwoFilesPatch(
    oldLabel,
    newLabel,
    entry.oldContent ?? "",
    entry.newContent ?? "",
    entry.oldPath ? `a/${entry.oldPath}` : "a/unknown",
    `b/${newLabel}`,
  );
}

type ParsedEntry = {
  entry: ReplaceDiffEntry;
  file: DiffFile;
};

function parseEntry(entry: ReplaceDiffEntry): ParsedEntry | null {
  const patch = buildPatchFromEntry(entry);
  if (!patch.trim()) {
    return null;
  }

  try {
    const [file] = parseDiff(patch);
    if (!file) return null;
    return { entry, file };
  } catch (error) {
    console.warn("Failed to parse diff for", entry.filePath, error);
    return null;
  }
}

export const ShadcnGitDiffViewer = memo(function ShadcnGitDiffViewer({
  diffs,
  onControlsChange,
  classNames,
  onFileToggle,
}: GitDiffViewerProps) {
  const parsed = useMemo(() => {
    return diffs
      .map((entry) => parseEntry(entry))
      .filter((item): item is ParsedEntry => Boolean(item));
  }, [diffs]);

  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    () => new Set(parsed.map((item) => item.entry.filePath)),
  );

  useEffect(() => {
    setExpandedFiles(new Set(parsed.map((item) => item.entry.filePath)));
  }, [parsed]);

  const expandAll = useCallback(() => {
    setExpandedFiles(new Set(parsed.map((item) => item.entry.filePath)));
  }, [parsed]);

  const collapseAll = useCallback(() => {
    setExpandedFiles(new Set());
  }, []);

  const totalAdditions = useMemo(
    () => diffs.reduce((sum, diff) => sum + diff.additions, 0),
    [diffs],
  );
  const totalDeletions = useMemo(
    () => diffs.reduce((sum, diff) => sum + diff.deletions, 0),
    [diffs],
  );

  const controlsHandlerRef = useRef<GitDiffViewerProps["onControlsChange"]>(
    null,
  );

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
  }, [collapseAll, expandAll, totalAdditions, totalDeletions, parsed.length]);

  const toggleFile = (filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      onFileToggle?.(filePath, next.has(filePath));
      return next;
    });
  };

  if (parsed.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
        No renderable diffs
      </div>
    );
  }

  return (
    <div className="grow bg-white dark:bg-neutral-900">
      <div className="flex flex-col -space-y-px">
        {parsed.map(({ entry, file }, index) => {
          const isExpanded = expandedFiles.has(entry.filePath);
          const rowKey = `${entry.filePath}:${index}`;
          return (
            <section
              key={rowKey}
              className="border-b border-neutral-200 dark:border-neutral-800"
            >
              <FileDiffHeader
                filePath={entry.filePath}
                oldPath={entry.oldPath}
                status={entry.status}
                additions={entry.additions}
                deletions={entry.deletions}
                isExpanded={isExpanded}
                onToggle={() => toggleFile(entry.filePath)}
                className={classNames?.fileDiffRow?.button}
              />
              {isExpanded ? (
                entry.isBinary ? (
                  <div className="px-4 py-10 text-center text-xs text-neutral-500 dark:text-neutral-400">
                    Binary file changes are not displayed
                  </div>
                ) : (
                  <div
                    className={cn(
                      "overflow-x-auto bg-white dark:bg-neutral-950",
                      classNames?.fileDiffRow?.container,
                    )}
                  >
                    <Diff
                      fileName={file.newPath ?? entry.filePath}
                      hunks={file.hunks}
                      type={file.type}
                      className="w-full"
                    >
                      {file.hunks.map((hunk, index) => (
                        <Hunk
                          key={`${entry.filePath}:${index}`}
                          hunk={hunk}
                        />
                      ))}
                    </Diff>
                  </div>
                )
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
});

ShadcnGitDiffViewer.displayName = "ShadcnGitDiffViewer";
