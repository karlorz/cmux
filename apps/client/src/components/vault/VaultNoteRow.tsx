/**
 * VaultNoteRow Component
 *
 * A row in the vault notes list that can be expanded to show note content.
 * Production-ready with keyboard support, accessibility, and error details.
 */

import { useQuery } from "@tanstack/react-query";
import { getApiVaultNoteOptions } from "@cmux/www-openapi-client/react-query";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  ExternalLink,
  FileText,
  Loader2,
} from "lucide-react";
import { useCallback, useRef, useEffect } from "react";
import clsx from "clsx";
import { toast } from "sonner";
import { VaultNoteContent } from "./VaultNoteContent";

interface VaultNoteRowProps {
  teamSlugOrId: string;
  notePath: string;
  noteTitle: string | null | undefined;
  lastAccessedAt?: number | null;
  lastAccessedBy: string | null | undefined;
  accessCount?: number | null;
  vaultName: string;
  isExpanded: boolean;
  showInlinePreview?: boolean;
  onToggle: () => void;
  onNavigateToNote?: (notePath: string) => void;
  isDirectLink?: boolean;
  isKeyboardFocused?: boolean;
  onFocus?: () => void;
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

function formatFullDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function getErrorMessage(error: unknown): string {
  if (!error) return "Unknown error";
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export function VaultNoteRow({
  teamSlugOrId,
  notePath,
  noteTitle,
  lastAccessedAt,
  lastAccessedBy,
  accessCount,
  vaultName,
  isExpanded,
  showInlinePreview = true,
  onToggle,
  onNavigateToNote,
  isDirectLink,
  isKeyboardFocused,
  onFocus,
}: VaultNoteRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  // Only fetch note content when expanded
  const {
    data: noteData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    ...getApiVaultNoteOptions({
      query: { teamSlugOrId, path: notePath },
    }),
    enabled: isExpanded && showInlinePreview,
    staleTime: 60000, // Cache for 1 minute
    retry: 1, // Only retry once on failure
  });

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onToggle();
      }
    },
    [onToggle]
  );

  const handleCopyPath = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(notePath);
        toast.success("Path copied to clipboard");
      } catch {
        toast.error("Failed to copy path");
      }
    },
    [notePath]
  );

  const handleRetry = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      void refetch();
    },
    [refetch]
  );

  // Focus management for keyboard navigation
  useEffect(() => {
    if (isKeyboardFocused && rowRef.current) {
      rowRef.current.focus();
    }
  }, [isKeyboardFocused]);

  const displayTitle =
    noteTitle || notePath.split("/").pop()?.replace(".md", "") || notePath;

  return (
    <div
      ref={rowRef}
      className={clsx(
        "border-b border-neutral-200 dark:border-neutral-800 last:border-b-0",
        isKeyboardFocused && "ring-2 ring-inset ring-blue-500"
      )}
      role="row"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      onFocus={onFocus}
    >
      {/* Row header (always visible) */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={showInlinePreview ? isExpanded : undefined}
        aria-controls={
          showInlinePreview
            ? `vault-note-content-${notePath.replace(/[^a-zA-Z0-9]/g, "-")}`
            : undefined
        }
        aria-pressed={!showInlinePreview ? isExpanded : undefined}
        className={clsx(
          "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
          "hover:bg-neutral-50 dark:hover:bg-neutral-800/50",
          "focus:outline-none focus:bg-neutral-50 dark:focus:bg-neutral-800/50",
          isExpanded && "bg-neutral-50 dark:bg-neutral-800/30"
        )}
      >
        {/* Expand/collapse icon */}
        <span
          className="text-neutral-400 dark:text-neutral-500 flex-shrink-0"
          aria-hidden="true"
        >
          {isExpanded ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </span>

        {/* File icon */}
        <FileText
          className="size-4 text-neutral-400 dark:text-neutral-500 flex-shrink-0"
          aria-hidden="true"
        />

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
          {isDirectLink && (
            <span className="hidden sm:inline rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
              Shared note
            </span>
          )}

          {/* Last accessed by */}
          {lastAccessedBy && (
            <span
              className="hidden sm:inline max-w-[120px] truncate"
              title={`Last accessed by: ${lastAccessedBy}`}
            >
              {lastAccessedBy}
            </span>
          )}

          {/* Access count */}
          {typeof accessCount === "number" ? (
            <span
              className="flex items-center gap-1"
              title={`Accessed ${accessCount} time${accessCount !== 1 ? "s" : ""}`}
            >
              <Eye className="size-3" aria-hidden="true" />
              <span aria-label={`${accessCount} views`}>{accessCount}</span>
            </span>
          ) : null}

          {/* Last accessed time */}
          {typeof lastAccessedAt === "number" ? (
            <span
              className="w-[60px] text-right"
              title={formatFullDate(lastAccessedAt)}
            >
              {formatTimeAgo(lastAccessedAt)}
            </span>
          ) : (
            <span className="w-[60px] text-right">Shared</span>
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && showInlinePreview && (
        <div
          id={`vault-note-content-${notePath.replace(/[^a-zA-Z0-9]/g, "-")}`}
          className="px-4 pb-4 pt-2 border-t border-neutral-100 dark:border-neutral-800/50 bg-neutral-50/50 dark:bg-neutral-800/20"
        >
          {isLoading ? (
            <div
              className="flex items-center justify-center py-8"
              role="status"
              aria-label="Loading note content"
            >
              <Loader2
                className="size-5 animate-spin text-neutral-400"
                aria-hidden="true"
              />
              <span className="ml-2 text-sm text-neutral-500">
                Loading note...
              </span>
            </div>
          ) : error ? (
            <div
              className="py-4 px-4 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
              role="alert"
            >
              <div className="flex items-start gap-3">
                <AlertCircle
                  className="size-5 text-red-500 flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">
                    Failed to load note content
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-300 mt-1 break-words">
                    {getErrorMessage(error)}
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="text-xs font-medium text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-200 underline focus:outline-none focus:ring-2 focus:ring-red-500 rounded"
                    >
                      Try again
                    </button>
                    <span className="text-red-400">|</span>
                    <button
                      type="button"
                      onClick={handleCopyPath}
                      className="text-xs font-medium text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-200 underline focus:outline-none focus:ring-2 focus:ring-red-500 rounded flex items-center gap-1"
                    >
                      <Copy className="size-3" aria-hidden="true" />
                      Copy path
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : noteData ? (
            <div className="space-y-2">
              {/* Action bar */}
              <div className="flex items-center justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleCopyPath}
                  className="flex items-center gap-1 px-2 py-1 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                  title="Copy note path"
                >
                  <Copy className="size-3" aria-hidden="true" />
                  <span className="hidden sm:inline">Copy path</span>
                </button>
                {noteData.path && (
                  <a
                    href={`obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(noteData.path.replace(/\.md$/, ""))}`}
                    className="flex items-center gap-1 px-2 py-1 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                    title="Open in Obsidian"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="size-3" aria-hidden="true" />
                    <span className="hidden sm:inline">Open in Obsidian</span>
                  </a>
                )}
              </div>
              {/* Content */}
              <div className="max-h-[400px] overflow-y-auto rounded-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 p-4">
                <VaultNoteContent
                  content={noteData.content}
                  vaultName={vaultName}
                  onNavigateToNote={onNavigateToNote}
                />
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
