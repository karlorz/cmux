import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ReplaceDiffEntry } from "@cmux/shared/diff-types";

import { Diff, Hunk } from "@/ui/diff";
import { parseDiff, type File as ParsedFile } from "@/ui/diff/utils";
import { cn } from "@/lib/utils";

import type { GitDiffViewerProps } from "../codemirror-git-diff-viewer";
import { FileDiffHeader } from "../file-diff-header";
import { kitties } from "../kitties";

interface FileDiffModel {
  entry: ReplaceDiffEntry;
  diff: ParsedFile | null;
  error?: string;
}

type GitDiffViewerClassNames = NonNullable<GitDiffViewerProps["classNames"]>;
type FileDiffRowClassNames = GitDiffViewerClassNames["fileDiffRow"];

const buildDiffText = (entry: ReplaceDiffEntry): string | null => {
  if (!entry.patch) {
    return null;
  }

  const normalizedPatch = entry.patch.endsWith("\n")
    ? entry.patch
    : `${entry.patch}\n`;

  const oldPath =
    entry.status === "added" ? "/dev/null" : entry.oldPath ?? entry.filePath;
  const newPath =
    entry.status === "deleted" ? "/dev/null" : entry.filePath ?? entry.oldPath;

  const gitOldLabel = `a/${entry.oldPath ?? entry.filePath}`;
  const gitNewLabel = `b/${entry.filePath}`;
  const oldLabel = oldPath === "/dev/null" ? oldPath : gitOldLabel;
  const newLabel = newPath === "/dev/null" ? newPath : gitNewLabel;

  return [
    `diff --git ${gitOldLabel} ${gitNewLabel}`,
    `--- ${oldLabel}`,
    `+++ ${newLabel}`,
    normalizedPatch,
    "",
  ].join("\n");
};

const parseEntry = (entry: ReplaceDiffEntry): FileDiffModel => {
  if (entry.isBinary) {
    return {
      entry,
      diff: null,
      error: "Binary file changes are not supported in this viewer.",
    };
  }

  if (entry.contentOmitted) {
    return {
      entry,
      diff: null,
      error: "Diff content omitted because the file is too large.",
    };
  }

  const diffText = buildDiffText(entry);
  if (!diffText) {
    return {
      entry,
      diff: null,
      error: "No diff data was provided for this file.",
    };
  }

  try {
    const [file] = parseDiff(diffText);
    return {
      entry,
      diff: file ?? null,
      error: file ? undefined : "Unable to parse diff data.",
    };
  } catch (error) {
    return {
      entry,
      diff: null,
      error:
        error instanceof Error
          ? error.message
          : "Unable to parse diff payload.",
    };
  }
};

const useKitty = () => {
  return useMemo(() => {
    return kitties[Math.floor(Math.random() * kitties.length)];
  }, []);
};

interface FileDiffRowProps {
  model: FileDiffModel;
  isExpanded: boolean;
  onToggle: () => void;
  classNames?: FileDiffRowClassNames;
}

function FileDiffRow({ model, isExpanded, onToggle, classNames }: FileDiffRowProps) {
  const { entry, diff, error } = model;

  return (
    <div className="flex flex-col">
      <FileDiffHeader
        filePath={entry.filePath}
        oldPath={entry.oldPath}
        status={entry.status}
        additions={entry.additions}
        deletions={entry.deletions}
        isExpanded={isExpanded}
        onToggle={onToggle}
        className={classNames?.button}
      />
      {isExpanded ? (
        <div
          className={cn(
            "px-3 py-4 bg-white dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 text-[13px]",
            classNames?.container
          )}
        >
          {diff ? (
            <Diff fileName={entry.filePath} hunks={diff.hunks} type={diff.type}>
              {diff.hunks.map((hunk: ParsedFile["hunks"][number], index) => (
                <Hunk key={`${entry.filePath}:${index}:${hunk.content}`} hunk={hunk} />
              ))}
            </Diff>
          ) : (
            <div className="text-xs text-neutral-500 dark:text-neutral-400 font-mono whitespace-pre-wrap">
              {error ?? "No diff available."}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function ShadcnGitDiffViewer({
  diffs,
  onControlsChange,
  classNames,
  onFileToggle,
}: GitDiffViewerProps) {
  const kitty = useKitty();
  const fileModels = useMemo(() => diffs.map(parseEntry), [diffs]);

  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    () => new Set(diffs.map((diff) => diff.filePath))
  );

  const toggleFile = useCallback(
    (filePath: string) => {
      setExpandedFiles((prev) => {
        const next = new Set(prev);
        if (next.has(filePath)) {
          next.delete(filePath);
          onFileToggle?.(filePath, false);
        } else {
          next.add(filePath);
          onFileToggle?.(filePath, true);
        }
        return next;
      });
    },
    [onFileToggle]
  );

  const expandAll = useCallback(() => {
    setExpandedFiles(new Set(diffs.map((diff) => diff.filePath)));
  }, [diffs]);

  const collapseAll = useCallback(() => {
    setExpandedFiles(new Set());
  }, []);

  const totalAdditions = useMemo(
    () => diffs.reduce((sum, diff) => sum + diff.additions, 0),
    [diffs]
  );
  const totalDeletions = useMemo(
    () => diffs.reduce((sum, diff) => sum + diff.deletions, 0),
    [diffs]
  );

  const controlsHandlerRef = useRef<GitDiffViewerProps["onControlsChange"] | null>(
    null
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
  }, [expandAll, collapseAll, totalAdditions, totalDeletions]);

  return (
    <div className="grow bg-white dark:bg-neutral-900">
      <div className="flex flex-col -space-y-px">
        {fileModels.map((model) => (
          <FileDiffRow
            key={model.entry.filePath}
            model={model}
            isExpanded={expandedFiles.has(model.entry.filePath)}
            onToggle={() => toggleFile(model.entry.filePath)}
            classNames={classNames?.fileDiffRow}
          />
        ))}
        <hr className="border-neutral-200 dark:border-neutral-800" />
        <div className="px-3 py-6 text-center">
          <span className="text-xs text-neutral-500 dark:text-neutral-400 select-none">
            You’ve reached the end of the diff!
          </span>
          <div className="grid place-content-center">
            <pre className="text-[8px] text-left text-neutral-500 dark:text-neutral-400 select-none mt-2 pb-20 font-mono">
              {kitty}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
