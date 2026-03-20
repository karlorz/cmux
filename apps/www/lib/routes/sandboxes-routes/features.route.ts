/**
 * Sandbox Features Routes
 *
 * Additional sandbox feature endpoints:
 * - POST /sandboxes/{id}/discover-repos - Discover git repositories
 * - POST /sandboxes/{id}/live-diff - Get live git diff
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
} from "./_helpers";
import { HTTPException } from "hono/http-exception";

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
