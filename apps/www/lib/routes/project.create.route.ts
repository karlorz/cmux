import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api } from "@cmux/convex/api";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { CreateProjectRequestSchema } from "./project.schemas";

const CreateProjectResponseSchema = z.object({
  id: z.string().openapi({ description: "Created project ID" }),
});

export const projectCreateRouter = new OpenAPIHono();

projectCreateRouter.openapi(
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
            schema: CreateProjectResponseSchema,
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
  },
);
