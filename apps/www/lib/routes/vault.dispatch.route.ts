import {
  getAccessTokenFromRequest,
  getUserFromRequest,
} from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api } from "@cmux/convex/api";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { DispatchRequestSchema } from "./vault.schemas";

export const vaultDispatchRouter = new OpenAPIHono();

vaultDispatchRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/vault/dispatch",
    tags: ["Vault"],
    summary: "Dispatch recommendation to agent",
    description: "Create a task from a vault recommendation and dispatch it to an agent.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: DispatchRequestSchema,
          },
        },
        required: true,
      },
    },
    responses: {
      201: {
        content: {
          "application/json": {
            schema: z.object({
              taskId: z.string().openapi({ description: "Created task ID" }),
              taskRunId: z.string().optional().openapi({ description: "Created task run ID" }),
            }),
          },
        },
        description: "Task created successfully",
      },
      401: { description: "Unauthorized" },
      422: { description: "Validation error" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const user = await getUserFromRequest(c.req.raw);
    if (!user) {
      return c.text("Unauthorized", 401);
    }

    const body = c.req.valid("json");

    try {
      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId: body.teamSlugOrId });
      const convex = getConvex({ accessToken });

      const taskDescription =
        body.recommendation.suggestedPrompt ||
        `[${body.recommendation.type}] ${body.recommendation.description}\n\nSource: ${body.recommendation.source}`;

      const taskId = await convex.mutation(api.tasks.create, {
        text: taskDescription,
        projectFullName: body.repoFullName,
        teamSlugOrId: body.teamSlugOrId,
      });

      return c.json({ taskId }, 201);
    } catch (error) {
      console.error("[vault] Failed to dispatch recommendation:", error);
      return c.text("Failed to dispatch recommendation", 500);
    }
  },
);
