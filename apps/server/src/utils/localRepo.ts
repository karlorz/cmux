import { parseGithubRepoUrl, type LocalPathSuggestion } from "@cmux/shared";
import { execFile } from "node:child_process";
import type { Dirent } from "node:fs";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface LocalRepoResolution {
  resolvedPath: string;
  repoRoot: string;
  repoUrl: string;
  repoFullName: string;
}

const HOME_DIR = os.homedir();

export const expandUserPath = (input: string): string => {
  if (!input) return input;
  if (input === "~") {
    return HOME_DIR;
  }
  if (input.startsWith("~/")) {
    return path.join(HOME_DIR, input.slice(2));
  }
  return input;
};

const toDisplayPath = (absPath: string): string => {
  const normalized = path.normalize(absPath);
  if (normalized === HOME_DIR) {
    return "~";
  }
  if (normalized.startsWith(HOME_DIR + path.sep)) {
    return `~${path.sep}${path.relative(HOME_DIR, normalized)}`;
  }
  return normalized;
};

const directoryExists = async (dirPath: string): Promise<boolean> => {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
};

export async function suggestLocalPaths(
  rawQuery: string,
  limit = 5
): Promise<LocalPathSuggestion[]> {
  const trimmed = rawQuery.trim();
  if (!trimmed) return [];

  const expanded = expandUserPath(trimmed);
  const normalized = path.isAbsolute(expanded)
    ? path.normalize(expanded)
    : path.resolve(expanded);

  let baseDir = normalized;
  let partialName = "";

  try {
    const stats = await fs.stat(baseDir);
    if (!stats.isDirectory()) {
      partialName = path.basename(baseDir);
      baseDir = path.dirname(baseDir);
    }
  } catch {
    partialName = path.basename(baseDir);
    baseDir = path.dirname(baseDir);
  }

  if (!baseDir) {
    baseDir = HOME_DIR;
  }

  const baseExists = await directoryExists(baseDir);
  if (!baseExists) {
    return [];
  }

  let entries: Dirent[] = [];
  try {
    entries = await fs.readdir(baseDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const needle = partialName.toLowerCase();
  const filtered = entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) =>
      needle.length === 0
        ? true
        : entry.name.toLowerCase().startsWith(needle)
    )
    .slice(0, limit * 2);

  const suggestions: LocalPathSuggestion[] = [];
  for (const entry of filtered) {
    const fullPath = path.join(baseDir, entry.name);
    let isGitRepo = false;
    try {
      await fs.access(path.join(fullPath, ".git"));
      isGitRepo = true;
    } catch {
      isGitRepo = false;
    }
    suggestions.push({
      path: fullPath,
      displayPath: toDisplayPath(fullPath),
      isGitRepo,
    });
    if (suggestions.length >= limit) {
      break;
    }
  }

  return suggestions;
}

export async function resolveLocalRepo(
  rawPath: string
): Promise<LocalRepoResolution> {
  const expanded = expandUserPath(rawPath.trim());
  const candidate = path.isAbsolute(expanded)
    ? path.normalize(expanded)
    : path.resolve(expanded);

  let statPath = candidate;
  try {
    const stats = await fs.stat(candidate);
    if (!stats.isDirectory()) {
      statPath = path.dirname(candidate);
    }
  } catch (error) {
    throw new Error(`Path not found: ${candidate}`);
  }

  const repoRoot = await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
    cwd: statPath,
  })
    .then((result) => result.stdout.trim())
    .catch((error) => {
      throw new Error(
        error instanceof Error
          ? `Not a git repository: ${error.message}`
          : "Not a git repository"
      );
    });

  const remoteUrl = await execFileAsync("git", ["config", "--get", "remote.origin.url"], {
    cwd: repoRoot,
  })
    .then((result) => result.stdout.trim())
    .catch((error) => {
      throw new Error(
        error instanceof Error
          ? `Unable to read remote origin: ${error.message}`
          : "Unable to read remote origin"
      );
    });

  const parsed = parseGithubRepoUrl(remoteUrl);
  if (!parsed) {
    throw new Error("Unsupported remote origin URL");
  }

  return {
    resolvedPath: repoRoot,
    repoRoot,
    repoUrl: parsed.gitUrl,
    repoFullName: parsed.fullName,
  };
}

export async function createGitArchive(
  repoRoot: string,
  destinationPath: string
): Promise<void> {
  await execFileAsync(
    "git",
    ["archive", "--format=tar", "--output", destinationPath, "HEAD"],
    { cwd: repoRoot }
  );
}

export const formatDisplayPath = toDisplayPath;
