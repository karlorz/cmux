import { env } from "@/lib/utils/www-env";
import { getPveLxcClient } from "@/lib/utils/pve-lxc-client";
import { internal } from "@cmux/convex/api";
import { ConvexHttpClient } from "convex/browser";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

const INTERNAL_API_UNAUTHORIZED_MESSAGE =
  "Unauthorized - missing or invalid internal API key";
const PVE_LXC_NOT_CONFIGURED_MESSAGE = "PVE LXC provider not configured";

const PreviewInstanceStartBody = z
  .object({
    snapshotId: z.string(),
    templateVmid: z.number().optional(),
    metadata: z.record(z.string(), z.string().optional()).optional(),
    ttlSeconds: z.number().optional(),
    ttlAction: z.enum(["pause", "stop"]).optional(),
  })
  .openapi("PveLxcPreviewInstanceStartBody");

const PreviewInstanceStartResponse = z
  .object({
    instanceId: z.string(),
    vmid: z.number(),
    status: z.string(),
    networking: z.object({
      httpServices: z.array(
        z.object({
          name: z.string(),
          port: z.number(),
          url: z.string(),
        })
      ),
      hostname: z.string().optional(),
      fqdn: z.string().optional(),
    }),
  })
  .openapi("PveLxcPreviewInstanceStartResponse");

const PreviewInstanceExecBody = z
  .object({
    command: z.string(),
    timeoutMs: z.number().optional(),
  })
  .openapi("PveLxcPreviewInstanceExecBody");

const PreviewInstanceExecResponse = z
  .object({
    exit_code: z.number(),
    stdout: z.string(),
    stderr: z.string(),
  })
  .openapi("PveLxcPreviewInstanceExecResponse");

export const pveLxcPreviewRouter = new OpenAPIHono();

const hasValidInternalApiKey = (authorizationHeader: string | undefined) => {
  const expectedKey = process.env.CMUX_TASK_RUN_JWT_SECRET;
  return Boolean(expectedKey && authorizationHeader === `Bearer ${expectedKey}`);
};

/**
 * Start a PVE LXC instance for preview jobs (called from convex)
 * This endpoint uses an internal API key for authentication instead of user tokens.
 */
pveLxcPreviewRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/pve-lxc/preview/instances/start",
    tags: ["PVE LXC Preview"],
    summary: "Start a PVE LXC instance for preview jobs (internal)",
    request: {
      body: {
        content: {
          "application/json": {
            schema: PreviewInstanceStartBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: PreviewInstanceStartResponse,
          },
        },
        description: "PVE LXC instance started",
      },
      401: { description: INTERNAL_API_UNAUTHORIZED_MESSAGE },
      500: { description: "Failed to start instance" },
      503: { description: PVE_LXC_NOT_CONFIGURED_MESSAGE },
    },
  }),
  async (c) => {
    if (!hasValidInternalApiKey(c.req.header("Authorization"))) {
      return c.text(INTERNAL_API_UNAUTHORIZED_MESSAGE, 401);
    }

    if (!env.PVE_API_URL || !env.PVE_API_TOKEN) {
      return c.text(PVE_LXC_NOT_CONFIGURED_MESSAGE, 503);
    }

    const body = c.req.valid("json");

    try {
      const client = getPveLxcClient();
      const instance = await client.instances.start({
        snapshotId: body.snapshotId,
        templateVmid: body.templateVmid,
        ttlSeconds: body.ttlSeconds ?? 3600,
        ttlAction: body.ttlAction ?? "stop",
        metadata: body.metadata,
      });

      try {
        const deployKey = process.env.CONVEX_DEPLOY_KEY;
        if (!deployKey) {
          console.warn(
            "[pve-lxc.preview.start] CONVEX_DEPLOY_KEY not configured; skipping activity record"
          );
        } else {
          type ConvexAdminClient = {
            setAdminAuth: (token: string) => void;
            mutation: (mutationRef: unknown, args: unknown) => Promise<unknown>;
          };
          const convex = new ConvexHttpClient(
            env.NEXT_PUBLIC_CONVEX_URL
          ) as unknown as ConvexAdminClient;
          convex.setAdminAuth(deployKey);
          await convex.mutation(internal.sandboxInstances.recordCreateInternal, {
            instanceId: instance.id,
            provider: "pve-lxc",
            vmid: instance.vmid,
            hostname: instance.networking.hostname,
            snapshotId: body.snapshotId,
            snapshotProvider: "pve-lxc",
            templateVmid: body.templateVmid,
            teamId: body.metadata?.teamId,
            userId: body.metadata?.userId,
          });
        }
      } catch (error) {
        console.error(
          "[pve-lxc.preview.start] Failed to record instance creation (non-fatal):",
          error
        );
      }

      return c.json({
        instanceId: instance.id,
        vmid: instance.vmid,
        status: instance.status,
        networking: {
          httpServices: instance.networking.httpServices,
          hostname: instance.networking.hostname,
          fqdn: instance.networking.fqdn,
        },
      });
    } catch (error) {
      console.error("[pve-lxc.preview.start] Failed to start instance", error);
      return c.text(
        `Failed to start instance: ${error instanceof Error ? error.message : String(error)}`,
        500
      );
    }
  }
);

/**
 * Execute a command in a PVE LXC instance for preview jobs (called from convex)
 */
pveLxcPreviewRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/pve-lxc/preview/instances/{instanceId}/exec",
    tags: ["PVE LXC Preview"],
    summary: "Execute a command in a PVE LXC instance for preview jobs (internal)",
    request: {
      params: z.object({
        instanceId: z.string(),
      }),
      body: {
        content: {
          "application/json": {
            schema: PreviewInstanceExecBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: PreviewInstanceExecResponse,
          },
        },
        description: "Command executed",
      },
      401: { description: INTERNAL_API_UNAUTHORIZED_MESSAGE },
      404: { description: "Instance not found" },
      500: { description: "Failed to execute command" },
      503: { description: PVE_LXC_NOT_CONFIGURED_MESSAGE },
    },
  }),
  async (c) => {
    if (!hasValidInternalApiKey(c.req.header("Authorization"))) {
      return c.text(INTERNAL_API_UNAUTHORIZED_MESSAGE, 401);
    }

    if (!env.PVE_API_URL || !env.PVE_API_TOKEN) {
      return c.text(PVE_LXC_NOT_CONFIGURED_MESSAGE, 503);
    }

    const { instanceId } = c.req.valid("param");
    const body = c.req.valid("json");

    try {
      const client = getPveLxcClient();
      const instance = await client.instances.get({ instanceId });

      const result = await instance.exec(body.command, {
        timeoutMs: body.timeoutMs,
      });

      return c.json({
        exit_code: result.exit_code,
        stdout: result.stdout,
        stderr: result.stderr,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("404") || errorMessage.includes("not found")) {
        return c.text("Instance not found", 404);
      }
      console.error("[pve-lxc.preview.exec] Failed to execute command", error);
      return c.text("Failed to execute command", 500);
    }
  }
);

/**
 * Stop a PVE LXC instance for preview jobs (called from convex)
 */
pveLxcPreviewRouter.openapi(
  createRoute({
    method: "delete" as const,
    path: "/pve-lxc/preview/instances/{instanceId}",
    tags: ["PVE LXC Preview"],
    summary: "Stop a PVE LXC instance for preview jobs (internal)",
    request: {
      params: z.object({
        instanceId: z.string(),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({ stopped: z.literal(true) }),
          },
        },
        description: "PVE LXC instance stopped",
      },
      401: { description: INTERNAL_API_UNAUTHORIZED_MESSAGE },
      404: { description: "Instance not found" },
      500: { description: "Failed to stop instance" },
      503: { description: PVE_LXC_NOT_CONFIGURED_MESSAGE },
    },
  }),
  async (c) => {
    if (!hasValidInternalApiKey(c.req.header("Authorization"))) {
      return c.text(INTERNAL_API_UNAUTHORIZED_MESSAGE, 401);
    }

    if (!env.PVE_API_URL || !env.PVE_API_TOKEN) {
      return c.text(PVE_LXC_NOT_CONFIGURED_MESSAGE, 503);
    }

    const { instanceId } = c.req.valid("param");

    try {
      const client = getPveLxcClient();
      const instance = await client.instances.get({ instanceId });
      await instance.stop();

      return c.json({ stopped: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("404") || errorMessage.includes("not found")) {
        return c.text("Instance not found", 404);
      }
      console.error("[pve-lxc.preview.stop] Failed to stop instance", error);
      return c.text("Failed to stop instance", 500);
    }
  }
);

/**
 * Read a file from a PVE LXC instance for preview jobs (called from convex)
 * Returns file content as base64.
 */
pveLxcPreviewRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/pve-lxc/preview/instances/{instanceId}/read-file",
    tags: ["PVE LXC Preview"],
    summary: "Read a file from a PVE LXC instance for preview jobs (internal)",
    request: {
      params: z.object({
        instanceId: z.string(),
      }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              filePath: z.string(),
            }),
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              base64: z.string(),
              size: z.number(),
            }),
          },
        },
        description: "File content returned",
      },
      401: { description: INTERNAL_API_UNAUTHORIZED_MESSAGE },
      404: { description: "Instance or file not found" },
      500: { description: "Failed to read file" },
      503: { description: PVE_LXC_NOT_CONFIGURED_MESSAGE },
    },
  }),
  async (c) => {
    if (!hasValidInternalApiKey(c.req.header("Authorization"))) {
      return c.text(INTERNAL_API_UNAUTHORIZED_MESSAGE, 401);
    }

    if (!env.PVE_API_URL || !env.PVE_API_TOKEN) {
      return c.text(PVE_LXC_NOT_CONFIGURED_MESSAGE, 503);
    }

    const { instanceId } = c.req.valid("param");
    const { filePath } = c.req.valid("json");

    try {
      const client = getPveLxcClient();
      const instance = await client.instances.get({ instanceId });

      const result = await instance.exec(`base64 -w 0 "${filePath}"`);
      if (result.exit_code !== 0) {
        if (result.stderr.includes("No such file")) {
          return c.text("File not found", 404);
        }
        throw new Error(`Failed to read file: ${result.stderr}`);
      }

      const base64Content = result.stdout.trim();
      const size = Math.floor((base64Content.length * 3) / 4);

      return c.json({
        base64: base64Content,
        size,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("404") || errorMessage.includes("not found")) {
        return c.text("Instance not found", 404);
      }
      console.error("[pve-lxc.preview.read-file] Failed to read file", error);
      return c.text("Failed to read file", 500);
    }
  }
);
