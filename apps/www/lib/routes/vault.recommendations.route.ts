import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { generateRecommendations } from "@cmux/shared/node/obsidian-reader";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getVaultConfig, readVault } from "./vault.helpers";
import { RecommendedActionSchema } from "./vault.schemas";

const VaultRecommendationsQuery = z.object({
  teamSlugOrId: z.string().openapi({ description: "Team slug or ID" }),
  limit: z.coerce.number().optional().openapi({ description: "Maximum recommendations" }),
  priority: z.enum(["high", "medium", "low"]).optional().openapi({ description: "Filter by priority" }),
  type: z.enum(["todo", "stale_note", "missing_docs", "broken_link"]).optional().openapi({
    description: "Filter by type",
  }),
});

export const vaultRecommendationsRouter = new OpenAPIHono();

vaultRecommendationsRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/vault/recommendations",
    tags: ["Vault"],
    summary: "Get vault recommendations",
    description: "Get recommended actions extracted from Obsidian vault notes.",
    request: {
      query: VaultRecommendationsQuery,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              recommendations: z.array(RecommendedActionSchema),
              vaultConfigured: z.boolean(),
            }),
          },
        },
        description: "Recommendations retrieved successfully",
      },
      401: { description: "Unauthorized" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const { teamSlugOrId, limit = 50, priority, type } = c.req.valid("query");

    try {
      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });

      const config = await getVaultConfig(teamSlugOrId, accessToken);
      if (!config) {
        return c.json({ recommendations: [], vaultConfigured: false });
      }

      const notes = await readVault(config);
      let recommendations = generateRecommendations(notes);

      if (priority) {
        recommendations = recommendations.filter((recommendation) => recommendation.priority === priority);
      }
      if (type) {
        recommendations = recommendations.filter((recommendation) => recommendation.type === type);
      }

      recommendations = recommendations.slice(0, limit);

      return c.json({ recommendations, vaultConfigured: true });
    } catch (error) {
      console.error("[vault] Failed to get recommendations:", error);
      return c.text("Failed to get recommendations", 500);
    }
  },
);
