import { getUserFromRequest } from "@/lib/utils/auth";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { E2BClient } from "@cmux/e2b-client";
import {
  DEFAULT_E2B_TEMPLATE_ID,
  E2B_TEMPLATE_PRESETS,
} from "@cmux/shared/e2b-templates";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { E2BDevboxProvider } from "./devbox/providers/e2b";
import type { DevboxInstance } from "./devbox/providers";

export const devboxRouter = new OpenAPIHono();

const ProviderSchema = z.enum(["e2b", "modal", "morph", "pve-lxc"]);

const DevboxInstanceSchema = z
  .object({
    id: z.string(),
    provider: z.string().optional(),
    status: z.string(),
    name: z.string().optional(),
    templateId: z.string().optional(),
    gpu: z.string().optional(),
    createdAt: z.number().optional(),
    jupyterUrl: z.string().optional(),
    vscodeUrl: z.string().optional(),
    workerUrl: z.string().optional(),
    vncUrl: z.string().optional(),
  })
  .openapi("DevboxInstance");

const CreateDevboxBody = z
  .object({
    teamSlugOrId: z.string(),
    provider: z.enum(["e2b", "modal"]).optional(),
    templateId: z.string().optional(),
    name: z.string().optional(),
    gpu: z.string().optional(),
    cpu: z.number().optional(),
    memoryMiB: z.number().optional(),
    diskGB: z.number().optional(),
    image: z.string().optional(),
    ttlSeconds: z.number().optional(),
    envs: z.record(z.string(), z.string()).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  })
  .openapi("CreateDevboxBody");

const TeamQuerySchema = z
  .object({
    teamSlugOrId: z.string(),
    provider: ProviderSchema.optional(),
  })
  .openapi("DevboxTeamQuery");

const TeamBodySchema = z
  .object({
    teamSlugOrId: z.string(),
  })
  .openapi("DevboxTeamBody");

const ExtendBodySchema = z
  .object({
    teamSlugOrId: z.string(),
    timeoutMs: z.number().optional(),
    ttlSeconds: z.number().optional(),
  })
  .openapi("DevboxExtendBody");

const ExecBodySchema = z
  .object({
    teamSlugOrId: z.string(),
    command: z.union([z.string(), z.array(z.string())]),
    timeout: z.number().optional(),
  })
  .openapi("DevboxExecBody");

const ListInstancesResponseSchema = z
  .object({
    instances: z.array(DevboxInstanceSchema),
  })
  .openapi("ListDevboxInstancesResponse");

const ExecResponseSchema = z
  .object({
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number(),
  })
  .openapi("DevboxExecResponse");

const TokenResponseSchema = z
  .object({
    token: z.string(),
  })
  .openapi("DevboxTokenResponse");

const ActionResponseSchema = z
  .object({
    ok: z.boolean(),
    provider: z.string(),
  })
  .openapi("DevboxActionResponse");

const ExtendResponseSchema = z
  .object({
    ok: z.boolean(),
    provider: z.string(),
    timeoutMs: z.number(),
  })
  .openapi("DevboxExtendResponse");

const TemplateSchema = z
  .object({
    templateId: z.string(),
    presetId: z.string().optional(),
    provider: z.string().optional(),
    name: z.string(),
    description: z.string().optional(),
    cpu: z.string().optional(),
    memory: z.string().optional(),
    disk: z.string().optional(),
    gpu: z.string().optional(),
    image: z.string().optional(),
    supportsDocker: z.boolean().optional(),
    gated: z.boolean().optional(),
  })
  .openapi("DevboxTemplate");

const ListTemplatesResponseSchema = z
  .object({
    templates: z.array(TemplateSchema),
  })
  .openapi("ListDevboxTemplatesResponse");

const ConfigResponseSchema = z
  .object({
    providers: z.array(z.string()),
    defaultProvider: z.string(),
    e2b: z
      .object({
        defaultTemplateId: z.string(),
      })
      .optional(),
  })
  .openapi("DevboxConfigResponse");

