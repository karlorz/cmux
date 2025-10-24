"use client";

import {
  Fragment,
  useCallback,
  useMemo,
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
import { DiffView, DiffModeEnum } from "@git-diff-view/react";
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
    case "added": {
      return {
        icon: <FilePlus className={iconClassName} />,
        colorClassName: "text-emerald-700",
        label: "Added",
      };
    }
    case "removed": {
      return {
        icon: <FileMinus className={iconClassName} />,
        colorClassName: "text-rose-700",
        label: "Removed",
      };
    }
    case "modified": {
      return {
        icon: <FileEdit className={iconClassName} />,
        colorClassName: "text-sky-700",
        label: "Modified",
      };
    }
    case "renamed": {
      return {
        icon: <FileCode className={iconClassName} />,
        colorClassName: "text-amber-700",
        label: "Renamed",
      };
    }
    default: {
      return {
        icon: <FileText className={iconClassName} />,
        colorClassName: "text-neutral-700",
        label: "Changed",
      };
    }
  }
}

function buildFileTree(files: GithubFileChange[]): FileTreeNode {
  const root: FileTreeNode = { name: "", path: "", children: [] };

  for (const file of files) {
    const segments = file.filename.split("/");
    let currentNode = root;

    for (const [index, segment] of segments.entries()) {
      const isLeaf = index === segments.length - 1;

      if (isLeaf) {
        currentNode.children.push({
          name: segment,
          path: file.filename,
          children: [],
          file,
        });
      } else {
        let childNode = currentNode.children.find(
          (child) => child.name === segment && !child.file
        );

        if (!childNode) {
          childNode = {
            name: segment,
            path: segments.slice(0, index + 1).join("/"),
            children: [],
          };
          currentNode.children.push(childNode);
        }

        currentNode = childNode;
      }
    }
  }

  return root;
}

function collapseCommonPrefix(node: FileTreeNode, depth = 0): FileTreeNode {
  if (node.children.length === 1 && !node.children[0].file && depth > 0) {
    const child = node.children[0];
    const collapsedName = `${node.name}/${child.name}`;

    return collapseCommonPrefix(
      {
        name: collapsedName,
        path: child.path,
        children: child.children,
      },
      depth + 1
    );
  }

  return {
    ...node,
    children: node.children.map((child) =>
      collapseCommonPrefix(child, depth + 1)
    ),
  };
}

type FileOutput =
  | FunctionReturnType<typeof api.codeReview.listFileOutputsForPr>[number]
  | FunctionReturnType<typeof api.codeReview.listFileOutputsForComparison>[number];

function inferLanguage(filename: string): string | null {
  const extensionMatch = filename.match(/\.([^./]+)$/);
  if (!extensionMatch) return null;

  const ext = extensionMatch[1].toLowerCase();

  const extensionMap: Record<string, string> = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    rb: "ruby",
    java: "java",
    go: "go",
    rs: "rust",
    c: "c",
    cpp: "cpp",
    cc: "cpp",
    cs: "csharp",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    sh: "bash",
    bash: "bash",
    yml: "yaml",
    yaml: "yaml",
    json: "json",
    xml: "xml",
    html: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    md: "markdown",
    sql: "sql",
  };

  return extensionMap[ext] || null;
}

