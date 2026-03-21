import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api } from "@cmux/convex/api";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  GetEnvironmentResponseSchema,
  UpdateEnvironmentBodySchema,
} from "./environments.schemas";

const UpdateEnvironmentParamsSchema = z.object({
  id: z.string(),
});

export const environmentsUpdateRouter = new OpenAPIHono();

environmentsUpdateRouter.openapi(
  createRoute({
    method: "patch" as const,
    path: "/environments/{id}",
    tags: ["Environments"],
    summary: "Update environment metadata",
    request: {
      params: UpdateEnvironmentParamsSchema,
      body: {
        content: {
          "application/json": {
            schema: UpdateEnvironmentBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: GetEnvironmentResponseSchema,
          },
        },
        description: "Environment updated successfully",
      },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Environment not found" },
      500: { description: "Failed to update environment" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) return c.text("Unauthorized", 401);

    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const environmentId = typedZid("environments").parse(id);

    try {
      await verifyTeamAccess({
        req: c.req.raw,
        teamSlugOrId: body.teamSlugOrId,
      });

      const convexClient = getConvex({ accessToken });
      await convexClient.mutation(api.environments.update, {
        teamSlugOrId: body.teamSlugOrId,
        id: environmentId,
        name: body.name,
        description: body.description,
        maintenanceScript: body.maintenanceScript,
        devScript: body.devScript,
      });

      const updated = await convexClient.query(api.environments.get, {
        teamSlugOrId: body.teamSlugOrId,
        id: environmentId,
      });

      if (!updated) {
        return c.text("Environment not found", 404);
      }

      if (!updated.snapshotId || !updated.snapshotProvider) {
        throw new Error(`Environment ${updated._id} is missing snapshot metadata`);
      }

      return c.json({
        id: updated._id,
        name: updated.name,
        snapshotId: updated.snapshotId,
        snapshotProvider: updated.snapshotProvider,
        templateVmid: updated.templateVmid ?? undefined,
        dataVaultKey: updated.dataVaultKey,
        selectedRepos: updated.selectedRepos ?? undefined,
        description: updated.description ?? undefined,
        maintenanceScript: updated.maintenanceScript ?? undefined,
        devScript: updated.devScript ?? undefined,
        exposedPorts: updated.exposedPorts ?? undefined,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Environment not found") {
        return c.text("Environment not found", 404);
      }

      console.error("Failed to update environment:", error);
      return c.text("Failed to update environment", 500);
    }
  },
);
