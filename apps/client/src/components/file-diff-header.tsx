import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { ReplaceDiffEntry } from "@cmux/shared/diff-types";
import { getDiffStatusColor, getDiffStatusIcon } from "./diff-status";

export interface FileDiffHeaderProps {
  filePath: string;
  oldPath?: string;
  status: ReplaceDiffEntry["status"];
  additions: number;
  deletions: number;
  isExpanded: boolean;
  onToggle: () => void;
  className?: string;
}

export function FileDiffHeader({
  filePath,
  oldPath,
  status,
  additions,
  deletions,
  isExpanded,
  onToggle,
  className,
}: FileDiffHeaderProps) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "w-full pl-3 pr-2.5 py-1.5 flex items-center hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors text-left group pt-1 bg-white dark:bg-neutral-900 border-y border-neutral-200 dark:border-neutral-800 sticky z-[var(--z-sticky-low)]",
        className,
      )}
    >
      <div className="flex items-center" style={{ width: '20px' }}>
        <div className="text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-600 dark:group-hover:text-neutral-400">
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </div>
      </div>
      <div className="flex items-center" style={{ width: '20px' }}>
        <div className={cn("flex-shrink-0", getDiffStatusColor(status))}>
          {getDiffStatusIcon(status)}
        </div>
      </div>
      <div className="flex-1 min-w-0 flex items-start justify-between gap-3">
        <div className="min-w-0 flex flex-col">
          <span className="font-mono text-xs text-neutral-700 dark:text-neutral-300 truncate select-none">
            {filePath}
          </span>
          {status === "renamed" && oldPath ? (
            <span className="font-mono text-[10px] text-neutral-500 dark:text-neutral-400 truncate select-none">
              Renamed from {oldPath}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-green-600 dark:text-green-400 font-medium select-none">
            +{additions}
          </span>
          <span className="text-red-600 dark:text-red-400 font-medium select-none">
            −{deletions}
          </span>
        </div>
      </div>
    </button>
  );
}
