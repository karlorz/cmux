import { getAccessTokenFromRequest, getUserFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { api } from "@cmux/convex/api";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { providersOverridesRouter } from "./providers.overrides.route";
import { providersTestRouter } from "./providers.test.route";
import { SuccessResponse } from "./providers.schemas";

export const providersRouter = new OpenAPIHono();

providersRouter.route("/", providersOverridesRouter);
providersRouter.route("/", providersTestRouter);

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
