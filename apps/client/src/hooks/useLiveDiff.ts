import { useQuery } from "@tanstack/react-query";
import type { ReplaceDiffEntry } from "@cmux/shared/diff-types";
import { WWW_ORIGIN } from "@/lib/wwwOrigin";
import { cachedGetUser } from "@/lib/cachedGetUser";
import { stackClientApp } from "@/lib/stack";

export interface LiveDiffFile {
  path: string;
  oldPath?: string;
  status: "added" | "modified" | "deleted" | "renamed" | "untracked";
  insertions: number;
  deletions: number;
  isBinary: boolean;
}

export interface LiveDiffResult {
  files: LiveDiffFile[];
  summary: {
    totalFiles: number;
    insertions: number;
    deletions: number;
  };
  mode: "full" | "file_list_only";
  totalDiffBytes: number;
  entries?: ReplaceDiffEntry[];
}

interface UseLiveDiffOptions {
  sandboxId: string | undefined;
  workspacePath?: string;
  includeContent?: boolean;
  maxContentLength?: number;
  enabled?: boolean;
  refetchInterval?: number | false;
}

interface UseLiveDiffFileOptions {
  sandboxId: string | undefined;
  path: string | undefined;
  workspacePath?: string;
  enabled?: boolean;
}

async function getAuthHeaders(): Promise<Headers> {
  const user = await cachedGetUser(stackClientApp);
  const authHeaders = user ? await user.getAuthHeaders() : undefined;
  return new Headers(authHeaders);
}

/**
 * Hook to fetch live git diff from a running sandbox.
 * Returns uncommitted changes (staged + unstaged) and full per-file entries for smaller diffs.
 */
export function useLiveDiff({
  sandboxId,
  workspacePath = "/root/workspace",
  includeContent = false,
  maxContentLength = 100_000,
  enabled = true,
  refetchInterval = false,
}: UseLiveDiffOptions) {
  return useQuery({
    queryKey: ["live-diff", sandboxId, workspacePath, includeContent, maxContentLength],
    queryFn: async (): Promise<LiveDiffResult> => {
      if (!sandboxId) {
        throw new Error("No sandbox ID provided");
      }

      const headers = await getAuthHeaders();
      headers.set("Content-Type", "application/json");

      const response = await fetch(
        `${WWW_ORIGIN}/api/sandboxes/${sandboxId}/live-diff`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            workspacePath,
            includeContent,
            maxContentLength,
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get live diff: ${errorText}`);
      }

      return (await response.json()) as LiveDiffResult;
    },
    enabled: enabled && Boolean(sandboxId),
    refetchInterval,
    staleTime: 5_000,
  });
}

/**
 * Fetch a single live-diff file entry when the aggregate diff is too large to preload.
 */
export function useLiveDiffFile({
  sandboxId,
  path,
  workspacePath = "/root/workspace",
  enabled = true,
}: UseLiveDiffFileOptions) {
  return useQuery({
    queryKey: ["live-diff-file", sandboxId, workspacePath, path],
    queryFn: async (): Promise<ReplaceDiffEntry> => {
      if (!sandboxId || !path) {
        throw new Error("Sandbox ID and file path are required");
      }

      const headers = await getAuthHeaders();
      const query = new URLSearchParams({ workspacePath });
      const response = await fetch(
        `${WWW_ORIGIN}/api/sandboxes/${sandboxId}/live-diff/${encodeURIComponent(path)}?${query.toString()}`,
        {
          method: "GET",
          headers,
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get live diff file: ${errorText}`);
      }

      return (await response.json()) as ReplaceDiffEntry;
    },
    enabled: enabled && Boolean(sandboxId) && Boolean(path),
    staleTime: 5_000,
  });
}
