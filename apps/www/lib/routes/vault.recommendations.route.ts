import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { generateRecommendations, type RecommendedAction as VaultRecommendedAction } from "@cmux/shared/node/obsidian-reader";
import {
  generateProjectRecommendations,
  type ProjectRecommendedAction,
} from "@cmux/shared/project-recommendations";
import { api } from "@cmux/convex/api";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getVaultConfig, readVault } from "./vault.helpers";
import { RecommendedActionSchema, RecommendedActionTypeSchema } from "./vault.schemas";

const VaultRecommendationsQuery = z.object({
  teamSlugOrId: z.string().openapi({ description: "Team slug or ID" }),
  limit: z.coerce.number().optional().openapi({ description: "Maximum recommendations" }),
  priority: z.enum(["high", "medium", "low"]).optional().openapi({ description: "Filter by priority" }),
  type: RecommendedActionTypeSchema.optional().openapi({
    description: "Filter by type",
  }),
});

export const vaultRecommendationsRouter = new OpenAPIHono();

vaultRecommendationsRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/vault/recommendations",
    tags: ["Vault"],
    summary: "Get recommendations",
    description:
      "Get recommended actions from project state and Obsidian vault. " +
      "Project-state recommendations (stale projects, failed tasks, etc.) are always generated. " +
      "Vault recommendations are included if a vault is configured.",
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
              projectsScanned: z.number().openapi({ description: "Number of projects analyzed" }),
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

      const convex = getConvex({ accessToken });

      // Collect all recommendations
      type MergedRecommendation = (VaultRecommendedAction | ProjectRecommendedAction) & {
        projectId?: string;
      };
      const allRecommendations: MergedRecommendation[] = [];

      // 1. Always generate project-state recommendations
      let projectsScanned = 0;
      try {
        const projects = await convex.query(
          api.projectQueries.listProjectsForRecommendations,
          { teamSlugOrId }
        );
        projectsScanned = projects.length;
        const projectRecs = generateProjectRecommendations(projects);
        allRecommendations.push(...projectRecs);
      } catch (projectError) {
        console.error("[vault] Failed to get project recommendations:", projectError);
        // Continue with vault recommendations even if project fetch fails
      }

      // 2. Optionally generate vault recommendations
      let vaultConfigured = false;
      const config = await getVaultConfig(teamSlugOrId, accessToken);
      if (config) {
        vaultConfigured = true;
        try {
          const notes = await readVault(config);
          const vaultRecs = generateRecommendations(notes);
          allRecommendations.push(...vaultRecs);
        } catch (vaultError) {
          console.error("[vault] Failed to read vault:", vaultError);
          // Continue with project recommendations even if vault read fails
        }
      }

      // 3. Filter by priority and type
      let filtered = allRecommendations;
      if (priority) {
        filtered = filtered.filter((rec) => rec.priority === priority);
      }
      if (type) {
        filtered = filtered.filter((rec) => rec.type === type);
      }

      // 4. Sort by priority (high > medium > low)
      const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      filtered.sort(
        (a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2)
      );

      // 5. Apply limit
      const recommendations = filtered.slice(0, limit);

      return c.json({ recommendations, vaultConfigured, projectsScanned });
    } catch (error) {
      console.error("[vault] Failed to get recommendations:", error);
      return c.text("Failed to get recommendations", 500);
    }
  }
);
