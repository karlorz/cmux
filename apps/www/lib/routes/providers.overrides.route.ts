import {
  getAccessTokenFromRequest,
  getUserFromRequest,
} from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { api } from "@cmux/convex/api";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  ProviderListResponse,
  ProviderOverrideSchema,
  SuccessResponse,
  UpsertProviderBody,
  UpsertResponse,
} from "./providers.schemas";

export const providersOverridesRouter = new OpenAPIHono();

providersOverridesRouter.openapi(
  createRoute({
    method: "get",
    path: "/providers",
    tags: ["Providers"],
    summary: "List provider overrides for team",
    request: {
      query: z.object({
        teamSlugOrId: z.string(),
      }),
    },
    responses: {
      200: {
        description: "List of provider overrides",
        content: {
          "application/json": {
            schema: ProviderListResponse,
          },
        },
      },
      401: { description: "Unauthorized" },
    },
  }),
  async (c) => {
    const user = await getUserFromRequest(c.req.raw);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.json({ error: "Missing access token" }, 401);
    }

    const { teamSlugOrId } = c.req.valid("query");
    const convex = getConvex({ accessToken });
    const providers = await convex.query(api.providerOverrides.getForTeam, {
      teamSlugOrId,
    });

    return c.json({ providers });
  },
);

providersOverridesRouter.openapi(
  createRoute({
    method: "get",
    path: "/providers/{id}",
    tags: ["Providers"],
    summary: "Get a specific provider override",
    request: {
      params: z.object({
        id: z.string().describe("Provider ID (e.g., anthropic, openai)"),
      }),
      query: z.object({
        teamSlugOrId: z.string(),
      }),
    },
    responses: {
      200: {
        description: "Provider override",
        content: {
          "application/json": {
            schema: ProviderOverrideSchema.nullable(),
          },
        },
      },
      401: { description: "Unauthorized" },
    },
  }),
  async (c) => {
    const user = await getUserFromRequest(c.req.raw);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.json({ error: "Missing access token" }, 401);
    }

    const { id } = c.req.valid("param");
    const { teamSlugOrId } = c.req.valid("query");
    const convex = getConvex({ accessToken });

    const provider = await convex.query(api.providerOverrides.getByProvider, {
      teamSlugOrId,
      providerId: id,
    });

    return c.json(provider);
  },
);

providersOverridesRouter.openapi(
  createRoute({
    method: "put",
    path: "/providers/{id}",
    tags: ["Providers"],
    summary: "Create or update a provider override",
    request: {
      params: z.object({
        id: z.string().describe("Provider ID (e.g., anthropic, openai)"),
      }),
      query: z.object({
        teamSlugOrId: z.string(),
      }),
      body: {
        content: {
          "application/json": {
            schema: UpsertProviderBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Success",
        content: {
          "application/json": {
            schema: UpsertResponse,
          },
        },
      },
      401: { description: "Unauthorized" },
    },
  }),
  async (c) => {
    const user = await getUserFromRequest(c.req.raw);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.json({ error: "Missing access token" }, 401);
    }

    const { id } = c.req.valid("param");
    const { teamSlugOrId } = c.req.valid("query");
    const body = c.req.valid("json");
    const convex = getConvex({ accessToken });

    const result = await convex.mutation(api.providerOverrides.upsert, {
      teamSlugOrId,
      providerId: id,
      baseUrl: body.baseUrl,
      apiFormat: body.apiFormat,
      apiKeyEnvVar: body.apiKeyEnvVar,
      customHeaders: body.customHeaders,
      fallbacks: body.fallbacks,
      claudeRouting: body.claudeRouting,
      enabled: body.enabled,
    });

    return c.json(result);
  },
);

providersOverridesRouter.openapi(
  createRoute({
    method: "delete",
    path: "/providers/{id}",
    tags: ["Providers"],
    summary: "Delete a provider override",
    request: {
      params: z.object({
        id: z.string().describe("Provider ID (e.g., anthropic, openai)"),
      }),
      query: z.object({
        teamSlugOrId: z.string(),
      }),
    },
    responses: {
      200: {
        description: "Success",
        content: {
          "application/json": {
            schema: SuccessResponse,
          },
        },
      },
      401: { description: "Unauthorized" },
      404: { description: "Provider override not found" },
    },
  }),
  async (c) => {
    const user = await getUserFromRequest(c.req.raw);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.json({ error: "Missing access token" }, 401);
    }

    const { id } = c.req.valid("param");
    const { teamSlugOrId } = c.req.valid("query");
    const convex = getConvex({ accessToken });

    try {
      await convex.mutation(api.providerOverrides.remove, {
        teamSlugOrId,
        providerId: id,
      });
      return c.json({ success: true });
    } catch (error) {
      console.error("[providers.route] Delete failed:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message.includes("not found")) {
        return c.json({ error: message }, 404);
      }
      throw error;
    }
  },
);
