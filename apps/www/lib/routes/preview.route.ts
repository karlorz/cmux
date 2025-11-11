import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { stackServerApp } from "@/lib/utils/stack";
import { getConvex } from "@/lib/utils/get-convex";
import { api } from "@cmux/convex";

const app = new OpenAPIHono();

// Create or update preview configuration
const createConfigurationRoute = createRoute({
  method: "post",
  path: "/preview/configurations",
  tags: ["preview"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            teamId: z.string(),
            repoFullName: z.string(),
            installationId: z.number(),
            repositoryId: z.number().optional(),
            devScript: z.string().optional(),
            maintenanceScript: z.string().optional(),
            environmentVariables: z
              .array(
                z.object({
                  key: z.string(),
                  value: z.string(),
                })
              )
              .optional(),
            browser: z.string().optional(),
            baseUrls: z.array(z.string()).optional(),
          }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Configuration created successfully",
      content: {
        "application/json": {
          schema: z.object({
            configId: z.string(),
          }),
        },
      },
    },
    401: {
      description: "Unauthorized",
    },
  },
});

app.openapi(createConfigurationRoute, async (c) => {
  const user = await stackServerApp.getUser({ tokenStore: c.req.raw });
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = c.req.valid("json");
  const convex = getConvex();

  const configId = await convex.mutation(api.preview.createConfiguration, {
    userId: user.id,
    ...body,
  });

  return c.json({ configId });
});

// Get configuration by repo
const getConfigurationRoute = createRoute({
  method: "get",
  path: "/preview/configurations/{teamId}/{repoFullName}",
  tags: ["preview"],
  request: {
    params: z.object({
      teamId: z.string(),
      repoFullName: z.string(),
    }),
  },
  responses: {
    200: {
      description: "Configuration retrieved successfully",
    },
    401: {
      description: "Unauthorized",
    },
  },
});

app.openapi(getConfigurationRoute, async (c) => {
  const user = await stackServerApp.getUser({ tokenStore: c.req.raw });
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { teamId, repoFullName } = c.req.valid("param");
  const convex = getConvex();

  const config = await convex.query(api.preview.getConfigurationByRepo, {
    teamId,
    repoFullName: decodeURIComponent(repoFullName),
  });

  return c.json(config);
});

// List team configurations
const listConfigurationsRoute = createRoute({
  method: "get",
  path: "/preview/configurations",
  tags: ["preview"],
  request: {
    query: z.object({
      teamId: z.string(),
    }),
  },
  responses: {
    200: {
      description: "Configurations retrieved successfully",
    },
    401: {
      description: "Unauthorized",
    },
  },
});

app.openapi(listConfigurationsRoute, async (c) => {
  const user = await stackServerApp.getUser({ tokenStore: c.req.raw });
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { teamId } = c.req.valid("query");
  const convex = getConvex();

  const configs = await convex.query(api.preview.listTeamConfigurations, {
    teamId,
  });

  return c.json({ configurations: configs });
});

// Deactivate configuration
const deactivateConfigurationRoute = createRoute({
  method: "delete",
  path: "/preview/configurations/{configId}",
  tags: ["preview"],
  request: {
    params: z.object({
      configId: z.string(),
    }),
  },
  responses: {
    200: {
      description: "Configuration deactivated successfully",
    },
    401: {
      description: "Unauthorized",
    },
  },
});

app.openapi(deactivateConfigurationRoute, async (c) => {
  const user = await stackServerApp.getUser({ tokenStore: c.req.raw });
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { configId } = c.req.valid("param");
  const convex = getConvex();

  await convex.mutation(api.preview.deactivateConfiguration, {
    configId: configId as any, // Type cast for Convex ID
  });

  return c.json({ success: true });
});

export const previewRouter = app;
