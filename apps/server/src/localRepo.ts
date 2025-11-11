import { parseGithubRepoUrl } from "@cmux/shared";
import type {
  LocalPathSuggestion,
  LocalRepoInspectResponse,
  LocalRepoBranchesResponse,
} from "@cmux/shared";
import fs from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import tar from "tar";
import { serverLogger } from "./utils/fileLogger";

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 256 * 1024 * 1024;

const isWindows = process.platform === "win32";

const expandPath = (input: string): string => {
  if (!input) return input;
  if (input.startsWith("~")) {
    return path.resolve(path.join(os.homedir(), input.slice(1)));
  }
  if (
    input.startsWith("/") ||
    (isWindows && /^[a-zA-Z]:[\\/]/.test(input)) ||
    input.startsWith("\\\\")
  ) {
    return path.resolve(input);
  }
  return path.resolve(process.cwd(), input);
};

const formatDisplayPath = (absPath: string): string => {
  const normalized = absPath.replace(/\\/g, "/");
  const home = os.homedir().replace(/\\/g, "/");
  if (normalized.startsWith(home)) {
    return normalized.replace(home, "~");
  }
  return normalized;
};

const sanitizeRepoFullName = (input: string): string => {
  const trimmed = input.trim();
  if (!trimmed.includes("/")) {
    return `local/${trimmed}`;
  }
  return trimmed;
};

const deriveFallbackRepoFullName = (repoRoot: string): string => {
  const normalized = repoRoot.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  const basename = segments[segments.length - 1] || "local-repo";
  return `local/${basename}`;
};

const runGit = async (
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string }> => {
  const result = await execFileAsync("git", args, {
    cwd,
    maxBuffer: MAX_BUFFER,
  });
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr?.toString() ?? "",
  };
};

const tryRunGit = async (
  args: string[],
  cwd: string
): Promise<string | null> => {
  try {
    const { stdout } = await runGit(args, cwd);
    return stdout.trim();
  } catch {
    return null;
  }
};

export interface LocalRepoBundle {
  repoRoot: string;
  archive: Buffer;
  diffPatch?: string;
  untrackedFiles: Array<{ relativePath: string; content: Buffer }>;
}

const collectGitRepoInfo = async (
  repoPath: string
): Promise<{
  repoRoot: string;
  repoFullName: string;
  repoUrl?: string;
  provider: LocalRepoInspectResponse["provider"];
  currentBranch?: string;
  defaultBranch?: string;
}> => {
  const { stdout: rootStdout } = await runGit(
    ["rev-parse", "--show-toplevel"],
    repoPath
  );
  const repoRoot = rootStdout.trim();
  const remoteUrl = await tryRunGit(
    ["config", "--get", "remote.origin.url"],
    repoRoot
  );
  let repoFullName: string;
  let provider: LocalRepoInspectResponse["provider"] = "unknown";
  if (remoteUrl) {
    try {
      const parsed = parseGithubRepoUrl(remoteUrl);
      if (parsed?.fullName) {
        repoFullName = parsed.fullName;
        provider =
          (parsed.provider as LocalRepoInspectResponse["provider"]) ||
          "github";
      } else {
        repoFullName = sanitizeRepoFullName(remoteUrl);
      }
    } catch {
      repoFullName = sanitizeRepoFullName(remoteUrl);
    }
  } else {
    repoFullName = deriveFallbackRepoFullName(repoRoot);
  }
  const currentBranch = await tryRunGit(
    ["rev-parse", "--abbrev-ref", "HEAD"],
    repoRoot
  );
  let defaultBranch: string | null = null;
  const remoteHead = await tryRunGit(
    ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    repoRoot
  );
  if (remoteHead) {
    const parts = remoteHead.split("/");
    defaultBranch = parts[parts.length - 1] || null;
  }
  if (!defaultBranch) {
    defaultBranch = await tryRunGit(
      ["config", "--get", "init.defaultBranch"],
      repoRoot
    );
  }
  return {
    repoRoot,
    repoFullName,
    repoUrl: remoteUrl ?? undefined,
    provider,
    currentBranch: currentBranch ?? undefined,
    defaultBranch: defaultBranch ?? undefined,
  };
};

export async function listLocalPathSuggestions(
  query: string
): Promise<LocalPathSuggestion[]> {
  try {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const expanded = expandPath(trimmed);
    const hasTrailing =
      trimmed.endsWith("/") ||
      trimmed.endsWith("\\") ||
      (isWindows && trimmed.match(/^[a-zA-Z]:$/));
    const baseDir = hasTrailing
      ? expanded
      : path.dirname(expanded) || expanded;
    const partial = hasTrailing ? "" : path.basename(expanded);
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    const lowerPartial = partial.toLowerCase();
    const matches = entries
      .filter((entry) => entry.isDirectory())
      .filter((entry) =>
        entry.name.toLowerCase().startsWith(lowerPartial.toLowerCase())
      )
      .slice(0, 12);
    const suggestions: LocalPathSuggestion[] = [];
    for (const entry of matches) {
      const fullPath = path.join(baseDir, entry.name);
      let isRepo = false;
      try {
        const stat = await fs.stat(path.join(fullPath, ".git"));
        isRepo = stat.isDirectory();
      } catch {
        isRepo = false;
      }
      suggestions.push({
        path: fullPath,
        displayPath: formatDisplayPath(fullPath),
        isRepository: isRepo,
      });
    }
    return suggestions;
  } catch (error) {
    serverLogger.warn("Failed to list local path suggestions:", error);
    return [];
  }
}

