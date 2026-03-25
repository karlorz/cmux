/**
 * @deprecated Legacy provider status route.
 *
 * New consumers should use the Provider Control Plane API at:
 *   GET /api/provider-control-plane
 *
 * The control plane provides richer connection state, auth methods,
 * and default model information.
 *
 * This route is kept for backwards compatibility during the migration.
 */

import {
  getAccessTokenFromRequest,
  getUserFromRequest,
} from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { api } from "@cmux/convex/api";
import type { ProviderControlPlaneProvider } from "@cmux/shared/providers/control-plane";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

const ProviderStatusSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    isAvailable: z.boolean(),
    source: z.enum(["apiKeys", "oauth", "free"]).nullable(),
    configuredKeys: z.array(z.string()),
    requiredKeys: z.array(z.string()),
  })
  .openapi("ProviderStatus");

const ProviderStatusListResponse = z
  .object({
    providers: z.array(ProviderStatusSchema),
  })
  .openapi("ProviderStatusListResponse");

export const providersStatusListRouter = new OpenAPIHono();

export function toLegacyProviderStatus(
  provider: ProviderControlPlaneProvider
): z.infer<typeof ProviderStatusSchema> {
  const requiredKeys = provider.authMethods
    .filter((method) => method.type !== "custom_endpoint")
    .map((method) => method.apiKey.envVar);
  const configuredKeys = provider.connectionState.configuredEnvVars.filter(
    (envVar) => requiredKeys.includes(envVar)
  );

  let source: z.infer<typeof ProviderStatusSchema>["source"] = null;
  switch (provider.connectionState.source) {
    case "free":
      source = "free";
      break;
    case "stored_oauth_token":
    case "stored_json_blob":
      source = "oauth";
      break;
    case "env":
    case "stored_api_key":
      source = "apiKeys";
      break;
    case "override":
      source = null;
      break;
    default:
      source = null;
      break;
  }

  return {
    id: provider.id,
    name: provider.name,
    isAvailable: provider.connectionState.isConnected,
    source,
    configuredKeys,
    requiredKeys,
  };
}

providersStatusListRouter.openapi(
  createRoute({
    method: "get",
    path: "/providers/status",
    tags: ["Providers"],
    summary: "Get provider availability status",
    request: {
      query: z.object({
        teamSlugOrId: z.string(),
      }),
    },
    responses: {
      200: {
        description: "Provider status list",
        content: {
          "application/json": {
            schema: ProviderStatusListResponse,
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
    const providers = result.providers.map(toLegacyProviderStatus);

    return c.json({ providers });
  },
);