function buildDiffText(file: GithubFileChange): string {
  const oldPath = file.previous_filename ?? file.filename;
  const newPath = file.filename;

  const header = [
    `diff --git a/${oldPath} b/${newPath}`,
    `--- a/${oldPath}`,
    `+++ b/${newPath}`,
  ].join("\n");

  return `${header}\n${file.patch}`;
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

  const fileTree = useMemo(() => {
    const tree = buildFileTree(files);
    return collapseCommonPrefix(tree);
  }, [files]);

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set()
  );

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
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
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  function renderFileTree(node: FileTreeNode, depth = 0): ReactElement | null {
    if (depth === 0) {
      return (
        <>
          {node.children.map((child) => (
            <Fragment key={child.path}>{renderFileTree(child, depth + 1)}</Fragment>
          ))}
        </>
      );
    }

    const isFolder = !node.file;
    const isExpanded = expandedFolders.has(node.path);

    if (isFolder) {
      return (
        <div key={node.path}>
          <button
            type="button"
            onClick={() => {
              toggleFolder(node.path);
            }}
            className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm text-neutral-700 hover:bg-neutral-100"
            style={{ paddingLeft: `${depth * 0.75}rem` }}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            <Folder className="h-3.5 w-3.5 text-neutral-500" />
            <span className="truncate">{node.name}</span>
          </button>
          {isExpanded && (
            <div>
              {node.children.map((child) => (
                <Fragment key={child.path}>
                  {renderFileTree(child, depth + 1)}
                </Fragment>
              ))}
            </div>
          )}
        </div>
      );
    }

    const file = node.file!;
    const statusMeta = getFileStatusMeta(file.status);

    return (
      <button
        key={node.path}
        type="button"
        onClick={() => {
          scrollToFile(file.filename);
        }}
        className={cn(
          "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm text-neutral-700 hover:bg-neutral-100"
        )}
        style={{ paddingLeft: `${depth * 0.75}rem` }}
      >
        <span className={statusMeta.colorClassName}>{statusMeta.icon}</span>
        <span className="truncate">{node.name}</span>
      </button>
    );
  }

  return (
    <div className="flex gap-6">
      <nav className="sticky top-4 h-[calc(100vh-8rem)] w-64 flex-shrink-0 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-3">
        <div className="mb-2 text-xs font-semibold uppercase text-neutral-500">
          Files ({totalFileCount})
        </div>
        {renderFileTree(fileTree)}
      </nav>

      <div className="flex-1 space-y-4">
        {isLoadingFileOutputs && processedFileCount === null && (
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600" />
              Loading review data...
            </div>
          </div>
        )}

        {processedFileCount !== null && processedFileCount < totalFileCount && (
          <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-700">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <span>
                Processing code reviews: {processedFileCount} of {totalFileCount}{" "}
                files completed
              </span>
            </div>
          </div>
        )}

        {files.map((file) => {
          const review = fileOutputIndex.get(file.filename);
          const statusMeta = getFileStatusMeta(file.status);
          const language = inferLanguage(file.filename);

          return (
            <div
              key={file.filename}
              id={file.filename}
              className="rounded-lg border border-neutral-200 bg-white shadow-sm"
            >
              <div className="border-b border-neutral-200 bg-neutral-50 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={statusMeta.colorClassName}>
                      {statusMeta.icon}
                    </span>
                    <span className="font-mono text-sm font-medium text-neutral-900">
                      {file.filename}
                    </span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-xs font-medium",
                              statusMeta.colorClassName.replace("text-", "bg-").replace("-700", "-100"),
                              statusMeta.colorClassName
                            )}
                          >
                            {statusMeta.label}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>File status: {statusMeta.label}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  <div className="flex items-center gap-3 text-sm">
                    {file.additions > 0 && (
                      <span className="text-emerald-700">+{file.additions}</span>
                    )}
                    {file.deletions > 0 && (
                      <span className="text-rose-700">-{file.deletions}</span>
                    )}
                  </div>
                </div>

                {file.previous_filename && file.previous_filename !== file.filename && (
                  <div className="mt-2 text-xs text-neutral-600">
                    Renamed from{" "}
                    <span className="font-mono">{file.previous_filename}</span>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                {!file.patch ? (
                  <div className="p-4 text-sm text-neutral-600">
                    No diff available for this file. It may be binary or too large.
                  </div>
                ) : (
                  <DiffView
                    data={{
                      oldFile: {
                        fileName: file.previous_filename ?? file.filename,
                        content: null,
                        fileLang: language,
                      },
                      newFile: {
                        fileName: file.filename,
                        content: null,
                        fileLang: language,
                      },
                      hunks: [buildDiffText(file)],
                    }}
                    diffViewMode={DiffModeEnum.Split}
                    diffViewHighlight={true}
                    diffViewWrap={false}
                    diffViewTheme="light"
                    diffViewFontSize={13}
                  />
                )}
              </div>

              {review && (
                <div className="border-t border-neutral-200 bg-neutral-50 p-4">
                  <div className="flex items-start gap-2 text-sm">
                    <Sparkles className="mt-0.5 h-4 w-4 text-sky-600" />
                    <div className="flex-1">
                      <div className="font-medium text-neutral-900">
                        AI Review Available
                      </div>
                      <div className="mt-1 text-neutral-600">
                        This file has been analyzed by the code review system.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
