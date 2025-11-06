export type DiffStatus = "added" | "modified" | "deleted" | "renamed";

export interface ReplaceDiffEntry {
  filePath: string;
  oldPath?: string;
  status: DiffStatus;
  additions: number;
  deletions: number;
  patch?: string;
  oldContent?: string;
  newContent?: string;
  isBinary: boolean;
  contentOmitted?: boolean;
  oldSize?: number;
  newSize?: number;
  patchSize?: number;
  oldImageDataUrl?: string;
  newImageDataUrl?: string;
}