export async function inspectLocalRepoPath(
  pathInput: string
): Promise<LocalRepoInspectResponse> {
  try {
    const resolvedPath = expandPath(pathInput);
    const stat = await fs.stat(resolvedPath);
    if (!stat.isDirectory()) {
      return {
        success: false,
        error: "Path is not a directory",
      };
    }
    const { repoRoot, repoFullName, repoUrl, provider, currentBranch, defaultBranch } =
      await collectGitRepoInfo(resolvedPath);
    return {
      success: true,
      path: resolvedPath,
      repoRoot,
      displayPath: formatDisplayPath(repoRoot),
      repoFullName,
      repoUrl,
      provider,
      currentBranch,
      defaultBranch,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to inspect repository",
    };
  }
}

export async function getLocalRepoBranches(
  pathInput: string
): Promise<LocalRepoBranchesResponse> {
  try {
    const resolvedPath = expandPath(pathInput);
    const { repoRoot, currentBranch, defaultBranch } =
      await collectGitRepoInfo(resolvedPath);
    const { stdout } = await runGit(
      ["for-each-ref", "--format=%(refname:short)", "refs/heads/"],
      repoRoot
    );
    const branches = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((name) => ({
        name,
        isCurrent: currentBranch === name,
      }));
    return {
      success: true,
      branches,
      currentBranch: currentBranch ?? undefined,
      defaultBranch: defaultBranch ?? undefined,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to list local branches",
    };
  }
}

const createArchiveBuffer = (repoRoot: string): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const git = spawn("git", ["archive", "--format=tar", "HEAD"], {
      cwd: repoRoot,
    });
    const chunks: Buffer[] = [];
    let stderr = "";
    git.stdout.on("data", (chunk) => {
      chunks.push(Buffer.from(chunk));
    });
    git.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    git.on("error", (error) => {
      reject(error);
    });
    git.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(
          new Error(
            stderr ? stderr.trim() : `git archive exited with code ${code}`
          )
        );
      }
    });
  });
};

export async function createLocalRepoBundle(
  pathInput: string
): Promise<LocalRepoBundle> {
  const resolvedPath = expandPath(pathInput);
  const { repoRoot } = await collectGitRepoInfo(resolvedPath);
  const archive = await createArchiveBuffer(repoRoot);
  let diffPatch: string | undefined;
  try {
    const { stdout } = await runGit(
      ["diff", "--binary", "HEAD"],
      repoRoot
    );
    diffPatch = stdout.trim() ? stdout : undefined;
  } catch (error) {
    serverLogger.warn("Failed to collect diff patch:", error);
  }
  const untrackedFiles: Array<{ relativePath: string; content: Buffer }> = [];
  try {
    const { stdout } = await runGit(
      ["ls-files", "--others", "--exclude-standard", "-z"],
      repoRoot
    );
    if (stdout) {
      const files = stdout.split("\0").filter(Boolean);
      for (const relativePath of files) {
        const absolute = path.join(repoRoot, relativePath);
        const fileStat = await fs.stat(absolute);
        if (fileStat.isFile()) {
          const content = await fs.readFile(absolute);
          untrackedFiles.push({
            relativePath,
            content,
          });
        }
      }
    }
  } catch (error) {
    serverLogger.warn("Failed to collect untracked files:", error);
  }
  return {
    repoRoot,
    archive,
    diffPatch,
    untrackedFiles,
  };
}

export async function applyBundleToLocalWorktree(
  bundle: LocalRepoBundle,
  worktreePath: string
) {
  await runGit(["reset", "--hard"], worktreePath);
  await runGit(["clean", "-fdx"], worktreePath);
  await new Promise<void>((resolve, reject) => {
    const archiveStream = Readable.from(bundle.archive);
    const extract = tar.x({
      cwd: worktreePath,
    });
    archiveStream.pipe(extract);
    extract.on("error", reject);
    extract.on("close", () => resolve());
  });
  if (bundle.diffPatch) {
    const patchPath = path.join(worktreePath, ".cmux-local.patch");
    await fs.writeFile(patchPath, bundle.diffPatch);
    try {
      await runGit(
        ["apply", "--allow-empty", "--whitespace=nowarn", patchPath],
        worktreePath
      );
    } finally {
      await fs.rm(patchPath, { force: true });
    }
  }
  for (const file of bundle.untrackedFiles) {
    const destination = path.join(worktreePath, file.relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, file.content);
  }
}
