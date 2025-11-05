import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  parse,
  type ParseError,
  printParseErrorCode,
} from "jsonc-parser";

function formatParseErrors(errors: ParseError[]): string {
  return errors
    .map(
      (error) =>
        `${printParseErrorCode(error.error)} at offset ${error.offset}`
    )
    .join("; ");
}

async function normalizeSettingsFile(sourcePath: string): Promise<string> {
  const raw = await readFile(sourcePath, "utf8");
  const errors: ParseError[] = [];
  const parsed = parse(raw, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Unable to parse ${sourcePath}: ${formatParseErrors(errors)}`
    );
  }

  if (parsed === undefined || parsed === null) {
    return "{}";
  }

  return JSON.stringify(parsed, null, 2);
}

export interface SyncResult {
  updated: boolean;
  hash: string;
  lastModified: number;
}

async function ensureDir(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

export async function syncSettingsFile(options: {
  sourcePath: string;
  destinationPath: string;
}): Promise<SyncResult> {
  const normalized = await normalizeSettingsFile(options.sourcePath);
  const hash = createHash("sha256").update(normalized).digest("hex");
  const sourceStat = await stat(options.sourcePath);

  let existing: string | null = null;
  try {
    existing = await readFile(options.destinationPath, "utf8");
  } catch {
    existing = null;
  }

  if (existing?.trim() === normalized.trim()) {
    return {
      updated: false,
      hash,
      lastModified: sourceStat.mtimeMs,
    };
  }

  await ensureDir(options.destinationPath);
  await writeFile(options.destinationPath, normalized, "utf8");

  return {
    updated: true,
    hash,
    lastModified: sourceStat.mtimeMs,
  };
}
