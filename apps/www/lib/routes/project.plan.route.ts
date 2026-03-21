import {
  getAccessTokenFromRequest,
} from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  ProjectProgressSchema,
  UpsertPlanRequestSchema,
} from "./project.schemas";

export const projectPlanRouter = new OpenAPIHono();

projectPlanRouter.openapi(
  createRoute({
    method: "put" as const,
    path: "/projects/{projectId}/plan",
    tags: ["Projects"],
    summary: "Upsert project plan",
    description: "Create or update the project's orchestration plan.",
    request: {
      params: z.object({
        projectId: z.string().openapi({ description: "Project ID" }),
      }),
      body: {
        content: {
          "application/json": {
            schema: UpsertPlanRequestSchema,
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
        description: "Plan upserted successfully",
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

      const updatedId = await convex.mutation(api.projectQueries.upsertPlan, {
        projectId: projectId as Id<"projects">,
        orchestrationId: body.orchestrationId,
        headAgent: body.headAgent,
        description: body.description,
        tasks: body.tasks,
      });

      return c.json({ id: updatedId });
    } catch (error) {
      console.error("[projects] Failed to upsert plan:", error);
      return c.text("Failed to upsert plan", 500);
    }
  }
);

projectPlanRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/projects/{projectId}/progress",
    tags: ["Projects"],
    summary: "Get project progress",
    description: "Get aggregated progress metrics for a project.",
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
            schema: ProjectProgressSchema,
          },
        },
        description: "Progress retrieved successfully",
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

      const progress = await convex.query(api.projectQueries.getProjectProgress, {
        projectId: projectId as Id<"projects">,
      });

      return c.json(progress);
    } catch (error) {
      console.error("[projects] Failed to get progress:", error);
      if (error instanceof Error && error.message.includes("not found")) {
        return c.text("Project not found", 404);
      }
      return c.text("Failed to get progress", 500);
    }
  }
);

projectPlanRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/projects/{projectId}/dispatch",
    tags: ["Projects"],
    summary: "Dispatch project plan",
    description: "Create orchestration tasks for each plan task and start execution.",
    request: {
      params: z.object({
        projectId: z.string().openapi({ description: "Project ID" }),
      }),
      body: {
        content: {
          "application/json": {
            schema: z.object({}).openapi("DispatchPlanRequest"),
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
              dispatched: z.number().openapi({ description: "Number of tasks dispatched" }),
            }),
          },
        },
        description: "Plan dispatched successfully",
      },
      401: { description: "Unauthorized" },
      404: { description: "Project not found" },
      422: { description: "No plan tasks to dispatch" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const { projectId } = c.req.valid("param");

    try {
      const convex = getConvex({ accessToken });

      const project = await convex.query(api.projectQueries.getProject, {
        projectId: projectId as Id<"projects">,
      });

      if (!project) {
        return c.text("Project not found", 404);
      }

      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId: project.teamId });

      const result = await convex.mutation(api.projectQueries.dispatchPlan, {
        projectId: projectId as Id<"projects">,
      });

      return c.json(result);
    } catch (error) {
      console.error("[projects] Failed to dispatch plan:", error);
      if (error instanceof Error && error.message.includes("No plan tasks")) {
        return c.text("No plan tasks to dispatch", 422);
      }
      return c.text("Failed to dispatch plan", 500);
    }
  }
);
