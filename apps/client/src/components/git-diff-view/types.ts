import type { DiffFile } from "@git-diff-view/core";
import type { ReplaceDiffEntry } from "@cmux/shared/diff-types";

export interface PreparedDiffFile {
  entry: ReplaceDiffEntry;
  diffFile: DiffFile | null; // null for binary/contentOmitted
  language: string;
  totalLines: number;
}

type FileDiffRowClassNames = {
  button?: string;
  container?: string;
};

type GitDiffViewerClassNames = {
  fileDiffRow?: FileDiffRowClassNames;
};

export interface GitDiffViewerProps {
  diffs: ReplaceDiffEntry[];
  isLoading?: boolean;
  onControlsChange?: (controls: {
    expandAll: () => void;
    collapseAll: () => void;
    totalAdditions: number;
    totalDeletions: number;
  }) => void;
  classNames?: GitDiffViewerClassNames;
  onFileToggle?: (filePath: string, isExpanded: boolean) => void;
}

export interface GitDiffViewerWithSidebarProps extends GitDiffViewerProps {
  isHeatmapActive?: boolean;
  onToggleHeatmap?: () => void;
}

// Large diff thresholds (following vibe-kanban pattern)
export const AUTO_COLLAPSE_THRESHOLD = 200; // Auto-collapse files over this
export const LARGE_DIFF_THRESHOLD = 2000; // Show placeholder, require click to load
export const MAX_LINES_FOR_SYNTAX = 5000; // Skip syntax highlighting above this

// Language extension map
export const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  json: "json",
  md: "markdown",
  markdown: "markdown",
  yml: "yaml",
  yaml: "yaml",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  css: "css",
  scss: "scss",
  less: "less",
  html: "html",
  htm: "html",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  c: "c",
  h: "c",
  cpp: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  m: "objective-c",
  mm: "objective-c",
  php: "php",
  rb: "ruby",
  sql: "sql",
  toml: "toml",
  ini: "ini",
  conf: "ini",
  xml: "xml",
  vue: "vue",
  svelte: "svelte",
  dart: "dart",
  scala: "scala",
};

export function guessLanguage(filePath: string): string {
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot === -1 || lastDot === filePath.length - 1) {
    return "plaintext";
  }
  const ext = filePath.slice(lastDot + 1).toLowerCase();
  return LANGUAGE_BY_EXTENSION[ext] ?? "plaintext";
}
