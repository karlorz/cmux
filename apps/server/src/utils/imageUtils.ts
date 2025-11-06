import { exec } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";
import type { ReplaceDiffEntry } from "@cmux/shared/diff-types";

const execAsync = promisify(exec);

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".ico",
]);

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
};

export function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

async function readFileAsDataUrl(
  filePath: string
): Promise<string | undefined> {
  try {
    const buffer = await fs.readFile(filePath);
    const mimeType = getMimeType(filePath);
    const base64 = buffer.toString("base64");
    return `data:${mimeType};base64,${base64}`;
  } catch {
    return undefined;
  }
}

async function getGitFileContent(
  worktreePath: string,
  ref: string,
  filePath: string
): Promise<string | undefined> {
  try {
    const { stdout } = await execAsync(
      `git show ${ref}:"${filePath}"`,
      {
        cwd: worktreePath,
        encoding: "buffer",
        maxBuffer: 10 * 1024 * 1024, // 10MB max
      }
    );
    const buffer = Buffer.from(stdout);
    const mimeType = getMimeType(filePath);
    const base64 = buffer.toString("base64");
    return `data:${mimeType};base64,${base64}`;
  } catch {
    return undefined;
  }
}

export async function enrichDiffWithImages(
  entries: ReplaceDiffEntry[],
  worktreePath: string,
  baseRef: string
): Promise<ReplaceDiffEntry[]> {
  return Promise.all(
    entries.map(async (entry) => {
      if (!entry.isBinary || !isImageFile(entry.filePath)) {
        return entry;
      }

      let newImageDataUrl: string | undefined;
      let oldImageDataUrl: string | undefined;

      // Get the new version (current working tree)
      if (entry.status !== "deleted") {
        const newImagePath = path.join(worktreePath, entry.filePath);
        newImageDataUrl = await readFileAsDataUrl(newImagePath);
      }

      // Get the old version (from base ref)
      if (entry.status !== "added") {
        const oldPath = entry.oldPath || entry.filePath;
        oldImageDataUrl = await getGitFileContent(
          worktreePath,
          baseRef,
          oldPath
        );
      }

      return {
        ...entry,
        newImageDataUrl,
        oldImageDataUrl,
      };
    })
  );
}
