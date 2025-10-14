import { cn } from "@/lib/utils";
import type { ReplaceDiffEntry } from "@cmux/shared/diff-types";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getDiffStatusColor, getDiffStatusIcon } from "./diff-status";

type DiffFile = Pick<
  ReplaceDiffEntry,
  "filePath" | "status" | "additions" | "deletions"
> & {
  filePath: string;
};

type DirectoryNode = {
  type: "directory";
  name: string;
  path: string;
  additions: number;
  deletions: number;
  children: TreeNode[];
};

type FileNode = {
  type: "file";
  name: string;
  path: string;
  additions: number;
  deletions: number;
  status: ReplaceDiffEntry["status"];
};

type TreeNode = DirectoryNode | FileNode;

type BuildTreeResult = {
  nodes: TreeNode[];
  directoryPaths: string[];
};

function buildTree(files: DiffFile[]): BuildTreeResult {
  const root: DirectoryNode = {
    type: "directory",
    name: "",
    path: "",
    additions: 0,
    deletions: 0,
    children: [],
  };

  const directoryMap = new Map<string, DirectoryNode>();
  directoryMap.set("", root);

  for (const file of files) {
    const normalizedPath = file.filePath.trim();
    if (!normalizedPath) continue;

    const segments = normalizedPath.split("/");
    let currentPath = "";
    let parent = root;

    root.additions += file.additions;
    root.deletions += file.deletions;

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const isFile = index === segments.length - 1;

      if (isFile) {
        const fileNode: FileNode = {
          type: "file",
          name: segment,
          path: normalizedPath,
          additions: file.additions,
          deletions: file.deletions,
          status: file.status,
        };
        parent.children.push(fileNode);
        break;
      }

      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let directory = directoryMap.get(currentPath);

      if (!directory) {
        directory = {
          type: "directory",
          name: segment,
          path: currentPath,
          additions: 0,
          deletions: 0,
          children: [],
        };
        directoryMap.set(currentPath, directory);
        parent.children.push(directory);
      }

      directory.additions += file.additions;
      directory.deletions += file.deletions;
      parent = directory;
    }
  }

  const sortTree = (node: DirectoryNode) => {
    node.children.sort((a, b) => {
      if (a.type === b.type) {
        return a.name.localeCompare(b.name, undefined, {
          sensitivity: "base",
        });
      }
      return a.type === "directory" ? -1 : 1;
    });

    node.children.forEach((child) => {
      if (child.type === "directory") {
        sortTree(child);
      }
    });
  };

  sortTree(root);

  return {
    nodes: root.children,
    directoryPaths: Array.from(directoryMap.keys()).filter((path) => path !== ""),
  };
}

function getParentDirectories(filePath: string): string[] {
  const segments = filePath.split("/");
  if (segments.length <= 1) {
    return [];
  }

  const parents: string[] = [];
  let current = "";

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    current = current ? `${current}/${segment}` : segment;
    parents.push(current);
  }

  return parents;
}

export interface DiffFileTreeProps {
  files: DiffFile[];
  activeFilePath?: string | null;
  onSelectFile?: (filePath: string) => void;
  expandedFiles?: Set<string>;
}

export function DiffFileTree({
  files,
  activeFilePath,
  onSelectFile,
  expandedFiles,
}: DiffFileTreeProps) {
  const { nodes, directoryPaths } = useMemo(() => buildTree(files), [files]);

  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(
    () => new Set(directoryPaths),
  );

  useEffect(() => {
    setExpandedDirectories((prev) => {
      const next = new Set(prev);
      let didChange = false;
      for (const path of directoryPaths) {
        if (!next.has(path)) {
          next.add(path);
          didChange = true;
        }
      }
      return didChange ? next : prev;
    });
  }, [directoryPaths]);

  useEffect(() => {
    if (!activeFilePath) {
      return;
    }
    const parents = getParentDirectories(activeFilePath);
    if (parents.length === 0) {
      return;
    }
    setExpandedDirectories((prev) => {
      const next = new Set(prev);
      let didChange = false;
      for (const directory of parents) {
        if (!next.has(directory)) {
          next.add(directory);
          didChange = true;
        }
      }
      return didChange ? next : prev;
    });
  }, [activeFilePath]);

  const handleToggleDirectory = (path: string) => {
    setExpandedDirectories((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleSelectFile = (path: string) => {
    onSelectFile?.(path);
  };

  const renderNode = (node: TreeNode, depth: number): ReactNode => {
    if (node.type === "directory") {
      const isExpanded = expandedDirectories.has(node.path);
      return (
        <div key={node.path}>
          <button
            type="button"
            onClick={() => handleToggleDirectory(node.path)}
            className={cn(
              "flex w-full items-center gap-2 py-1.5 pr-3 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-200/60 dark:text-neutral-300 dark:hover:bg-neutral-800/60",
            )}
            style={{ paddingLeft: 12 + depth * 12 }}
          >
            <span className="text-neutral-500 dark:text-neutral-400">
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </span>
            <span className="truncate font-medium">
              {node.name || "(root)"}
            </span>
            <span className="ml-auto flex gap-1 text-[11px] font-medium">
              <span className="text-green-600 dark:text-green-400 select-none">
                +{node.additions}
              </span>
              <span className="text-red-600 dark:text-red-400 select-none">
                −{node.deletions}
              </span>
            </span>
          </button>
          {isExpanded ? (
            <div>
              {node.children.map((child) => renderNode(child, depth + 1))}
            </div>
          ) : null}
        </div>
      );
    }

    const isActive = activeFilePath === node.path;
    const isCollapsedInDiff = expandedFiles ? !expandedFiles.has(node.path) : false;

    return (
      <button
        key={node.path}
        type="button"
        onClick={() => handleSelectFile(node.path)}
        className={cn(
          "relative flex w-full items-center gap-2 py-1.5 pr-3 text-xs font-mono transition-colors",
          "hover:bg-neutral-200/60 dark:hover:bg-neutral-800/60",
          isActive
            ? "bg-neutral-200/80 text-neutral-900 dark:bg-neutral-800/70 dark:text-neutral-50"
            : "text-neutral-700 dark:text-neutral-300",
          isCollapsedInDiff && !isActive && "opacity-80",
        )}
        style={{ paddingLeft: 32 + depth * 12 }}
      >
        <span
          className={cn(
            "flex h-3.5 w-3.5 items-center justify-center",
            getDiffStatusColor(node.status),
          )}
        >
          {getDiffStatusIcon(node.status, "h-3 w-3")}
        </span>
        <span className="truncate select-none">{node.name}</span>
        <span className="ml-auto flex gap-1 text-[11px] font-medium">
          <span className="text-green-600 dark:text-green-400 select-none">
            +{node.additions}
          </span>
          <span className="text-red-600 dark:text-red-400 select-none">
            −{node.deletions}
          </span>
        </span>
      </button>
    );
  };

  if (nodes.length === 0) {
    return null;
  }

  return (
    <div className="hidden min-h-0 w-64 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50/80 dark:border-neutral-800 dark:bg-neutral-950/60 md:flex">
      <div className="border-b border-neutral-200 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400 select-none">
        Files
      </div>
      <div className="flex-1 overflow-y-auto pb-4">
        {nodes.map((node) => renderNode(node, 0))}
      </div>
    </div>
  );
}
