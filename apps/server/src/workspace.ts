import { api } from "@cmux/convex/api";
import { createHash } from "node:crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { RepositoryManager } from "./repositoryManager";
import { getConvex } from "./utils/convexClient";
import { serverLogger } from "./utils/fileLogger";

interface WorkspaceResult {
  success: boolean;
  worktreePath?: string;
  error?: string;
}

type WorktreeMode = "legacy" | "codex-style";

interface WorktreeInfo {
  appDataPath: string;
  projectsPath: string;
  projectPath: string;
  originPath: string;
  worktreesPath: string;
  worktreePath: string;
  repoName: string;
  branch: string;
  mode: WorktreeMode;
  shortId?: string;
  sourceRepoPath?: string;
  projectFullName?: string;
}

const DEFAULT_CODEX_WORKTREE_PATTERN =
  "~/.cmux/worktrees/{short-id}/{repo-name}";

async function getAppDataPath(): Promise<string> {
  const appName = "manaflow3";
  const platform = process.platform;

  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", appName);
  } else if (platform === "win32") {
    return path.join(process.env.APPDATA || "", appName);
  } else {
    return path.join(os.homedir(), ".config", appName);
  }
}

function extractRepoName(repoUrl: string): string {
  const match = repoUrl.match(/([^/]+)\.git$/);
  if (match) {
    return match[1];
  }

  const parts = repoUrl.split("/");
  return parts[parts.length - 1] || "unknown-repo";
}

function extractProjectFullName(repoUrl: string): string | null {
  try {
    const parsed = new URL(repoUrl);
    const cleanedPath = parsed.pathname.replace(/^\/+/, "").replace(/\.git$/, "");
    const parts = cleanedPath.split("/").filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
    }
  } catch {
    // Continue with SCP-like parsing.
  }

  const scpLikeMatch = repoUrl.match(
    /^[^@]+@[^:]+:([^/]+\/[^/]+?)(?:\.git)?$/
  );
  if (scpLikeMatch) {
    return scpLikeMatch[1];
  }

  const slashMatch = repoUrl.match(/([^/]+\/[^/]+?)(?:\.git)?$/);
  if (slashMatch) {
    return slashMatch[1];
  }

  return null;
}

function expandHomePath(inputPath: string): string {
  return inputPath.replace(/^~(?=$|[\\/])/, os.homedir());
}

function resolveLegacyProjectsPath(
  settings: { worktreePath?: string } | null
): string {
  if (settings?.worktreePath) {
    return path.resolve(expandHomePath(settings.worktreePath));
  }
  return path.join(os.homedir(), "cmux");
}

function deriveShortId(seed: string): string {
  return createHash("sha256").update(seed).digest("hex").slice(0, 8);
}

function renderCodexWorktreePath(args: {
  pattern: string;
  shortId: string;
  repoName: string;
  branch: string;
}): string {
  const withTokens = args.pattern
    .replaceAll("{short-id}", args.shortId)
    .replaceAll("{repo-name}", args.repoName)
    .replaceAll("{branch}", args.branch);
  return path.resolve(expandHomePath(withTokens));
}

function buildLegacyWorktreeInfo(args: {
  repoUrl: string;
  branch: string;
  projectsPath: string;
}): WorktreeInfo {
  const repoName = extractRepoName(args.repoUrl);
  const projectPath = path.join(args.projectsPath, repoName);
  const originPath = path.join(projectPath, "origin");
  const worktreesPath = path.join(projectPath, "worktrees");
  const worktreePath = path.join(worktreesPath, args.branch);
  const projectFullName = extractProjectFullName(args.repoUrl) ?? undefined;

  return {
    appDataPath: "",
    projectsPath: args.projectsPath,
    projectPath,
    originPath,
    worktreesPath,
    worktreePath,
    repoName,
    branch: args.branch,
    mode: "legacy",
    projectFullName,
  };
}