let e2bProvider: E2BDevboxProvider | null = null;

function getE2BProvider(): E2BDevboxProvider {
  const apiKey = process.env.E2B_API_KEY;
  if (!apiKey) {
    throw new HTTPException(500, {
      message: "E2B provider is not configured",
    });
  }

  if (!e2bProvider) {
    e2bProvider = new E2BDevboxProvider(new E2BClient({ apiKey }));
  }

  return e2bProvider;
}

function normalizeProviderOrThrow(provider?: string): "e2b" {
  if (!provider || provider === "e2b") {
    return "e2b";
  }

  throw new HTTPException(400, {
    message: `Provider "${provider}" is not supported yet`,
  });
}

function toInstanceResponse(instance: DevboxInstance) {
  return {
    id: instance.id,
    provider: instance.provider,
    status: instance.status,
    name: instance.name,
    templateId: instance.templateId,
    gpu: instance.gpu,
    createdAt: instance.createdAt,
    jupyterUrl: instance.jupyterUrl,
    vscodeUrl: instance.vscodeUrl,
    workerUrl: instance.workerUrl,
    vncUrl: instance.vncUrl,
  };
}

function isProbablyNotFound(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("not found") || message.includes("404");
}

function normalizeExecCommand(command: string | string[]): string {
  return Array.isArray(command) ? command.join(" ") : command;
}

function normalizeExecTimeoutMs(timeout?: number): number | undefined {
  if (typeof timeout !== "number" || Number.isNaN(timeout) || timeout <= 0) {
    return undefined;
  }

  // Cloudrouter CLI passes timeout in seconds.
  if (timeout <= 10_000) {
    return Math.floor(timeout * 1000);
  }

  return Math.floor(timeout);
}

function normalizeExtendTimeoutMs(body: {
  timeoutMs?: number;
  ttlSeconds?: number;
}): number {
  if (
    typeof body.ttlSeconds === "number" &&
    Number.isFinite(body.ttlSeconds) &&
    body.ttlSeconds > 0
  ) {
    return Math.floor(body.ttlSeconds * 1000);
  }

  if (
    typeof body.timeoutMs === "number" &&
    Number.isFinite(body.timeoutMs) &&
    body.timeoutMs > 0
  ) {
    // Cloudrouter currently sends this field in seconds despite the name.
    if (body.timeoutMs <= 10_000) {
      return Math.floor(body.timeoutMs * 1000);
    }
    return Math.floor(body.timeoutMs);
  }

  return 60 * 60 * 1000;
}

async function requireUser(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
  return user;
}

async function requireTeam(req: Request, teamSlugOrId: string) {
  return await verifyTeamAccess({ req, teamSlugOrId });
}

function assertInstanceOwnership(
  instance: DevboxInstance,
  opts: { userId: string; teamId: string }
): void {
  const metadata = instance.metadata ?? {};
  if (metadata.userId !== opts.userId || metadata.teamId !== opts.teamId) {
    throw new HTTPException(404, { message: "Instance not found" });
  }
}

