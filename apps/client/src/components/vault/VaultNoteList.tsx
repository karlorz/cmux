/**
 * VaultNoteList Component
 *
 * Lists recently accessed vault notes sorted by access time.
 */

import { api } from "@cmux/convex/api";
import { useQuery } from "convex/react";
import { BookOpen, Loader2, Search, Settings } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { VaultNoteRow } from "./VaultNoteRow";

interface VaultNoteListProps {
  teamSlugOrId: string;
}

export function VaultNoteList({ teamSlugOrId }: VaultNoteListProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const notes = useQuery(api.vaultNoteAccess.listRecent, {
    teamSlugOrId,
    limit: 100,
  });

  const isLoading = notes === undefined;
  const error = null; // Convex handles errors via Suspense/ErrorBoundary

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

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-neutral-400 mb-3" />
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Loading vault access history...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-neutral-500 dark:text-neutral-400">
        <p className="text-sm mb-2">Failed to load vault notes.</p>
        <p className="text-xs">{String(error)}</p>
      </div>
    );
  }

  if (!notes || notes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-neutral-500 dark:text-neutral-400">
        <BookOpen className="size-10 mb-4 text-neutral-300 dark:text-neutral-600" />
        <p className="text-sm font-medium mb-1">No vault notes accessed yet</p>
        <p className="text-xs text-center max-w-xs mb-4">
          When agents access notes from your Obsidian vault, they will appear here sorted by most recent access.
        </p>
        <Link
          to="/$teamSlugOrId/settings"
          params={{ teamSlugOrId }}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
        >
          <Settings className="size-3" />
          Configure vault in settings
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-3 px-4 py-2 text-xs font-medium text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/20">
        <span className="w-4" /> {/* Chevron spacer */}
        <span className="w-4" /> {/* Icon spacer */}
        <span className="flex-1">Note</span>
        <span className="hidden sm:inline w-[120px]">Accessed By</span>
        <span className="w-[50px] text-center">Views</span>
        <span className="w-[60px] text-right">Last</span>
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto">
        {filteredNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-neutral-500 dark:text-neutral-400">
            <p className="text-sm">No notes match your search.</p>
          </div>
        ) : (
          filteredNotes.map((note) => (
            <VaultNoteRow
              key={note.notePath}
              teamSlugOrId={teamSlugOrId}
              notePath={note.notePath}
              noteTitle={note.noteTitle}
              lastAccessedAt={note.lastAccessedAt}
              lastAccessedBy={note.lastAccessedBy}
              accessCount={note.accessCount}
            />
          ))
        )}
      </div>

      {/* Footer with count */}
      <div className="px-4 py-2 border-t border-neutral-200 dark:border-neutral-800 text-xs text-neutral-500 dark:text-neutral-400">
        {filteredNotes.length} of {notes.length} notes
      </div>
    </div>
  );
}
