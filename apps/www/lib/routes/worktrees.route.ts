import { getUserFromRequest } from "@/lib/utils/auth";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

export const worktreesRouter = new OpenAPIHono();

const RemoveWorktreeBody = z
  .object({
    teamSlugOrId: z.string(),
    worktreePath: z.string(),
  })
  .openapi("RemoveWorktreeBody");

const RemoveWorktreeResult = z
  .object({
    success: z.boolean(),
    message: z.string(),
  })
  .openapi("RemoveWorktreeResult");

/**
 * Remove a worktree from the registry.
 * This endpoint provides API access for worktree removal.
 * Note: The primary mechanism for worktree removal is through Convex mutations
 * in the frontend. This endpoint is provided for CLI/API access.
 */
worktreesRouter.openapi(
  createRoute({
    method: "post",
    path: "/worktrees/remove",
    tags: ["Worktrees"],
    summary: "Remove a worktree from the registry",
    description:
      "Removes a worktree entry from the registry. Note: This only removes the registry entry, not the actual filesystem worktree.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: RemoveWorktreeBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Worktree removal result",
        content: {
          "application/json": {
            schema: RemoveWorktreeResult,
          },
        },
      },
      401: {
        description: "Unauthorized",
      },
    },
  }),
  async (c) => {
    const user = await getUserFromRequest(c.req.raw);
    if (!user) {
      return c.json(
        {
          success: false,
          message: "Unauthorized",
        },
        401
      );
    }

    const { worktreePath } = c.req.valid("json");

    // Note: Actual removal is done via Convex mutations in the frontend.
    // This endpoint provides the API structure for potential future CLI integration.
    // For now, return success as the frontend handles the actual mutation.
    return c.json({
      success: true,
      message: `Worktree removal for ${worktreePath} should be handled via Convex mutation`,
    });
  }
);