devboxRouter.openapi(
  createRoute({
    method: "post",
    path: "/v2/devbox/instances",
    tags: ["DevboxV2"],
    summary: "Create a devbox instance",
    request: {
      body: {
        content: {
          "application/json": {
            schema: CreateDevboxBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: DevboxInstanceSchema,
          },
        },
        description: "Created instance",
      },
      400: { description: "Bad request" },
      401: { description: "Unauthorized" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const req = c.req.raw;

    const user = await requireUser(req);
    const team = await requireTeam(req, body.teamSlugOrId);
    normalizeProviderOrThrow(body.provider);

    try {
      const instance = await getE2BProvider().createInstance({
        templateId: body.templateId,
        name: body.name,
        ttlSeconds: body.ttlSeconds,
        envs: body.envs,
        autoPause: true,
        secure: true,
        allowInternetAccess: true,
        metadata: {
          ...(body.metadata ?? {}),
          app: "cmux-devbox-v2",
          userId: user.id,
          teamId: team.uuid,
        },
      });

      return c.json(toInstanceResponse(instance));
    } catch (error) {
      console.error("[devbox.create] Failed to create instance", error);
      throw new HTTPException(500, {
        message: "Failed to create instance",
      });
    }
  }
);

devboxRouter.openapi(
  createRoute({
    method: "get",
    path: "/v2/devbox/instances",
    tags: ["DevboxV2"],
    summary: "List devbox instances",
    request: {
      query: TeamQuerySchema,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: ListInstancesResponseSchema,
          },
        },
        description: "List of instances",
      },
      400: { description: "Bad request" },
      401: { description: "Unauthorized" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const query = c.req.valid("query");
    const req = c.req.raw;

    const user = await requireUser(req);
    const team = await requireTeam(req, query.teamSlugOrId);

    if (query.provider && query.provider !== "e2b") {
      return c.json({ instances: [] });
    }

    try {
      const instances = await getE2BProvider().listInstances({
        metadata: {
          userId: user.id,
          teamId: team.uuid,
        },
      });

      return c.json({
        instances: instances.map(toInstanceResponse),
      });
    } catch (error) {
      console.error("[devbox.list] Failed to list instances", error);
      throw new HTTPException(500, {
        message: "Failed to list instances",
      });
    }
  }
);

devboxRouter.openapi(
  createRoute({
    method: "get",
    path: "/v2/devbox/instances/{id}",
    tags: ["DevboxV2"],
    summary: "Get a devbox instance",
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
            schema: DevboxInstanceSchema,
          },
        },
        description: "Instance details",
      },
      401: { description: "Unauthorized" },
      404: { description: "Not found" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const { teamSlugOrId } = c.req.valid("query");
    const req = c.req.raw;

    const user = await requireUser(req);
    const team = await requireTeam(req, teamSlugOrId);

    try {
      const instance = await getE2BProvider().getInstance(id);
      assertInstanceOwnership(instance, {
        userId: user.id,
        teamId: team.uuid,
      });
      return c.json(toInstanceResponse(instance));
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      if (isProbablyNotFound(error)) {
        throw new HTTPException(404, { message: "Instance not found" });
      }
      console.error("[devbox.get] Failed to get instance", error);
      throw new HTTPException(500, {
        message: "Failed to get instance",
      });
    }
  }
);

function registerActionRoute(options: {
  path: string;
  summary: string;
  handler: (
    instanceId: string,
    body: { teamSlugOrId: string },
    req: Request,
    user: Awaited<ReturnType<typeof requireUser>>,
    team: Awaited<ReturnType<typeof requireTeam>>,
  ) => Promise<{ ok: boolean; provider: string }>;
}) {
  devboxRouter.openapi(
    createRoute({
      method: "post",
      path: options.path,
      tags: ["DevboxV2"],
      summary: options.summary,
      request: {
        params: z.object({
          id: z.string(),
        }),
        body: {
          content: {
            "application/json": {
              schema: TeamBodySchema,
            },
          },
          required: true,
        },
      },
      responses: {
        200: {
          content: {
            "application/json": {
              schema: ActionResponseSchema,
            },
          },
          description: "Action completed",
        },
        401: { description: "Unauthorized" },
        404: { description: "Not found" },
        500: { description: "Server error" },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const req = c.req.raw;

      const user = await requireUser(req);
      const team = await requireTeam(req, body.teamSlugOrId);

      const result = await options.handler(id, body, req, user, team);
      return c.json(result);
    }
  );
}

registerActionRoute({
  path: "/v2/devbox/instances/{id}/stop",
  summary: "Stop a devbox instance",
  handler: async (id, _body, _req, user, team) => {
    const provider = getE2BProvider();

    try {
      const instance = await provider.getInstance(id);
      assertInstanceOwnership(instance, { userId: user.id, teamId: team.uuid });
      await provider.stopInstance(id);
      return { ok: true, provider: "e2b" };
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      if (isProbablyNotFound(error)) {
        throw new HTTPException(404, { message: "Instance not found" });
      }
      console.error("[devbox.stop] Failed to stop instance", error);
      throw new HTTPException(500, { message: "Failed to stop instance" });
    }
  },
});

registerActionRoute({
  path: "/v2/devbox/instances/{id}/pause",
  summary: "Pause a devbox instance",
  handler: async (id, _body, _req, user, team) => {
    const provider = getE2BProvider();

    try {
      const instance = await provider.getInstance(id);
      assertInstanceOwnership(instance, { userId: user.id, teamId: team.uuid });
      await provider.pauseInstance(id);
      return { ok: true, provider: "e2b" };
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      if (isProbablyNotFound(error)) {
        throw new HTTPException(404, { message: "Instance not found" });
      }
      console.error("[devbox.pause] Failed to pause instance", error);
      throw new HTTPException(500, { message: "Failed to pause instance" });
    }
  },
});

registerActionRoute({
  path: "/v2/devbox/instances/{id}/resume",
  summary: "Resume a devbox instance",
  handler: async (id, _body, _req, user, team) => {
    const provider = getE2BProvider();

    try {
      const instance = await provider.getInstance(id);
      assertInstanceOwnership(instance, { userId: user.id, teamId: team.uuid });
      await provider.resumeInstance(id);
      return { ok: true, provider: "e2b" };
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      if (isProbablyNotFound(error)) {
        throw new HTTPException(404, { message: "Instance not found" });
      }
      console.error("[devbox.resume] Failed to resume instance", error);
      throw new HTTPException(500, { message: "Failed to resume instance" });
    }
  },
});

registerActionRoute({
  path: "/v2/devbox/instances/{id}/delete",
  summary: "Delete a devbox instance",
  handler: async (id, _body, _req, user, team) => {
    const provider = getE2BProvider();

    try {
      const instance = await provider.getInstance(id);
      assertInstanceOwnership(instance, { userId: user.id, teamId: team.uuid });
      await provider.deleteInstance(id);
      return { ok: true, provider: "e2b" };
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      if (isProbablyNotFound(error)) {
        throw new HTTPException(404, { message: "Instance not found" });
      }
      console.error("[devbox.delete] Failed to delete instance", error);
      throw new HTTPException(500, { message: "Failed to delete instance" });
    }
  },
});

devboxRouter.openapi(
  createRoute({
    method: "post",
    path: "/v2/devbox/instances/{id}/extend",
    tags: ["DevboxV2"],
    summary: "Extend devbox timeout",
    request: {
      params: z.object({
        id: z.string(),
      }),
      body: {
        content: {
          "application/json": {
            schema: ExtendBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: ExtendResponseSchema,
          },
        },
        description: "Timeout extended",
      },
      401: { description: "Unauthorized" },
      404: { description: "Not found" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const req = c.req.raw;

    const user = await requireUser(req);
    const team = await requireTeam(req, body.teamSlugOrId);
    const timeoutMs = normalizeExtendTimeoutMs(body);

    const provider = getE2BProvider();

    try {
      const instance = await provider.getInstance(id);
      assertInstanceOwnership(instance, { userId: user.id, teamId: team.uuid });
      await provider.extendTimeout(id, timeoutMs);
      return c.json({ ok: true, provider: "e2b", timeoutMs });
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      if (isProbablyNotFound(error)) {
        throw new HTTPException(404, { message: "Instance not found" });
      }
      console.error("[devbox.extend] Failed to extend timeout", error);
      throw new HTTPException(500, { message: "Failed to extend timeout" });
    }
  }
);

devboxRouter.openapi(
  createRoute({
    method: "post",
    path: "/v2/devbox/instances/{id}/exec",
    tags: ["DevboxV2"],
    summary: "Execute command in devbox",
    request: {
      params: z.object({
        id: z.string(),
      }),
      body: {
        content: {
          "application/json": {
            schema: ExecBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: ExecResponseSchema,
          },
        },
        description: "Command output",
      },
      401: { description: "Unauthorized" },
      404: { description: "Not found" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const req = c.req.raw;

    const user = await requireUser(req);
    const team = await requireTeam(req, body.teamSlugOrId);
    const provider = getE2BProvider();

    try {
      const instance = await provider.getInstance(id);
      assertInstanceOwnership(instance, { userId: user.id, teamId: team.uuid });

      const result = await provider.exec(
        id,
        normalizeExecCommand(body.command),
        normalizeExecTimeoutMs(body.timeout)
      );

      return c.json(result);
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      if (isProbablyNotFound(error)) {
        throw new HTTPException(404, { message: "Instance not found" });
      }
      console.error("[devbox.exec] Failed to execute command", error);
      throw new HTTPException(500, { message: "Failed to execute command" });
    }
  }
);

devboxRouter.openapi(
  createRoute({
    method: "post",
    path: "/v2/devbox/instances/{id}/token",
    tags: ["DevboxV2"],
    summary: "Get devbox auth token",
    request: {
      params: z.object({
        id: z.string(),
      }),
      body: {
        content: {
          "application/json": {
            schema: TeamBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: TokenResponseSchema,
          },
        },
        description: "Auth token",
      },
      401: { description: "Unauthorized" },
      404: { description: "Not found" },
      503: { description: "Token not ready" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const req = c.req.raw;

    const user = await requireUser(req);
    const team = await requireTeam(req, body.teamSlugOrId);
    const provider = getE2BProvider();

    try {
      const instance = await provider.getInstance(id);
      assertInstanceOwnership(instance, { userId: user.id, teamId: team.uuid });

      const token = await provider.getAuthToken(id);
      if (!token) {
        return c.json({ code: 503, message: "Auth token not yet available" }, 503);
      }

      return c.json({ token });
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      if (isProbablyNotFound(error)) {
        throw new HTTPException(404, { message: "Instance not found" });
      }
      console.error("[devbox.token] Failed to get auth token", error);
      throw new HTTPException(500, { message: "Failed to get auth token" });
    }
  }
);

devboxRouter.openapi(
  createRoute({
    method: "get",
    path: "/v2/devbox/templates",
    tags: ["DevboxV2"],
    summary: "List available devbox templates",
    request: {
      query: TeamQuerySchema,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: ListTemplatesResponseSchema,
          },
        },
        description: "List templates",
      },
      401: { description: "Unauthorized" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const query = c.req.valid("query");
    const req = c.req.raw;

    await requireUser(req);
    await requireTeam(req, query.teamSlugOrId);

    if (query.provider && query.provider !== "e2b") {
      return c.json({ templates: [] });
    }

    const templates = E2B_TEMPLATE_PRESETS.map((preset) => ({
      provider: "e2b",
      // Stable identifier used by CLI for preset selection.
      presetId: preset.templateId,
      // Actual E2B template ID sent to provider on create.
      templateId: preset.id,
      name: preset.label,
      description: preset.description,
      cpu: preset.cpu,
      memory: preset.memory,
      disk: preset.disk,
      supportsDocker: preset.templateId.includes("docker"),
    }));

    return c.json({ templates });
  }
);

devboxRouter.openapi(
  createRoute({
    method: "get",
    path: "/v2/devbox/config",
    tags: ["DevboxV2"],
    summary: "Get devbox provider config",
    responses: {
      200: {
        content: {
          "application/json": {
            schema: ConfigResponseSchema,
          },
        },
        description: "Provider configuration",
      },
      401: { description: "Unauthorized" },
    },
  }),
  async (c) => {
    await requireUser(c.req.raw);

    return c.json({
      providers: ["e2b"],
      defaultProvider: "e2b",
      e2b: {
        defaultTemplateId: DEFAULT_E2B_TEMPLATE_ID,
      },
    });
  }
);
