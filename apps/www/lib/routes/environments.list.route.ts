import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { api } from "@cmux/convex/api";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { ListEnvironmentsResponseSchema } from "./environments.schemas";

const ListEnvironmentsQuerySchema = z.object({
  teamSlugOrId: z.string(),
});

export const environmentsListRouter = new OpenAPIHono();

environmentsListRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/environments",
    tags: ["Environments"],
    summary: "List environments for a team",
    request: {
      query: ListEnvironmentsQuerySchema,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: ListEnvironmentsResponseSchema,
          },
        },
        description: "Environments retrieved successfully",
      },
      401: { description: "Unauthorized" },
      500: { description: "Failed to list environments" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) return c.text("Unauthorized", 401);

    const { teamSlugOrId } = c.req.valid("query");

    try {
      const convexClient = getConvex({ accessToken });
      const environments = await convexClient.query(api.environments.list, {
        teamSlugOrId,
      });

      const result = environments.map((env) => {
        if (!env.snapshotId || !env.snapshotProvider) {
          throw new Error(`Environment ${env._id} is missing snapshot metadata`);
        }
        return {
          id: env._id,
          name: env.name,
          snapshotId: env.snapshotId,
          snapshotProvider: env.snapshotProvider,
          templateVmid: env.templateVmid ?? undefined,
          dataVaultKey: env.dataVaultKey,
          selectedRepos: env.selectedRepos,
          description: env.description,
          maintenanceScript: env.maintenanceScript,
          devScript: env.devScript,
          exposedPorts: env.exposedPorts,
          createdAt: env.createdAt,
          updatedAt: env.updatedAt,
        };
      });

      return c.json(result);
    } catch (error) {
      console.error("Failed to list environments:", error);
      return c.text("Failed to list environments", 500);
    }
  },
);
