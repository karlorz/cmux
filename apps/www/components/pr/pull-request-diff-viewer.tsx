"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactElement, ReactNode } from "react";
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  FileCode,
  FileEdit,
  FileMinus,
  FilePlus,
  FileText,
  Folder,
} from "lucide-react";
import {
  computeNewLineNumber,
  parseDiff,
  getChangeKey,
  type ChangeData,
  type FileData,
} from "react-diff-view";
import type { DiffStatus, ReplaceDiffEntry } from "@cmux/shared/diff-types";
import {
  MonacoDiffViewer,
  type FileEditorReadyEvent,
  type MonacoFileGroup,
  type GitDiffViewerProps,
} from "@cmux/shared/diff-viewer";

import { api } from "@cmux/convex/api";
import { useConvexQuery } from "@convex-dev/react-query";
import type { FunctionReturnType } from "convex/server";
import type { GithubPullRequestFile } from "@/lib/github/fetch-pull-request";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { loaderInitPromise } from "@/lib/monaco-environment";

import {
  buildDiffHeatmap,
  parseReviewHeatmap,
  type DiffHeatmap,
  type ReviewHeatmapLine,
} from "./heatmap";

type PullRequestDiffViewerProps = {
  files: GithubPullRequestFile[];
  teamSlugOrId: string;
  repoFullName: string;
  prNumber: number;
  commitRef?: string;
};

type ParsedFileDiff = {
  file: GithubPullRequestFile;
  anchorId: string;
  diff: FileData | null;
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
  cxx: "cpp",
  dockerfile: "dockerfile",
  gql: "graphql",
  graphql: "graphql",
  h: "c",
  hh: "cpp",
  hpp: "cpp",
  htm: "markup",
  html: "markup",
  hxx: "cpp",
  ini: "ini",
  java: "java",
  js: "javascript",
  json: "json",
  json5: "json",
  jsx: "jsx",
  kt: "kotlin",
  kts: "kotlin",
  less: "less",
  m: "objectivec",
  md: "markdown",
  mdx: "markdown",
  mk: "makefile",
  mjs: "javascript",
  mm: "objectivec",
  php: "php",
  prisma: "prisma",
  ps1: "powershell",
  psm1: "powershell",
  py: "python",
  rs: "rust",
  rb: "ruby",
  sass: "scss",
  scss: "scss",
  sh: "bash",
  sql: "sql",
  svg: "markup",
  swift: "swift",
  toml: "toml",
  ts: "typescript",
  tsx: "tsx",
  vue: "vue",
  xml: "markup",
  yaml: "yaml",
  yml: "yaml",
  zsh: "bash",
  svelte: "svelte",
  go: "go",
  diff: "diff",
  env: "bash",
  lock: "yaml",
};

const filenameLanguageMap: Record<string, string> = {
  dockerfile: "dockerfile",
  "docker-compose.yml": "yaml",
  "cmakelists.txt": "cmake",
  makefile: "makefile",
  gitignore: "bash",
  env: "bash",
  "env.example": "bash",
  gemfile: "ruby",
  podfile: "ruby",
  brewfile: "ruby",
  "package-lock.json": "json",
  "yarn.lock": "yaml",
  "pnpm-lock.yaml": "yaml",
  "bun.lock": "toml",
};

const GITHUB_STATUS_TO_DIFF_STATUS: Record<string, DiffStatus> = {
  added: "added",
  removed: "deleted",
  deleted: "deleted",
  modified: "modified",
  changed: "modified",
  renamed: "renamed",
  copied: "modified",
};

function mapGithubStatus(status: GithubPullRequestFile["status"] | undefined): DiffStatus {
  if (!status) {
    return "modified";
  }
  const normalized = status.toLowerCase();
  return GITHUB_STATUS_TO_DIFF_STATUS[normalized] ?? "modified";
}

function reconstructFileContents(diff: FileData | null): {
  oldContent: string;
  newContent: string;
} {
  if (!diff) {
    return { oldContent: "", newContent: "" };
  }

  const oldLines: string[] = [];
  const newLines: string[] = [];

  for (const hunk of diff.hunks) {
    for (const change of hunk.changes) {
      const content = change.content ?? "";
      if (change.type === "delete") {
        oldLines.push(content);
      } else if (change.type === "insert") {
        newLines.push(content);
      } else {
        oldLines.push(content);
        newLines.push(content);
      }
    }
  }

  return {
    oldContent: oldLines.join("\n"),
    newContent: newLines.join("\n"),
  };
}

