import { getAccessTokenFromRequest, getUserFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { api } from "@cmux/convex/api";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

const ReorderBody = z
  .object({
    modelNames: z.array(z.string()),
  })
  .openapi("ReorderBody");

const SuccessResponse = z
  .object({
    success: z.boolean(),
  })
  .openapi("SuccessResponse");

export const modelsReorderRouter = new OpenAPIHono();

modelsReorderRouter.openapi(
  createRoute({
    method: "post",
    path: "/models/reorder",
    tags: ["Models"],
    summary: "Reorder models",
    request: {
      query: z.object({
        teamSlugOrId: z.string(),
      }),
      body: {
        content: {
          "application/json": {
            schema: ReorderBody,
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
    const { modelNames } = c.req.valid("json");
    const convex = getConvex({ accessToken });

    await convex.mutation(api.models.reorder, {
      teamSlugOrId,
      modelNames,
    });

    return c.json({ success: true });
  }
);
