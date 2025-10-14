import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { ReplaceDiffEntry } from "@cmux/shared/diff-types";

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: TreeNode[];
  diff?: ReplaceDiffEntry;
  isExpanded?: boolean;
}

interface FileTreeProps {
  diffs: ReplaceDiffEntry[];
  onFileSelect?: (filePath: string) => void;
  selectedFile?: string;
  className?: string;
}

function buildFileTree(diffs: ReplaceDiffEntry[]): TreeNode[] {
  const root: Record<string, TreeNode> = {};

  for (const diff of diffs) {
    const parts = diff.filePath.split("/");
    let current = root;
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!current[part]) {
        current[part] = {
          name: part,
          path: currentPath,
          type: isLast ? "file" : "folder",
          children: isLast ? undefined : {},
          diff: isLast ? diff : undefined,
          isExpanded: false,
        };
      }

      if (!isLast) {
        current = current[part].children as Record<string, TreeNode>;
      }
    }
  }

  function convertToArray(node: Record<string, TreeNode>): TreeNode[] {
    return Object.values(node)
      .sort((a, b) => {
        // Folders first, then files
        if (a.type !== b.type) {
          return a.type === "folder" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      })
      .map(node => ({
        ...node,
        children: node.children ? convertToArray(node.children) : undefined,
      }));
  }

  return convertToArray(root);
}

function TreeNodeComponent({
  node,
  level = 0,
  onFileSelect,
  selectedFile,
  onToggle,
}: {
  node: TreeNode;
  level?: number;
  onFileSelect?: (filePath: string) => void;
  selectedFile?: string;
  onToggle: (path: string) => void;
}) {
  const isSelected = selectedFile === node.path;
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = node.isExpanded;

  const handleClick = () => {
    if (node.type === "folder") {
      onToggle(node.path);
    } else {
      onFileSelect?.(node.path);
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "added":
        return "text-green-600 dark:text-green-400";
      case "modified":
        return "text-blue-600 dark:text-blue-400";
      case "deleted":
        return "text-red-600 dark:text-red-400";
      case "renamed":
        return "text-yellow-600 dark:text-yellow-400";
      default:
        return "text-neutral-600 dark:text-neutral-400";
    }
  };

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 py-1 px-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer text-sm",
          isSelected && "bg-neutral-200 dark:bg-neutral-700",
          level > 0 && "ml-4"
        )}
        onClick={handleClick}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
      >
        {node.type === "folder" ? (
          <>
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="w-4 h-4 text-neutral-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-neutral-500" />
              )
            ) : (
              <div className="w-4" />
            )}
            {isExpanded ? (
              <FolderOpen className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
            ) : (
              <Folder className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
            )}
          </>
        ) : (
          <>
            <div className="w-4" />
            <File className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
          </>
        )}
        <span className={cn("truncate", node.diff && getStatusColor(node.diff.status))}>
          {node.name}
        </span>
        {node.diff && (
          <div className="ml-auto flex items-center gap-1 text-xs">
            {node.diff.additions > 0 && (
              <span className="text-green-600 dark:text-green-400">+{node.diff.additions}</span>
            )}
            {node.diff.deletions > 0 && (
              <span className="text-red-600 dark:text-red-400">-{node.diff.deletions}</span>
            )}
          </div>
        )}
      </div>
      {node.type === "folder" && isExpanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNodeComponent
              key={child.path}
              node={child}
              level={level + 1}
              onFileSelect={onFileSelect}
              selectedFile={selectedFile}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({ diffs, onFileSelect, selectedFile, className }: FileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const treeData = useMemo(() => buildFileTree(diffs), [diffs]);

  const handleToggle = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Update tree data with expanded state
  const treeWithState = useMemo(() => {
    const updateExpanded = (nodes: TreeNode[]): TreeNode[] => {
      return nodes.map(node => ({
        ...node,
        isExpanded: expandedFolders.has(node.path),
        children: node.children ? updateExpanded(node.children) : undefined,
      }));
    };
    return updateExpanded(treeData);
  }, [treeData, expandedFolders]);

  if (treeData.length === 0) {
    return (
      <div className={cn("p-4 text-sm text-neutral-500 dark:text-neutral-400", className)}>
        No files to display
      </div>
    );
  }

  return (
    <div className={cn("border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900", className)}>
      <div className="p-2 border-b border-neutral-200 dark:border-neutral-800">
        <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          Files ({diffs.length})
        </h3>
      </div>
      <div className="overflow-y-auto max-h-full">
        {treeWithState.map((node) => (
          <TreeNodeComponent
            key={node.path}
            node={node}
            onFileSelect={onFileSelect}
            selectedFile={selectedFile}
            onToggle={handleToggle}
          />
        ))}
      </div>
    </div>
  );
}