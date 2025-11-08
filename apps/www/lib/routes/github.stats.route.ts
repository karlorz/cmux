import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { createGitHubClient } from "@/lib/github/octokit";

const GitHubStatsSchema = z
  .object({
    stars: z.number().openapi({
      example: 1234,
      description: "Number of stars on the repository",
    }),
    forks: z.number().openapi({
      example: 100,
      description: "Number of forks of the repository",
    }),
    watchers: z.number().openapi({
      example: 50,
      description: "Number of watchers of the repository",
    }),
  })
  .openapi("GitHubStats");

export const githubStatsRouter = new OpenAPIHono();

githubStatsRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/github/stats",
    tags: ["GitHub"],
    summary: "Get GitHub repository statistics",
    responses: {
      200: {
        content: {
          "application/json": {
            schema: GitHubStatsSchema,
          },
        },
        description: "GitHub repository statistics",
      },
    },
  }),
  async (c) => {
    try {
      const octokit = createGitHubClient(null);

      // Fetch the cmux repository stats
      const { data } = await octokit.rest.repos.get({
        owner: "manaflow-ai",
        repo: "cmux",
      });

      return c.json(
        {
          stars: data.stargazers_count,
          forks: data.forks_count,
          watchers: data.watchers_count,
        },
        200
      );
    } catch (error) {
      console.error("Error fetching GitHub stats:", error);
      // Return 0s if we can't fetch the data
      return c.json(
        {
          stars: 0,
          forks: 0,
          watchers: 0,
        },
        200
      );
    }
  }
);
