import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex, getConvexAdmin } from "@/lib/utils/get-convex";
import { getPveLxcClient } from "@/lib/utils/pve-lxc-client";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { env } from "@/lib/utils/www-env";
import { api, internal } from "@cmux/convex/api";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { waitForPveExecReady } from "./pve-lxc.resume.helpers";

const ListPveLxcInstancesQuery = z
  .object({
    teamSlugOrId: z.string(),
  })
  .openapi("ListPveLxcInstancesQuery");

const PveLxcInstanceParams = z
  .object({
    instanceId: z.string(),
  })
  .openapi("PveLxcInstanceParams");

const PveLxcInstanceQuery = z
  .object({
    teamSlugOrId: z.string(),
  })
  .openapi("PveLxcInstanceQuery");

const PveLxcInstanceActionBody = z
  .object({
    teamSlugOrId: z.string(),
  })
  .openapi("PveLxcInstanceActionBody");

const PveLxcInstanceExecBody = z
  .object({
    teamSlugOrId: z.string(),
    command: z.string(),
    timeoutSeconds: z.number().int().positive().optional(),
  })
  .openapi("PveLxcInstanceExecBody");

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

const PveLxcInstanceExecResponse = z
  .object({
    stdout: z.string(),
    stderr: z.string(),
    exit_code: z.number(),
  })
  .openapi("PveLxcInstanceExecResponse");

const PveLxcPauseResponse = z
  .object({
    paused: z.literal(true),
  })
  .openapi("PveLxcPauseResponse");

const PveLxcStopResponse = z
  .object({
    stopped: z.literal(true),
  })
  .openapi("PveLxcStopResponse");

export const pveLxcInstancesRouter = new OpenAPIHono();

const PVE_PROVIDER_NOT_CONFIGURED_MESSAGE = "PVE LXC provider not configured";
const PVE_VSCODE_PORT = 39378;
const PVE_VNC_PORT = 39380;
const PVE_XTERM_PORT = 39383;

type AuthorizedPveLxcInstanceContext = {
  client: ReturnType<typeof getPveLxcClient>;
  convex: ReturnType<typeof getConvex>;
  instance: Awaited<ReturnType<ReturnType<typeof getPveLxcClient>["instances"]["get"]>>;
};

function getServiceURL(
  instance: AuthorizedPveLxcInstanceContext["instance"],
  port: number,
): string | undefined {
  return instance.networking.httpServices.find((service) => service.port === port)?.url;
}

function serializePveLxcInstance(instance: AuthorizedPveLxcInstanceContext["instance"]) {
  return {
    id: instance.id,
    status: instance.status,
    vscodeUrl: getServiceURL(instance, PVE_VSCODE_PORT),
    vncUrl: getServiceURL(instance, PVE_VNC_PORT),
    xtermUrl: getServiceURL(instance, PVE_XTERM_PORT),
  };
}

function isNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes("404") ||
    normalized.includes("not found") ||
    normalized.includes("unable to resolve vmid")
  );
}

async function getAuthorizedPveLxcInstanceContext(
  req: Request,
  teamSlugOrId: string,
  instanceId: string,
): Promise<AuthorizedPveLxcInstanceContext | Response> {
  const accessToken = await getAccessTokenFromRequest(req);
  if (!accessToken) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!env.PVE_API_URL || !env.PVE_API_TOKEN) {
    return new Response(PVE_PROVIDER_NOT_CONFIGURED_MESSAGE, { status: 503 });
  }

  const convex = getConvex({ accessToken });
  const team = await verifyTeamAccess({ req, teamSlugOrId });
  const activity = await convex.query(api.sandboxInstances.getActivity, {
    instanceId,
  });

  if (!activity) {
    return new Response("Sandbox not found", { status: 404 });
  }
  if (activity.teamId && activity.teamId !== team.uuid) {
    return new Response("Forbidden", { status: 403 });
  }

  const client = getPveLxcClient();

  try {
    const instance = await client.instances.get({ instanceId });
    if (instance.metadata.teamId && instance.metadata.teamId !== team.uuid) {
      return new Response("Forbidden", { status: 403 });
    }
    return {
      client,
      convex,
      instance,
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      return new Response("Instance not found", { status: 404 });
    }
    throw error;
  }
}

