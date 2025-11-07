import { useMemo, useState, useEffect } from "react";
import type { ReplaceDiffEntry } from "@cmux/shared";
import { Diff, Hunk } from "./index";
import { parseDiff } from "./utils";
import { FileDiffHeader } from "../file-diff-header";

export interface ShadcnGitDiffViewerProps {
  diffs: ReplaceDiffEntry[];
  classNames?: {
    fileDiffRow?: {
      button?: string;
      container?: string;
    };
  };
  onControlsChange?: (controls: {
    expandAll: () => void;
    collapseAll: () => void;
    totalAdditions: number;
    totalDeletions: number;
  }) => void;
  onFileToggle?: (filePath: string, isExpanded: boolean) => void;
}

function convertDiffToPatch(diff: ReplaceDiffEntry): string {
  // If we already have a patch, use it
  if (diff.patch) {
    return diff.patch;
  }

  // Otherwise, create a unified diff from oldContent and newContent
  // This is a simplified version - the patch parser expects unified diff format
  const oldPath = diff.oldPath || diff.filePath;
  const newPath = diff.filePath;

  let patch = `diff --git a/${oldPath} b/${newPath}\n`;

  if (diff.status === "added") {
    patch += `new file mode 100644\n`;
    patch += `--- /dev/null\n`;
    patch += `+++ b/${newPath}\n`;
  } else if (diff.status === "deleted") {
    patch += `deleted file mode 100644\n`;
    patch += `--- a/${oldPath}\n`;
    patch += `+++ /dev/null\n`;
  } else if (diff.status === "renamed") {
    patch += `rename from ${oldPath}\n`;
    patch += `rename to ${newPath}\n`;
  } else {
    patch += `--- a/${oldPath}\n`;
    patch += `+++ b/${newPath}\n`;
  }

  // Add content if available
  if (diff.newContent !== undefined || diff.oldContent !== undefined) {
    const oldContent = diff.oldContent || "";
    const newContent = diff.newContent || "";

    // Simple unified diff generation
    const oldLines = oldContent.split("\n");
    const newLines = newContent.split("\n");

    patch += `@@ -1,${oldLines.length} +1,${newLines.length} @@\n`;

    // For simplicity, show all old lines as deletions and all new lines as additions
    // In a real implementation, you'd use a proper diff algorithm
    for (const line of oldLines) {
      if (line || oldLines.length > 0) {
        patch += `-${line}\n`;
      }
    }
    for (const line of newLines) {
      if (line || newLines.length > 0) {
        patch += `+${line}\n`;
      }
    }
  }

  return patch;
}

export function ShadcnGitDiffViewer({
  diffs,
  classNames,
  onControlsChange,
  onFileToggle,
}: ShadcnGitDiffViewerProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    () => new Set(diffs.map((diff) => diff.filePath))
  );

  const totalAdditions = useMemo(
    () => diffs.reduce((sum, diff) => sum + diff.additions, 0),
    [diffs]
  );

  const totalDeletions = useMemo(
    () => diffs.reduce((sum, diff) => sum + diff.deletions, 0),
    [diffs]
  );

  const expandAll = () => {
    setExpandedFiles(new Set(diffs.map((diff) => diff.filePath)));
  };

  const collapseAll = () => {
    setExpandedFiles(new Set());
  };

  const toggleFile = (filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      const wasExpanded = next.has(filePath);
      if (wasExpanded) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      onFileToggle?.(filePath, !wasExpanded);
      return next;
    });
  };

  // Expose controls to parent
  useEffect(() => {
    onControlsChange?.({
      expandAll,
      collapseAll,
      totalAdditions,
      totalDeletions,
    });
  }, [onControlsChange, totalAdditions, totalDeletions]);

  if (diffs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-neutral-500 dark:text-neutral-400 text-sm select-none">
          No changes to display
        </div>
      </div>
    );
  }

  return (
    <div className="grow bg-white dark:bg-neutral-900">
      <div className="flex flex-col">
        {diffs.map((diff, index) => {
          const isExpanded = expandedFiles.has(diff.filePath);

          // Skip binary files and files without content
          const canRender =
            !diff.isBinary &&
            !diff.contentOmitted &&
            diff.status !== "deleted" &&
            diff.status !== "renamed";

          let parsedFile;
          try {
            if (canRender && diff.patch) {
              const patch = convertDiffToPatch(diff);
              const [file] = parseDiff(patch);
              parsedFile = file;
            }
          } catch (error) {
            console.error("Failed to parse diff for", diff.filePath, error);
          }

          return (
            <div
              key={diff.filePath}
              className={`bg-white dark:bg-neutral-900 ${classNames?.fileDiffRow?.container || ""}`}
            >
              <FileDiffHeader
                filePath={diff.filePath}
                oldPath={diff.oldPath}
                status={diff.status}
                additions={diff.additions}
                deletions={diff.deletions}
                isExpanded={isExpanded}
                onToggle={() => toggleFile(diff.filePath)}
                className={`${classNames?.fileDiffRow?.button || ""} ${index === 0 ? "!border-t-0" : ""}`}
              />

              {isExpanded && (
                <div className="overflow-hidden border-b border-neutral-200 dark:border-neutral-800">
                  {diff.status === "renamed" ? (
                    <div className="space-y-2 bg-neutral-50 px-3 py-6 text-center text-xs text-neutral-500 dark:bg-neutral-900/50 dark:text-neutral-400 grid place-content-center">
                      <p className="select-none">File was renamed.</p>
                      {diff.oldPath ? (
                        <p className="select-none font-mono text-[11px] text-neutral-600 dark:text-neutral-300">
                          {diff.oldPath} → {diff.filePath}
                        </p>
                      ) : null}
                    </div>
                  ) : diff.isBinary ? (
                    <div className="bg-neutral-50 px-3 py-6 text-center text-xs text-neutral-500 dark:bg-neutral-900/50 dark:text-neutral-400 grid place-content-center">
                      Binary file not shown
                    </div>
                  ) : diff.status === "deleted" ? (
                    <div className="bg-neutral-50 px-3 py-6 text-center text-xs text-neutral-500 dark:bg-neutral-900/50 dark:text-neutral-400 grid place-content-center">
                      File was deleted
                    </div>
                  ) : diff.contentOmitted ? (
                    <div className="bg-neutral-50 px-3 py-6 text-center text-xs text-neutral-500 dark:bg-neutral-900/50 dark:text-neutral-400 grid place-content-center">
                      Diff content omitted due to size
                    </div>
                  ) : parsedFile ? (
                    <Diff
                      fileName={diff.filePath}
                      hunks={parsedFile.hunks}
                      type={parsedFile.type}
                    >
                      {parsedFile.hunks.map((hunk, hunkIndex) => (
                        <Hunk key={hunkIndex} hunk={hunk} />
                      ))}
                    </Diff>
                  ) : (
                    <div className="bg-neutral-50 px-3 py-6 text-center text-xs text-neutral-500 dark:bg-neutral-900/50 dark:text-neutral-400 grid place-content-center">
                      Unable to display diff
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <hr className="border-neutral-200 dark:border-neutral-800" />
        <div className="px-3 py-6 text-center">
          <span className="select-none text-xs text-neutral-500 dark:text-neutral-400">
            You've reached the end of the diff!
          </span>
        </div>
      </div>
    </div>
  );
}
