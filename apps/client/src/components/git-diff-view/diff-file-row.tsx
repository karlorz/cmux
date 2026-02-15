import { memo, useCallback, useState } from "react";
import { DiffView, DiffModeEnum } from "@git-diff-view/react";
import { cn } from "@/lib/utils";
import { FileDiffHeaderWithViewed } from "../file-diff-header-with-viewed";
import { LargeDiffPlaceholder } from "./large-diff-placeholder";
import { type PreparedDiffFile, LARGE_DIFF_THRESHOLD } from "./types";
import "@git-diff-view/react/styles/diff-view.css";

interface DiffFileRowProps {
  prepared: PreparedDiffFile;
  isExpanded: boolean;
  isViewed: boolean;
  onToggle: () => void;
  onToggleViewed: () => void;
  theme: "light" | "dark";
  anchorId?: string;
  className?: string;
}

function DiffFileRow({
  prepared,
  isExpanded,
  isViewed,
  onToggle,
  onToggleViewed,
  theme,
  anchorId,
  className,
}: DiffFileRowProps) {
  const { entry, diffFile, totalLines } = prepared;
  const [forceLoadLargeDiff, setForceLoadLargeDiff] = useState(false);

  const handleLoadAnyway = useCallback(() => {
    setForceLoadLargeDiff(true);
  }, []);

  const isLargeDiff = totalLines > LARGE_DIFF_THRESHOLD && !forceLoadLargeDiff;
  const canRenderDiff =
    !entry.isBinary &&
    !entry.contentOmitted &&
    entry.status !== "deleted" &&
    entry.status !== "renamed" &&
    diffFile !== null;

  return (
    <div
      id={anchorId}
      className={cn(
        "bg-white dark:bg-neutral-900 border-b border-neutral-200/80 dark:border-neutral-800/70",
        className
      )}
    >
      <FileDiffHeaderWithViewed
        filePath={entry.filePath}
        oldPath={entry.oldPath}
        status={entry.status}
        additions={entry.additions}
        deletions={entry.deletions}
        isExpanded={isExpanded}
        isViewed={isViewed}
        onToggle={onToggle}
        onToggleViewed={onToggleViewed}
      />

      <div
        className={cn(
          "overflow-hidden flex flex-col",
          !isExpanded && "hidden"
        )}
        aria-hidden={!isExpanded}
      >
        {entry.status === "renamed" ? (
          <div className="grow space-y-2 bg-neutral-50 px-3 py-6 text-center text-xs text-neutral-500 dark:bg-neutral-900/50 dark:text-neutral-400 grid place-content-center">
            <p className="select-none">File was renamed.</p>
            {entry.oldPath ? (
              <p className="select-none font-mono text-[11px] text-neutral-600 dark:text-neutral-300">
                {entry.oldPath} &rarr; {entry.filePath}
              </p>
            ) : null}
          </div>
        ) : entry.isBinary ? (
          <div className="grow bg-neutral-50 px-3 py-6 text-center text-xs text-neutral-500 dark:bg-neutral-900/50 dark:text-neutral-400 grid place-content-center">
            Binary file not shown
          </div>
        ) : entry.status === "deleted" ? (
          <div className="grow bg-neutral-50 px-3 py-6 text-center text-xs text-neutral-500 dark:bg-neutral-900/50 dark:text-neutral-400 grid place-content-center">
            File was deleted
          </div>
        ) : entry.contentOmitted ? (
          <div className="grow bg-neutral-50 px-3 py-6 text-center text-xs text-neutral-500 dark:bg-neutral-900/50 dark:text-neutral-400 grid place-content-center">
            Diff content omitted due to size
          </div>
        ) : isLargeDiff ? (
          <LargeDiffPlaceholder
            totalLines={totalLines}
            additions={entry.additions}
            deletions={entry.deletions}
            onLoadAnyway={handleLoadAnyway}
          />
        ) : canRenderDiff && diffFile ? (
          <div className="diff-view-container">
            <DiffView
              diffFile={diffFile}
              diffViewMode={DiffModeEnum.Split}
              diffViewTheme={theme}
              diffViewWrap
              diffViewFontSize={13}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export const MemoDiffFileRow = memo(DiffFileRow, (prev, next) => {
  const a = prev.prepared.entry;
  const b = next.prepared.entry;
  return (
    prev.isExpanded === next.isExpanded &&
    prev.isViewed === next.isViewed &&
    prev.theme === next.theme &&
    prev.anchorId === next.anchorId &&
    a.filePath === b.filePath &&
    a.oldPath === b.oldPath &&
    a.status === b.status &&
    a.additions === b.additions &&
    a.deletions === b.deletions &&
    a.isBinary === b.isBinary &&
    a.contentOmitted === b.contentOmitted &&
    a.oldContent === b.oldContent &&
    a.newContent === b.newContent &&
    prev.prepared.diffFile === next.prepared.diffFile
  );
});

export { DiffFileRow };