async function getWorktreePathCodexStyle(
  args: { repoUrl: string; branch: string },
  teamSlugOrId: string,
  settings: { codexWorktreePathPattern?: string } | null
): Promise<WorktreeInfo | null> {
  const projectFullName = extractProjectFullName(args.repoUrl);
  if (!projectFullName) {
    return null;
  }

  const mapping = await getConvex().query(api.sourceRepoMappings.getByProject, {
    teamSlugOrId,
    projectFullName,
  });
  if (!mapping?.localRepoPath) {
    return null;
  }

  const repoName = extractRepoName(args.repoUrl);
  const shortId = deriveShortId(`${projectFullName}:${args.branch}`);
  const pattern =
    settings?.codexWorktreePathPattern?.trim() ||
    DEFAULT_CODEX_WORKTREE_PATTERN;
  const worktreePath = renderCodexWorktreePath({
    pattern,
    shortId,
    repoName,
    branch: args.branch,
  });
  const worktreesPath = path.dirname(worktreePath);
  const projectPath = worktreesPath;
  const projectsPath = path.dirname(worktreesPath);

  return {
    appDataPath: "",
    projectsPath,
    projectPath,
    originPath: expandHomePath(mapping.localRepoPath),
    worktreesPath,
    worktreePath,
    repoName,
    branch: args.branch,
    mode: "codex-style",
    shortId,
    sourceRepoPath: expandHomePath(mapping.localRepoPath),
    projectFullName,
  };
}

async function registerWorktreeIfPossible(args: {
  teamSlugOrId?: string;
  worktreeInfo: WorktreeInfo;
}): Promise<void> {
  if (!args.teamSlugOrId) {
    return;
  }

  const sourceRepoPath = args.worktreeInfo.sourceRepoPath ?? args.worktreeInfo.originPath;
  const resolvedWorktreePath = path.resolve(args.worktreeInfo.worktreePath);
  const resolvedSourceRepoPath = path.resolve(sourceRepoPath);
  const shortId =
    args.worktreeInfo.shortId ??
    deriveShortId(`${args.worktreeInfo.repoName}:${args.worktreeInfo.branch}`);
  const projectFullName =
    args.worktreeInfo.projectFullName ?? args.worktreeInfo.repoName;

  try {
    await getConvex().mutation(api.worktreeRegistry.register, {
      teamSlugOrId: args.teamSlugOrId,
      worktreePath: resolvedWorktreePath,
      sourceRepoPath: resolvedSourceRepoPath,
      projectFullName,
      branchName: args.worktreeInfo.branch,
      shortId,
      mode: args.worktreeInfo.mode,
    });
  } catch (error) {
    serverLogger.warn(
      `Failed to register worktree at ${args.worktreeInfo.worktreePath}:`,
      error
    );
  }
}

async function markSourceRepoVerifiedIfPossible(args: {
  teamSlugOrId?: string;
  worktreeInfo: WorktreeInfo;
}): Promise<void> {
  if (
    !args.teamSlugOrId ||
    args.worktreeInfo.mode !== "codex-style" ||
    !args.worktreeInfo.projectFullName ||
    !args.worktreeInfo.sourceRepoPath
  ) {
    return;
  }

  try {
    await getConvex().mutation(api.sourceRepoMappings.upsert, {
      teamSlugOrId: args.teamSlugOrId,
      projectFullName: args.worktreeInfo.projectFullName,
      localRepoPath: path.resolve(args.worktreeInfo.sourceRepoPath),
      lastVerifiedAt: Date.now(),
    });
  } catch (error) {
    serverLogger.warn(
      `Failed to update source repo verification for ${args.worktreeInfo.projectFullName}:`,
      error
    );
  }
}

export async function getWorktreePath(
  args: {
    repoUrl: string;
    branch: string;
  },
  teamSlugOrId: string
): Promise<WorktreeInfo> {
  const settings = await getConvex().query(api.workspaceSettings.get, {
    teamSlugOrId,
  });

  const configuredMode: WorktreeMode = settings?.worktreeMode ?? "legacy";

  let info: WorktreeInfo | null = null;
  if (configuredMode === "codex-style") {
    info = await getWorktreePathCodexStyle(args, teamSlugOrId, settings);
    if (!info) {
      serverLogger.warn(
        `Codex-style mode enabled but no source mapping found for ${args.repoUrl}; falling back to legacy mode`
      );
    }
  }

  const appDataPath = await getAppDataPath();
  if (info) {
    info.appDataPath = appDataPath;
    return info;
  }

  const legacyInfo = buildLegacyWorktreeInfo({
    repoUrl: args.repoUrl,
    branch: args.branch,
    projectsPath: resolveLegacyProjectsPath(settings),
  });
  legacyInfo.appDataPath = appDataPath;
  return legacyInfo;
}

