import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import type { FileDiff, FileHeatmap, HeatmapOptions, PRHeatmapResult } from "./types.js";
import { FileHeatmapSchema } from "./types.js";
import {
  getGitDiff,
  parseDiff,
  getFileContent,
  getHeadCommit,
  getMergeBase,
} from "./git-diff.js";

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_MODEL = "gpt-4o-mini";

/**
 * Generate a heatmap for a single file's diff
 */
async function generateFileHeatmap(
  fileDiff: FileDiff,
  model: string,
  verbose: boolean
): Promise<FileHeatmap> {
  // Get full file content for context
  const fileContent = getFileContent(fileDiff.path);
  const fileLines = fileContent?.split("\n") ?? [];

  // Build the prompt
  const prompt = buildPrompt(fileDiff, fileLines);

  if (verbose) {
    console.error(`  Analyzing ${fileDiff.path}...`);
  }

  const result = await generateObject({
    model: openai(model),
    schema: FileHeatmapSchema,
    prompt,
  });

  return result.object;
}

function buildPrompt(fileDiff: FileDiff, fileLines: string[]): string {
  // Focus on changed regions with context
  const changedLineNumbers = new Set<number>();
  for (const hunk of fileDiff.hunks) {
    for (const line of hunk.lines) {
      if (line.type === "add" && line.newLineNumber) {
        changedLineNumbers.add(line.newLineNumber);
      }
    }
  }

  // Build line annotations for the AI
  const annotatedLines = fileLines.map((content, idx) => {
    const lineNum = idx + 1;
    const isChanged = changedLineNumbers.has(lineNum);
    return { lineNumber: lineNum, content, isChanged };
  });

  // Only include lines near changes (with 5 lines context)
  const relevantLines = annotatedLines.filter((line) => {
    if (line.isChanged) return true;
    for (const changedNum of changedLineNumbers) {
      if (Math.abs(line.lineNumber - changedNum) <= 5) return true;
    }
    return false;
  });

  return `You are a senior code reviewer. Analyze this code diff and identify which lines need human review attention.

File: ${fileDiff.path}
Status: ${fileDiff.status}

## Raw Diff
\`\`\`
${fileDiff.rawDiff.slice(0, 4000)}
\`\`\`

## File Content (relevant sections)
${relevantLines
  .map(
    (l) =>
      `${l.lineNumber}: ${l.isChanged ? "[CHANGED] " : ""}${l.content}`
  )
  .join("\n")}

## Instructions
1. For each line in the relevant sections, assess review priority (0-10 scale)
2. Focus on:
   - Logic errors or bugs
   - Security issues
   - Performance concerns
   - Breaking changes
   - Missing error handling
   - Code style issues are LOW priority (1-2)
3. Provide a brief "why" for lines scoring 5+
4. Identify the character index most important to focus on for high-priority lines
5. Summarize the overall changes and risk

Return ONLY the lines that appear in the "File Content" section above.`;
}

/**
 * Process files with controlled concurrency
 */
async function processFilesWithConcurrency<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];
  const pending: Promise<void>[] = [];

  for (let i = 0; i < items.length; i++) {
    const promise = processor(items[i]).then((result) => {
      results[i] = result;
    });
    pending.push(promise);

    if (pending.length >= concurrency) {
      await Promise.race(pending);
      // Remove completed promises
      for (let j = pending.length - 1; j >= 0; j--) {
        const status = await Promise.race([
          pending[j].then(() => "done"),
          Promise.resolve("pending"),
        ]);
        if (status === "done") {
          pending.splice(j, 1);
        }
      }
    }
  }

  await Promise.all(pending);
  return results;
}

/**
 * Generate heatmaps for all changed files in the PR
 */
export async function generatePRHeatmap(
  options: HeatmapOptions = {}
): Promise<PRHeatmapResult> {
  const {
    base = "origin/main",
    concurrency = DEFAULT_CONCURRENCY,
    model = DEFAULT_MODEL,
    verbose = false,
    diffText: providedDiff,
    diffLabel,
  } = options;

  // Use provided diff text or fetch from git
  let diffText: string;
  let diffSource: string;

  if (providedDiff) {
    diffText = providedDiff;
    diffSource = diffLabel ?? "provided diff";
    if (verbose) {
      console.error(`Analyzing ${diffSource}...`);
    }
  } else {
    if (verbose) {
      console.error(`Fetching diff from ${base}...`);
    }
    diffText = getGitDiff(base);
    diffSource = base;
  }

  const files = parseDiff(diffText);

  if (verbose) {
    console.error(`Found ${files.length} changed files`);
  }

  // Filter to reviewable files (skip binaries, lockfiles, etc)
  const reviewableFiles = files.filter((f) => isReviewableFile(f.path));

  if (verbose) {
    console.error(`${reviewableFiles.length} files to analyze`);
  }

  // Generate heatmaps with concurrency control
  const heatmaps = await processFilesWithConcurrency(
    reviewableFiles,
    (file) => generateFileHeatmap(file, model, verbose),
    concurrency
  );

  // Build the result
  const fileResults = reviewableFiles.map((file, i) => ({
    path: file.path,
    status: file.status,
    heatmap: heatmaps[i],
  }));

  // Compute summary
  const highRiskFiles = fileResults
    .filter((f) => f.heatmap.overallRiskScore >= 7)
    .map((f) => f.path);

  const allFocusAreas = fileResults.flatMap((f) => f.heatmap.suggestedFocusAreas);
  const topFocusAreas = [...new Set(allFocusAreas)].slice(0, 5);

  // Use appropriate labels based on diff source
  const baseLabel = providedDiff ? diffSource : getMergeBase(base);
  const headLabel = providedDiff ? "HEAD" : getHeadCommit();

  return {
    base: baseLabel,
    head: headLabel,
    generatedAt: new Date().toISOString(),
    files: fileResults,
    summary: {
      totalFiles: fileResults.length,
      highRiskFiles,
      topFocusAreas,
    },
  };
}

/**
 * Check if a file should be reviewed (not binary, not lockfile, etc)
 */
function isReviewableFile(path: string): boolean {
  const skipPatterns = [
    /\.lock$/,
    /package-lock\.json$/,
    /yarn\.lock$/,
    /bun\.lockb$/,
    /go\.sum$/,
    /\.min\.(js|css)$/,
    /\.(png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/i,
    /\.(pdf|doc|docx|xls|xlsx)$/i,
    /node_modules\//,
    /dist\//,
    /\.git\//,
  ];

  return !skipPatterns.some((pattern) => pattern.test(path));
}
