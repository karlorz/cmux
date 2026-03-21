import { getAccessTokenFromRequest, getUserFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { api } from "@cmux/convex/api";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

const ModelSchema = z
  .object({
    _id: z.string(),
    name: z.string(),
    displayName: z.string(),
    vendor: z.string(),
    source: z.enum(["curated", "discovered"]),
    discoveredFrom: z.string().optional(),
    discoveredAt: z.number().optional(),
    requiredApiKeys: z.array(z.string()),
    tier: z.enum(["free", "paid"]),
    tags: z.array(z.string()),
    enabled: z.boolean(),
    sortOrder: z.number(),
    disabled: z.boolean().optional(),
    disabledReason: z.string().optional(),
    hiddenForTeam: z.boolean(),
    variants: z
      .array(
        z.object({
          id: z.string(),
          displayName: z.string(),
          description: z.string().optional(),
        })
      )
      .optional(),
    defaultVariant: z.string().optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .openapi("Model");

const ModelListResponse = z
  .object({
    models: z.array(ModelSchema),
  })
  .openapi("ModelListResponse");

export const modelsListRouter = new OpenAPIHono();

modelsListRouter.openapi(
  createRoute({
    method: "get",
    path: "/models",
    tags: ["Models"],
    summary: "List all models for admin management",
    request: {
      query: z.object({
        teamSlugOrId: z.string(),
      }),
    },
    responses: {
      200: {
        description: "List of all models",
        content: {
          "application/json": {
            schema: ModelListResponse,
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

    const models = await convex.query(api.models.listAll, { teamSlugOrId });

    return c.json({
      models: models.map((model) => ({
        ...model,
        hiddenForTeam: model.hiddenForTeam ?? false,
      })),
    });
  }
);
