// New @git-diff-view based components (default)
export {
  GitDiffViewer,
  GitDiffViewerWithSidebar,
  type GitDiffViewerProps,
  type GitDiffViewerWithSidebarProps,
} from "./git-diff-view";

// Legacy Monaco-based components (for fallback via ?diffViewer=monaco)
export {
  MonacoGitDiffViewer,
  type GitDiffViewerProps as MonacoGitDiffViewerProps,
} from "./monaco/monaco-git-diff-viewer";

export { MonacoGitDiffViewerWithSidebar } from "./monaco/monaco-git-diff-viewer-with-sidebar";

export {
  GitDiffViewerWithHeatmap,
  HeatmapDiffViewer,
  type GitDiffViewerWithHeatmapProps,
  type HeatmapDiffViewerProps,
  type DiffViewerControls,
} from "./heatmap-diff-viewer";
