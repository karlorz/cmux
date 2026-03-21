import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { api } from "@cmux/convex/api";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { GetEnvironmentResponseSchema } from "./environments.schemas";

const GetEnvironmentParamsSchema = z.object({
  id: z.string(),
});

const GetEnvironmentQuerySchema = z.object({
  teamSlugOrId: z.string(),
});

export const environmentsGetRouter = new OpenAPIHono();

environmentsGetRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/environments/{id}",
    tags: ["Environments"],
    summary: "Get a specific environment",
    request: {
      params: GetEnvironmentParamsSchema,
      query: GetEnvironmentQuerySchema,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: GetEnvironmentResponseSchema,
          },
        },
        description: "Environment retrieved successfully",
      },
      401: { description: "Unauthorized" },
      404: { description: "Environment not found" },
      500: { description: "Failed to get environment" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) return c.text("Unauthorized", 401);

    const { id } = c.req.valid("param");
    const { teamSlugOrId } = c.req.valid("query");

    try {
      const convexClient = getConvex({ accessToken });
      const environmentId = typedZid("environments").parse(id);
      const environment = await convexClient.query(api.environments.get, {
        teamSlugOrId,
        id: environmentId,
      });

      if (!environment) {
        return c.text("Environment not found", 404);
      }
      if (!environment.snapshotId || !environment.snapshotProvider) {
        throw new Error(`Environment ${environment._id} is missing snapshot metadata`);
      }

      return c.json({
        id: environment._id,
        name: environment.name,
        snapshotId: environment.snapshotId,
        snapshotProvider: environment.snapshotProvider,
        templateVmid: environment.templateVmid ?? undefined,
        dataVaultKey: environment.dataVaultKey,
        selectedRepos: environment.selectedRepos,
        description: environment.description,
        maintenanceScript: environment.maintenanceScript,
        devScript: environment.devScript,
        exposedPorts: environment.exposedPorts,
        createdAt: environment.createdAt,
        updatedAt: environment.updatedAt,
      });
    } catch (error) {
      console.error("Failed to get environment:", error);
      return c.text("Failed to get environment", 500);
    }
  },
);
