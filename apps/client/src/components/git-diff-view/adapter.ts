import { DiffFile, generateDiffFile } from "@git-diff-view/file";
import type { ReplaceDiffEntry } from "@cmux/shared/diff-types";
import {
  type PreparedDiffFile,
  guessLanguage,
} from "./types";

/**
 * Prepare a DiffFile from a ReplaceDiffEntry.
 * Returns null diffFile for binary, deleted, renamed, or content-omitted files.
 */
export function prepareDiffFile(
  entry: ReplaceDiffEntry,
): PreparedDiffFile {
  // Skip binary or content-omitted files
  if (entry.contentOmitted || entry.isBinary) {
    return { entry, diffFile: null, language: "", totalLines: 0 };
  }

  // Skip deleted and renamed files (they don't have meaningful diff content to show)
  if (entry.status === "deleted" || entry.status === "renamed") {
    return { entry, diffFile: null, language: "", totalLines: 0 };
  }

  const language = guessLanguage(entry.filePath);
  const oldPath = entry.oldPath || entry.filePath;
  const newPath = entry.filePath;
  const oldContent = entry.oldContent || "";
  const newContent = entry.newContent || "";

  const diffFile = generateDiffFile(
    oldPath,
    oldContent,
    newPath,
    newContent,
    language,
    language
  );

  diffFile.init();
  diffFile.buildSplitDiffLines();
  diffFile.buildUnifiedDiffLines();

  const totalLines = (diffFile.additionLength ?? 0) + (diffFile.deletionLength ?? 0);
  return { entry, diffFile, language, totalLines };
}

/**
 * Prepare all diffs and return prepared files with metadata.
 */
export function prepareDiffFiles(
  diffs: ReplaceDiffEntry[],
): PreparedDiffFile[] {
  return diffs.map((entry) => prepareDiffFile(entry));
}

/**
 * Re-export DiffFile for use in components
 */
export { DiffFile };
