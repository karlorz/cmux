/**
 * Provider Control Plane Routes.
 *
 * Canonical routes for provider inventory, connection state, and model availability.
 * Replaces the fragmented provider status and connection testing routes.
 */

import {
  getAccessTokenFromRequest,
  getUserFromRequest,
} from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { api } from "@cmux/convex/api";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

// ============================================================================
// Schemas
// ============================================================================

const AuthMethodSchema = z
  .object({
    id: z.string(),
    type: z.enum(["api_key", "oauth_token", "json_blob", "custom_endpoint"]),
    displayName: z.string(),
    description: z.string().optional(),
    envVar: z.string(),
    preferred: z.boolean().optional(),
    placeholder: z.string().optional(),
    multiline: z.boolean().optional(),
  })
  .openapi("AuthMethod");

const ConnectionStateSchema = z
  .object({
    isConnected: z.boolean(),
    source: z
      .enum([
        "env",
        "stored_api_key",
        "stored_oauth_token",
        "stored_json_blob",
        "override",
        "free",
      ])
      .nullable(),
    configuredEnvVars: z.array(z.string()),
    hasFreeModels: z.boolean(),
    lastVerifiedAt: z.number().optional(),
    error: z.string().optional(),
  })
  .openapi("ConnectionState");

const DefaultModelSchema = z
  .object({
    name: z.string(),
    displayName: z.string(),
    reason: z.string().optional(),
  })
  .openapi("DefaultModel");

const ControlPlaneProviderSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    defaultBaseUrl: z.string(),
    effectiveBaseUrl: z.string(),
    apiFormat: z.enum(["anthropic", "openai", "bedrock", "vertex", "passthrough"]),
    authMethods: z.array(AuthMethodSchema),
    connectionState: ConnectionStateSchema,
    defaultModel: DefaultModelSchema.optional(),
    isOverridden: z.boolean(),
    customHeaders: z.record(z.string(), z.string()).optional(),
  })
  .openapi("ControlPlaneProvider");

const ControlPlaneModelSchema = z
  .object({
    name: z.string(),
    displayName: z.string(),
    providerId: z.string(),
    vendor: z.string(),
    isAvailable: z.boolean(),
    tier: z.enum(["free", "paid"]),
    requiredApiKeys: z.array(z.string()),
    tags: z.array(z.string()),
    sortOrder: z.number(),
    disabled: z.boolean().optional(),
    disabledReason: z.string().optional(),
  })
  .openapi("ControlPlaneModel");

const DiscoveryFreshnessSchema = z
  .object({
    providerId: z.string(),
    isStale: z.boolean(),
    lastDiscoveredAt: z.number().optional(),
    error: z.string().optional(),
    modelCount: z.number(),
  })
  .openapi("DiscoveryFreshness");

// Response schemas
const ListProvidersResponseSchema = z
  .object({
    providers: z.array(ControlPlaneProviderSchema),
    generatedAt: z.number(),
  })
  .openapi("ListProvidersResponse");

const ListModelsResponseSchema = z
  .object({
    models: z.array(ControlPlaneModelSchema),
    defaultsByProvider: z.record(z.string(), DefaultModelSchema),
    view: z.enum(["all", "connected", "vendor"]),
    filter: z.string().optional(),
    refreshedAt: z.number().optional(),
    generatedAt: z.number(),
  })
  .openapi("ListModelsResponse");

const ConnectResponseSchema = z
  .object({
    action: z.enum(["created", "updated"]),
    envVar: z.string(),
  })
  .openapi("ConnectResponse");

const DisconnectResponseSchema = z
  .object({
    action: z.enum(["deleted", "not_found"]),
    envVar: z.string(),
  })
  .openapi("DisconnectResponse");

const RefreshResponseSchema = z
  .object({
    action: z.literal("refresh_requested"),
    providerId: z.string(),
    teamId: z.string(),
  })
  .openapi("RefreshResponse");

// ============================================================================
// Router
// ============================================================================

export const providerControlPlaneRouter = new OpenAPIHono();

