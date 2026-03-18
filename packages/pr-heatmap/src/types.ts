import { z } from "zod";

/**
 * Schema for a single line in the heatmap output
 */
export const LineHeatmapSchema = z.object({
  line: z.string().describe("The actual line content from the file"),
  lineNumber: z.number().describe("1-indexed line number"),
  hasChanged: z.boolean().describe("Whether this line was modified in the diff"),
  shouldBeReviewedScore: z
    .number()
    .min(0)
    .max(10)
    .optional()
    .describe("0-10 score indicating review priority (10 = must review)"),
  shouldReviewWhy: z
    .string()
    .optional()
    .describe("Brief explanation of why this line needs review"),
  mostImportantCharacterIndex: z
    .number()
    .optional()
    .describe("Index of the most important character to focus on"),
});

export type LineHeatmap = z.infer<typeof LineHeatmapSchema>;

/**
 * Schema for the full file heatmap response from the AI
 */
export const FileHeatmapSchema = z.object({
  lines: z.array(LineHeatmapSchema),
  fileSummary: z
    .string()
    .describe("One-sentence summary of changes in this file"),
  overallRiskScore: z
    .number()
    .min(0)
    .max(10)
    .describe("Overall risk score for the file (10 = high risk)"),
  suggestedFocusAreas: z
    .array(z.string())
    .describe("Top 3 areas to focus review on"),
});

export type FileHeatmap = z.infer<typeof FileHeatmapSchema>;

/**
 * Parsed diff information for a single file
 */
export interface FileDiff {
  path: string;
  oldPath?: string;
  status: "added" | "modified" | "deleted" | "renamed";
  hunks: DiffHunk[];
  rawDiff: string;
}

/**
 * A hunk from the diff (a contiguous block of changes)
 */
export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

/**
 * A single line from the diff
 */
export interface DiffLine {
  type: "add" | "remove" | "context";
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

/**
 * Combined result for all files in the PR
 */
export interface PRHeatmapResult {
  base: string;
  head: string;
  generatedAt: string;
  files: Array<{
    path: string;
    status: FileDiff["status"];
    heatmap: FileHeatmap;
  }>;
  summary: {
    totalFiles: number;
    highRiskFiles: string[];
    topFocusAreas: string[];
  };
}

/**
 * Options for the heatmap generator
 */
export interface HeatmapOptions {
  base?: string;
  concurrency?: number;
  model?: string;
  verbose?: boolean;
  outputDir?: string;
  /**
   * Raw diff text to analyze instead of computing via git diff.
   * When provided, `base` is ignored for diff generation.
   */
  diffText?: string;
  /**
   * Label for the diff source (e.g., "PR #123" or "origin/main").
   * Used in output metadata when diffText is provided.
   */
  diffLabel?: string;
}
