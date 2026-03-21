import { getAccessTokenFromRequest, getUserFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { api } from "@cmux/convex/api";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

const SetEnabledBody = z
  .object({
    enabled: z.boolean(),
  })
  .openapi("SetEnabledBody");

const SuccessResponse = z
  .object({
    success: z.boolean(),
  })
  .openapi("SuccessResponse");

export const modelsEnabledRouter = new OpenAPIHono();

modelsEnabledRouter.openapi(
  createRoute({
    method: "patch",
    path: "/models/{name}/enabled",
    tags: ["Models"],
    summary: "Toggle model visibility for the current team",
    request: {
      params: z.object({
        name: z.string().describe("Model name (URL-encoded)"),
      }),
      query: z.object({
        teamSlugOrId: z.string(),
      }),
      body: {
        content: {
          "application/json": {
            schema: SetEnabledBody,
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
      404: { description: "Model not found" },
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

    const { name } = c.req.valid("param");
    const { teamSlugOrId } = c.req.valid("query");
    const { enabled: visible } = c.req.valid("json");

    const modelName = decodeURIComponent(name);
    const convex = getConvex({ accessToken });

    try {
      await convex.mutation(api.teamModelVisibility.toggleModel, {
        teamSlugOrId,
        modelName,
        hidden: !visible,
      });
      return c.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update model visibility";
      if (message.includes("not found")) {
        return c.json({ error: message }, 404);
      }
      throw error;
    }
  }
);
