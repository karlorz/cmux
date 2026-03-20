import {
  getAccessTokenFromRequest,
  getUserFromRequest,
} from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { api } from "@cmux/convex/api";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { providersOverridesRouter } from "./providers.overrides.route";
import { SuccessResponse, TestResponse } from "./providers.schemas";

export const providersRouter = new OpenAPIHono();

providersRouter.route("/", providersOverridesRouter);

providersRouter.openapi(
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

providersRouter.openapi(
  createRoute({
    method: "patch",
    path: "/providers/{id}/enabled",
    tags: ["Providers"],
    summary: "Toggle provider enabled state",
    request: {
      params: z.object({
        id: z.string().describe("Provider ID"),
      }),
      query: z.object({
        teamSlugOrId: z.string(),
      }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              enabled: z.boolean(),
            }),
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
    const { enabled } = c.req.valid("json");
    const convex = getConvex({ accessToken });

    try {
      await convex.mutation(api.providerOverrides.setEnabled, {
        teamSlugOrId,
        providerId: id,
        enabled,
      });
      return c.json({ success: true });
    } catch (error) {
      console.error("[providers.route] Toggle enabled failed:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message.includes("not found")) {
        return c.json({ error: message }, 404);
      }
      throw error;
    }
  },
);
