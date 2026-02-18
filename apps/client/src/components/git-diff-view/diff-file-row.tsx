import { DiffModeEnum, DiffView } from "@git-diff-view/react";
import type { DiffFileHighlighter } from "@git-diff-view/core";
import { memo, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { FileDiffHeader } from "../file-diff-header";
import { FileDiffHeaderWithViewed } from "../file-diff-header-with-viewed";
import { LargeDiffPlaceholder } from "./large-diff-placeholder";
import {
  LARGE_DIFF_THRESHOLD,
  VIEWPORT_RENDER_MARGIN,
  type FileDiffRowClassNames,
  type PreparedDiffFile,
} from "./types";

interface DiffFileRowProps {
  preparedFile: PreparedDiffFile;
  isExpanded: boolean;
  isViewed?: boolean;
  onToggle: () => void;
  onToggleViewed?: () => void;
  theme: "light" | "dark";
  mode?: DiffModeEnum;
  classNames?: FileDiffRowClassNames;
  registerHighlighter?: DiffFileHighlighter;
  anchorId?: string;
}

function DiffFileRow({
  preparedFile,
  isExpanded,
  isViewed,
  onToggle,
  onToggleViewed,
  theme,
  mode = DiffModeEnum.SplitGitHub,
  classNames,
  registerHighlighter,
  anchorId,
}: DiffFileRowProps) {
  const entry = preparedFile.entry;
  const isVeryLarge = preparedFile.totalLines > LARGE_DIFF_THRESHOLD;
  const [loadLargeDiff, setLoadLargeDiff] = useState(false);

  // Lazy loading: only render diff content when scrolled into viewport
  const rowRef = useRef<HTMLDivElement>(null);
  const [isInViewport, setIsInViewport] = useState(false);

  useEffect(() => {
    const element = rowRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([intersectionEntry]) => {
        if (intersectionEntry?.isIntersecting) {
          setIsInViewport(true);
          // Once in viewport, no need to keep observing
          observer.disconnect();
        }
      },
      { rootMargin: VIEWPORT_RENDER_MARGIN }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setLoadLargeDiff(false);
  }, [entry.filePath, preparedFile.totalLines]);

  const canRenderDiff = Boolean(preparedFile.diffFile);
  // Only render expensive diff content when in viewport AND expanded
  const shouldRenderDiff = isExpanded && isInViewport;

  return (
    <div
      ref={rowRef}
      id={anchorId}
      className={cn("bg-white dark:bg-neutral-900", classNames?.container)}
    >
      {onToggleViewed ? (
        <FileDiffHeaderWithViewed
          filePath={entry.filePath}
          oldPath={entry.oldPath}
          status={entry.status}
          additions={entry.additions}
          deletions={entry.deletions}
          isExpanded={isExpanded}
          isViewed={Boolean(isViewed)}
          onToggle={onToggle}
          onToggleViewed={onToggleViewed}
          className={classNames?.button}
        />
      ) : (
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
      )}

      <div
        className="overflow-hidden"
        style={isExpanded ? undefined : { minHeight: 0, height: 0 }}
        aria-hidden={!isExpanded}
      >
        {entry.status === "renamed" ? (
          <div className="grid grow place-content-center space-y-2 bg-neutral-50 px-3 py-6 text-center text-xs text-neutral-500 dark:bg-neutral-900/50 dark:text-neutral-400">
            <p className="select-none">File was renamed.</p>
            {entry.oldPath ? (
              <p className="select-none font-mono text-[11px] text-neutral-600 dark:text-neutral-300">
                {entry.oldPath} → {entry.filePath}
              </p>
            ) : null}
          </div>
        ) : entry.isBinary ? (
          <div className="grid grow place-content-center bg-neutral-50 px-3 py-6 text-center text-xs text-neutral-500 dark:bg-neutral-900/50 dark:text-neutral-400">
            Binary file not shown
          </div>
        ) : entry.status === "deleted" ? (
          <div className="grid grow place-content-center bg-neutral-50 px-3 py-6 text-center text-xs text-neutral-500 dark:bg-neutral-900/50 dark:text-neutral-400">
            File was deleted
          </div>
        ) : entry.contentOmitted ? (
          <div className="grid grow place-content-center bg-neutral-50 px-3 py-6 text-center text-xs text-neutral-500 dark:bg-neutral-900/50 dark:text-neutral-400">
            Diff content omitted due to size
          </div>
        ) : isVeryLarge && !loadLargeDiff ? (
          <LargeDiffPlaceholder
            totalLines={preparedFile.totalLines}
            additions={entry.additions}
            deletions={entry.deletions}
            onLoadAnyway={() => setLoadLargeDiff(true)}
          />
        ) : !shouldRenderDiff ? (
          // Lazy loading placeholder - shown when expanded but not yet in viewport
          <div className="grid grow place-content-center bg-neutral-50 px-3 py-6 text-center text-xs text-neutral-500 dark:bg-neutral-900/50 dark:text-neutral-400">
            Loading diff...
          </div>
        ) : canRenderDiff && preparedFile.diffFile ? (
          <div className="cmux-git-diff-view w-full overflow-x-auto border-t border-neutral-200/80 dark:border-neutral-800/70">
            <DiffView
              diffFile={preparedFile.diffFile}
              diffViewMode={mode}
              diffViewTheme={theme}
              diffViewWrap={true}
              diffViewFontSize={13}
              diffViewHighlight={Boolean(registerHighlighter)}
              registerHighlighter={registerHighlighter}
            />
          </div>
        ) : (
          <div className="grid grow place-content-center bg-neutral-50 px-3 py-6 text-center text-xs text-neutral-500 dark:bg-neutral-900/50 dark:text-neutral-400">
            Unable to render diff
          </div>
        )}
      </div>
    </div>
  );
}

export const MemoDiffFileRow = memo(DiffFileRow, (prev, next) => {
  const prevEntry = prev.preparedFile.entry;
  const nextEntry = next.preparedFile.entry;

  return (
    prev.isExpanded === next.isExpanded &&
    prev.isViewed === next.isViewed &&
    prev.theme === next.theme &&
    prev.mode === next.mode &&
    prev.anchorId === next.anchorId &&
    prev.classNames?.button === next.classNames?.button &&
    prev.classNames?.container === next.classNames?.container &&
    prev.registerHighlighter === next.registerHighlighter &&
    prev.preparedFile.diffFile === next.preparedFile.diffFile &&
    prev.preparedFile.language === next.preparedFile.language &&
    prev.preparedFile.totalLines === next.preparedFile.totalLines &&
    prevEntry.filePath === nextEntry.filePath &&
    prevEntry.oldPath === nextEntry.oldPath &&
    prevEntry.status === nextEntry.status &&
    prevEntry.additions === nextEntry.additions &&
    prevEntry.deletions === nextEntry.deletions &&
    prevEntry.oldContent === nextEntry.oldContent &&
    prevEntry.newContent === nextEntry.newContent &&
    prevEntry.patch === nextEntry.patch &&
    prevEntry.isBinary === nextEntry.isBinary &&
    prevEntry.contentOmitted === nextEntry.contentOmitted
  );
});