type EditorContext = {
  diffEditor: FileEditorReadyEvent["diffEditor"];
  monaco: FileEditorReadyEvent["monaco"];
  decorations: string[];
};


type FileOutput = FunctionReturnType<
  typeof api.codeReview.listFileOutputsForPr
>[number];

type FileDiffViewModel = {
  entry: ParsedFileDiff;
  review: FileOutput | null;
  reviewHeatmap: ReviewHeatmapLine[];
  diffHeatmap: DiffHeatmap | null;
  changeKeyByLine: Map<number, string>;
};

type ReviewErrorTarget = {
  id: string;
  anchorId: string;
  filePath: string;
  lineNumber: number;
  reason: string | null;
  score: number | null;
  changeKey: string | null;
};

type FocusNavigateOptions = {
  source?: "keyboard" | "pointer";
};

type ActiveTooltipTarget = {
  filePath: string;
  lineNumber: number;
};

type ShowAutoTooltipOptions = {
  sticky?: boolean;
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
  file?: GithubPullRequestFile;
};

type FileStatusMeta = {
  icon: ReactElement;
  colorClassName: string;
  label: string;
};

function getFileStatusMeta(
  status: GithubPullRequestFile["status"] | undefined
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
  commitRef,
}: PullRequestDiffViewerProps) {
  const fileOutputArgs = useMemo(
    () => ({
      teamSlugOrId,
      repoFullName,
      prNumber,
      ...(commitRef ? { commitRef } : {}),
    }),
    [teamSlugOrId, repoFullName, prNumber, commitRef]
  );

  const fileOutputs = useConvexQuery(
    api.codeReview.listFileOutputsForPr,
    fileOutputArgs
  );

  const fileOutputIndex = useMemo(() => {
    if (!fileOutputs) {
      return new Map<string, FileOutput>();
    }

    const map = new Map<string, FileOutput>();
    for (const output of fileOutputs) {
      map.set(output.filePath, output);
    }
    return map;
  }, [fileOutputs]);

  const totalFileCount = files.length;

  const processedFileCount = useMemo(() => {
    if (fileOutputs === undefined) {
      return null;
    }

    let count = 0;
    for (const file of files) {
      if (fileOutputIndex.has(file.filename)) {
        count += 1;
      }
    }

    return count;
  }, [fileOutputs, fileOutputIndex, files]);

  const isLoadingFileOutputs = fileOutputs === undefined;

  const parsedDiffs = useMemo<ParsedFileDiff[]>(() => {
    return files.map((file) => {
      if (!file.patch) {
        return {
          file,
          anchorId: file.filename,
          diff: null,
          error:
            "GitHub did not return a textual diff for this file. It may be binary or too large.",
        };
      }

      try {
        const [diff] = parseDiff(buildDiffText(file));
        return {
          file,
          anchorId: file.filename,
          diff: diff ?? null,
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to parse GitHub patch payload.";
        return {
          file,
          anchorId: file.filename,
          diff: null,
          error: message,
        };
      }
    });
  }, [files]);

  const fileEntries = useMemo<FileDiffViewModel[]>(() => {
    return parsedDiffs.map((entry) => {
      const review = fileOutputIndex.get(entry.file.filename) ?? null;
      const reviewHeatmap = review
        ? parseReviewHeatmap(review.codexReviewOutput)
        : [];
      const diffHeatmap =
        entry.diff && reviewHeatmap.length > 0
          ? buildDiffHeatmap(entry.diff, reviewHeatmap)
          : null;

      return {
        entry,
        review,
        reviewHeatmap,
        diffHeatmap,
        changeKeyByLine: buildChangeKeyIndex(entry.diff),
      };
    });
  }, [parsedDiffs, fileOutputIndex]);

  const fileEntryByPath = useMemo(() => {
    const map = new Map<string, FileDiffViewModel>();
    for (const item of fileEntries) {
      map.set(item.entry.file.filename, item);
    }
    return map;
  }, [fileEntries]);

  const monacoDiffs = useMemo<ReplaceDiffEntry[]>(() => {
    return fileEntries.map(({ entry }) => {
      const { oldContent, newContent } = reconstructFileContents(entry.diff);
      const status = mapGithubStatus(entry.file.status);
      const isContentMissing = entry.diff === null;

      return {
        filePath: entry.file.filename,
        oldPath: entry.file.previous_filename ?? undefined,
        status,
        additions: entry.file.additions,
        deletions: entry.file.deletions,
        patch: entry.file.patch ?? undefined,
        oldContent,
        newContent,
        isBinary: false,
        contentOmitted: isContentMissing,
      } satisfies ReplaceDiffEntry;
    });
  }, [fileEntries]);

  const errorTargets = useMemo<ReviewErrorTarget[]>(() => {
    const targets: ReviewErrorTarget[] = [];

    for (const fileEntry of fileEntries) {
      const { entry, diffHeatmap, changeKeyByLine } = fileEntry;
      if (!diffHeatmap || diffHeatmap.entries.size === 0) {
        continue;
      }

      const sortedEntries = Array.from(diffHeatmap.entries.entries()).sort(
        (a, b) => a[0] - b[0]
      );

      for (const [lineNumber, metadata] of sortedEntries) {
        targets.push({
          id: `${entry.anchorId}:${lineNumber}`,
          anchorId: entry.anchorId,
          filePath: entry.file.filename,
          lineNumber,
          reason: metadata.reason ?? null,
          score: metadata.score ?? null,
          changeKey: changeKeyByLine.get(lineNumber) ?? null,
        });
      }
    }

    return targets;
  }, [fileEntries]);

  const targetCount = errorTargets.length;

  type DiffControls = Parameters<
    NonNullable<GitDiffViewerProps["onControlsChange"]>
  >[0];
  const diffControlsRef = useRef<DiffControls | null>(null);
  const editorContextsRef = useRef<Map<string, EditorContext>>(new Map());
  const focusedErrorRef = useRef<ReviewErrorTarget | null>(null);

  const handleDiffControlsChange = useCallback((controls: DiffControls) => {
    diffControlsRef.current = controls;
  }, []);

  const applyDecorationsForFile = useCallback(
    (filePath: string) => {
      const context = editorContextsRef.current.get(filePath);
      if (!context) {
        return;
      }

      const entry = fileEntryByPath.get(filePath) ?? null;
      const modifiedEditor = context.diffEditor.getModifiedEditor();
      const monacoInstance = context.monaco;

      const decorations: Parameters<typeof modifiedEditor.deltaDecorations>[1] = [];

      if (entry?.diffHeatmap) {
        for (const [lineNumber, className] of entry.diffHeatmap.lineClasses.entries()) {
          const metadata = entry.diffHeatmap.entries.get(lineNumber) ?? null;
          const hoverMessage =
            metadata && (metadata.reason || metadata.score !== null)
              ? [
                  {
                    value: [
                      metadata.score !== null
                        ? `**Importance:** ${(metadata.score * 100).toFixed(0)}%`
                        : null,
                      metadata.reason ?? null,
                    ]
                      .filter(Boolean)
                      .join("\n\n"),
                  },
                ]
              : undefined;

          decorations.push({
            range: new monacoInstance.Range(lineNumber, 1, lineNumber, 1),
            options: {
              isWholeLine: true,
              className,
              linesDecorationsClassName: `cmux-heatmap-gutter ${className}`,
              hoverMessage,
            },
          });
        }

        for (const range of entry.diffHeatmap.newRanges) {
          decorations.push({
            range: new monacoInstance.Range(
              range.lineNumber,
              range.start + 1,
              range.lineNumber,
              range.start + Math.max(range.length, 1) + 1,
            ),
            options: {
              inlineClassName: range.className,
            },
          });
        }
      }

      const focused = focusedErrorRef.current;
      const isFocusedFile = focused?.filePath === filePath;
      const focusedLineNumber = isFocusedFile ? (focused?.lineNumber ?? null) : null;
      if (focusedLineNumber && focusedLineNumber > 0) {
        decorations.push({
          range: new monacoInstance.Range(focusedLineNumber, 1, focusedLineNumber, 1),
          options: {
            isWholeLine: true,
            className: "cmux-heatmap-focus-line",
            linesDecorationsClassName: "cmux-heatmap-focus-gutter",
          },
        });
      }

      context.decorations = modifiedEditor.deltaDecorations(
        context.decorations,
        decorations,
      );
    },
    [fileEntryByPath],
  );

  const handleFileEditorReady = useCallback(
    (event: FileEditorReadyEvent) => {
      const context: EditorContext = {
        diffEditor: event.diffEditor,
        monaco: event.monaco,
        decorations: [],
      };

      editorContextsRef.current.set(event.file.filePath, context);

      event.diffEditor.onDidDispose(() => {
        editorContextsRef.current.delete(event.file.filePath);
      });

      applyDecorationsForFile(event.file.filePath);
    },
    [applyDecorationsForFile],
  );

  useEffect(() => {
    for (const filePath of editorContextsRef.current.keys()) {
      applyDecorationsForFile(filePath);
    }
  }, [applyDecorationsForFile, fileEntries]);

  const [focusedErrorIndex, setFocusedErrorIndex] = useState<number | null>(
    null
  );
  const [autoTooltipTarget, setAutoTooltipTarget] =
    useState<ActiveTooltipTarget | null>(null);
  const autoTooltipTimeoutRef = useRef<number | null>(null);

  const clearAutoTooltip = useCallback(() => {
    if (
      typeof window !== "undefined" &&
      autoTooltipTimeoutRef.current !== null
    ) {
      window.clearTimeout(autoTooltipTimeoutRef.current);
      autoTooltipTimeoutRef.current = null;
    }
    setAutoTooltipTarget(null);
  }, []);

  const showAutoTooltipForTarget = useCallback(
    (target: ReviewErrorTarget, options?: ShowAutoTooltipOptions) => {
      if (typeof window === "undefined") {
        return;
      }

      if (autoTooltipTimeoutRef.current !== null) {
        window.clearTimeout(autoTooltipTimeoutRef.current);
        autoTooltipTimeoutRef.current = null;
      }

      setAutoTooltipTarget({
        filePath: target.filePath,
        lineNumber: target.lineNumber,
      });

      const shouldStick = options?.sticky ?? false;

      if (!shouldStick) {
        autoTooltipTimeoutRef.current = window.setTimeout(() => {
          setAutoTooltipTarget((current) => {
            if (
              current &&
              current.filePath === target.filePath &&
              current.lineNumber === target.lineNumber
            ) {
              return null;
            }
            return current;
          });
          autoTooltipTimeoutRef.current = null;
        }, 1800);
      }
    },
    []
  );

  useEffect(() => {
    if (targetCount === 0) {
      setFocusedErrorIndex(null);
      return;
    }

    setFocusedErrorIndex((previous) => {
      if (previous === null) {
        return 0;
      }
      if (previous >= targetCount) {
        return 0;
      }
      return previous;
    });
  }, [targetCount]);
  useEffect(() => {
    if (targetCount === 0) {
      clearAutoTooltip();
    }
  }, [targetCount, clearAutoTooltip]);

  useEffect(() => {
    return () => {
      if (
        typeof window !== "undefined" &&
        autoTooltipTimeoutRef.current !== null
      ) {
        window.clearTimeout(autoTooltipTimeoutRef.current);
      }
    };
  }, []);

  const focusedError =
    focusedErrorIndex === null
      ? null
      : (errorTargets[focusedErrorIndex] ?? null);

  useEffect(() => {
    focusedErrorRef.current = focusedError;
  }, [focusedError]);

  const fileTree = useMemo(() => buildFileTree(files), [files]);
  const directoryPaths = useMemo(
    () => collectDirectoryPaths(fileTree),
    [fileTree]
  );

  const hydratedInitialPath =
    typeof window !== "undefined"
      ? decodeURIComponent(window.location.hash.slice(1))
      : "";

  const firstPath = parsedDiffs[0]?.file.filename ?? "";
  const initialPath =
    hydratedInitialPath &&
    files.some((file) => file.filename === hydratedInitialPath)
      ? hydratedInitialPath
      : firstPath;

  const [activePath, setActivePath] = useState<string>(initialPath);
  const [activeAnchor, setActiveAnchor] = useState<string>(initialPath);

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    const defaults = new Set<string>(directoryPaths);
    for (const parent of getParentPaths(initialPath)) {
      defaults.add(parent);
    }
    return defaults;
  });

  useEffect(() => {
    setExpandedPaths(() => {
      const defaults = new Set<string>(directoryPaths);
      for (const parent of getParentPaths(activePath)) {
        defaults.add(parent);
      }
      return defaults;
    });
  }, [directoryPaths, activePath]);

  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash && files.some((file) => file.filename === hash)) {
      setActivePath(hash);
      setActiveAnchor(hash);
    }
  }, [files]);

  useEffect(() => {
    setExpandedPaths((previous) => {
      const next = new Set(previous);
      for (const parent of getParentPaths(activePath)) {
        next.add(parent);
      }
      return next;
    });
  }, [activePath]);

  const handleFileToggle = useCallback(
    (filePath: string, isExpanded: boolean) => {
      if (!isExpanded) {
        return;
      }

      setActivePath(filePath);
      setActiveAnchor(filePath);
    },
    [],
  );

  useEffect(() => {
    if (parsedDiffs.length === 0) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) =>
              a.target.getBoundingClientRect().top -
              b.target.getBoundingClientRect().top
          );

        if (visible[0]?.target.id) {
          setActiveAnchor(visible[0].target.id);
          return;
        }

        const nearest = entries
          .map((entry) => ({
            id: entry.target.id,
            top: entry.target.getBoundingClientRect().top,
          }))
          .sort((a, b) => Math.abs(a.top) - Math.abs(b.top))[0];

        if (nearest?.id) {
          setActiveAnchor(nearest.id);
        }
      },
      {
        rootMargin: "-128px 0px -55% 0px",
        threshold: [0, 0.2, 0.4, 0.6, 1],
      }
    );

    const elements = parsedDiffs
      .map((entry) => document.getElementById(entry.anchorId))
      .filter((element): element is HTMLElement => Boolean(element));

    elements.forEach((element) => observer.observe(element));

    return () => {
      elements.forEach((element) => observer.unobserve(element));
      observer.disconnect();
    };
  }, [parsedDiffs]);

  const handleNavigate = useCallback(
    (path: string) => {
      setActivePath(path);
      setActiveAnchor(path);

      diffControlsRef.current?.setFileExpanded(path, true);

      if (typeof window === "undefined") {
        return;
      }

      window.location.hash = encodeURIComponent(path);

      const target = document.getElementById(path);
      if (target) {
        scrollElementToViewportCenter(target);
      }
    },
    [],
  );

  const handleFocusPrevious = useCallback(
    (options?: FocusNavigateOptions) => {
      if (targetCount === 0) {
        return;
      }

      const isKeyboard = options?.source === "keyboard";

      setFocusedErrorIndex((previous) => {
        const nextIndex =
          previous === null
            ? targetCount - 1
            : (previous - 1 + targetCount) % targetCount;
        const target = errorTargets[nextIndex] ?? null;

        if (isKeyboard) {
          if (target) {
            showAutoTooltipForTarget(target, { sticky: true });
          } else {
            clearAutoTooltip();
          }
        } else {
          clearAutoTooltip();
        }

        return nextIndex;
      });
    },
    [targetCount, errorTargets, clearAutoTooltip, showAutoTooltipForTarget]
  );

  const handleFocusNext = useCallback(
    (options?: FocusNavigateOptions) => {
      if (targetCount === 0) {
        return;
      }

      const isKeyboard = options?.source === "keyboard";

      setFocusedErrorIndex((previous) => {
        const nextIndex = previous === null ? 0 : (previous + 1) % targetCount;
        const target = errorTargets[nextIndex] ?? null;

        if (isKeyboard) {
          if (target) {
            showAutoTooltipForTarget(target, { sticky: true });
          } else {
            clearAutoTooltip();
          }
        } else {
          clearAutoTooltip();
        }

        return nextIndex;
      });
    },
    [targetCount, errorTargets, clearAutoTooltip, showAutoTooltipForTarget]
  );

  const handleToggleDirectory = useCallback((path: string) => {
    setExpandedPaths((previous) => {
      const next = new Set(previous);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (targetCount === 0) {
      return;
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if (!event.shiftKey || event.metaKey || event.altKey || event.ctrlKey) {
        return;
      }

      const activeElement = document.activeElement;
      if (
        activeElement &&
        activeElement !== document.body &&
        activeElement instanceof HTMLElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          activeElement.tagName === "SELECT" ||
          activeElement.isContentEditable)
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "j") {
        event.preventDefault();
        handleFocusNext({ source: "keyboard" });
      } else if (key === "k") {
        event.preventDefault();
        handleFocusPrevious({ source: "keyboard" });
      }
    };

    window.addEventListener("keydown", handleKeydown);

    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [handleFocusNext, handleFocusPrevious, targetCount]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearAutoTooltip();
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [clearAutoTooltip]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!focusedError) {
      return;
    }

    handleNavigate(focusedError.filePath);

    if (focusedError.changeKey) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const article = document.getElementById(focusedError.anchorId);
      if (article) {
        scrollElementToViewportCenter(article);
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [focusedError, handleNavigate]);

  if (totalFileCount === 0) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-sm text-neutral-600 shadow-sm">
        This pull request does not introduce any file changes.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ReviewProgressIndicator
        totalFileCount={totalFileCount}
        processedFileCount={processedFileCount}
        isLoading={isLoadingFileOutputs}
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10">
        <aside className="lg:sticky lg:top-6 lg:h-[calc(100vh-96px)] lg:w-72 lg:overflow-y-auto">
          {targetCount > 0 ? (
            <div className="mb-4 flex justify-center">
              <ErrorNavigator
                totalCount={targetCount}
                currentIndex={focusedErrorIndex}
                onPrevious={handleFocusPrevious}
                onNext={handleFocusNext}
              />
            </div>
          ) : null}
          <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
            <FileTreeNavigator
              nodes={fileTree}
              activePath={activeAnchor}
              expandedPaths={expandedPaths}
              onToggleDirectory={handleToggleDirectory}
              onSelectFile={handleNavigate}
            />
          </div>
        </aside>

        <div className="flex-1">
          <MonacoDiffViewer
            diffs={monacoDiffs}
            monacoTheme="cmux-light"
            loader={loaderInitPromise}
            onControlsChange={handleDiffControlsChange}
            onFileToggle={handleFileToggle}
            onFileEditorReady={handleFileEditorReady}
            getRowId={(file) => file.filePath}
            getKitty={() => ""}
            classNames={{
              fileDiffRow: {
                container:
                  "mb-6 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm focus:outline-none last:mb-0",
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}

function ReviewProgressIndicator({
  totalFileCount,
  processedFileCount,
  isLoading,
}: {
  totalFileCount: number;
  processedFileCount: number | null;
  isLoading: boolean;
}) {
  const pendingFileCount =
    processedFileCount === null
      ? Math.max(totalFileCount, 0)
      : Math.max(totalFileCount - processedFileCount, 0);
  const progressPercent =
    processedFileCount === null || totalFileCount === 0
      ? 0
      : Math.min(100, (processedFileCount / totalFileCount) * 100);
  const statusText =
    processedFileCount === null
      ? "Loading file progress..."
      : pendingFileCount === 0
        ? "All files processed"
        : `${processedFileCount} processed • ${pendingFileCount} pending`;

  const processedBadgeText =
    processedFileCount === null ? "— done" : `${processedFileCount} done`;
  const pendingBadgeText =
    processedFileCount === null ? "— waiting" : `${pendingFileCount} waiting`;

  return (
    <div
      className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-neutral-700">
            Automated review progress
          </p>
          <p className="text-xs text-neutral-500">{statusText}</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold">
          <span
            className={cn(
              "rounded-md bg-emerald-100 px-2 py-0.5 text-emerald-700",
              isLoading ? "animate-pulse" : undefined
            )}
          >
            {processedBadgeText}
          </span>
          <span
            className={cn(
              "rounded-md bg-amber-100 px-2 py-0.5 text-amber-700",
              isLoading ? "animate-pulse" : undefined
            )}
          >
            {pendingBadgeText}
          </span>
        </div>
      </div>
      <div className="mt-3 h-2 rounded-full bg-neutral-200">
        <div
          className="h-full rounded-full bg-sky-500 transition-[width] duration-300 ease-out"
          style={{ width: `${progressPercent}%` }}
          role="progressbar"
          aria-label="Automated review progress"
          aria-valuemin={0}
          aria-valuemax={totalFileCount}
          aria-valuenow={processedFileCount ?? 0}
        />
      </div>
    </div>
  );
}

type ErrorNavigatorProps = {
  totalCount: number;
  currentIndex: number | null;
  onPrevious: (options?: FocusNavigateOptions) => void;
  onNext: (options?: FocusNavigateOptions) => void;
};

function ErrorNavigator({
  totalCount,
  currentIndex,
  onPrevious,
  onNext,
}: ErrorNavigatorProps) {
  if (totalCount === 0) {
    return null;
  }

  const hasSelection =
    typeof currentIndex === "number" &&
    currentIndex >= 0 &&
    currentIndex < totalCount;
  const displayIndex = hasSelection ? currentIndex + 1 : null;

  return (
    <TooltipProvider delayDuration={120} skipDelayDuration={120}>
      <div className="inline-flex items-center gap-3 rounded-full border border-sky-200 bg-white/95 px-3 py-1 text-xs font-medium text-neutral-700 shadow-sm shadow-sky-200/60 backdrop-blur dark:border-sky-800/60 dark:bg-neutral-900/95 dark:text-neutral-200 dark:shadow-sky-900/40">
        <span aria-live="polite" className="flex items-center gap-1">
          {hasSelection && displayIndex !== null ? (
            <>
              <span>Error</span>
              <span className="font-mono tabular-nums">{displayIndex}</span>
              <span>of</span>
              <span className="font-mono tabular-nums">{totalCount}</span>
            </>
          ) : (
            <>
              <span className="font-mono tabular-nums">{totalCount}</span>
              <span>{totalCount === 1 ? "error" : "errors"}</span>
            </>
          )}
        </span>
        <div className="flex items-center gap-1">
          <Tooltip delayDuration={120}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onPrevious()}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
                aria-label="Go to previous error (Shift+K)"
                disabled={totalCount === 0}
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              align="center"
              className="flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px] font-medium text-neutral-700 shadow-md dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
            >
              <span>Previous error</span>
              <span className="rounded border border-neutral-200 bg-neutral-50 px-1 py-0.5 font-mono text-[10px] uppercase text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                ⇧ K
              </span>
            </TooltipContent>
          </Tooltip>
          <Tooltip delayDuration={120}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onNext()}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
                aria-label="Go to next error (Shift+J)"
                disabled={totalCount === 0}
              >
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              align="center"
              className="flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px] font-medium text-neutral-700 shadow-md dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
            >
              <span>Next error</span>
              <span className="rounded border border-neutral-200 bg-neutral-50 px-1 py-0.5 font-mono text-[10px] uppercase text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                ⇧ J
              </span>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}

type FileTreeNavigatorProps = {
  nodes: FileTreeNode[];
  activePath: string;
  expandedPaths: Set<string>;
  onToggleDirectory: (path: string) => void;
  onSelectFile: (path: string) => void;
  depth?: number;
};

function FileTreeNavigator({
  nodes,
  activePath,
  expandedPaths,
  onToggleDirectory,
  onSelectFile,
  depth = 0,
}: FileTreeNavigatorProps) {
  return (
    <div className="space-y-0.5">
      {nodes.map((node) => {
        const isDirectory = node.children.length > 0;
        const isExpanded = expandedPaths.has(node.path);
        const isActive = activePath === node.path;

        if (isDirectory) {
          return (
            <div key={node.path}>
              <button
                type="button"
                onClick={() => onToggleDirectory(node.path)}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded-md px-2.5 py-1 text-left text-sm font-medium transition hover:bg-neutral-100",
                  isExpanded ? "text-neutral-900" : "text-neutral-700"
                )}
                style={{ paddingLeft: depth * 14 + 10 }}
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-neutral-500" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-neutral-500" />
                )}
                <Folder className="h-4 w-4 text-neutral-500" />
                <span className="truncate">{node.name}</span>
              </button>
              {isExpanded ? (
                <div className="mt-0.5">
                  <FileTreeNavigator
                    nodes={node.children}
                    activePath={activePath}
                    expandedPaths={expandedPaths}
                    onToggleDirectory={onToggleDirectory}
                    onSelectFile={onSelectFile}
                    depth={depth + 1}
                  />
                </div>
              ) : null}
            </div>
          );
        }

        return (
          <button
            key={node.path}
            type="button"
            onClick={() => onSelectFile(node.path)}
            className={cn(
              "flex w-full items-center gap-1 rounded-md px-2.5 py-1 text-left text-sm transition hover:bg-neutral-100",
              isActive
                ? "bg-sky-100/80 text-sky-900 shadow-sm"
                : "text-neutral-700"
            )}
            style={{ paddingLeft: depth * 14 + 32 }}
          >
            <span className="truncate font-medium">{node.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function scrollElementToViewportCenter(
  element: HTMLElement,
  { behavior = "auto" }: { behavior?: ScrollBehavior } = {}
): void {
  if (typeof window === "undefined") {
    return;
  }

  const rect = element.getBoundingClientRect();
  const viewportHeight =
    window.innerHeight || document.documentElement?.clientHeight || 0;
  if (viewportHeight === 0) {
    return;
  }

  const currentScrollY =
    window.scrollY ??
    window.pageYOffset ??
    document.documentElement?.scrollTop ??
    0;
  const currentScrollX =
    window.scrollX ??
    window.pageXOffset ??
    document.documentElement?.scrollLeft ??
    0;
  const scrollHeight = document.documentElement?.scrollHeight ?? 0;

  const halfViewport = Math.max((viewportHeight - rect.height) / 2, 0);
  const rawTargetTop = rect.top + currentScrollY - halfViewport;
  const maxScrollTop = Math.max(scrollHeight - viewportHeight, 0);
  const targetTop = Math.max(0, Math.min(rawTargetTop, maxScrollTop));

  window.scrollTo({
    top: targetTop,
    left: currentScrollX,
    behavior,
  });
}

function buildChangeKeyIndex(diff: FileData | null): Map<number, string> {
  const map = new Map<number, string>();
  if (!diff) {
    return map;
  }

  for (const hunk of diff.hunks) {
    for (const change of hunk.changes) {
      const lineNumber = computeNewLineNumber(change);
      if (lineNumber <= 0) {
        continue;
      }

      map.set(lineNumber, getChangeKey(change));
    }
  }

  return map;
}

function buildDiffText(file: GithubPullRequestFile): string {
  const oldPath =
    file.status === "added"
      ? "/dev/null"
      : (file.previous_filename ?? file.filename);
  const newPath = file.status === "removed" ? "/dev/null" : file.filename;

  const gitOldLabel = `a/${file.previous_filename ?? file.filename}`;
  const gitNewLabel = `b/${file.filename}`;
  const oldLabel = oldPath === "/dev/null" ? "/dev/null" : gitOldLabel;
  const newLabel = newPath === "/dev/null" ? "/dev/null" : gitNewLabel;

  return [
    `diff --git ${gitOldLabel} ${gitNewLabel}`,
    `--- ${oldLabel}`,
    `+++ ${newLabel}`,
    file.patch,
    "",
  ].join("\n");
}

function buildFileTree(files: GithubPullRequestFile[]): FileTreeNode[] {
  const root: FileTreeNode = {
    name: "",
    path: "",
    children: [],
  };

  for (const file of files) {
    const segments = file.filename.split("/");
    let current = root;

    segments.forEach((segment, index) => {
      const path =
        index === 0
          ? segment
          : `${current.path ? `${current.path}/` : ""}${segment}`;

      let child = current.children.find((node) => node.name === segment);

      if (!child) {
        child = {
          name: segment,
          path,
          children: [],
        };
        current.children.push(child);
      }

      if (index === segments.length - 1) {
        child.file = file;
      }

      current = child;
    });
  }

  const sortNodes = (nodes: FileTreeNode[]) => {
    nodes.sort((a, b) => {
      const aIsDir = a.children.length > 0;
      const bIsDir = b.children.length > 0;
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((node) => {
      if (node.children.length > 0) {
        sortNodes(node.children);
      }
    });
  };

  sortNodes(root.children);

  const collapseNode = (node: FileTreeNode): FileTreeNode => {
    if (node.children.length === 0) {
      return node;
    }

    let current = node;

    while (
      current.file === undefined &&
      current.children.length === 1 &&
      current.children[0].file === undefined
    ) {
      const child = current.children[0];
      current = {
        name: current.name ? `${current.name}/${child.name}` : child.name,
        path: child.path,
        children: child.children,
        file: child.file,
      };
    }

    return {
      ...current,
      children: current.children.map((child) => collapseNode(child)),
    };
  };

  const collapsedChildren = root.children.map((child) => collapseNode(child));

  return collapsedChildren;
}

function collectDirectoryPaths(nodes: FileTreeNode[]): string[] {
  const directories: string[] = [];
  const stack = [...nodes];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }

    if (node.children.length === 0) {
      continue;
    }

    if (node.path) {
      directories.push(node.path);
    }

    stack.push(...node.children);
  }

  return directories;
}

function getParentPaths(path: string): string[] {
  if (!path) return [];
  const segments = path.split("/");
  const parents: string[] = [];
  for (let index = 1; index < segments.length; index += 1) {
    parents.push(segments.slice(0, index).join("/"));
  }
  return parents;
}
