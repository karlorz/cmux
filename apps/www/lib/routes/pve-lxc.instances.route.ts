import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getPveLxcClient } from "@/lib/utils/pve-lxc-client";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { env } from "@/lib/utils/www-env";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

const ListPveLxcInstancesQuery = z
  .object({
    teamSlugOrId: z.string(),
  })
  .openapi("ListPveLxcInstancesQuery");

const PveLxcInstanceInfo = z
  .object({
    id: z.string(),
    status: z.string(),
    vscodeUrl: z.string().optional(),
    vncUrl: z.string().optional(),
    xtermUrl: z.string().optional(),
  })
  .openapi("PveLxcInstanceInfo");

const ListPveLxcInstancesResponse = z
  .object({
    instances: z.array(PveLxcInstanceInfo),
  })
  .openapi("ListPveLxcInstancesResponse");

export const pveLxcInstancesRouter = new OpenAPIHono();

pveLxcInstancesRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/pve-lxc/instances",
    tags: ["PVE LXC"],
    summary: "List PVE LXC instances available to the authenticated user",
    request: {
      query: ListPveLxcInstancesQuery,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: ListPveLxcInstancesResponse,
          },
        },
        description: "List of PVE LXC instances",
      },
      401: { description: "Unauthorized" },
      500: { description: "Failed to list instances" },
      503: { description: "PVE LXC provider not configured" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    if (!env.PVE_API_URL || !env.PVE_API_TOKEN) {
      return c.text("PVE LXC provider not configured", 503);
    }

    const { teamSlugOrId } = c.req.valid("query");

    try {
      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });

      const client = getPveLxcClient();
      const listedInstances = await client.instances.list();
      const hydratedInstances = await Promise.all(
        listedInstances.map((instance) =>
          client.instances.get({
            instanceId: instance.id,
            vmid: instance.vmid,
            hostname: instance.networking.hostname,
          }),
        ),
      );

      return c.json({
        instances: hydratedInstances.map((instance) => {
          const services = instance.networking.httpServices;
          return {
            id: instance.id,
            status: instance.status,
            vscodeUrl: services.find((service) => service.port === 39378)?.url,
            vncUrl: services.find((service) => service.port === 39380)?.url,
            xtermUrl: services.find((service) => service.port === 39383)?.url,
          };
        }),
      });
    } catch (error) {
      console.error("[pve-lxc.list-instances] Failed to list instances:", error);
      return c.text("Failed to list instances", 500);
    }
  },
);