async function recordPveInstanceActivity(
  action: "pause" | "stop",
  instanceId: string,
): Promise<void> {
  const convexAdmin = getConvexAdmin();
  if (!convexAdmin) {
    console.warn(`[pve-lxc.${action}] Convex admin auth not configured; skipping activity record`);
    return;
  }

  try {
    if (action === "pause") {
      await convexAdmin.mutation(internal.sandboxInstances.recordPauseInternal, {
        instanceId,
        provider: "pve-lxc",
      });
      return;
    }

    await convexAdmin.mutation(internal.sandboxInstances.recordStopInternal, {
      instanceId,
      provider: "pve-lxc",
    });
  } catch (error) {
    console.error(`[pve-lxc.${action}] Failed to record activity (non-fatal):`, error);
  }
}

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
      return c.text(PVE_PROVIDER_NOT_CONFIGURED_MESSAGE, 503);
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
        instances: hydratedInstances.map((instance) => serializePveLxcInstance(instance)),
      });
    } catch (error) {
      console.error("[pve-lxc.list-instances] Failed to list instances:", error);
      return c.text("Failed to list instances", 500);
    }
  },
);

pveLxcInstancesRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/pve-lxc/instances/{instanceId}",
    tags: ["PVE LXC"],
    summary: "Get a PVE LXC instance available to the authenticated user",
    request: {
      params: PveLxcInstanceParams,
      query: PveLxcInstanceQuery,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: PveLxcInstanceInfo,
          },
        },
        description: "PVE LXC instance details",
      },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Instance not found" },
      500: { description: "Failed to get instance" },
      503: { description: PVE_PROVIDER_NOT_CONFIGURED_MESSAGE },
    },
  }),
  async (c) => {
    const { instanceId } = c.req.valid("param");
    const { teamSlugOrId } = c.req.valid("query");

    try {
      const context = await getAuthorizedPveLxcInstanceContext(c.req.raw, teamSlugOrId, instanceId);
      if (context instanceof Response) {
        return c.body(await context.text(), context.status as 401 | 403 | 404 | 503);
      }

      return c.json(serializePveLxcInstance(context.instance));
    } catch (error) {
      console.error("[pve-lxc.get-instance] Failed to get instance:", error);
      return c.text("Failed to get instance", 500);
    }
  },
);

pveLxcInstancesRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/pve-lxc/instances/{instanceId}/exec",
    tags: ["PVE LXC"],
    summary: "Execute a command in a PVE LXC instance",
    request: {
      params: PveLxcInstanceParams,
      body: {
        content: {
          "application/json": {
            schema: PveLxcInstanceExecBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: PveLxcInstanceExecResponse,
          },
        },
        description: "Command executed",
      },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Instance not found" },
      500: { description: "Failed to execute command" },
      503: { description: PVE_PROVIDER_NOT_CONFIGURED_MESSAGE },
    },
  }),
  async (c) => {
    const { instanceId } = c.req.valid("param");
    const body = c.req.valid("json");

    try {
      const context = await getAuthorizedPveLxcInstanceContext(
        c.req.raw,
        body.teamSlugOrId,
        instanceId,
      );
      if (context instanceof Response) {
        return c.body(await context.text(), context.status as 401 | 403 | 404 | 503);
      }

      const result = await context.instance.exec(body.command, {
        timeoutMs: body.timeoutSeconds ? body.timeoutSeconds * 1000 : undefined,
      });

      return c.json({
        stdout: result.stdout,
        stderr: result.stderr,
        exit_code: result.exit_code,
      });
    } catch (error) {
      console.error("[pve-lxc.exec-instance] Failed to execute command:", error);
      return c.text("Failed to execute command", 500);
    }
  },
);

pveLxcInstancesRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/pve-lxc/instances/{instanceId}/pause",
    tags: ["PVE LXC"],
    summary: "Pause a PVE LXC instance",
    request: {
      params: PveLxcInstanceParams,
      body: {
        content: {
          "application/json": {
            schema: PveLxcInstanceActionBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: PveLxcPauseResponse,
          },
        },
        description: "PVE LXC instance paused",
      },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Instance not found" },
      500: { description: "Failed to pause instance" },
      503: { description: PVE_PROVIDER_NOT_CONFIGURED_MESSAGE },
    },
  }),
  async (c) => {
    const { instanceId } = c.req.valid("param");
    const { teamSlugOrId } = c.req.valid("json");

    try {
      const context = await getAuthorizedPveLxcInstanceContext(c.req.raw, teamSlugOrId, instanceId);
      if (context instanceof Response) {
        return c.body(await context.text(), context.status as 401 | 403 | 404 | 503);
      }

      await context.instance.pause();
      await recordPveInstanceActivity("pause", instanceId);

      return c.json({ paused: true });
    } catch (error) {
      console.error("[pve-lxc.pause-instance] Failed to pause instance:", error);
      return c.text("Failed to pause instance", 500);
    }
  },
);

pveLxcInstancesRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/pve-lxc/instances/{instanceId}/resume",
    tags: ["PVE LXC"],
    summary: "Resume a PVE LXC instance",
    request: {
      params: PveLxcInstanceParams,
      body: {
        content: {
          "application/json": {
            schema: PveLxcInstanceActionBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: PveLxcInstanceInfo,
          },
        },
        description: "PVE LXC instance resumed",
      },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Instance not found" },
      500: { description: "Failed to resume instance" },
      503: { description: PVE_PROVIDER_NOT_CONFIGURED_MESSAGE },
    },
  }),
  async (c) => {
    const { instanceId } = c.req.valid("param");
    const { teamSlugOrId } = c.req.valid("json");

    try {
      const context = await getAuthorizedPveLxcInstanceContext(c.req.raw, teamSlugOrId, instanceId);
      if (context instanceof Response) {
        return c.body(await context.text(), context.status as 401 | 403 | 404 | 503);
      }

      if (context.instance.status !== "running") {
        await context.instance.resume();
      }
      await waitForPveExecReady(context.instance);

      await context.convex.mutation(api.sandboxInstances.recordResume, {
        instanceId,
        teamSlugOrId,
      });

      const resumedInstance = await context.client.instances.get({ instanceId });
      return c.json(serializePveLxcInstance(resumedInstance));
    } catch (error) {
      console.error("[pve-lxc.resume-instance] Failed to resume instance:", error);
      return c.text("Failed to resume instance", 500);
    }
  },
);

pveLxcInstancesRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/pve-lxc/instances/{instanceId}/stop",
    tags: ["PVE LXC"],
    summary: "Delete a PVE LXC instance",
    request: {
      params: PveLxcInstanceParams,
      body: {
        content: {
          "application/json": {
            schema: PveLxcInstanceActionBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: PveLxcStopResponse,
          },
        },
        description: "PVE LXC instance deleted",
      },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Instance not found" },
      500: { description: "Failed to delete instance" },
      503: { description: PVE_PROVIDER_NOT_CONFIGURED_MESSAGE },
    },
  }),
  async (c) => {
    const { instanceId } = c.req.valid("param");
    const { teamSlugOrId } = c.req.valid("json");

    try {
      const context = await getAuthorizedPveLxcInstanceContext(c.req.raw, teamSlugOrId, instanceId);
      if (context instanceof Response) {
        return c.body(await context.text(), context.status as 401 | 403 | 404 | 503);
      }

      await context.instance.delete();
      await recordPveInstanceActivity("stop", instanceId);

      return c.json({ stopped: true });
    } catch (error) {
      console.error("[pve-lxc.stop-instance] Failed to delete instance:", error);
      return c.text("Failed to delete instance", 500);
    }
  },
);
