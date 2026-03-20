/**
 * Project REST API Routes
 *
 * Provides REST endpoints for project tracking:
 * - GET /api/projects - List projects for a team
 * - POST /api/projects - Create a new project
 * - GET /api/projects/:id - Get a single project
 * - PATCH /api/projects/:id - Update a project
 * - PUT /api/projects/:id/plan - Upsert project plan
 * - GET /api/projects/:id/progress - Get project progress metrics
 */

import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { projectCreateRouter } from "./project.create.route";
import { projectGetRouter } from "./project.get.route";
import { projectListRouter } from "./project.list.route";
import { projectPlanRouter } from "./project.plan.route";
import { UpdateProjectRequestSchema } from "./project.schemas";
// ============================================================================
// Router
// ============================================================================

export const projectRouter = new OpenAPIHono();

projectRouter.route("/", projectCreateRouter);
projectRouter.route("/", projectGetRouter);
projectRouter.route("/", projectListRouter);
projectRouter.route("/", projectPlanRouter);

/**
 * PATCH /api/projects/:projectId
 * Update a project.
 */
projectRouter.openapi(
  createRoute({
    method: "patch" as const,
    path: "/projects/{projectId}",
    tags: ["Projects"],
    summary: "Update project",
    description: "Update an existing project.",
    request: {
      params: z.object({
        projectId: z.string().openapi({ description: "Project ID" }),
      }),
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
            schema: z.object({
              id: z.string().openapi({ description: "Updated project ID" }),
            }),
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

      // Get project to verify access
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
  }
);

