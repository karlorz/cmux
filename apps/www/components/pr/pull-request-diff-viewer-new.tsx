"use client";

import React, {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactElement } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileCode,
  FileEdit,
  FileMinus,
  FilePlus,
  FileText,
  Folder,
  Sparkles,
} from "lucide-react";
import { DiffFile, DiffView } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view.css";

import { api } from "@cmux/convex/api";
import { useConvexQuery } from "@convex-dev/react-query";
import type { FunctionReturnType } from "convex/server";
import type { GithubFileChange } from "@/lib/github/fetch-pull-request";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  parseReviewHeatmap,
  type ReviewHeatmapLine,
} from "./heatmap";

type PullRequestDiffViewerProps = {
  files: GithubFileChange[];
  teamSlugOrId: string;
  repoFullName: string;
  prNumber?: number | null;
  comparisonSlug?: string | null;
  jobType?: "pull_request" | "comparison";
  commitRef?: string;
  baseCommitRef?: string;
};

type ParsedFileDiff = {
  file: GithubFileChange;
  anchorId: string;
  diffFile: DiffFile | null;
  error?: string;
};

const extensionToLanguage: Record<string, string> = {
  bash: "bash",
  c: "c",
  cc: "cpp",
  cmake: "cmake",
  coffee: "coffeescript",
  conf: "ini",
  cpp: "cpp",
  cjs: "javascript",
  cs: "csharp",
  css: "css",
  d: "d",
  dart: "dart",
  dockerfile: "docker",
  elm: "elm",
  ex: "elixir",
  exs: "elixir",
  go: "go",
  graphql: "graphql",
  gql: "graphql",
  groovy: "groovy",
  h: "c",
  hh: "cpp",
  hpp: "cpp",
  hs: "haskell",
  html: "html",
  java: "java",
  js: "javascript",
  json: "json",
  jsx: "jsx",
  kt: "kotlin",
  less: "less",
  lua: "lua",
  m: "objectivec",
  md: "markdown",
  mjs: "javascript",
  mm: "objectivec",
  pas: "pascal",
  php: "php",
  pl: "perl",
  pp: "pascal",
  proto: "protobuf",
  py: "python",
  r: "r",
  rb: "ruby",
  rs: "rust",
  sass: "sass",
  scala: "scala",
  scss: "scss",
  sh: "bash",
  sql: "sql",
  styl: "stylus",
  swift: "swift",
  toml: "toml",
  ts: "typescript",
  tsx: "tsx",
  txt: "plaintext",
  vim: "vim",
  vue: "vue",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zig: "zig",
};

const filenameLanguageMap: Record<string, string> = {
  dockerfile: "docker",
  "dockerfile.dev": "docker",
  "dockerfile.prod": "docker",
  makefile: "makefile",
  "makefile.am": "makefile",
  gemfile: "ruby",
  "gemfile.lock": "ruby",
  rakefile: "ruby",
  procfile: "ruby",
  vagrantfile: "ruby",
  brewfile: "ruby",
  guardfile: "ruby",
};

type FileOutput =
  | FunctionReturnType<typeof api.codeReview.listFileOutputsForPr>[number]
  | FunctionReturnType<typeof api.codeReview.listFileOutputsForComparison>[number];

type FileDiffViewModel = {
  entry: ParsedFileDiff;
  review: FileOutput | null;
  reviewHeatmap: ReviewHeatmapLine[];
};

function inferLanguage(filename: string): string | null {
  const lowerPath = filename.toLowerCase();
  const segments = lowerPath.split("/");
  const basename = segments[segments.length - 1] ?? lowerPath;

  if (filenameLanguageMap[lowerPath]) {
    return filenameLanguageMap[lowerPath];
  }

  if (filenameLanguageMap[basename]) {
    return filenameLanguageMap[basename];
  }

  const dotSegments = basename.split(".").filter(Boolean);

  for (let index = dotSegments.length - 1; index >= 0; index -= 1) {
    const part = dotSegments[index];
    const language = extensionToLanguage[part];
    if (language) {
      return language;
    }
  }

  return null;
}

type FileTreeNode = {
  name: string;
  path: string;
  children: FileTreeNode[];
  file?: GithubFileChange;
};

type FileStatusMeta = {
  icon: ReactElement;
  colorClassName: string;
  label: string;
};