// GET /api/provider-control-plane - List all providers
providerControlPlaneRouter.openapi(
  createRoute({
    method: "get",
    path: "/provider-control-plane",
    tags: ["Provider Control Plane"],
    summary: "List all providers with connection states",
    description:
      "Returns all providers with their connection states, auth methods, and default models.",
    request: {
      query: z.object({
        teamSlugOrId: z.string(),
      }),
    },
    responses: {
      200: {
        description: "Provider list",
        content: {
          "application/json": {
            schema: ListProvidersResponseSchema,
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

    const result = await convex.query(
      api.providerControlPlane.listProvidersQuery,
      { teamSlugOrId }
    );

    // Transform to match the response schema
    return c.json({
      providers: result.providers.map((p) => ({
        id: p.id,
        name: p.name,
        defaultBaseUrl: p.defaultBaseUrl,
        effectiveBaseUrl: p.effectiveBaseUrl,
        apiFormat: p.apiFormat,
        authMethods: p.authMethods.map((m) => ({
          id: m.id,
          type: m.type,
          displayName: m.displayName,
          description: m.apiKey.description,
          envVar: m.apiKey.envVar,
          preferred: m.preferred,
          placeholder: m.placeholder,
          multiline: m.multiline,
        })),
        connectionState: p.connectionState,
        defaultModel: p.defaultModel,
        isOverridden: p.isOverridden,
        customHeaders: p.customHeaders,
      })),
      generatedAt: result.generatedAt,
    });
  }
);

// GET /api/provider-control-plane/models - List models
providerControlPlaneRouter.openapi(
  createRoute({
    method: "get",
    path: "/provider-control-plane/models",
    tags: ["Provider Control Plane"],
    summary: "List models with availability",
    description:
      "Returns models with availability resolved based on provider connection state.",
    request: {
      query: z.object({
        teamSlugOrId: z.string(),
        view: z.enum(["all", "connected", "vendor"]).optional(),
        providerId: z.string().optional(),
        includeDisabled: z.coerce.boolean().optional(),
      }),
    },
    responses: {
      200: {
        description: "Model list",
        content: {
          "application/json": {
            schema: ListModelsResponseSchema,
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

    const { teamSlugOrId, view, providerId, includeDisabled } =
      c.req.valid("query");
    const convex = getConvex({ accessToken });

    const result = await convex.query(
      api.providerControlPlane.listModelsQuery,
      {
        teamSlugOrId,
        view,
        providerId,
        includeDisabled,
      }
    );

    return c.json(result);
  }
);

// GET /api/provider-control-plane/discovery-freshness - Get discovery freshness
providerControlPlaneRouter.openapi(
  createRoute({
    method: "get",
    path: "/provider-control-plane/discovery-freshness",
    tags: ["Provider Control Plane"],
    summary: "Get discovery freshness for providers",
    description:
      "Returns discovery freshness state for providers that support model discovery.",
    request: {
      query: z.object({
        teamSlugOrId: z.string(),
        staleDurationMs: z.coerce.number().optional(),
      }),
    },
    responses: {
      200: {
        description: "Discovery freshness",
        content: {
          "application/json": {
            schema: z.object({
              freshness: z.array(DiscoveryFreshnessSchema),
            }),
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

    const { teamSlugOrId, staleDurationMs } = c.req.valid("query");
    const convex = getConvex({ accessToken });

    const result = await convex.query(
      api.providerControlPlane.getDiscoveryFreshnessQuery,
      { teamSlugOrId, staleDurationMs }
    );

    return c.json({ freshness: result });
  }
);

// POST /api/provider-control-plane/connect - Connect a provider
providerControlPlaneRouter.openapi(
  createRoute({
    method: "post",
    path: "/provider-control-plane/connect",
    tags: ["Provider Control Plane"],
    summary: "Connect a provider by storing credentials",
    description: "Stores an API key or credential to connect a provider.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              teamSlugOrId: z.string(),
              envVar: z.string(),
              value: z.string(),
              displayName: z.string(),
              description: z.string().optional(),
            }),
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Connection result",
        content: {
          "application/json": {
            schema: ConnectResponseSchema,
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

    const body = c.req.valid("json");
    const convex = getConvex({ accessToken });

    const result = await convex.mutation(api.providerControlPlane.connect, body);
    return c.json(result);
  }
);

// POST /api/provider-control-plane/disconnect - Disconnect a provider
providerControlPlaneRouter.openapi(
  createRoute({
    method: "post",
    path: "/provider-control-plane/disconnect",
    tags: ["Provider Control Plane"],
    summary: "Disconnect a provider by removing credentials",
    description: "Removes the stored credential for a provider.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              teamSlugOrId: z.string(),
              envVar: z.string(),
            }),
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Disconnection result",
        content: {
          "application/json": {
            schema: DisconnectResponseSchema,
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

    const body = c.req.valid("json");
    const convex = getConvex({ accessToken });

    const result = await convex.mutation(
      api.providerControlPlane.disconnect,
      body
    );
    return c.json(result);
  }
);

// POST /api/provider-control-plane/refresh - Refresh model discovery
providerControlPlaneRouter.openapi(
  createRoute({
    method: "post",
    path: "/provider-control-plane/refresh",
    tags: ["Provider Control Plane"],
    summary: "Refresh model discovery for a provider",
    description: "Triggers model discovery for the specified provider.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              teamSlugOrId: z.string(),
              providerId: z.string(),
            }),
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Refresh result",
        content: {
          "application/json": {
            schema: RefreshResponseSchema,
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

    const body = c.req.valid("json");
    const convex = getConvex({ accessToken });

    const result = await convex.mutation(api.providerControlPlane.refresh, body);
    return c.json(result);
  }
);
