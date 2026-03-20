import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api } from "@cmux/convex/api";
import { SNAPSHOT_PROVIDERS } from "@cmux/shared/provider-types";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { environmentsLifecycleRouter } from "./environments.lifecycle.route";
import { environmentsPortsRouter } from "./environments.ports.route";
import { environmentsSnapshotsRouter } from "./environments.snapshots.route";
import { environmentsVarsRouter } from "./environments.vars.route";

export const environmentsRouter = new OpenAPIHono();

environmentsRouter.route("/", environmentsLifecycleRouter);
environmentsRouter.route("/", environmentsPortsRouter);
environmentsRouter.route("/", environmentsVarsRouter);
environmentsRouter.route("/", environmentsSnapshotsRouter);

const GetEnvironmentResponse = z
  .object({
    id: z.string(),
    name: z.string(),
    snapshotId: z.string(),
    snapshotProvider: z.enum(SNAPSHOT_PROVIDERS),
    templateVmid: z.number().optional(),
    dataVaultKey: z.string(),
    selectedRepos: z.array(z.string()).optional(),
    description: z.string().optional(),
    maintenanceScript: z.string().optional(),
    devScript: z.string().optional(),
    exposedPorts: z.array(z.number()).optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .openapi("GetEnvironmentResponse");

const ListEnvironmentsResponse = z
  .array(GetEnvironmentResponse)
  .openapi("ListEnvironmentsResponse");

const UpdateEnvironmentBody = z
  .object({
    teamSlugOrId: z.string(),
    name: z.string().trim().min(1).optional(),
    description: z.string().optional(),
    maintenanceScript: z.string().optional(),
    devScript: z.string().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.maintenanceScript !== undefined ||
      value.devScript !== undefined,
    "At least one field must be provided",
  )
  .openapi("UpdateEnvironmentBody");

// List environments for a team
environmentsRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/environments",
    tags: ["Environments"],
    summary: "List environments for a team",
    request: {
      query: z.object({
        teamSlugOrId: z.string(),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: ListEnvironmentsResponse,
          },
        },
        description: "Environments retrieved successfully",
      },
      401: { description: "Unauthorized" },
      500: { description: "Failed to list environments" },
    },
  }),
  async (c) => {
    // Require authentication
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) return c.text("Unauthorized", 401);

    const { teamSlugOrId } = c.req.valid("query");

    try {
      const convexClient = getConvex({ accessToken });
      const environments = await convexClient.query(api.environments.list, {
        teamSlugOrId,
      });

      // Map Convex documents to API response shape
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
  }
);

// Get a specific environment
environmentsRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/environments/{id}",
    tags: ["Environments"],
    summary: "Get a specific environment",
    request: {
      params: z.object({
        id: z.string(),
      }),
      query: z.object({
        teamSlugOrId: z.string(),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: GetEnvironmentResponse,
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
    // Require authentication
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
      // Map Convex document to API response shape
      if (!environment.snapshotId || !environment.snapshotProvider) {
        throw new Error(`Environment ${environment._id} is missing snapshot metadata`);
      }
      const mapped = {
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
      };

      return c.json(mapped);
    } catch (error) {
      console.error("Failed to get environment:", error);
      return c.text("Failed to get environment", 500);
    }
  }
);

// Update metadata for an environment
environmentsRouter.openapi(
  createRoute({
    method: "patch" as const,
    path: "/environments/{id}",
    tags: ["Environments"],
    summary: "Update environment metadata",
    request: {
      params: z.object({
        id: z.string(),
      }),
      body: {
        content: {
          "application/json": {
            schema: UpdateEnvironmentBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: GetEnvironmentResponse,
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
  }
);

