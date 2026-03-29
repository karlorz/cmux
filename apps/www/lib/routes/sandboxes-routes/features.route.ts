/**
 * Sandbox Features Routes
 *
 * Additional sandbox feature endpoints:
 * - POST /sandboxes/{id}/discover-repos - Discover git repositories
 * - POST /sandboxes/{id}/live-diff - Get live git diff
 * - GET /sandboxes/{id}/live-diff/{path} - Get live diff for a single file
 * - POST /sandboxes/{id}/publish-devcontainer - Expose devcontainer ports
 * - GET /sandboxes/{id}/ssh - Get SSH connection details
 */

import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
  z,
  getAccessTokenFromRequest,
  getUserFromRequest,
  getInstanceById,
  getMorphClient,
  getMorphClientOrNull,
  getConvex,
  isPveLxcInstanceId,
  env,
  api,
  RESERVED_CMUX_PORT_SET,
  verifyTeamAccess,
  verifyInstanceOwnership,
  type Id,
  type Doc,
  type SandboxInstance,
} from "./_helpers";
import { HTTPException } from "hono/http-exception";
import type { ReplaceDiffEntry } from "@cmux/shared/diff-types";
import { singleQuote } from "../sandboxes/shell";

export const sandboxesFeaturesRouter = new OpenAPIHono();

const LIVE_DIFF_DEFAULT_MAX_BYTES = 100_000;

type LiveDiffFileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "untracked";

type LiveDiffFile = {
  path: string;
  oldPath?: string;
  status: LiveDiffFileStatus;
  insertions: number;
  deletions: number;
  isBinary: boolean;
};

const LiveDiffFileSchema = z.object({
  path: z.string(),
  oldPath: z.string().optional(),
  status: z.enum(["added", "modified", "deleted", "renamed", "untracked"]),
  insertions: z.number(),
  deletions: z.number(),
  isBinary: z.boolean(),
});

const ReplaceDiffEntrySchema = z.object({
  filePath: z.string(),
  oldPath: z.string().optional(),
  status: z.enum(["added", "modified", "deleted", "renamed"]),
  additions: z.number(),
  deletions: z.number(),
  patch: z.string().optional(),
  oldContent: z.string().optional(),
  newContent: z.string().optional(),
  isBinary: z.boolean(),
  contentOmitted: z.boolean().optional(),
  oldSize: z.number().optional(),
  newSize: z.number().optional(),
  patchSize: z.number().optional(),
});

const LiveDiffResponseSchema = z.object({
  files: z.array(LiveDiffFileSchema).describe("Changed files with stats"),
  summary: z.object({
    totalFiles: z.number(),
    insertions: z.number(),
    deletions: z.number(),
  }),
  mode: z.enum(["full", "file_list_only"]),
  totalDiffBytes: z.number(),
  entries: z.array(ReplaceDiffEntrySchema).optional(),
});

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


function decodeLiveDiffPath(rawPath: string): string {
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath;
  }
}

function parseTrackedStatusMap(output: string): Map<string, LiveDiffFile> {
  const byPath = new Map<string, LiveDiffFile>();

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const parts = trimmed.split("\t");
    const statusCode = parts[0] ?? "";
    const normalizedCode = statusCode.charAt(0);

    if (normalizedCode === "R" && parts.length >= 3) {
      const oldPath = parts[1];
      const path = parts[2];
      byPath.set(path, {
        path,
        oldPath,
        status: "renamed",
        insertions: 0,
        deletions: 0,
        isBinary: false,
      });
      continue;
    }

    const path = parts[1];
    if (!path) {
      continue;
    }

    const status: LiveDiffFileStatus =
      normalizedCode === "A"
        ? "added"
        : normalizedCode === "D"
          ? "deleted"
          : "modified";

    byPath.set(path, {
      path,
      status,
      insertions: 0,
      deletions: 0,
      isBinary: false,
    });
  }

  return byPath;
}

