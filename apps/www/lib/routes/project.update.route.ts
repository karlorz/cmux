import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { UpdateProjectRequestSchema } from "./project.schemas";

const UpdateProjectParamsSchema = z.object({
  projectId: z.string().openapi({ description: "Project ID" }),
});

const UpdateProjectResponseSchema = z.object({
  id: z.string().openapi({ description: "Updated project ID" }),
});

export const projectUpdateRouter = new OpenAPIHono();

projectUpdateRouter.openapi(
  createRoute({
    method: "patch" as const,
    path: "/projects/{projectId}",
    tags: ["Projects"],
    summary: "Update project",
    description: "Update an existing project.",
    request: {
      params: UpdateProjectParamsSchema,
      body: {
        content: {
          "application/json": {
            schema: UpdateProjectRequestSchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: UpdateProjectResponseSchema,
          },
        },
        description: "Project updated successfully",
      },
      401: { description: "Unauthorized" },
      404: { description: "Project not found" },
      422: { description: "Validation error" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const { projectId } = c.req.valid("param");
    const body = c.req.valid("json");

    try {
      const convex = getConvex({ accessToken });

      const project = await convex.query(api.projectQueries.getProject, {
        projectId: projectId as Id<"projects">,
      });

      if (!project) {
        return c.text("Project not found", 404);
      }

      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId: project.teamId });

      const updatedId = await convex.mutation(api.projectQueries.updateProject, {
        projectId: projectId as Id<"projects">,
        ...body,
      });

      return c.json({ id: updatedId });
    } catch (error) {
      console.error("[projects] Failed to update project:", error);
      return c.text("Failed to update project", 500);
    }
  },
);
