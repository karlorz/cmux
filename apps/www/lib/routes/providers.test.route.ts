import {
  getAccessTokenFromRequest,
  getUserFromRequest,
} from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { api } from "@cmux/convex/api";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { TestResponse } from "./providers.schemas";

export const providersTestRouter = new OpenAPIHono();

providersTestRouter.openapi(
  createRoute({
    method: "post",
    path: "/providers/{id}/test",
    tags: ["Providers"],
    summary: "Test provider connectivity",
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
        description: "Test result",
        content: {
          "application/json": {
            schema: TestResponse,
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

    if (!provider || !provider.baseUrl) {
      return c.json({
        success: false,
        error: "Provider override not found or has no base URL configured",
      });
    }

    const startTime = Date.now();
    try {
      const response = await fetch(provider.baseUrl, {
        method: "HEAD",
        headers: provider.customHeaders ?? {},
        signal: AbortSignal.timeout(10000),
      });

      const latencyMs = Date.now() - startTime;
      if (response.ok || response.status < 500) {
        return c.json({
          success: true,
          latencyMs,
        });
      }

      return c.json({
        success: false,
        latencyMs,
        error: `HTTP ${response.status}: ${response.statusText}`,
      });
    } catch (error) {
      console.error("[providers.route] Connectivity test failed:", error);
      const latencyMs = Date.now() - startTime;
      return c.json({
        success: false,
        latencyMs,
        error: error instanceof Error ? error.message : "Connection failed",
      });
    }
  },
);
