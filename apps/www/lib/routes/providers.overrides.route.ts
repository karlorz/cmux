import {
  getAccessTokenFromRequest,
  getUserFromRequest,
} from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { api } from "@cmux/convex/api";
import { ConvexError } from "convex/values";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  ProviderListResponse,
  ProviderOverrideErrorResponse,
  ProviderOverrideSchema,
  SuccessResponse,
  UpsertProviderBody,
  UpsertResponse,
} from "./providers.schemas";

export const providersOverridesRouter = new OpenAPIHono();

function mapProviderOverrideError(error: unknown): {
  code: string;
  message: string;
  details?: {
    providerId: string;
    field: string;
    reason: string;
  };
} | null {
  if (!(error instanceof ConvexError)) {
    return null;
  }

  const data = error.data as {
    code?: unknown;
    message?: unknown;
    details?: {
      providerId?: unknown;
      field?: unknown;
      reason?: unknown;
    };
  } | undefined;

  if (data?.code !== "INVALID_PROVIDER_OVERRIDE") {
    return null;
  }

  const details = data.details;
  return {
    code: "INVALID_PROVIDER_OVERRIDE",
    message:
      typeof data.message === "string"
        ? data.message
        : "Invalid provider override configuration",
    details:
      typeof details?.providerId === "string" &&
      typeof details.field === "string" &&
      typeof details.reason === "string"
        ? {
            providerId: details.providerId,
            field: details.field,
            reason: details.reason,
          }
        : undefined,
  };
}

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
      422: {
        description: "Invalid provider override configuration",
        content: {
          "application/json": {
            schema: ProviderOverrideErrorResponse,
          },
        },
      },
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

    try {
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
    } catch (error) {
      const mapped = mapProviderOverrideError(error);
      if (mapped) {
        return c.json(mapped, 422);
      }
      throw error;
    }
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