function parseTrackedDiffFiles(
  statusOutput: string,
  numstatOutput: string,
): LiveDiffFile[] {
  const filesByPath = parseTrackedStatusMap(statusOutput);

  for (const line of numstatOutput.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const parts = trimmed.split("\t");
    if (parts.length < 3) {
      continue;
    }

    const rawInsertions = parts[0] ?? "0";
    const rawDeletions = parts[1] ?? "0";
    const isBinary = rawInsertions === "-" || rawDeletions === "-";
    const insertions = isBinary ? 0 : Number.parseInt(rawInsertions, 10) || 0;
    const deletions = isBinary ? 0 : Number.parseInt(rawDeletions, 10) || 0;
    const oldPath = parts.length >= 4 ? parts[2] : undefined;
    const path = parts.length >= 4 ? parts[3] : parts[2];

    if (!path) {
      continue;
    }

    const existing = filesByPath.get(path);
    const status =
      existing?.status ??
      (deletions > 0 && insertions === 0
        ? "deleted"
        : insertions > 0 && deletions === 0
          ? "added"
          : "modified");

    filesByPath.set(path, {
      path,
      oldPath: existing?.oldPath ?? oldPath,
      status,
      insertions,
      deletions,
      isBinary,
    });
  }

  return Array.from(filesByPath.values());
}

async function getUntrackedFileStats(
  sandbox: SandboxInstance,
  workspacePath: string,
  filePath: string,
): Promise<{ insertions: number; bytes: number }> {
  const quotedPath = singleQuote(filePath);
  const [numstatResult, bytesResult] = await Promise.all([
    sandbox.exec(
      `cd "${workspacePath}" && (git diff --no-index --numstat -- /dev/null ${quotedPath} 2>/dev/null || true)`,
      { timeoutMs: 10_000 },
    ),
    sandbox.exec(
      `cd "${workspacePath}" && (wc -c < ${quotedPath} 2>/dev/null || echo 0)`,
      { timeoutMs: 10_000 },
    ),
  ]);

  const numstatLine = numstatResult.stdout.trim().split("\n")[0]?.trim();
  if (numstatLine) {
    const parts = numstatLine.split("\t");
    if (parts.length >= 2) {
      const insertions = Number.parseInt(parts[0] ?? "0", 10) || 0;
      const bytes = Number.parseInt(bytesResult.stdout.trim(), 10) || 0;
      return { insertions, bytes };
    }
  }

  return {
    insertions: 0,
    bytes: Number.parseInt(bytesResult.stdout.trim(), 10) || 0,
  };
}

async function collectLiveDiffSnapshot(
  sandbox: SandboxInstance,
  workspacePath: string,
): Promise<{
  files: LiveDiffFile[];
  summary: { totalFiles: number; insertions: number; deletions: number };
  totalDiffBytes: number;
}> {
  const [statusResult, statsResult, untrackedResult, diffResult] = await Promise.all([
    sandbox.exec(
      `cd "${workspacePath}" && git diff --name-status -M HEAD 2>/dev/null || git diff --name-status -M 2>/dev/null || echo ""`,
      { timeoutMs: 15_000 },
    ),
    sandbox.exec(
      `cd "${workspacePath}" && git diff --numstat -M HEAD 2>/dev/null || git diff --numstat -M 2>/dev/null || echo ""`,
      { timeoutMs: 15_000 },
    ),
    sandbox.exec(
      `cd "${workspacePath}" && git ls-files --others --exclude-standard 2>/dev/null || echo ""`,
      { timeoutMs: 10_000 },
    ),
    sandbox.exec(
      `cd "${workspacePath}" && git diff -M HEAD 2>/dev/null || git diff -M 2>/dev/null || echo ""`,
      { timeoutMs: 30_000 },
    ),
  ]);

  const files = parseTrackedDiffFiles(statusResult.stdout, statsResult.stdout);
  let totalInsertions = files.reduce((sum, file) => sum + file.insertions, 0);
  const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0);
  let totalDiffBytes = diffResult.stdout.length;

  const untrackedFiles = untrackedResult.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const trackedPaths = new Set(files.map((f) => f.path));
  const newUntrackedPaths = untrackedFiles.filter((p) => !trackedPaths.has(p));

  const untrackedStatsList = await Promise.all(
    newUntrackedPaths.map((p) => getUntrackedFileStats(sandbox, workspacePath, p)),
  );

  for (let i = 0; i < newUntrackedPaths.length; i++) {
    const untrackedPath = newUntrackedPaths[i];
    const untrackedStats = untrackedStatsList[i];
    files.push({
      path: untrackedPath,
      status: "untracked",
      insertions: untrackedStats.insertions,
      deletions: 0,
      isBinary: false,
    });
    totalInsertions += untrackedStats.insertions;
    totalDiffBytes += untrackedStats.bytes;
  }

  return {
    files,
    summary: {
      totalFiles: files.length,
      insertions: totalInsertions,
      deletions: totalDeletions,
    },
    totalDiffBytes,
  };
}

