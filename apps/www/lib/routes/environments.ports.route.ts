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
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { MorphCloudClient } from "morphcloud";
import { determineHttpServiceUpdates } from "./determine-http-service-updates";
import {
  detectInstanceProvider,
  sanitizePortsOrThrow,
  withMorphRetry,
} from "./environments.helpers";

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

const serviceNameForPort = (port: number): string => `port-${port}`;

export const environmentsPortsRouter = new OpenAPIHono();

environmentsPortsRouter.openapi(
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
            "instances.get (update ports)",
          );

          const metadata = instance.metadata;
          const instanceTeamId = metadata?.teamId;
          if (instanceTeamId && instanceTeamId !== team.uuid) {
            return c.text("Forbidden: Instance does not belong to this team", 403);
          }
          const metadataEnvironmentId = metadata?.environmentId;
          if (metadataEnvironmentId && metadataEnvironmentId !== id) {
            return c.text(
              "Forbidden: Instance does not belong to this environment",
              403,
            );
          }
          workingInstance = wrapMorphInstance(instance);
        } else {
          return c.text("Sandbox instance provider not supported", 404);
        }

        const { servicesToHide, portsToExpose, servicesToKeep } =
          determineHttpServiceUpdates(
            workingInstance.networking.httpServices,
            sanitizedPorts,
          );

        const hidePromises = servicesToHide.map((service) =>
          workingInstance.hideHttpService(service.name),
        );

        const exposePromises = portsToExpose.map((port) => {
          const serviceName = serviceNameForPort(port);
          return (async () => {
            try {
              await workingInstance.exposeHttpService(serviceName, port);
            } catch (error) {
              console.error(
                `[environments.updatePorts] Failed to expose ${serviceName}`,
                error,
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
              "instances.get (update ports reload)",
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
            (service) => service.name === serviceName || service.port === port,
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
        },
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
  },
);
