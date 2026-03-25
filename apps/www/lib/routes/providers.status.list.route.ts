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
import { BASE_PROVIDERS, type ProviderSpec } from "@cmux/shared/provider-registry";
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

    const apiKeys = await convex.query(api.apiKeys.getAll, { teamSlugOrId });
    const configuredEnvVars = new Set(apiKeys.map((key) => key.envVar));

    const providers = BASE_PROVIDERS.map((provider: ProviderSpec) => {
      const configuredKeys = provider.authEnvVars.filter((envVar: string) =>
        configuredEnvVars.has(envVar),
      );

      const isAvailable = configuredKeys.length > 0;

      let source: "apiKeys" | "oauth" | "free" | null = null;
      if (isAvailable) {
        if (configuredKeys.some((key: string) => key.includes("OAUTH") || key.includes("AUTH_JSON"))) {
          source = "oauth";
        } else {
          source = "apiKeys";
        }
      }

      return {
        id: provider.id,
        name: provider.name,
        isAvailable,
        source,
        configuredKeys,
        requiredKeys: provider.authEnvVars,
      };
    });

    return c.json({ providers });
  },
);
