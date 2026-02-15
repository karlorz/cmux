interface LargeDiffPlaceholderProps {
  totalLines: number;
  additions: number;
  deletions: number;
  onLoadAnyway: () => void;
}

/**
 * GitHub-style placeholder for large diffs that may slow down the browser.
 * Used when totalLines > LARGE_DIFF_THRESHOLD.
 */
export function LargeDiffPlaceholder({
  totalLines,
  additions,
  deletions,
  onLoadAnyway,
}: LargeDiffPlaceholderProps) {
  return (
    <div className="p-4 bg-yellow-50/50 dark:bg-yellow-900/10 border-t border-yellow-200/50 dark:border-yellow-800/30">
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-neutral-600 dark:text-neutral-400">
          <span className="font-medium text-yellow-700 dark:text-yellow-400">
            Large file
          </span>
          <span className="ml-4">
            {totalLines.toLocaleString()} lines changed
            <span className="text-green-600 dark:text-green-400 ml-2">
              +{additions.toLocaleString()}
            </span>
            <span className="text-red-600 dark:text-red-400 ml-1">
              -{deletions.toLocaleString()}
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={onLoadAnyway}
          className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors font-medium"
        >
          Load diff anyway
        </button>
      </div>
      <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
        Large diffs may slow down your browser.
      </p>
    </div>
  );
}
