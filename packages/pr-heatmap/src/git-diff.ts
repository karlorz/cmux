import { execSync } from "node:child_process";
import type { FileDiff, DiffHunk, DiffLine } from "./types.js";

/**
 * Get the git diff between base and HEAD
 */
export function getGitDiff(base: string = "origin/main"): string {
  try {
    return execSync(`git diff ${base}...HEAD`, {
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large diffs
    });
  } catch (error) {
    // If the range syntax fails, try without the triple dot
    try {
      return execSync(`git diff ${base} HEAD`, {
        encoding: "utf-8",
        maxBuffer: 50 * 1024 * 1024,
      });
    } catch {
      throw new Error(
        `Failed to get git diff: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

/**
 * Get list of changed files with their status
 */
export function getChangedFiles(base: string = "origin/main"): string[] {
  try {
    const output = execSync(`git diff --name-only ${base}...HEAD`, {
      encoding: "utf-8",
    });
    return output
      .trim()
      .split("\n")
      .filter((f) => f.length > 0);
  } catch {
    // Fallback without triple dot
    const output = execSync(`git diff --name-only ${base} HEAD`, {
      encoding: "utf-8",
    });
    return output
      .trim()
      .split("\n")
      .filter((f) => f.length > 0);
  }
}

/**
 * Parse a unified diff into structured FileDiff objects
 */
export function parseDiff(diffText: string): FileDiff[] {
  const files: FileDiff[] = [];
  const fileSections = diffText.split(/^diff --git /m).slice(1);

  for (const section of fileSections) {
    const file = parseFileSection(section);
    if (file) {
      files.push(file);
    }
  }

  return files;
}

function parseFileSection(section: string): FileDiff | null {
  const lines = section.split("\n");
  if (lines.length === 0) return null;

  // Parse file paths from first line: "a/path b/path"
  const pathMatch = lines[0].match(/^a\/(.+?) b\/(.+?)$/);
  if (!pathMatch) return null;

  const oldPath = pathMatch[1];
  const newPath = pathMatch[2];

  // Determine status
  let status: FileDiff["status"] = "modified";
  if (section.includes("new file mode")) {
    status = "added";
  } else if (section.includes("deleted file mode")) {
    status = "deleted";
  } else if (oldPath !== newPath) {
    status = "renamed";
  }

  // Parse hunks
  const hunks = parseHunks(section);

  return {
    path: newPath,
    oldPath: oldPath !== newPath ? oldPath : undefined,
    status,
    hunks,
    rawDiff: "diff --git " + section,
  };
}

function parseHunks(section: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const hunkRegex = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm;

  const lines = section.split("\n");
  let match: RegExpExecArray | null;
  const hunkStarts: Array<{ index: number; match: RegExpExecArray }> = [];

  while ((match = hunkRegex.exec(section)) !== null) {
    hunkStarts.push({ index: match.index, match: { ...match } as RegExpExecArray });
  }

  for (let i = 0; i < hunkStarts.length; i++) {
    const { match } = hunkStarts[i];
    const oldStart = parseInt(match[1], 10);
    const oldLines = match[2] ? parseInt(match[2], 10) : 1;
    const newStart = parseInt(match[3], 10);
    const newLines = match[4] ? parseInt(match[4], 10) : 1;

    // Find the lines for this hunk
    const startLineIdx = lines.findIndex((l) => l.includes(match[0]));
    const endLineIdx =
      i + 1 < hunkStarts.length
        ? lines.findIndex((l, idx) =>
            idx > startLineIdx && hunkStarts[i + 1] ? l.includes(hunkStarts[i + 1].match[0]) : false
          )
        : lines.length;

    const hunkLines = lines.slice(
      startLineIdx + 1,
      endLineIdx === -1 ? undefined : endLineIdx
    );

    let oldLineNum = oldStart;
    let newLineNum = newStart;
    const diffLines: DiffLine[] = [];

    for (const line of hunkLines) {
      if (line.startsWith("+")) {
        diffLines.push({
          type: "add",
          content: line.slice(1),
          newLineNumber: newLineNum++,
        });
      } else if (line.startsWith("-")) {
        diffLines.push({
          type: "remove",
          content: line.slice(1),
          oldLineNumber: oldLineNum++,
        });
      } else if (line.startsWith(" ") || line === "") {
        diffLines.push({
          type: "context",
          content: line.slice(1) || "",
          oldLineNumber: oldLineNum++,
          newLineNumber: newLineNum++,
        });
      }
      // Skip lines starting with \ (no newline at end of file)
    }

    hunks.push({
      oldStart,
      oldLines,
      newStart,
      newLines,
      lines: diffLines,
    });
  }

  return hunks;
}

/**
 * Get file content at HEAD for context
 */
export function getFileContent(path: string): string | null {
  try {
    return execSync(`git show HEAD:${path}`, {
      encoding: "utf-8",
    });
  } catch {
    return null;
  }
}

/**
 * Get the current HEAD commit hash
 */
export function getHeadCommit(): string {
  return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
}

/**
 * Get the merge base between base and HEAD
 */
export function getMergeBase(base: string = "origin/main"): string {
  try {
    return execSync(`git merge-base ${base} HEAD`, { encoding: "utf-8" }).trim();
  } catch {
    return base;
  }
}
