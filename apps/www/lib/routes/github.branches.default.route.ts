import { stackServerAppJs } from "@/lib/utils/stack";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { Octokit } from "octokit";

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  if (!("status" in error)) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function getErrorMessage(error: unknown): string | null {
  if (error instanceof Error && error.message) return error.message;
  if (!error || typeof error !== "object") return null;
  if (!("message" in error)) return null;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.trim().length > 0 ? message : null;
}

function isUnauthenticatedRateLimit(error: unknown): boolean {
  const status = getErrorStatus(error);
  const message = getErrorMessage(error)?.toLowerCase() ?? "";
  return status === 403 && message.includes("api rate limit exceeded");
}

const DefaultBranchQuery = z
  .object({
    repo: z.string().min(1).openapi({ description: "Repository full name (owner/repo)" }),
  })
  .openapi("GithubDefaultBranchQuery");

const DefaultBranchResponse = z
  .object({
    defaultBranch: z.string().nullable(),
    error: z.string().nullable(),
  })
  .openapi("GithubDefaultBranchResponse");

export const githubDefaultBranchRouter = new OpenAPIHono();

githubDefaultBranchRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/integrations/github/default-branch",
    tags: ["Integrations"],
    summary: "Get the default branch for a repository (fast - single API call)",
    request: { query: DefaultBranchQuery },
    responses: {
      200: {
        description: "Default branch response",
        content: {
          "application/json": {
            schema: DefaultBranchResponse,
          },
        },
      },
      401: { description: "Unauthorized" },
    },
  }),
  async (c) => {
    const user = await stackServerAppJs.getUser({ tokenStore: c.req.raw });
    if (!user) {
      return c.text("Unauthorized", 401);
    }

    const { repo } = c.req.valid("query");
    const [owner, repoName] = repo.split("/");
    if (!owner || !repoName) {
      return c.json({ defaultBranch: null, error: "Invalid repository format" }, 200);
    }

    let accessToken: string | null = null;
    let missingAuthErrorMessage = "GitHub account not connected";
    try {
      const githubAccount = await user.getConnectedAccount("github");
      if (githubAccount) {
        const tokenResult = await githubAccount.getAccessToken();
        const trimmed = (tokenResult.accessToken ?? "").trim();
        if (trimmed.length > 0) {
          accessToken = trimmed;
        } else {
          missingAuthErrorMessage = "GitHub access token not found";
        }
      }
    } catch (error) {
      missingAuthErrorMessage = "GitHub access token not found";
      console.error("[github.branches] Failed to fetch GitHub access token:", error);
    }

    const octokit = accessToken ? new Octokit({ auth: accessToken }) : new Octokit();

    try {
      const { data } = await octokit.request("GET /repos/{owner}/{repo}", {
        owner,
        repo: repoName,
      });

      return c.json({ defaultBranch: data.default_branch, error: null }, 200);
    } catch (error) {
      console.error("[github.branches] Error getting default branch:", error);
      if (getErrorStatus(error) === 404) {
        return c.json(
          {
            defaultBranch: null,
            error: accessToken ? "Repository not found" : missingAuthErrorMessage,
          },
          200
        );
      }
      if (!accessToken && isUnauthenticatedRateLimit(error)) {
        return c.json(
          {
            defaultBranch: null,
            error: "GitHub API rate limit exceeded. Connect GitHub for higher limits.",
          },
          200
        );
      }
      return c.json(
        {
          defaultBranch: null,
          error: error instanceof Error ? error.message : "Failed to get default branch",
        },
        200
      );
    }
  }
);