async function readSandboxTextFile(
  sandbox: SandboxInstance,
  workspacePath: string,
  filePath: string,
): Promise<string> {
  const quotedPath = singleQuote(filePath);
  const result = await sandbox.exec(
    `cd "${workspacePath}" && (cat -- ${quotedPath} 2>/dev/null || true)`,
    { timeoutMs: 15_000 },
  );
  return result.stdout;
}

async function readSandboxGitHeadFile(
  sandbox: SandboxInstance,
  workspacePath: string,
  filePath: string,
): Promise<string> {
  const quotedHeadPath = singleQuote(`HEAD:${filePath}`);
  const result = await sandbox.exec(
    `cd "${workspacePath}" && (git show ${quotedHeadPath} 2>/dev/null || true)`,
    { timeoutMs: 15_000 },
  );
  return result.stdout;
}

function toReplaceDiffStatus(status: LiveDiffFileStatus): ReplaceDiffEntry["status"] {
  return status === "untracked" ? "added" : status;
}

async function buildLiveDiffEntry(
  sandbox: SandboxInstance,
  workspacePath: string,
  file: LiveDiffFile,
): Promise<ReplaceDiffEntry> {
  if (file.isBinary) {
    return {
      filePath: file.path,
      oldPath: file.oldPath,
      status: toReplaceDiffStatus(file.status),
      additions: file.insertions,
      deletions: file.deletions,
      isBinary: true,
    };
  }

  const oldPath = file.oldPath ?? file.path;
  const [oldContent, newContent] = await Promise.all([
    file.status === "added" || file.status === "untracked"
      ? Promise.resolve("")
      : readSandboxGitHeadFile(sandbox, workspacePath, oldPath),
    file.status === "deleted"
      ? Promise.resolve("")
      : readSandboxTextFile(sandbox, workspacePath, file.path),
  ]);

  return {
    filePath: file.path,
    oldPath: file.oldPath,
    status: toReplaceDiffStatus(file.status),
    additions: file.insertions,
    deletions: file.deletions,
    isBinary: false,
    oldContent,
    newContent,
    contentOmitted: false,
  };
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
              maxContentLength: z.number().optional().describe("Switch to file-list-only mode above this byte threshold (default: 100000)"),
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
            schema: LiveDiffResponseSchema,
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
    const maxContentLength = body.maxContentLength ?? LIVE_DIFF_DEFAULT_MAX_BYTES;

    // Sanitize workspacePath
    if (!/^[a-zA-Z0-9/_.-]+$/.test(rawWorkspacePath)) {
      return c.text("Invalid workspace path: contains disallowed characters", 400);
    }
    const workspacePath = rawWorkspacePath;

    const token = await getAccessTokenFromRequest(c.req.raw);
    if (!token) return c.text("Unauthorized", 401);

    try {
      const sandbox = await getInstanceById(id, getMorphClientOrNull());
      const snapshot = await collectLiveDiffSnapshot(sandbox, workspacePath);
      const mode =
        snapshot.totalDiffBytes > maxContentLength ? "file_list_only" : "full";

      const response: z.infer<typeof LiveDiffResponseSchema> = {
        files: snapshot.files,
        summary: snapshot.summary,
        mode,
        totalDiffBytes: snapshot.totalDiffBytes,
      };

      if (includeContent && mode === "full" && snapshot.files.length > 0) {
        response.entries = await Promise.all(
          snapshot.files.map((file) => buildLiveDiffEntry(sandbox, workspacePath, file)),
        );
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

/**
 * GET /sandboxes/{id}/live-diff/{path}
 * Fetch a single live-diff file entry on demand.
 */
sandboxesFeaturesRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/sandboxes/{id}/live-diff/{path}",
    tags: ["Sandboxes"],
    summary: "Get live diff for a single file",
    request: {
      params: z.object({
        id: z.string(),
        path: z.string().describe("URL-encoded repository-relative file path"),
      }),
      query: z.object({
        workspacePath: z.string().optional().describe("Path to scan for repos (default: /root/workspace)"),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: ReplaceDiffEntrySchema,
          },
        },
        description: "Single-file live diff entry",
      },
      400: { description: "Invalid workspace path" },
      401: { description: "Unauthorized" },
      404: { description: "Sandbox or diff entry not found" },
      500: { description: "Failed to get diff entry" },
    },
  }),
  async (c) => {
    const { id, path } = c.req.valid("param");
    const { workspacePath: rawWorkspacePath = "/root/workspace" } = c.req.valid("query");

    if (!/^[a-zA-Z0-9/_.-]+$/.test(rawWorkspacePath)) {
      return c.text("Invalid workspace path: contains disallowed characters", 400);
    }

    const token = await getAccessTokenFromRequest(c.req.raw);
    if (!token) {
      return c.text("Unauthorized", 401);
    }

    const decodedPath = decodeLiveDiffPath(path);

    try {
      const sandbox = await getInstanceById(id, getMorphClientOrNull());
      const snapshot = await collectLiveDiffSnapshot(sandbox, rawWorkspacePath);
      const file = snapshot.files.find((entry) => entry.path === decodedPath);

      if (!file) {
        return c.text("Live diff entry not found", 404);
      }

      return c.json(await buildLiveDiffEntry(sandbox, rawWorkspacePath, file));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes("not found") ||
        errorMessage.includes("does not exist") ||
        errorMessage.includes("404")
      ) {
        return c.text("Sandbox not found", 404);
      }
      console.error("[sandboxes.live-diff.single-file] Failed to get diff entry:", error);
      return c.text("Failed to get diff entry", 500);
    }
  },
);

