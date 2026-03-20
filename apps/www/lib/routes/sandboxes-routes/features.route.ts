/**
 * Sandbox Features Routes
 *
 * Additional sandbox feature endpoints:
 * - POST /sandboxes/{id}/discover-repos - Discover git repositories
 * - POST /sandboxes/{id}/live-diff - Get live git diff
 */

import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
  z,
  getAccessTokenFromRequest,
  getInstanceById,
} from "./_helpers";
import { getMorphClientOrNull } from "./_helpers";

export const sandboxesFeaturesRouter = new OpenAPIHono();

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse a git remote URL to extract owner/repo format.
 * Supports:
 * - https://github.com/owner/repo.git
 * - git@github.com:owner/repo.git
 * - https://github.com/owner/repo
 */
function parseGitRemoteUrl(url: string): string | null {
  // HTTPS URL: https://github.com/owner/repo.git or https://github.com/owner/repo
  // Use non-greedy match to support repo names with dots (e.g., next.js)
  const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/)?$/);
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  // SSH URL: git@github.com:owner/repo.git
  const sshMatch = url.match(/git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?(?:\/)?$/);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }

  return null;
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /sandboxes/{id}/discover-repos
 * Discover git repositories in sandbox workspace.
 */
sandboxesFeaturesRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/sandboxes/{id}/discover-repos",
    tags: ["Sandboxes"],
    summary: "Discover git repositories in sandbox workspace",
    description: "Scans the sandbox workspace for git repositories and returns their GitHub remote URLs in owner/repo format.",
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              workspacePath: z.string().optional().describe("Path to scan for repos (default: /root/workspace)"),
            }),
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              repos: z.array(z.string()).describe("Array of discovered repos in owner/repo format"),
              paths: z.array(z.object({
                path: z.string(),
                repo: z.string().nullable(),
              })).describe("Detailed info about each discovered .git directory"),
            }),
          },
        },
        description: "Discovered repositories",
      },
      400: { description: "Invalid workspace path" },
      401: { description: "Unauthorized" },
      404: { description: "Sandbox not found" },
      500: { description: "Failed to discover repos" },
    },
  }),
  async (c) => {
    const id = c.req.valid("param").id;
    const body = c.req.valid("json");
    const rawWorkspacePath = body.workspacePath ?? "/root/workspace";

    // Sanitize workspacePath to prevent shell injection
    // Only allow alphanumeric, /, -, _, and . characters (standard path characters)
    if (!/^[a-zA-Z0-9/_.-]+$/.test(rawWorkspacePath)) {
      return c.text("Invalid workspace path: contains disallowed characters", 400);
    }
    const workspacePath = rawWorkspacePath;

    const token = await getAccessTokenFromRequest(c.req.raw);
    if (!token) return c.text("Unauthorized", 401);

    try {
      // Get instance via provider dispatch
      const sandbox = await getInstanceById(id, getMorphClientOrNull());

      // Find all .git directories in the workspace
      const findResult = await sandbox.exec(
        `find "${workspacePath}" -maxdepth 3 -name ".git" -type d 2>/dev/null || true`,
        { timeoutMs: 10_000 }
      );

      const gitDirs = findResult.stdout
        .split("\n")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      // For each .git directory, get the remote URL
      const pathsWithRepos: Array<{ path: string; repo: string | null }> = [];
      const repos = new Set<string>();

      for (const gitDir of gitDirs) {
        // Get the parent directory (the actual repo directory)
        const repoDir = gitDir.replace(/\/\.git$/, "");

        try {
          const remoteResult = await sandbox.exec(
            `git -C "${repoDir}" remote get-url origin 2>/dev/null || echo ""`,
            { timeoutMs: 5_000 }
          );

          const remoteUrl = remoteResult.stdout.trim();
          const repo = remoteUrl ? parseGitRemoteUrl(remoteUrl) : null;

          pathsWithRepos.push({ path: repoDir, repo });

          if (repo) {
            repos.add(repo);
          }
        } catch {
          // If we can't get remote URL, skip this repo
          pathsWithRepos.push({ path: repoDir, repo: null });
        }
      }

      return c.json({
        repos: Array.from(repos),
        paths: pathsWithRepos,
      });
    } catch (error) {
      // Check if error indicates sandbox not found
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes("not found") ||
        errorMessage.includes("does not exist") ||
        errorMessage.includes("404")
      ) {
        return c.text("Sandbox not found", 404);
      }
      console.error("[sandboxes.discover-repos] Failed to discover repos:", error);
      return c.text("Failed to discover repos", 500);
    }
  },
);

/**
 * POST /sandboxes/{id}/live-diff
 * Get live git diff from sandbox (uncommitted changes).
 */
sandboxesFeaturesRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/sandboxes/{id}/live-diff",
    tags: ["Sandboxes"],
    summary: "Get live git diff from sandbox",
    description: "Returns uncommitted changes (staged + unstaged) from the sandbox git repository.",
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              workspacePath: z.string().optional().describe("Path to scan for repos (default: /root/workspace)"),
              includeContent: z.boolean().optional().describe("Include full diff content (default: false, stats only)"),
              maxContentLength: z.number().optional().describe("Max diff content length in bytes (default: 100000)"),
            }),
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              files: z.array(z.object({
                path: z.string(),
                status: z.enum(["added", "modified", "deleted", "renamed", "untracked"]),
                insertions: z.number(),
                deletions: z.number(),
              })).describe("Changed files with stats"),
              summary: z.object({
                totalFiles: z.number(),
                insertions: z.number(),
                deletions: z.number(),
              }),
              diff: z.string().optional().describe("Full diff content (if includeContent=true)"),
              truncated: z.boolean().optional().describe("True if diff was truncated"),
            }),
          },
        },
        description: "Live diff from sandbox",
      },
      400: { description: "Invalid workspace path" },
      401: { description: "Unauthorized" },
      404: { description: "Sandbox not found" },
      500: { description: "Failed to get diff" },
    },
  }),
  async (c) => {
    const id = c.req.valid("param").id;
    const body = c.req.valid("json");
    const rawWorkspacePath = body.workspacePath ?? "/root/workspace";
    const includeContent = body.includeContent ?? false;
    const maxContentLength = body.maxContentLength ?? 100_000;

    // Sanitize workspacePath
    if (!/^[a-zA-Z0-9/_.-]+$/.test(rawWorkspacePath)) {
      return c.text("Invalid workspace path: contains disallowed characters", 400);
    }
    const workspacePath = rawWorkspacePath;

    const token = await getAccessTokenFromRequest(c.req.raw);
    if (!token) return c.text("Unauthorized", 401);

    try {
      const sandbox = await getInstanceById(id, getMorphClientOrNull());

      // Get diff stats (--numstat gives insertions/deletions per file)
      // Include both staged and unstaged changes
      const statsResult = await sandbox.exec(
        `cd "${workspacePath}" && git diff --numstat HEAD 2>/dev/null || git diff --numstat 2>/dev/null || echo ""`,
        { timeoutMs: 15_000 }
      );

      // Get untracked files
      const untrackedResult = await sandbox.exec(
        `cd "${workspacePath}" && git ls-files --others --exclude-standard 2>/dev/null || echo ""`,
        { timeoutMs: 10_000 }
      );

      // Parse diff stats
      const files: Array<{
        path: string;
        status: "added" | "modified" | "deleted" | "renamed" | "untracked";
        insertions: number;
        deletions: number;
      }> = [];

      let totalInsertions = 0;
      let totalDeletions = 0;

      // Parse numstat output: insertions\tdeletions\tfilename
      for (const line of statsResult.stdout.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const parts = trimmed.split("\t");
        if (parts.length >= 3) {
          const ins = parts[0] === "-" ? 0 : parseInt(parts[0], 10) || 0;
          const del = parts[1] === "-" ? 0 : parseInt(parts[1], 10) || 0;
          const filePath = parts.slice(2).join("\t"); // Handle filenames with tabs

          files.push({
            path: filePath,
            status: del > 0 && ins === 0 ? "deleted" : ins > 0 && del === 0 ? "added" : "modified",
            insertions: ins,
            deletions: del,
          });

          totalInsertions += ins;
          totalDeletions += del;
        }
      }

      // Add untracked files
      for (const line of untrackedResult.stdout.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Check if not already in files list
        if (!files.some((f) => f.path === trimmed)) {
          files.push({
            path: trimmed,
            status: "untracked",
            insertions: 0,
            deletions: 0,
          });
        }
      }

      const response: {
        files: typeof files;
        summary: { totalFiles: number; insertions: number; deletions: number };
        diff?: string;
        truncated?: boolean;
      } = {
        files,
        summary: {
          totalFiles: files.length,
          insertions: totalInsertions,
          deletions: totalDeletions,
        },
      };

      // Optionally include full diff content
      if (includeContent && files.length > 0) {
        const diffResult = await sandbox.exec(
          `cd "${workspacePath}" && git diff HEAD 2>/dev/null || git diff 2>/dev/null || echo ""`,
          { timeoutMs: 30_000 }
        );

        const diffContent = diffResult.stdout;
        if (diffContent.length > maxContentLength) {
          response.diff = diffContent.substring(0, maxContentLength);
          response.truncated = true;
        } else {
          response.diff = diffContent;
          response.truncated = false;
        }
      }

      return c.json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes("not found") ||
        errorMessage.includes("does not exist") ||
        errorMessage.includes("404")
      ) {
        return c.text("Sandbox not found", 404);
      }
      console.error("[sandboxes.live-diff] Failed to get diff:", error);
      return c.text("Failed to get diff", 500);
    }
  },
);
