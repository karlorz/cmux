import { getAccessTokenFromRequest, getUserFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { api } from "@cmux/convex/api";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

const DiscoveryResultResponse = z
  .object({
    success: z.boolean(),
    curated: z.number().optional(),
    discovered: z.number().optional(),
    free: z.number().optional(),
    paid: z.number().optional(),
    openrouter: z
      .object({
        discovered: z.number(),
        free: z.number(),
        paid: z.number(),
      })
      .optional(),
    error: z.string().optional(),
  })
  .openapi("DiscoveryResultResponse");

const SeedResultResponse = z
  .object({
    success: z.boolean(),
    seededCount: z.number(),
    error: z.string().optional(),
  })
  .openapi("SeedResultResponse");

export const modelsDiscoveryRouter = new OpenAPIHono();

modelsDiscoveryRouter.openapi(
  createRoute({
    method: "post",
    path: "/models/refresh",
    tags: ["Models"],
    summary: "Trigger model discovery",
    request: {
      query: z.object({
        teamSlugOrId: z.string(),
      }),
    },
    responses: {
      200: {
        description: "Discovery result",
        content: {
          "application/json": {
            schema: DiscoveryResultResponse,
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

    try {
      const result = await convex.action(api.modelDiscovery.triggerRefresh, {
        teamSlugOrId,
      });

      return c.json({
        success: result.success,
        curated: result.curated,
        discovered: result.discovered,
        free: result.free,
        paid: result.paid,
        openrouter: result.openrouter,
      });
    } catch (error) {
      console.error("[models.route] Discovery failed:", error);
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : "Discovery failed",
      });
    }
  },
);

modelsDiscoveryRouter.openapi(
  createRoute({
    method: "post",
    path: "/models/seed",
    tags: ["Models"],
    summary: "Seed curated models from AGENT_CATALOG",
    request: {
      query: z.object({
        teamSlugOrId: z.string(),
      }),
    },
    responses: {
      200: {
        description: "Seed result",
        content: {
          "application/json": {
            schema: SeedResultResponse,
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

    try {
      const result = await convex.action(api.modelDiscovery.triggerSeed, {
        teamSlugOrId,
      });

      return c.json({
        success: result.success,
        seededCount: result.seededCount,
      });
    } catch (error) {
      console.error("[models.route] Seeding failed:", error);
      return c.json({
        success: false,
        seededCount: 0,
        error: error instanceof Error ? error.message : "Seeding failed",
      });
    }
  },
);
