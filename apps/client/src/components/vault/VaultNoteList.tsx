/**
 * VaultNoteList Component
 *
 * Lists recently accessed vault notes sorted by access time.
 * Production-ready with keyboard navigation, refresh, and accessibility.
 */

import { api } from "@cmux/convex/api";
import { useQuery } from "convex/react";
import { BookOpen, Loader2, RefreshCw, Search, Settings, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { VaultNoteRow } from "./VaultNoteRow";

const DEFAULT_VAULT_NAME = "obsidian_vault";

interface VaultNoteListProps {
  teamSlugOrId: string;
}

export function VaultNoteList({ teamSlugOrId }: VaultNoteListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  const notes = useQuery(api.vaultNoteAccess.listRecent, {
    teamSlugOrId,
    limit: 100,
  });

  const workspaceSettings = useQuery(api.workspaceSettings.get, { teamSlugOrId });
  const vaultName = workspaceSettings?.vaultConfig?.vaultName ?? DEFAULT_VAULT_NAME;

  const isLoading = notes === undefined;

  // Filter notes by search query
  const filteredNotes = useMemo(() => {
    if (!notes) return [];
    if (!searchQuery.trim()) return notes;

    const query = searchQuery.toLowerCase();
    return notes.filter(
      (note) =>
        note.notePath.toLowerCase().includes(query) ||
        (note.noteTitle?.toLowerCase().includes(query) ?? false)
    );
  }, [notes, searchQuery]);

  // Handle refresh (Convex auto-refreshes, but this provides visual feedback)
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    // Convex queries are reactive, so we just need visual feedback
    setTimeout(() => setIsRefreshing(false), 500);
  }, []);

  // Clear search
  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    searchInputRef.current?.focus();
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!filteredNotes.length) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setExpandedIndex((prev) =>
            prev === null ? 0 : Math.min(prev + 1, filteredNotes.length - 1)
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setExpandedIndex((prev) =>
            prev === null ? filteredNotes.length - 1 : Math.max(prev - 1, 0)
          );
          break;
        case "Enter":
        case " ":
          if (expandedIndex !== null && e.target === listContainerRef.current) {
            e.preventDefault();
            // Toggle is handled by VaultNoteRow
          }
          break;
        case "Escape":
          e.preventDefault();
          setExpandedIndex(null);
          break;
        case "/":
          if (e.target !== searchInputRef.current) {
            e.preventDefault();
            searchInputRef.current?.focus();
          }
          break;
      }
    },
    [filteredNotes.length, expandedIndex]
  );

  // Focus management for keyboard navigation
  useEffect(() => {
    if (expandedIndex !== null && listContainerRef.current) {
      const rows = listContainerRef.current.querySelectorAll('[role="row"]');
      const targetRow = rows[expandedIndex] as HTMLElement | undefined;
      targetRow?.focus();
    }
  }, [expandedIndex]);

  if (isLoading) {
    return (
      <div
        className="flex flex-col items-center justify-center py-12"
        role="status"
        aria-label="Loading vault notes"
      >
        <Loader2 className="size-6 animate-spin text-neutral-400 mb-3" aria-hidden="true" />
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Loading vault access history...
        </p>
      </div>
    );
  }

  if (!notes || notes.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-12 text-neutral-500 dark:text-neutral-400"
        role="status"
      >
        <BookOpen className="size-10 mb-4 text-neutral-300 dark:text-neutral-600" aria-hidden="true" />
        <p className="text-sm font-medium mb-1">No vault notes accessed yet</p>
        <p className="text-xs text-center max-w-xs mb-4">
          When agents access notes from your Obsidian vault, they will appear here sorted by most recent access.
        </p>
        <Link
          to="/$teamSlugOrId/settings"
          params={{ teamSlugOrId }}
          search={{ section: "general" }}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1"
        >
          <Settings className="size-3" aria-hidden="true" />
          Configure vault in settings
        </Link>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full"
      onKeyDown={handleKeyDown}
      role="region"
      aria-label="Vault notes list"
    >
      {/* Search bar with refresh */}
      <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400"
              aria-hidden="true"
            />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search notes... (press / to focus)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-sm bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              aria-label="Search vault notes"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
            aria-label="Refresh list"
          >
            <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Column headers */}
      <div
        className="flex items-center gap-3 px-4 py-2 text-xs font-medium text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/20"
        role="row"
        aria-hidden="true"
      >
        <span className="w-4" /> {/* Chevron spacer */}
        <span className="w-4" /> {/* Icon spacer */}
        <span className="flex-1">Note</span>
        <span className="hidden sm:inline w-[120px]">Accessed By</span>
        <span className="w-[50px] text-center">Views</span>
        <span className="w-[60px] text-right">Last</span>
      </div>

      {/* Notes list */}
      <div
        ref={listContainerRef}
        className="flex-1 overflow-y-auto"
        role="table"
        aria-label="Vault notes"
        tabIndex={0}
      >
        {filteredNotes.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-8 text-neutral-500 dark:text-neutral-400"
            role="status"
          >
            <p className="text-sm">No notes match your search.</p>
            <button
              type="button"
              onClick={handleClearSearch}
              className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1"
            >
              Clear search
            </button>
          </div>
        ) : (
          filteredNotes.map((note, index) => (
            <VaultNoteRow
              key={note.notePath}
              teamSlugOrId={teamSlugOrId}
              notePath={note.notePath}
              noteTitle={note.noteTitle}
              lastAccessedAt={note.lastAccessedAt}
              lastAccessedBy={note.lastAccessedBy}
              accessCount={note.accessCount}
              vaultName={vaultName}
              isKeyboardFocused={expandedIndex === index}
              onFocus={() => setExpandedIndex(index)}
            />
          ))
        )}
      </div>

      {/* Footer with count and keyboard hints */}
      <div className="px-4 py-2 border-t border-neutral-200 dark:border-neutral-800 text-xs text-neutral-500 dark:text-neutral-400 flex items-center justify-between">
        <span>
          {filteredNotes.length} of {notes.length} notes
        </span>
        <span className="hidden sm:inline text-neutral-400 dark:text-neutral-500">
          Press / to search, arrow keys to navigate
        </span>
      </div>
    </div>
  );
}
