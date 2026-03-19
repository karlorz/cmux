import { useQuery } from "@tanstack/react-query";
import { WWW_ORIGIN } from "@/lib/wwwOrigin";
import { cachedGetUser } from "@/lib/cachedGetUser";
import { stackClientApp } from "@/lib/stack";

interface LiveDiffFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "untracked";
  insertions: number;
  deletions: number;
}

interface LiveDiffResult {
  files: LiveDiffFile[];
  summary: {
    totalFiles: number;
    insertions: number;
    deletions: number;
  };
  diff?: string;
  truncated?: boolean;
}

interface UseLiveDiffOptions {
  sandboxId: string | undefined;
  workspacePath?: string;
  includeContent?: boolean;
  maxContentLength?: number;
  enabled?: boolean;
  refetchInterval?: number | false;
}

/**
 * Hook to fetch live git diff from a running sandbox.
 * Returns uncommitted changes (staged + unstaged) with stats and optionally full diff content.
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
    queryKey: ["live-diff", sandboxId, workspacePath, includeContent],
    queryFn: async (): Promise<LiveDiffResult> => {
      if (!sandboxId) {
        throw new Error("No sandbox ID provided");
      }

      const user = await cachedGetUser(stackClientApp);
      const authHeaders = user ? await user.getAuthHeaders() : undefined;
      const headers = new Headers(authHeaders);
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
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get live diff: ${errorText}`);
      }

      return (await response.json()) as LiveDiffResult;
    },
    enabled: enabled && Boolean(sandboxId),
    refetchInterval,
    staleTime: 5_000, // Consider data stale after 5 seconds
  });
}
