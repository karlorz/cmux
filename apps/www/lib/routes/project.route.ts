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

import {
  getAccessTokenFromRequest,
} from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { projectPlanRouter } from "./project.plan.route";
import { PlanTaskSchema } from "./project.schemas";
// ============================================================================
// Schemas
// ============================================================================

const ProjectStatusSchema = z
  .enum(["planning", "active", "paused", "completed", "archived"])
  .openapi("ProjectStatus");

const ProjectGoalSchema = z
  .object({
    id: z.string().openapi({ description: "Goal ID" }),
    title: z.string().openapi({ description: "Goal title" }),
    completed: z.boolean().openapi({ description: "Whether goal is completed" }),
  })
  .openapi("ProjectGoal");

const ProjectPlanSchema = z
  .object({
    orchestrationId: z.string().openapi({ description: "Orchestration ID" }),
    headAgent: z.string().openapi({ description: "Head agent name" }),
    description: z.string().optional().openapi({ description: "Plan description" }),
    tasks: z.array(PlanTaskSchema).openapi({ description: "Plan tasks" }),
    updatedAt: z.string().openapi({ description: "Last update timestamp (ISO)" }),
  })
  .openapi("ProjectPlan");

const ProjectSchema = z
  .object({
    _id: z.string().openapi({ description: "Project ID (Convex document ID)" }),
    teamId: z.string().openapi({ description: "Team ID" }),
    userId: z.string().openapi({ description: "User ID who created the project" }),
    name: z.string().openapi({ description: "Project name" }),
    description: z.string().optional().openapi({ description: "Project description" }),
    goals: z.array(ProjectGoalSchema).optional().openapi({ description: "Project goals" }),
    status: ProjectStatusSchema,
    totalTasks: z.number().optional().openapi({ description: "Total task count" }),
    completedTasks: z.number().optional().openapi({ description: "Completed task count" }),
    failedTasks: z.number().optional().openapi({ description: "Failed task count" }),
    obsidianNotePath: z.string().optional().openapi({ description: "Path to linked Obsidian note" }),
    githubProjectId: z.string().optional().openapi({ description: "GitHub Projects v2 node ID" }),
    plan: ProjectPlanSchema.optional().openapi({ description: "Embedded orchestration plan" }),
    createdAt: z.number().openapi({ description: "Creation timestamp" }),
    updatedAt: z.number().openapi({ description: "Last update timestamp" }),
  })
  .openapi("Project");

const CreateProjectRequestSchema = z
  .object({
    teamSlugOrId: z.string().openapi({ description: "Team slug or ID" }),
    name: z.string().min(1).max(200).openapi({ description: "Project name" }),
    description: z.string().max(2000).optional().openapi({ description: "Project description" }),
    goals: z.array(ProjectGoalSchema).optional().openapi({ description: "Initial goals" }),
    status: ProjectStatusSchema.optional().openapi({ description: "Initial status" }),
    obsidianNotePath: z.string().optional().openapi({ description: "Path to Obsidian note" }),
    githubProjectId: z.string().optional().openapi({ description: "GitHub Projects node ID" }),
  })
  .openapi("CreateProjectRequest");

const UpdateProjectRequestSchema = z
  .object({
    name: z.string().min(1).max(200).optional().openapi({ description: "Project name" }),
    description: z.string().max(2000).optional().openapi({ description: "Project description" }),
    goals: z.array(ProjectGoalSchema).optional().openapi({ description: "Project goals" }),
    status: ProjectStatusSchema.optional().openapi({ description: "Project status" }),
    obsidianNotePath: z.string().optional().openapi({ description: "Path to Obsidian note" }),
    githubProjectId: z.string().optional().openapi({ description: "GitHub Projects node ID" }),
  })
  .openapi("UpdateProjectRequest");

// ============================================================================
// Router
// ============================================================================

export const projectRouter = new OpenAPIHono();

projectRouter.route("/", projectPlanRouter);

/**
 * GET /api/projects
 * List projects for a team with optional status filter.
 */
projectRouter.openapi(
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
  }
);

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

