/**
 * VaultNoteRow Component
 *
 * A row in the vault notes list that can be expanded to show note content.
 */

import { useQuery } from "@tanstack/react-query";
import { getApiVaultNoteOptions } from "@cmux/www-openapi-client/react-query";
import { ChevronDown, ChevronRight, Eye, FileText, Loader2 } from "lucide-react";
import { useState, useCallback } from "react";
import clsx from "clsx";
import { VaultNoteContent } from "./VaultNoteContent";

interface VaultNoteRowProps {
  teamSlugOrId: string;
  notePath: string;
  noteTitle: string | null | undefined;
  lastAccessedAt: number;
  lastAccessedBy: string | null | undefined;
  accessCount: number;
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "Just now";
}

export function VaultNoteRow({
  teamSlugOrId,
  notePath,
  noteTitle,
  lastAccessedAt,
  lastAccessedBy,
  accessCount,
}: VaultNoteRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Only fetch note content when expanded
  const {
    data: noteData,
    isLoading,
    error,
  } = useQuery({
    ...getApiVaultNoteOptions({
      query: { teamSlugOrId, path: notePath },
    }),
    enabled: isExpanded,
    staleTime: 60000, // Cache for 1 minute
  });

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const displayTitle = noteTitle || notePath.split("/").pop()?.replace(".md", "") || notePath;

  return (
    <div className="border-b border-neutral-200 dark:border-neutral-800 last:border-b-0">
      {/* Row header (always visible) */}
      <button
        type="button"
        onClick={toggleExpand}
        className={clsx(
          "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
          "hover:bg-neutral-50 dark:hover:bg-neutral-800/50",
          isExpanded && "bg-neutral-50 dark:bg-neutral-800/30"
        )}
      >
        {/* Expand/collapse icon */}
        <span className="text-neutral-400 dark:text-neutral-500 flex-shrink-0">
          {isExpanded ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </span>

        {/* File icon */}
        <FileText className="size-4 text-neutral-400 dark:text-neutral-500 flex-shrink-0" />

        {/* Title and path */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
            {displayTitle}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
            {notePath}
          </p>
        </div>

        {/* Access metadata */}
        <div className="flex items-center gap-4 flex-shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
          {/* Last accessed by */}
          {lastAccessedBy && (
            <span className="hidden sm:inline max-w-[120px] truncate" title={lastAccessedBy}>
              {lastAccessedBy}
            </span>
          )}

          {/* Access count */}
          <span className="flex items-center gap-1" title="Total accesses">
            <Eye className="size-3" />
            {accessCount}
          </span>

          {/* Last accessed time */}
          <span className="w-[60px] text-right" title={new Date(lastAccessedAt).toLocaleString()}>
            {formatTimeAgo(lastAccessedAt)}
          </span>
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-neutral-100 dark:border-neutral-800/50 bg-neutral-50/50 dark:bg-neutral-800/20">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-neutral-400" />
              <span className="ml-2 text-sm text-neutral-500">Loading note...</span>
            </div>
          ) : error ? (
            <div className="py-4 text-sm text-red-600 dark:text-red-400">
              Failed to load note content.
            </div>
          ) : noteData ? (
            <div className="max-h-[400px] overflow-y-auto rounded-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 p-4">
              <VaultNoteContent content={noteData.content} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