function getFileStatusMeta(
  status: GithubFileChange["status"] | undefined
): FileStatusMeta {
  const iconClassName = "h-3.5 w-3.5";

  switch (status) {
    case "added":
      return {
        icon: <FilePlus className={iconClassName} />,
        colorClassName: "text-emerald-600",
        label: "Added file",
      };
    case "removed":
      return {
        icon: <FileMinus className={iconClassName} />,
        colorClassName: "text-rose-600",
        label: "Removed file",
      };
    case "modified":
    case "changed":
      return {
        icon: <FileEdit className={iconClassName} />,
        colorClassName: "text-amber-600",
        label: "Modified file",
      };
    case "renamed":
      return {
        icon: <FileCode className={iconClassName} />,
        colorClassName: "text-sky-600",
        label: "Renamed file",
      };
    case "copied":
      return {
        icon: <FileCode className={iconClassName} />,
        colorClassName: "text-sky-600",
        label: "Copied file",
      };
    default:
      return {
        icon: <FileText className={iconClassName} />,
        colorClassName: "text-neutral-500",
        label: "File change",
      };
  }
}

export function PullRequestDiffViewer({
  files,
  teamSlugOrId,
  repoFullName,
  prNumber,
  comparisonSlug,
  jobType,
  commitRef,
  baseCommitRef,
}: PullRequestDiffViewerProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Detect system theme
  useEffect(() => {
    const updateTheme = () => {
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setTheme(isDark ? "dark" : "light");
    };

    updateTheme();
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", updateTheme);
    return () => mediaQuery.removeEventListener("change", updateTheme);
  }, []);

  // Parse all file diffs
  const parsedDiffs = useMemo((): ParsedFileDiff[] => {
    return files.map((file) => {
      const anchorId = file.filename;

      try {
        if (!file.patch) {
          return {
            file,
            anchorId,
            diffFile: null,
            error: "No patch data available",
          };
        }

        const lang = inferLanguage(file.filename) || "plaintext";

        const diffFile = new DiffFile(
          file.previous_filename || file.filename,
          "", // old file content (we don't have full content)
          file.filename,
          "", // new file content (we don't have full content)
          [file.patch],
          lang,
          lang
        );

        diffFile.initTheme(theme);
        diffFile.init();
        diffFile.buildSplitDiffLines();
        diffFile.buildUnifiedDiffLines();

        return {
          file,
          anchorId,
          diffFile,
        };
      } catch (error) {
        return {
          file,
          anchorId,
          diffFile: null,
          error: error instanceof Error ? error.message : "Parse error",
        };
      }
    });
  }, [files, theme]);

  // Fetch review data
  const normalizedJobType: "pull_request" | "comparison" =
    jobType ?? (comparisonSlug ? "comparison" : "pull_request");

  const prQueryArgs = useMemo(
    () =>
      normalizedJobType !== "pull_request" || prNumber === null || prNumber === undefined
        ? ("skip" as const)
        : {
            teamSlugOrId,
            repoFullName,
            prNumber,
            ...(commitRef ? { commitRef } : {}),
            ...(baseCommitRef ? { baseCommitRef } : {}),
          },
    [
      normalizedJobType,
      teamSlugOrId,
      repoFullName,
      prNumber,
      commitRef,
      baseCommitRef,
    ]
  );

  const comparisonQueryArgs = useMemo(
    () =>
      normalizedJobType !== "comparison" || !comparisonSlug
        ? ("skip" as const)
        : {
            teamSlugOrId,
            repoFullName,
            comparisonSlug,
            ...(commitRef ? { commitRef } : {}),
            ...(baseCommitRef ? { baseCommitRef } : {}),
          },
    [
      normalizedJobType,
      teamSlugOrId,
      repoFullName,
      comparisonSlug,
      commitRef,
      baseCommitRef,
    ]
  );

  const prFileOutputs = useConvexQuery(
    api.codeReview.listFileOutputsForPr,
    prQueryArgs
  );
  const comparisonFileOutputs = useConvexQuery(
    api.codeReview.listFileOutputsForComparison,
    comparisonQueryArgs
  );

  const fileOutputs =
    normalizedJobType === "comparison" ? comparisonFileOutputs : prFileOutputs;

  const reviews = useMemo(() => fileOutputs || [], [fileOutputs]);

  // Build view models with review data
  const viewModels = useMemo((): FileDiffViewModel[] => {
    return parsedDiffs.map((entry) => {
      const review = reviews.find((r) => r.filePath === entry.file.filename);
      const reviewHeatmap = review
        ? parseReviewHeatmap(review.codexReviewOutput)
        : [];

      return {
        entry,
        review: review || null,
        reviewHeatmap,
      };
    });
  }, [parsedDiffs, reviews]);

  // Build file tree
  const fileTree = useMemo((): FileTreeNode[] => {
    const root: FileTreeNode[] = [];

    for (const file of files) {
      const parts = file.filename.split("/");
      let currentLevel = root;

      for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index];
        const isFile = index === parts.length - 1;
        const fullPath = parts.slice(0, index + 1).join("/");

        let existingNode = currentLevel.find((node) => node.name === part);

        if (!existingNode) {
          existingNode = {
            name: part,
            path: fullPath,
            children: [],
            file: isFile ? file : undefined,
          };
          currentLevel.push(existingNode);
        }

        if (!isFile) {
          currentLevel = existingNode.children;
        }
      }
    }

    return root;
  }, [files]);

  const togglePath = useCallback((path: string) => {
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const scrollToFile = useCallback((anchorId: string) => {
    const element = document.getElementById(anchorId);
    if (element && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const scrollTop =
        container.scrollTop + elementRect.top - containerRect.top - 20;

      container.scrollTo({
        top: scrollTop,
        behavior: "smooth",
      });
    }
  }, []);

  const renderFileTree = useCallback(
    (nodes: FileTreeNode[], depth = 0): React.ReactElement[] => {
      return nodes.map((node) => {
        const isCollapsed = collapsedPaths.has(node.path);
        const hasChildren = node.children.length > 0;
        const isFile = !!node.file;

        if (isFile && node.file) {
          const meta = getFileStatusMeta(node.file.status);
          const anchorId = node.file.filename;

          return (
            <button
              key={node.path}
              onClick={() => scrollToFile(anchorId)}
              className={cn(
                "flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800",
                meta.colorClassName
              )}
              style={{ paddingLeft: `${depth * 0.75 + 0.5}rem` }}
            >
              {meta.icon}
              <span className="truncate">{node.name}</span>
            </button>
          );
        }

        return (
          <Fragment key={node.path}>
            <button
              onClick={() => togglePath(node.path)}
              className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
              style={{ paddingLeft: `${depth * 0.75 + 0.5}rem` }}
            >
              {isCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5 text-neutral-500" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-neutral-500" />
              )}
              <Folder className="h-3.5 w-3.5 text-amber-500" />
              <span className="truncate font-medium">{node.name}</span>
            </button>
            {!isCollapsed && hasChildren && (
              <div>{renderFileTree(node.children, depth + 1)}</div>
            )}
          </Fragment>
        );
      });
    },
    [collapsedPaths, togglePath, scrollToFile]
  );

  // Calculate review progress
  const reviewProgress = useMemo(() => {
    const done = reviews.length;
    const waiting = Math.max(0, files.length - reviews.length);
    return { done, waiting };
  }, [reviews, files.length]);

  return (
    <div className="flex h-[800px] overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700">
      {/* File tree sidebar */}
      <aside className="w-64 flex-shrink-0 overflow-y-auto border-r border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Files
          </h3>
          {reviewProgress.done + reviewProgress.waiting > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
              <Sparkles className="h-3.5 w-3.5" />
              <span>
                {reviewProgress.done}/{reviewProgress.done + reviewProgress.waiting}
              </span>
            </div>
          )}
        </div>
        <div className="space-y-0.5">{renderFileTree(fileTree)}</div>
      </aside>

      {/* Main diff view */}
      <main
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto bg-neutral-50 dark:bg-neutral-950"
      >
        <div className="space-y-4 p-4">
          {viewModels.map((vm) => {
            const meta = getFileStatusMeta(vm.entry.file.status);

            return (
              <section
                key={vm.entry.file.filename}
                id={vm.entry.anchorId}
                className="overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
              >
                {/* File header */}
                <header className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800">
                  <span className={meta.colorClassName}>{meta.icon}</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="truncate font-mono text-sm font-medium text-neutral-900 dark:text-neutral-100">
                          {vm.entry.file.filename}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{meta.label}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  {vm.review && (
                    <span className="ml-auto flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                      <Sparkles className="h-3.5 w-3.5" />
                      Reviewed
                    </span>
                  )}
                </header>

                {/* Diff content */}
                <div className="overflow-x-auto">
                  {vm.entry.error ? (
                    <div className="p-4 text-sm text-rose-600">
                      Error: {vm.entry.error}
                    </div>
                  ) : vm.entry.diffFile ? (
                    <DiffView
                      diffFile={vm.entry.diffFile}
                      diffViewTheme={theme}
                      diffViewHighlight={true}
                      diffViewWrap={false}
                      diffViewFontSize={13}
                    />
                  ) : (
                    <div className="p-4 text-sm text-neutral-600 dark:text-neutral-400">
                      No diff available
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
