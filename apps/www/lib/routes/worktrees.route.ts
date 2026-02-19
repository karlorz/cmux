import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api } from "@cmux/convex/api";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import fs from "node:fs/promises";
import path from "node:path";
import { RepositoryManager } from "../../../server/src/repositoryManager";

export const worktreesRouter = new OpenAPIHono();

const RemoveWorktreeBody = z
  .object({
    teamSlugOrId: z.string(),
    worktreePath: z.string(),
  })
  .openapi("RemoveWorktreeBody");

const RemoveWorktreeResponse = z
  .object({
    success: z.boolean(),
    message: z.string(),
    sourceRepoPath: z.string(),
  })
  .openapi("RemoveWorktreeResponse");

async function resolveSourceRepoPathFromWorktree(
  worktreePath: string
): Promise<string> {
  const gitPath = path.join(worktreePath, ".git");
  const stat = await fs.stat(gitPath);

  if (stat.isDirectory()) {
    return worktreePath;
  }

  const gitFileContent = await fs.readFile(gitPath, "utf8");
  const match = gitFileContent.match(/^gitdir:\s*(.+)\s*$/m);
  if (!match) {
    throw new Error(`Could not parse .git file at ${gitPath}`);
  }

  const worktreeGitDir = match[1].trim();
  const resolvedWorktreeGitDir = path.isAbsolute(worktreeGitDir)
    ? worktreeGitDir
    : path.resolve(worktreePath, worktreeGitDir);

  const commonDirPath = path.join(resolvedWorktreeGitDir, "commondir");
  try {
    const commonDir = (await fs.readFile(commonDirPath, "utf8")).trim();
    if (commonDir) {
      const resolvedCommonDir = path.isAbsolute(commonDir)
        ? commonDir
        : path.resolve(resolvedWorktreeGitDir, commonDir);
      return path.dirname(resolvedCommonDir);
    }
  } catch {
    // Fall through to default structure resolution.
  }

  // Typical layout: <repo>/.git/worktrees/<name>
  return path.resolve(resolvedWorktreeGitDir, "..", "..", "..");
}

worktreesRouter.openapi(
  createRoute({
    method: "post",
    path: "/worktrees/remove",
    tags: ["Worktrees"],
    summary: "Remove a registered local git worktree",
    request: {
      body: {
        content: {
          "application/json": {
            schema: RemoveWorktreeBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Worktree removed",
        content: {
          "application/json": {
            schema: RemoveWorktreeResponse,
          },
        },
      },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Worktree not found" },
      500: { description: "Failed to remove worktree" },
    },
  }),
  async (c) => {
    const { teamSlugOrId, worktreePath } = c.req.valid("json");
    const normalizedWorktreePath = path.resolve(worktreePath);
    const req = c.req.raw;

    const accessToken = await getAccessTokenFromRequest(req);
    if (!accessToken) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    await verifyTeamAccess({ req, accessToken, teamSlugOrId });

    const convex = getConvex({ accessToken });
    const registryEntry = await convex.query(api.worktreeRegistry.getByPath, {
      teamSlugOrId,
      worktreePath: normalizedWorktreePath,
    });
    if (!registryEntry) {
      throw new HTTPException(404, {
        message: "Worktree not found in registry",
      });
    }

    let sourceRepoPath: string;
    try {
      sourceRepoPath = await resolveSourceRepoPathFromWorktree(
        normalizedWorktreePath
      );
    } catch (error) {
      const fallbackSourceRepoPath = registryEntry.sourceRepoPath;
      if (!fallbackSourceRepoPath) {
        throw new HTTPException(500, {
          message:
            error instanceof Error
              ? error.message
              : "Unable to resolve source repository path",
        });
      }
      sourceRepoPath = fallbackSourceRepoPath;
    }

    const repoManager = RepositoryManager.getInstance();
    await repoManager.removeWorktree(sourceRepoPath, normalizedWorktreePath);

    const stillExists = await repoManager.worktreeExists(
      sourceRepoPath,
      normalizedWorktreePath
    );
    if (stillExists) {
      throw new HTTPException(500, {
        message: "Worktree removal failed",
      });
    }

    await convex.mutation(api.worktreeRegistry.remove, {
      teamSlugOrId,
      worktreePath: normalizedWorktreePath,
    });

    return c.json({
      success: true,
      message: "Worktree removed",
      sourceRepoPath: path.resolve(sourceRepoPath),
    });
  }
);
