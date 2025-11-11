import type { LocalRepoSuggestion } from "@cmux/shared";
import { parseGithubRepoUrl } from "@cmux/shared";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ResolvedLocalRepo {
  path: string;
  repoFullName?: string;
  remoteUrl?: string;
  currentBranch?: string;
  defaultBranch?: string;
}

function expandHomeDir(input: string): string {
  if (!input) return input;
  if (input.startsWith("~")) {
    return path.join(os.homedir(), input.slice(1));
  }
  return input;
}

function normalizeInputPath(input: string): string {
  const expanded = expandHomeDir(input.trim());
  if (!expanded) return expanded;
  return path.isAbsolute(expanded)
    ? path.normalize(expanded)
    : path.normalize(path.join(process.cwd(), expanded));
}

export function formatDisplayPath(p: string): string {
  const home = os.homedir();
  if (p.startsWith(home)) {
    return `~${p.slice(home.length)}` || "~";
  }
  return p;
}

async function isGitRepo(directory: string): Promise<boolean> {
  try {
    const gitDir = path.join(directory, ".git");
    const stat = await fs.stat(gitDir);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function suggestLocalDirectories(
  rawQuery: string,
  limit = 8
): Promise<LocalRepoSuggestion[]> {
  const query = rawQuery.trim();
  if (!query) return [];

  const normalized = normalizeInputPath(query);
  if (!normalized) return [];

  let baseDir = normalized;
  let partial = "";

  try {
    const stat = await fs.stat(normalized);
    if (stat.isDirectory()) {
      baseDir = normalized;
      partial = "";
    } else {
      baseDir = path.dirname(normalized);
      partial = path.basename(normalized);
    }
  } catch {
    baseDir = path.dirname(normalized);
    partial = path.basename(normalized);
  }

  try {
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    const suggestions: LocalRepoSuggestion[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (partial && !entry.name.toLowerCase().startsWith(partial.toLowerCase())) {
        continue;
      }
      const fullPath = path.join(baseDir, entry.name);
      const gitRepo = await isGitRepo(fullPath);
      suggestions.push({
        path: fullPath,
        displayName: formatDisplayPath(fullPath),
        isGitRepo: gitRepo,
      });
      if (suggestions.length >= limit) break;
    }
    return suggestions;
  } catch {
    return [];
  }
}

export async function resolveLocalRepo(
  rawPath: string
): Promise<ResolvedLocalRepo> {
  const normalized = normalizeInputPath(rawPath);
  const info: ResolvedLocalRepo = { path: normalized };
  try {
    const stat = await fs.stat(normalized);
    if (!stat.isDirectory()) {
      throw new Error("Path is not a directory");
    }
  } catch (error) {
    throw new Error(
      `Path "${rawPath}" not found or not accessible: ${String(error)}`
    );
  }

  try {
    const { stdout: rootStdout } = await execFileAsync("git", ["-C", normalized, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
    });
    info.path = rootStdout.trim() || normalized;
  } catch (error) {
    throw new Error(
      `No git repository found at ${rawPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  try {
    const { stdout: remoteStdout } = await execFileAsync("git", ["-C", info.path, "config", "--get", "remote.origin.url"], {
      encoding: "utf8",
    });
    const remoteUrl = remoteStdout.trim();
    info.remoteUrl = remoteUrl;
    const parsed = parseGithubRepoUrl(remoteUrl);
    if (parsed) {
      info.repoFullName = parsed.fullName;
    }
  } catch {
    // Missing remote is acceptable
  }

  try {
    const { stdout: branchStdout } = await execFileAsync("git", ["-C", info.path, "rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
    });
    info.currentBranch = branchStdout.trim();
  } catch {
    // ignore
  }

  return info;
}

export async function createGitArchive(
  rawRepoPath: string
): Promise<{ archivePath: string }> {
  const resolved = normalizeInputPath(rawRepoPath);
  await resolveLocalRepo(resolved);
  const archiveDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "cmux-local-archive-")
  );
  const archivePath = path.join(archiveDir, "repo.tar");
  await execFileAsync("git", [
    "-C",
    resolved,
    "archive",
    "--format=tar",
    "--output",
    archivePath,
    "HEAD",
  ]);
  return { archivePath };
}

export async function applyArchiveToDirectory(
  archivePath: string,
  targetDirectory: string
): Promise<void> {
  await execFileAsync("tar", ["-xf", archivePath, "-C", targetDirectory]);
}
