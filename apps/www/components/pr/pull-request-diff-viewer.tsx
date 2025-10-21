"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { GithubPullRequestFile } from "@/lib/github/fetch-pull-request";
import { cn } from "@/lib/utils";
import type { ReplaceDiffEntry } from "@cmux/shared/diff-types";
import {
  MonacoGitDiffViewer,
  type GitDiffViewerControls,
} from "@cmux/shared/ui/monaco-git-diff-viewer";

type PullRequestDiffViewerProps = {
  files: GithubPullRequestFile[];
  teamSlugOrId: string;
  repoFullName: string;
  prNumber: number;
  commitRef?: string;
};

type GithubPrCodeFile = {
  filename: string;
  status: string;
  previous_filename?: string;
  additions?: number;
  deletions?: number;
  patch?: string;
  contents?: {
    encoding: "base64";
    content: string;
  };
  baseContents?: {
    encoding: "base64";
    content: string;
  };
  truncated?: boolean;
  truncatedBase?: boolean;
  size?: number;
  sizeBase?: number;
};

type GithubPrCodeResponse = {
  files: GithubPrCodeFile[];
};

function decodeBase64Content(content?: {
  encoding: "base64";
  content: string;
}): string {
  if (!content || content.encoding !== "base64" || !content.content) {
    return "";
  }

  try {
    const normalized = content.content.replace(/\s+/g, "");
    if (typeof atob === "function") {
      const binary = atob(normalized);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return new TextDecoder().decode(bytes);
    }

    if (typeof Buffer !== "undefined") {
      return Buffer.from(normalized, "base64").toString("utf-8");
    }
  } catch (error) {
    console.error("Failed to decode base64 content", error);
  }

  return "";
}

function mapStatus(status: string): ReplaceDiffEntry["status"] {
  switch (status) {
    case "added":
      return "added";
    case "removed":
      return "deleted";
    case "renamed":
      return "renamed";
    default:
      return "modified";
  }
}

function inferIsBinary(file: GithubPrCodeFile): boolean {
  if (file.truncated || file.truncatedBase) {
    return true;
  }
  if (!file.patch && !file.contents && !file.baseContents) {
    return true;
  }
  return false;
}

function computeContentOmitted(
  file: GithubPrCodeFile,
  status: ReplaceDiffEntry["status"],
): boolean {
  if (file.truncated || file.truncatedBase) {
    return true;
  }
  if (status !== "added" && !file.baseContents) {
    return true;
  }
  if (status !== "deleted" && !file.contents) {
    return true;
  }
  return false;
}

function getDocumentTheme(): "light" | "dark" {
  if (typeof document === "undefined") {
    return "dark";
  }
  return document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";
}

export function PullRequestDiffViewer({
  files,
  teamSlugOrId,
  repoFullName,
  prNumber,
  commitRef: _commitRef,
}: PullRequestDiffViewerProps) {
  const [diffs, setDiffs] = useState<ReplaceDiffEntry[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [controls, setControls] = useState<GitDiffViewerControls | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(() => getDocumentTheme());

  const ownerRepo = useMemo(() => {
    const [owner, repo] = repoFullName.split("/");
    if (!owner || !repo) {
      return null;
    }
    return { owner, repo };
  }, [repoFullName]);

  const fallbackTotals = useMemo(() => {
    return files.reduce(
      (
        acc,
        file,
      ): {
        additions: number;
        deletions: number;
      } => {
        acc.additions += file.additions ?? 0;
        acc.deletions += file.deletions ?? 0;
        return acc;
      },
      { additions: 0, deletions: 0 },
    );
  }, [files]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const updateTheme = () => {
      setTheme(getDocumentTheme());
    };

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    updateTheme();

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!ownerRepo) {
      setFetchError("Repository information is unavailable for this pull request.");
      setDiffs(null);
      setIsLoading(false);
      return;
    }

    const { owner, repo } = ownerRepo;

    const controller = new AbortController();

    async function loadDiff() {
      setIsLoading(true);
      setFetchError(null);

      try {
        const params = new URLSearchParams();
        params.set("team", teamSlugOrId);
        params.set("owner", owner);
        params.set("repo", repo);
        params.set("number", String(prNumber));
        params.set("includeContents", "1");
        params.set("includePatch", "1");

        const response = await fetch(
          `/api/integrations/github/prs/code?${params.toString()}`,
          {
            credentials: "include",
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(`GitHub diff request failed with status ${response.status}`);
        }

        const data = (await response.json()) as GithubPrCodeResponse;
        const nextDiffs: ReplaceDiffEntry[] = data.files.map((file) => {
          const status = mapStatus(file.status);
          const oldContent =
            status === "added"
              ? ""
              : decodeBase64Content(file.baseContents);
          const newContent =
            status === "deleted"
              ? ""
              : decodeBase64Content(file.contents);

          return {
            filePath: file.filename,
            oldPath: file.previous_filename ?? undefined,
            status,
            additions: file.additions ?? 0,
            deletions: file.deletions ?? 0,
            patch: file.patch,
            oldContent,
            newContent,
            isBinary: inferIsBinary(file),
            contentOmitted: computeContentOmitted(file, status),
            oldSize: file.sizeBase,
            newSize: file.size,
          } satisfies ReplaceDiffEntry;
        });

        setDiffs(nextDiffs);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        console.error("Failed to load pull request diff", error);
        setFetchError(
          "Unable to load the pull request diff. Try refreshing or open the diff on GitHub.",
        );
        setDiffs(null);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadDiff();

    return () => {
      controller.abort();
    };
  }, [ownerRepo, prNumber, teamSlugOrId]);

  const fileCount = diffs?.length ?? files.length;
  const totalAdditions = controls?.totalAdditions ?? fallbackTotals.additions;
  const totalDeletions = controls?.totalDeletions ?? fallbackTotals.deletions;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="text-sm text-neutral-600 dark:text-neutral-300">
          <span>
            {fileCount} file{fileCount === 1 ? "" : "s"}
          </span>
          <span className="ml-3 font-medium text-emerald-600 dark:text-emerald-400">
            +{totalAdditions}
          </span>
          <span className="ml-2 font-medium text-rose-600 dark:text-rose-400">
            -{totalDeletions}
          </span>
          {fetchError ? (
            <span className="ml-3 text-xs text-rose-500 dark:text-rose-400">
              {fetchError}
            </span>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => controls?.expandAll()}
            disabled={!controls}
          >
            Expand all
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => controls?.collapseAll()}
            disabled={!controls}
          >
            Collapse all
          </Button>
        </div>
      </header>

      <div className={cn("min-h-[320px]", isLoading && "opacity-75")}>
        {isLoading ? (
          <div className="flex h-48 items-center justify-center text-sm text-neutral-500 dark:text-neutral-400">
            Loading diff…
          </div>
        ) : fetchError ? (
          <div className="p-6 text-sm text-rose-500 dark:text-rose-400">
            {fetchError}
          </div>
        ) : diffs && diffs.length > 0 ? (
          <MonacoGitDiffViewer
            diffs={diffs}
            theme={theme}
            onControlsChange={setControls}
            debugLoggingEnabled={false}
          />
        ) : (
          <div className="p-6 text-sm text-neutral-500 dark:text-neutral-400">
            This pull request does not have any diffable files.
          </div>
        )}
      </div>
    </div>
  );
}