// ============================================================================
// Publish Devcontainer Route
// ============================================================================

// Publish devcontainer forwarded ports (read devcontainer.json inside instance, expose, persist to Convex)
sandboxesFeaturesRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/sandboxes/{id}/publish-devcontainer",
    tags: ["Sandboxes"],
    summary:
      "Expose forwarded ports from devcontainer.json and persist networking info",
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              teamSlugOrId: z.string(),
              taskRunId: z.string(),
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
            schema: z.array(
              z.object({
                status: z.enum(["running"]).default("running"),
                port: z.number(),
                url: z.string(),
              }),
            ),
          },
        },
        description: "Exposed ports list",
      },
      401: { description: "Unauthorized" },
      500: { description: "Failed to publish devcontainer networking" },
    },
  }),
  async (c) => {
    const token = await getAccessTokenFromRequest(c.req.raw);
    if (!token) return c.text("Unauthorized", 401);
    const { id } = c.req.valid("param");
    const { teamSlugOrId, taskRunId } = c.req.valid("json");
    try {
      // Get instance via provider dispatch
      const instance = await getInstanceById(id, getMorphClientOrNull());

      const isPveLxc = isPveLxcInstanceId(id);

      const reservedPorts = RESERVED_CMUX_PORT_SET;

      // Attempt to read devcontainer.json for declared forwarded ports
      const devcontainerJson = await instance.exec(
        "cat /root/workspace/.devcontainer/devcontainer.json",
      );
      const parsed =
        devcontainerJson.exit_code === 0
          ? (JSON.parse(devcontainerJson.stdout || "{}") as {
            forwardPorts?: number[];
          })
          : { forwardPorts: [] as number[] };

      const devcontainerPorts = Array.isArray(parsed.forwardPorts)
        ? (parsed.forwardPorts as number[])
        : [];

      // Get environmentId from the taskRun (PVE-LXC doesn't persist metadata on instances)
      const convex = getConvex({ accessToken: token });
      let environmentPorts: number[] | undefined;

      // First try to get environmentId from the taskRun
      let environmentId: string | undefined;
      try {
        const taskRun = await convex.query(api.taskRuns.get, {
          teamSlugOrId,
          id: taskRunId as unknown as string & { __tableName: "taskRuns" },
        });
        environmentId = taskRun?.environmentId;
      } catch {
        // ignore lookup errors
      }

      // If we have an environmentId, fetch the environment's exposedPorts
      if (environmentId) {
        try {
          const envDoc = await convex.query(api.environments.get, {
            teamSlugOrId,
            id: environmentId as string & {
              __tableName: "environments";
            },
          });
          environmentPorts = envDoc?.exposedPorts ?? undefined;
        } catch {
          // ignore lookup errors; fall back to devcontainer ports
        }
      }

      // Build the set of ports we want to expose and persist
      const allowedPorts = new Set<number>();
      const addAllowed = (p: number) => {
        if (!Number.isFinite(p)) return;
        const pn = Math.floor(p);
        if (pn > 0 && !reservedPorts.has(pn)) allowedPorts.add(pn);
      };

      // Prefer environment.exposedPorts if available; otherwise use devcontainer forwardPorts
      (environmentPorts && environmentPorts.length > 0
        ? environmentPorts
        : devcontainerPorts
      ).forEach(addAllowed);

      const desiredPorts = Array.from(allowedPorts.values()).sort(
        (a, b) => a - b,
      );
      const serviceNameForPort = (port: number) => `port-${port}`;

      let workingInstance = instance;
      const reloadInstance = async () => {
        workingInstance = await getInstanceById(instance.id, getMorphClientOrNull());
      };

      await reloadInstance();

      for (const service of workingInstance.networking.httpServices) {
        if (!service.name.startsWith("port-")) {
          continue;
        }
        if (reservedPorts.has(service.port)) {
          continue;
        }
        if (!allowedPorts.has(service.port)) {
          await workingInstance.hideHttpService(service.name);
        }
      }

      await reloadInstance();

      for (const port of desiredPorts) {
        const serviceName = serviceNameForPort(port);
        const alreadyExposed = workingInstance.networking.httpServices.some(
          (service) => service.name === serviceName,
        );
        if (alreadyExposed) {
          continue;
        }
        try {
          await workingInstance.exposeHttpService(serviceName, port);
        } catch (error) {
          console.error(
            `[sandboxes.publishNetworking] Failed to expose ${serviceName}`,
            error,
          );
        }
      }

      // For Morph, reload to get persisted state from their API
      // For PVE-LXC, skip reload as exposeHttpService only updates in-memory state
      // and reloading would wipe out the services we just added
      if (!isPveLxc) {
        await reloadInstance();
      }

      const networking = workingInstance.networking.httpServices
        .filter((s) => allowedPorts.has(s.port))
        .map((s) => ({ status: "running" as const, port: s.port, url: s.url }));

      // Persist to Convex
      await convex.mutation(api.taskRuns.updateNetworking, {
        teamSlugOrId,
        id: taskRunId as unknown as string & { __tableName: "taskRuns" },
        networking,
      });

      return c.json(networking);
    } catch (error) {
      console.error("Failed to publish devcontainer networking:", error);
      return c.text("Failed to publish devcontainer networking", 500);
    }
  },
);

