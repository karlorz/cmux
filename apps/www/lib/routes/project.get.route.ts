import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { ProjectSchema } from "./project.schemas";

const GetProjectParamsSchema = z.object({
  projectId: z.string().openapi({ description: "Project ID" }),
});

const GetProjectQuerySchema = z.object({
  teamSlugOrId: z.string().openapi({ description: "Team slug or ID" }),
});

export const projectGetRouter = new OpenAPIHono();

projectGetRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/projects/{projectId}",
    tags: ["Projects"],
    summary: "Get project",
    description: "Get a single project by ID.",
    request: {
      params: GetProjectParamsSchema,
      query: GetProjectQuerySchema,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: ProjectSchema,
          },
        },
        description: "Project retrieved successfully",
      },
      401: { description: "Unauthorized" },
      404: { description: "Project not found" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const { projectId } = c.req.valid("param");
    const { teamSlugOrId } = c.req.valid("query");

    try {
      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });
      const convex = getConvex({ accessToken });

      const project = await convex.query(api.projectQueries.getProject, {
        projectId: projectId as Id<"projects">,
        teamSlugOrId,
      });

      if (!project) {
        return c.text("Project not found", 404);
      }

      return c.json(project);
    } catch (error) {
      console.error("[projects] Failed to get project:", error);
      return c.text("Failed to get project", 500);
    }
  },
);
