import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api } from "@cmux/convex/api";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  ProjectSchema,
  ProjectStatusSchema,
} from "./project.schemas";

export const projectListRouter = new OpenAPIHono();

projectListRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/projects",
    tags: ["Projects"],
    summary: "List projects",
    description: "List projects for a team with optional status filter.",
    request: {
      query: z.object({
        teamSlugOrId: z.string().openapi({ description: "Team slug or ID" }),
        status: ProjectStatusSchema.optional().openapi({ description: "Filter by status" }),
        limit: z.coerce.number().optional().openapi({ description: "Maximum number of projects" }),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.array(ProjectSchema),
          },
        },
        description: "Projects retrieved successfully",
      },
      401: { description: "Unauthorized" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const { teamSlugOrId, status, limit } = c.req.valid("query");

    try {
      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });
      const convex = getConvex({ accessToken });

      const projects = await convex.query(api.projectQueries.listProjects, {
        teamSlugOrId,
        status,
        limit,
      });

      return c.json(projects);
    } catch (error) {
      console.error("[projects] Failed to list projects:", error);
      return c.text("Failed to list projects", 500);
    }
  },
);