// ============================================================================
// SSH Route
// ============================================================================

// SSH connection info response schema
const SandboxSshResponse = z
  .object({
    morphInstanceId: z.string(),
    sshCommand: z.string().describe("Full SSH command to connect to this sandbox"),
    accessToken: z.string().describe("SSH access token for this sandbox"),
    user: z.string(),
    status: z.enum(["running", "paused"]).describe("Current instance status"),
  })
  .openapi("SandboxSshResponse");

// Get SSH connection details for a sandbox
sandboxesFeaturesRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/sandboxes/{id}/ssh",
    tags: ["Sandboxes"],
    summary: "Get SSH connection details for a sandbox",
    description:
      "Returns SSH connection info for a sandbox. Use the returned sshCommand or accessToken to connect.",
    request: {
      params: z.object({ id: z.string() }),
      query: z.object({
        teamSlugOrId: z.string().optional(),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: SandboxSshResponse,
          },
        },
        description: "SSH connection details",
      },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden - not a team member" },
      404: { description: "Sandbox not found" },
      500: { description: "Failed to get SSH info" },
    },
  }),
  async (c) => {
    const user = await getUserFromRequest(c.req.raw);
    if (!user) {
      return c.text("Unauthorized", 401);
    }
    const { accessToken } = await user.getAuthJson();
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const { id } = c.req.valid("param");
    const { teamSlugOrId } = c.req.valid("query");

    try {
      const convex = getConvex({ accessToken });

      let morphInstanceId: string | null = null;

      // Check if the id is a Morph instance ID (starts with "morphvm_")
      if (id.startsWith("morphvm_")) {
        // Direct Morph instance ID - verify ownership via instance metadata
        const morphClient = getMorphClient();

        // First try to find in task runs if team is provided
        if (teamSlugOrId) {
          let taskRun = null;
          try {
            taskRun = await convex.query(api.taskRuns.getByContainerName, {
              teamSlugOrId,
              containerName: id,
            });
          } catch (convexError) {
            console.log(
              `[sandboxes.ssh] Convex query failed for ${id}:`,
              convexError,
            );
          }

          if (taskRun) {
            // Found in task runs - verify team access and that it's a Morph instance
            await verifyTeamAccess({
              req: c.req.raw,
              teamSlugOrId,
            });
            if (taskRun.vscode?.provider !== "morph") {
              return c.text("Sandbox type not supported for SSH", 404);
            }
            morphInstanceId = id;
          }
        }

        // If not found via task run, verify ownership via instance metadata
        if (!morphInstanceId) {
          const result = await verifyInstanceOwnership(
            morphClient,
            id,
            user.id,
            async () => {
              const memberships = await convex.query(api.teams.listTeamMemberships, {});
              return memberships.map((m) => ({ teamId: m.team.teamId }));
            }
          );
          if (!result.authorized) {
            return c.text(result.message, result.status);
          }
          morphInstanceId = result.instanceId;
        }
      } else {
        // For task-run IDs, team is required to look up the task run
        if (!teamSlugOrId) {
          return c.text("teamSlugOrId is required for task-run IDs", 400);
        }

        // Verify team access
        const team = await verifyTeamAccess({
          req: c.req.raw,
          teamSlugOrId,
        });

        // Assume it's a task-run ID - look up the sandbox
        let taskRun: Doc<"taskRuns"> | null = null;

        try {
          taskRun = await convex.query(api.taskRuns.get, {
            teamSlugOrId,
            id: id as Id<"taskRuns">,
          });
        } catch {
          // Not a valid task run ID
          return c.text("Invalid sandbox or task-run ID", 404);
        }

        if (!taskRun) {
          return c.text("Task run not found", 404);
        }

        // Verify the task run is in the correct team
        if (taskRun.teamId !== team.uuid) {
          return c.text("Forbidden", 403);
        }

        // Check if this task run has an active Morph sandbox
        if (!taskRun.vscode) {
          return c.text("No sandbox associated with this task run", 404);
        }

        if (taskRun.vscode.provider !== "morph") {
          return c.text("Sandbox type not supported for SSH", 404);
        }

        if (!taskRun.vscode.containerName) {
          return c.text("Sandbox container name not found", 404);
        }

        // Only return SSH info for running/starting sandboxes
        if (
          taskRun.vscode.status !== "running" &&
          taskRun.vscode.status !== "starting"
        ) {
          return c.text("Sandbox is not running", 404);
        }

        morphInstanceId = taskRun.vscode.containerName;
      }

      if (!morphInstanceId) {
        return c.text("Could not resolve sandbox instance", 404);
      }

      // Get SSH access token from Morph API
      const sshKeyResponse = await fetch(
        `https://cloud.morph.so/api/instance/${morphInstanceId}/ssh/key`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${env.MORPH_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!sshKeyResponse.ok) {
        const errorText = await sshKeyResponse.text();
        console.error(
          `[sandboxes.ssh] Morph API returned ${sshKeyResponse.status}: ${errorText}`
        );
        // Return 404 if the instance doesn't exist in Morph
        if (sshKeyResponse.status === 404 || errorText.includes("not found")) {
          return c.text("Sandbox not found", 404);
        }
        return c.text("Failed to get SSH credentials", 500);
      }

      const sshKeyData = (await sshKeyResponse.json()) as {
        private_key: string;
        public_key: string;
        password: string;
        access_token: string;
      };

      if (!sshKeyData.access_token) {
        console.error("[sandboxes.ssh] Morph API did not return access_token");
        return c.text("Failed to get SSH credentials", 500);
      }

      // Get instance status from Morph
      const morphClient = getMorphClient();
      const instance = await morphClient.instances.get({ instanceId: morphInstanceId });
      const status = instance.status === "paused" ? "paused" : "running";

      const sshCommand = `ssh ${sshKeyData.access_token}@ssh.cloud.morph.so`;
      return c.json({
        morphInstanceId,
        sshCommand,
        accessToken: sshKeyData.access_token,
        user: "root",
        status,
      });
    } catch (error) {
      if (error instanceof HTTPException) {
        return c.text(error.message || "Request failed", error.status);
      }
      console.error("[sandboxes.ssh] Failed to get SSH info:", error);
      return c.text("Failed to get SSH info", 500);
    }
  },
);
