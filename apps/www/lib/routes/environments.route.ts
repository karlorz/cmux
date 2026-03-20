import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { getPveLxcClient } from "@/lib/utils/pve-lxc-client";
import {
  type SandboxInstance,
  wrapMorphInstance,
  wrapPveLxcInstance,
} from "@/lib/utils/sandbox-instance";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { env } from "@/lib/utils/www-env";
import { api } from "@cmux/convex/api";
import { SNAPSHOT_PROVIDERS } from "@cmux/shared/provider-types";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { validateExposedPorts } from "@cmux/shared/utils/validate-exposed-ports";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { MorphCloudClient } from "morphcloud";
import { determineHttpServiceUpdates } from "./determine-http-service-updates";
import {
  detectInstanceProvider,
  withMorphRetry,
} from "./environments.helpers";
import { environmentsLifecycleRouter } from "./environments.lifecycle.route";
import { environmentsSnapshotsRouter } from "./environments.snapshots.route";
import { environmentsVarsRouter } from "./environments.vars.route";

export const environmentsRouter = new OpenAPIHono();

environmentsRouter.route("/", environmentsLifecycleRouter);
environmentsRouter.route("/", environmentsVarsRouter);
environmentsRouter.route("/", environmentsSnapshotsRouter);

const sanitizePortsOrThrow = (ports: readonly number[]): number[] => {
  const validation = validateExposedPorts(ports);
  if (validation.reserved.length > 0) {
    throw new HTTPException(400, {
      message: `Reserved ports cannot be exposed: ${validation.reserved.join(", ")}`,
    });
  }
  if (validation.invalid.length > 0) {
    throw new HTTPException(400, {
      message: `Invalid ports provided: ${validation.invalid.join(", ")}`,
    });
  }
  return validation.sanitized;
};

const serviceNameForPort = (port: number): string => `port-${port}`;

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

const ExposedService = z
  .object({
    port: z.number(),
    url: z.string(),
  })
  .openapi("ExposedService");

const UpdateEnvironmentPortsBody = z
  .object({
    teamSlugOrId: z.string(),
    ports: z.array(z.number()),
    instanceId: z.string().optional(),
  })
  .openapi("UpdateEnvironmentPortsBody");

const UpdateEnvironmentPortsResponse = z
  .object({
    exposedPorts: z.array(z.number()),
    services: z.array(ExposedService).optional(),
  })
  .openapi("UpdateEnvironmentPortsResponse");

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

// Update exposed ports for an environment
environmentsRouter.openapi(
  createRoute({
    method: "patch" as const,
    path: "/environments/{id}/ports",
    tags: ["Environments"],
    summary: "Update exposed ports for an environment",
    request: {
      params: z.object({
        id: z.string(),
      }),
      body: {
        content: {
          "application/json": {
            schema: UpdateEnvironmentPortsBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: UpdateEnvironmentPortsResponse,
          },
        },
        description: "Exposed ports updated successfully",
      },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Environment not found" },
      500: { description: "Failed to update environment ports" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) return c.text("Unauthorized", 401);

    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const environmentId = typedZid("environments").parse(id);

    try {
      const sanitizedPorts = sanitizePortsOrThrow(body.ports);
      const convexClient = getConvex({ accessToken });
      const team = await verifyTeamAccess({
        req: c.req.raw,
        teamSlugOrId: body.teamSlugOrId,
      });

      let services:
        | Array<{
            port: number;
            url: string;
          }>
        | undefined;

      if (body.instanceId) {
        const instanceProvider = detectInstanceProvider(body.instanceId);
        let workingInstance: SandboxInstance;
        if (instanceProvider === "pve-lxc") {
          const pveClient = getPveLxcClient();
          const pveInstance = await pveClient.instances.get({
            instanceId: body.instanceId,
          });
          workingInstance = wrapPveLxcInstance(pveInstance);
        } else if (instanceProvider === "morph") {
          const morphClient = new MorphCloudClient({ apiKey: env.MORPH_API_KEY });
          const instance = await withMorphRetry(
            () => morphClient.instances.get({ instanceId: body.instanceId! }),
            "instances.get (update ports)"
          );

          const metadata = instance.metadata;
          const instanceTeamId = metadata?.teamId;
          if (instanceTeamId && instanceTeamId !== team.uuid) {
            return c.text(
              "Forbidden: Instance does not belong to this team",
              403
            );
          }
          const metadataEnvironmentId = metadata?.environmentId;
          if (metadataEnvironmentId && metadataEnvironmentId !== id) {
            return c.text(
              "Forbidden: Instance does not belong to this environment",
              403
            );
          }
          workingInstance = wrapMorphInstance(instance);
        } else {
          return c.text("Sandbox instance provider not supported", 404);
        }

        const { servicesToHide, portsToExpose, servicesToKeep } =
          determineHttpServiceUpdates(
            workingInstance.networking.httpServices,
            sanitizedPorts
          );

        const hidePromises = servicesToHide.map((service) =>
          workingInstance.hideHttpService(service.name)
        );

        const exposePromises = portsToExpose.map((port) => {
          const serviceName = serviceNameForPort(port);
          return (async () => {
            try {
              await workingInstance.exposeHttpService(serviceName, port);
            } catch (error) {
              console.error(
                `[environments.updatePorts] Failed to expose ${serviceName}`,
                error
              );
              throw new HTTPException(500, {
                message: `Failed to expose ${serviceName}`,
              });
            }
          })();
        });

        await Promise.all([
          Promise.all(hidePromises),
          Promise.all(exposePromises),
        ]);

        const reloadInstance = async () => {
          if (instanceProvider === "pve-lxc") {
            const pveClient = getPveLxcClient();
            const pveInstance = await pveClient.instances.get({
              instanceId: body.instanceId!,
            });
            return wrapPveLxcInstance(pveInstance);
          }
          if (instanceProvider === "morph") {
            const morphClient = new MorphCloudClient({ apiKey: env.MORPH_API_KEY });
            const instance = await withMorphRetry(
              () => morphClient.instances.get({ instanceId: body.instanceId! }),
              "instances.get (update ports reload)"
            );
            return wrapMorphInstance(instance);
          }
          return workingInstance;
        };

        workingInstance = await reloadInstance();

        const serviceUrls = new Map<number, string>();

        for (const service of servicesToKeep) {
          serviceUrls.set(service.port, service.url);
        }

        for (const port of sanitizedPorts) {
          const serviceName = serviceNameForPort(port);
          const matched = workingInstance.networking.httpServices.find(
            (service) => service.name === serviceName || service.port === port
          );
          if (matched?.url) {
            serviceUrls.set(port, matched.url);
          }
        }

        services = Array.from(serviceUrls.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([port, url]) => ({ port, url }));
      }

      const updatedPorts = await convexClient.mutation(
        api.environments.updateExposedPorts,
        {
          teamSlugOrId: body.teamSlugOrId,
          id: environmentId,
          ports: sanitizedPorts,
        }
      );

      return c.json({
        exposedPorts: updatedPorts,
        ...(services ? { services } : {}),
      });
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      if (error instanceof Error && error.message === "Environment not found") {
        return c.text("Environment not found", 404);
      }
      console.error("Failed to update environment ports:", error);
      return c.text("Failed to update environment ports", 500);
    }
  }
);

