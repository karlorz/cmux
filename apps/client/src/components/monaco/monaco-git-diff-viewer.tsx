import { MonacoDiffViewer, type GitDiffViewerProps } from "@cmux/shared/diff-viewer";

import { useTheme } from "@/components/theme/use-theme";
import { loaderInitPromise } from "@/lib/monaco-environment";
import { isElectron } from "@/lib/electron";

import { FileDiffHeader } from "../file-diff-header";
import { getRandomKitty } from "../kitties";

export type { GitDiffViewerProps };

export function MonacoGitDiffViewer(props: GitDiffViewerProps) {
  const { theme } = useTheme();
  const monacoTheme = theme === "dark" ? "cmux-dark" : "cmux-light";

  return (
    <MonacoDiffViewer
      {...props}
      monacoTheme={monacoTheme}
      loader={loaderInitPromise}
      enableDebugLogging={isElectron}
      getKitty={getRandomKitty}
      FileDiffHeaderComponent={FileDiffHeader}
    />
  );
}

