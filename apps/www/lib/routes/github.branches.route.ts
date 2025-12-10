import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { env } from "@/lib/utils/www-env";
import { api } from "@cmux/convex/api";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "octokit";
import { getConvex } from "../utils/get-convex";
import { githubPrivateKey } from "../utils/githubPrivateKey";

export const githubBranchesRouter = new OpenAPIHono();

// Schema for branch data
const GithubBranch = z
  .object({
    name: z.string(),
    lastCommitSha: z.string().optional(),
    isDefault: z.boolean().optional(),
  })
  .openapi("GithubBranch");

// Helper to get Octokit client with GitHub App auth for a repo
async function getOctokitForRepo(
  accessToken: string,
  teamSlugOrId: string,
  repo: string
): Promise<{ octokit: Octokit | null; error: string | null }> {
  const [owner] = repo.split("/");
  if (!owner) {
    return { octokit: null, error: "Invalid repository format" };
  }

  const convex = getConvex({ accessToken });
  const connections = await convex.query(api.github.listProviderConnections, {
    teamSlugOrId,
  });

  // Find the installation that has access to this repo (match by owner)
  const target = connections.find(
    (co) =>
      co.isActive && co.accountLogin?.toLowerCase() === owner.toLowerCase()
  );

  if (!target) {
    return {
      octokit: null,
      error:
        "GitHub App not installed for this repository. Please install the GitHub App first.",
    };
  }

  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: env.CMUX_GITHUB_APP_ID,
      privateKey: githubPrivateKey,
      installationId: target.installationId,
    },
  });

  return { octokit, error: null };
}

// --- Default Branch Endpoint (fast - single API call) ---

const DefaultBranchQuery = z
  .object({
    team: z.string().min(1).openapi({ description: "Team slug or UUID" }),
    repo: z
      .string()
      .min(1)
      .openapi({ description: "Repository full name (owner/repo)" }),
  })
  .openapi("GithubDefaultBranchQuery");

const DefaultBranchResponse = z
  .object({
    defaultBranch: z.string().nullable(),
    error: z.string().nullable(),
  })
  .openapi("GithubDefaultBranchResponse");

githubBranchesRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/integrations/github/default-branch",
    tags: ["Integrations"],
    summary: "Get the default branch for a repository using GitHub App",
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
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) return c.text("Unauthorized", 401);

    const { team, repo } = c.req.valid("query");
    const [owner, repoName] = repo.split("/");

    try {
      const { octokit, error } = await getOctokitForRepo(
        accessToken,
        team,
        repo
      );
      if (error || !octokit) {
        return c.json({ defaultBranch: null, error }, 200);
      }

      const { data } = await octokit.request("GET /repos/{owner}/{repo}", {
        owner: owner!,
        repo: repoName!,
      });

      return c.json({ defaultBranch: data.default_branch, error: null }, 200);
    } catch (error) {
      console.error("[github.branches] Error getting default branch:", error);
      return c.json(
        {
          defaultBranch: null,
          error:
            error instanceof Error
              ? error.message
              : "Failed to get default branch",
        },
        200
      );
    }
  }
);

// --- Branches List Endpoint (with optional search) ---

const BranchesQuery = z
  .object({
    team: z.string().min(1).openapi({ description: "Team slug or UUID" }),
    repo: z
      .string()
      .min(1)
      .openapi({ description: "Repository full name (owner/repo)" }),
    search: z
      .string()
      .trim()
      .optional()
      .openapi({ description: "Optional search term to filter branches by name" }),
    limit: z.coerce
      .number()
      .min(1)
      .max(100)
      .default(30)
      .optional()
      .openapi({ description: "Max branches to return (default 30, max 100)" }),
  })
  .openapi("GithubBranchesQuery");

const BranchesResponse = z
  .object({
    branches: z.array(GithubBranch),
    defaultBranch: z.string().nullable(),
    error: z.string().nullable(),
  })
  .openapi("GithubBranchesResponse");

githubBranchesRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/integrations/github/branches",
    tags: ["Integrations"],
    summary: "List branches for a repository using GitHub App",
    request: { query: BranchesQuery },
    responses: {
      200: {
        description: "Branches list response",
        content: {
          "application/json": {
            schema: BranchesResponse,
          },
        },
      },
      401: { description: "Unauthorized" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) return c.text("Unauthorized", 401);

    const { team, repo, search, limit = 30 } = c.req.valid("query");
    const [owner, repoName] = repo.split("/");

    try {
      const { octokit, error } = await getOctokitForRepo(
        accessToken,
        team,
        repo
      );
      if (error || !octokit) {
        return c.json({ branches: [], defaultBranch: null, error }, 200);
      }

      // Get repo info for default branch
      let defaultBranchName: string | null = null;
      try {
        const { data: repoData } = await octokit.request(
          "GET /repos/{owner}/{repo}",
          {
            owner: owner!,
            repo: repoName!,
          }
        );
        defaultBranchName = repoData.default_branch;
      } catch {
        // Ignore - we'll continue without default branch info
      }

      type BranchResp = { name: string; commit: { sha: string } };
      const branches: Array<z.infer<typeof GithubBranch>> = [];

      if (!search) {
        // No search - just get first page of branches
        const { data } = (await octokit.request(
          "GET /repos/{owner}/{repo}/branches",
          {
            owner: owner!,
            repo: repoName!,
            per_page: limit,
          }
        )) as { data: BranchResp[] };

        for (const br of data) {
          branches.push({
            name: br.name,
            lastCommitSha: br.commit.sha,
            isDefault: br.name === defaultBranchName,
          });
        }
      } else {
        // With search - fetch pages until we find enough matches
        const searchLower = search.toLowerCase();
        let page = 1;
        const perPage = 100;

        while (branches.length < limit) {
          const { data } = (await octokit.request(
            "GET /repos/{owner}/{repo}/branches",
            {
              owner: owner!,
              repo: repoName!,
              per_page: perPage,
              page,
            }
          )) as { data: BranchResp[] };

          if (data.length === 0) break;

          for (const br of data) {
            if (br.name.toLowerCase().includes(searchLower)) {
              branches.push({
                name: br.name,
                lastCommitSha: br.commit.sha,
                isDefault: br.name === defaultBranchName,
              });
              if (branches.length >= limit) break;
            }
          }

          if (data.length < perPage) break;
          page++;
        }
      }

      return c.json(
        { branches, defaultBranch: defaultBranchName, error: null },
        200
      );
    } catch (error) {
      console.error("[github.branches] Error fetching branches:", error);
      return c.json(
        {
          branches: [],
          defaultBranch: null,
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch branches",
        },
        200
      );
    }
  }
);
