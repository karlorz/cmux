import { useQuery } from "@tanstack/react-query";
import { getApiVaultNoteOptions } from "@cmux/www-openapi-client/react-query";
import {
  AlertCircle,
  BookOpen,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
} from "lucide-react";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { VaultNoteContent } from "./VaultNoteContent";

interface VaultNotePreviewProps {
  teamSlugOrId: string;
  vaultName: string;
  notePath?: string;
  onSelectedNotePathChange?: (notePath?: string) => void;
}

function getErrorMessage(error: unknown): string {
  if (!error) return "Unknown error";
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function getDisplayTitle(notePath?: string): string {
  if (!notePath) {
    return "Select a note";
  }

  return notePath.split("/").pop()?.replace(/\.md$/, "") ?? notePath;
}

export function VaultNotePreview({
  teamSlugOrId,
  vaultName,
  notePath,
  onSelectedNotePathChange,
}: VaultNotePreviewProps) {
  const {
    data: noteData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    ...getApiVaultNoteOptions({
      query: {
        teamSlugOrId,
        path: notePath ?? "",
      },
    }),
    enabled: Boolean(notePath),
    staleTime: 60000,
    retry: 1,
  });

  useEffect(() => {
    if (
      notePath &&
      noteData?.path &&
      noteData.path !== notePath &&
      onSelectedNotePathChange
    ) {
      onSelectedNotePathChange(noteData.path);
    }
  }, [noteData?.path, notePath, onSelectedNotePathChange]);

  const handleCopyPath = useCallback(async () => {
    if (!notePath) {
      return;
    }

    try {
      await navigator.clipboard.writeText(noteData?.path ?? notePath);
      toast.success("Path copied to clipboard");
    } catch {
      toast.error("Failed to copy path");
    }
  }, [noteData?.path, notePath]);

  const handleRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const resolvedPath = noteData?.path ?? notePath;
  const displayTitle = noteData?.title ?? getDisplayTitle(notePath);

  if (!notePath) {
    return (
      <section className="flex h-full min-h-0 flex-col bg-white dark:bg-neutral-900">
        <div className="flex h-full flex-col items-center justify-center px-6 text-center text-neutral-500 dark:text-neutral-400">
          <BookOpen className="mb-4 size-10 text-neutral-300 dark:text-neutral-600" aria-hidden="true" />
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Select a vault note
          </p>
          <p className="mt-2 max-w-md text-sm leading-6">
            Pick a note from the list to open it in a full preview pane with a shareable URL.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-white dark:bg-neutral-900">
      <div className="border-b border-neutral-200 dark:border-neutral-800 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
              <FileText className="size-4 shrink-0" aria-hidden="true" />
              <p className="truncate text-xs uppercase tracking-[0.18em]">
                Note Preview
              </p>
            </div>
            <h2 className="mt-2 truncate text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              {displayTitle}
            </h2>
            <p className="mt-1 truncate text-sm text-neutral-500 dark:text-neutral-400">
              {resolvedPath}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyPath}
              className="flex items-center gap-1 rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
              title="Copy note path"
            >
              <Copy className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Copy path</span>
            </button>
            <a
              href={`obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent((resolvedPath ?? notePath).replace(/\.md$/, ""))}`}
              className="flex items-center gap-1 rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
              title="Open in Obsidian"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Open in Obsidian</span>
            </a>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-50/70 dark:bg-neutral-950/40">
        {isLoading ? (
          <div
            className="flex h-full items-center justify-center"
            role="status"
            aria-label="Loading note content"
          >
            <Loader2 className="size-5 animate-spin text-neutral-400" aria-hidden="true" />
            <span className="ml-2 text-sm text-neutral-500 dark:text-neutral-400">
              Loading note...
            </span>
          </div>
        ) : error ? (
          <div className="p-5">
            <div
              className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/60 dark:bg-red-950/40"
              role="alert"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-500" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">
                    Failed to load note content
                  </p>
                  <p className="mt-1 break-words text-xs text-red-700 dark:text-red-300">
                    {getErrorMessage(error)}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="text-xs font-medium text-red-700 underline underline-offset-2 hover:text-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 dark:text-red-300 dark:hover:text-red-200"
                    >
                      Try again
                    </button>
                    <span className="text-red-300 dark:text-red-700">|</span>
                    <button
                      type="button"
                      onClick={handleCopyPath}
                      className="text-xs font-medium text-red-700 underline underline-offset-2 hover:text-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 dark:text-red-300 dark:hover:text-red-200"
                    >
                      Copy path
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : noteData ? (
          <div className="p-5">
            <div className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <div className="min-h-[calc(100dvh-14rem)] px-5 py-5">
                <VaultNoteContent
                  content={noteData.content}
                  vaultName={vaultName}
                  onNavigateToNote={onSelectedNotePathChange}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
