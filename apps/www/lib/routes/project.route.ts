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
import { projectListRouter } from "./project.list.route";
import { projectPlanRouter } from "./project.plan.route";
import {
  CreateProjectRequestSchema,
  ProjectSchema,
  UpdateProjectRequestSchema,
} from "./project.schemas";
// ============================================================================
// Router
// ============================================================================

export const projectRouter = new OpenAPIHono();

projectRouter.route("/", projectListRouter);
projectRouter.route("/", projectPlanRouter);

/**
 * POST /api/projects
 * Create a new project.
 */
projectRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/projects",
    tags: ["Projects"],
    summary: "Create project",
    description: "Create a new project for a team.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: CreateProjectRequestSchema,
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
              id: z.string().openapi({ description: "Created project ID" }),
            }),
          },
        },
        description: "Project created successfully",
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

    const body = c.req.valid("json");

    try {
      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId: body.teamSlugOrId });
      const convex = getConvex({ accessToken });

      const projectId = await convex.mutation(api.projectQueries.createProject, {
        teamSlugOrId: body.teamSlugOrId,
        name: body.name,
        description: body.description,
        goals: body.goals,
        status: body.status,
        obsidianNotePath: body.obsidianNotePath,
        githubProjectId: body.githubProjectId,
      });

      return c.json({ id: projectId }, 201);
    } catch (error) {
      console.error("[projects] Failed to create project:", error);
      return c.text("Failed to create project", 500);
    }
  }
);

/**
 * GET /api/projects/:projectId
 * Get a single project by ID.
 */
projectRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/projects/{projectId}",
    tags: ["Projects"],
    summary: "Get project",
    description: "Get a single project by ID.",
    request: {
      params: z.object({
        projectId: z.string().openapi({ description: "Project ID" }),
      }),
      query: z.object({
        teamSlugOrId: z.string().openapi({ description: "Team slug or ID" }),
      }),
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
  }
);

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