export async function getProjectPaths(
  repoUrl: string,
  teamSlugOrId: string
): Promise<{
  appDataPath: string;
  projectsPath: string;
  projectPath: string;
  originPath: string;
  worktreesPath: string;
  repoName: string;
}> {
  const settings = await getConvex().query(api.workspaceSettings.get, {
    teamSlugOrId,
  });

  const projectsPath = resolveLegacyProjectsPath(settings);

  const repoName = extractRepoName(repoUrl);
  const projectPath = path.join(projectsPath, repoName);
  const originPath = path.join(projectPath, "origin");
  const worktreesPath = path.join(projectPath, "worktrees");
  const appDataPath = await getAppDataPath();

  return {
    appDataPath,
    projectsPath,
    projectPath,
    originPath,
    worktreesPath,
    repoName,
  };
}

export async function setupProjectWorkspace(args: {
  repoUrl: string;
  branch?: string;
  worktreeInfo: WorktreeInfo;
  /** Optional authenticated URL for git operations (with embedded token). repoUrl is stored as remote. */
  authenticatedRepoUrl?: string;
  teamSlugOrId?: string;
}): Promise<WorkspaceResult> {
  try {
    const { worktreeInfo } = args;
    const repoManager = RepositoryManager.getInstance();

    if (worktreeInfo.mode === "codex-style") {
      if (!worktreeInfo.sourceRepoPath) {
        throw new Error("Codex-style worktree requires sourceRepoPath");
      }

      await fs.mkdir(path.dirname(worktreeInfo.worktreePath), { recursive: true });

      const baseBranch =
        args.branch ||
        (await repoManager.getDefaultBranch(worktreeInfo.sourceRepoPath));

      try {
        await repoManager.prewarmCommitHistory(
          worktreeInfo.sourceRepoPath,
          baseBranch,
          undefined,
          args.authenticatedRepoUrl
        );
      } catch (e) {
        serverLogger.warn("Prewarm commit history failed:", e);
      }

      const actualPath = await repoManager.createWorktreeFromLocalRepo(
        worktreeInfo.sourceRepoPath,
        worktreeInfo.worktreePath,
        worktreeInfo.branch,
        baseBranch,
        args.authenticatedRepoUrl
      );
      if (actualPath && actualPath !== worktreeInfo.worktreePath) {
        serverLogger.info(
          `Worktree path resolved to ${actualPath} for branch ${worktreeInfo.branch}`
        );
        worktreeInfo.worktreePath = actualPath;
      }

      await markSourceRepoVerifiedIfPossible({
        teamSlugOrId: args.teamSlugOrId,
        worktreeInfo,
      });
      await registerWorktreeIfPossible({
        teamSlugOrId: args.teamSlugOrId,
        worktreeInfo,
      });
      return { success: true, worktreePath: worktreeInfo.worktreePath };
    }

    // Normalize worktree path to avoid accidental extra folders like "cmux/<branch>"
    const normalizedWorktreePath = path.join(
      worktreeInfo.worktreesPath,
      worktreeInfo.branch
    );
    if (worktreeInfo.worktreePath !== normalizedWorktreePath) {
      serverLogger.info(
        `Normalizing worktree path from ${worktreeInfo.worktreePath} to ${normalizedWorktreePath}`
      );
      worktreeInfo.worktreePath = normalizedWorktreePath;
    }

    await fs.mkdir(worktreeInfo.projectPath, { recursive: true });
    await fs.mkdir(worktreeInfo.worktreesPath, { recursive: true });

    // Use RepositoryManager to handle clone/fetch with deduplication
    // If authenticatedRepoUrl provided, use it for git operations but store clean repoUrl as remote
    await repoManager.ensureRepository(
      args.authenticatedRepoUrl ?? args.repoUrl,
      worktreeInfo.originPath,
      args.branch,
      args.authenticatedRepoUrl ? args.repoUrl : undefined
    );

    // Get the default branch if not specified
    const baseBranch =
      args.branch ||
      (await repoManager.getDefaultBranch(worktreeInfo.originPath));

    // Prewarm commit history at origin for fast merge-base computation
    try {
      await repoManager.prewarmCommitHistory(
        worktreeInfo.originPath,
        baseBranch,
        undefined,
        args.authenticatedRepoUrl
      );
    } catch (e) {
      serverLogger.warn("Prewarm commit history failed:", e);
    }

    // If a worktree for this branch already exists anywhere, reuse it
    try {
      const existingByBranch = await repoManager.findWorktreeUsingBranch(
        worktreeInfo.originPath,
        worktreeInfo.branch
      );
      if (existingByBranch) {
        if (existingByBranch !== worktreeInfo.worktreePath) {
          serverLogger.info(
            `Reusing existing worktree for ${worktreeInfo.branch} at ${existingByBranch}`
          );
          worktreeInfo.worktreePath = existingByBranch;
        } else {
          serverLogger.info(
            `Worktree for ${worktreeInfo.branch} already registered at ${existingByBranch}`
          );
        }
        // Ensure configuration and hooks are present
        await repoManager.ensureWorktreeConfigured(
          worktreeInfo.worktreePath,
          worktreeInfo.branch
        );
      }
    } catch (e) {
      serverLogger.warn(
        `Failed checking for existing worktree for ${worktreeInfo.branch}:`,
        e
      );
    }

    // Check if worktree already exists in git
    const worktreeRegistered = await repoManager.worktreeExists(
      worktreeInfo.originPath,
      worktreeInfo.worktreePath
    );

    if (worktreeRegistered) {
      // Check if the directory actually exists AND is a valid git worktree
      let isValidWorktree = false;
      try {
        await fs.access(worktreeInfo.worktreePath);
        // Also verify it's actually a git worktree by checking for .git file/directory
        const gitPath = path.join(worktreeInfo.worktreePath, ".git");
        const gitStat = await fs.stat(gitPath);
        // Worktrees have a .git file (not directory) pointing to the main repo
        isValidWorktree = gitStat.isFile() || gitStat.isDirectory();
      } catch {
        isValidWorktree = false;
      }

      if (isValidWorktree) {
        serverLogger.info(
          `Worktree already exists at ${worktreeInfo.worktreePath}, using existing`
        );
      } else {
        // Worktree is registered but directory doesn't exist or is invalid, remove and recreate
        serverLogger.info(
          `Worktree registered but directory missing or invalid, recreating...`
        );
        try {
          await repoManager.removeWorktree(
            worktreeInfo.originPath,
            worktreeInfo.worktreePath
          );
        } catch (removeErr) {
          // Log but continue - the worktree may already be in a broken state
          serverLogger.warn(
            `Failed to remove stale worktree registration: ${removeErr}`
          );
        }
        // Also clean up the directory if it exists but is invalid
        try {
          await fs.rm(worktreeInfo.worktreePath, { recursive: true, force: true });
        } catch {
          // Ignore - directory may not exist
        }
        const actualPath = await repoManager.createWorktree(
          worktreeInfo.originPath,
          worktreeInfo.worktreePath,
          worktreeInfo.branch,
          baseBranch
        );
        if (actualPath && actualPath !== worktreeInfo.worktreePath) {
          serverLogger.info(
            `Worktree path resolved to ${actualPath} for branch ${worktreeInfo.branch}`
          );
          worktreeInfo.worktreePath = actualPath;
        }
      }
    } else {
      // Worktree not registered - but directory might exist from a previous broken state
      // Clean it up first to avoid conflicts
      try {
        const dirExists = await fs.access(worktreeInfo.worktreePath).then(() => true).catch(() => false);
        if (dirExists) {
          serverLogger.info(
            `Directory exists at ${worktreeInfo.worktreePath} but not registered as worktree, cleaning up...`
          );
          await fs.rm(worktreeInfo.worktreePath, { recursive: true, force: true });
        }
      } catch {
        // Ignore cleanup errors
      }

      // Create the worktree
      const actualPath = await repoManager.createWorktree(
        worktreeInfo.originPath,
        worktreeInfo.worktreePath,
        worktreeInfo.branch,
        baseBranch
      );
      if (actualPath && actualPath !== worktreeInfo.worktreePath) {
        serverLogger.info(
          `Worktree path resolved to ${actualPath} for branch ${worktreeInfo.branch}`
        );
        worktreeInfo.worktreePath = actualPath;
      }
    }

    await registerWorktreeIfPossible({
      teamSlugOrId: args.teamSlugOrId,
      worktreeInfo,
    });
    return { success: true, worktreePath: worktreeInfo.worktreePath };
  } catch (error) {
    serverLogger.error("Failed to setup workspace:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
