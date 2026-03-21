import { getUserFromRequest } from "@/lib/utils/auth";
import { env } from "@/lib/utils/www-env";
import { api } from "@cmux/convex/api";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { MorphCloudClient } from "morphcloud";
import { getConvex } from "../utils/get-convex";

const ListInstancesQuery = z
  .object({
    teamId: z.string().optional(),
  })
  .openapi("ListInstancesQuery");

const InstanceInfo = z
  .object({
    id: z.string(),
    status: z.string(),
    createdAt: z.string().optional(),
    metadata: z
      .object({
        app: z.string().optional(),
        userId: z.string().optional(),
        teamId: z.string().optional(),
      })
      .optional(),
  })
  .openapi("InstanceInfo");

const ListInstancesResponse = z.array(InstanceInfo).openapi("ListInstancesResponse");

export const morphInstancesRouter = new OpenAPIHono();

morphInstancesRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/morph/instances",
    tags: ["Morph"],
    summary: "List Morph instances for the authenticated user",
    request: {
      query: ListInstancesQuery,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: ListInstancesResponse,
          },
        },
        description: "List of Morph instances",
      },
      401: { description: "Unauthorized" },
      500: { description: "Failed to list instances" },
    },
  }),
  async (c) => {
    const user = await getUserFromRequest(c.req.raw);
    if (!user) {
      return c.text("Unauthorized", 401);
    }
    const { accessToken } = await user.getAuthJson();
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const { teamId } = c.req.valid("query");

    try {
      const convex = getConvex({ accessToken });

      const memberships = await convex.query(api.teams.listTeamMemberships, {});
      const userTeamIds = new Set(memberships.map((m) => m.team.teamId));

      if (teamId && !userTeamIds.has(teamId)) {
        return c.text("Forbidden - not a member of this team", 403);
      }

      const client = new MorphCloudClient({ apiKey: env.MORPH_API_KEY });
      const instances = await client.instances.list();

      const filteredInstances = instances.filter((instance) => {
        const meta = instance.metadata as
          | { app?: string; teamId?: string; userId?: string }
          | undefined;

        if (meta?.app !== "cmux-dev") {
          return false;
        }

        if (teamId && meta?.teamId !== teamId) {
          return false;
        }

        const isOwner = meta?.userId === user.id;
        const isTeamMember = meta?.teamId ? userTeamIds.has(meta.teamId) : false;

        if (!isOwner && !isTeamMember) {
          return false;
        }

        return true;
      });

      const response = filteredInstances.map((instance) => ({
        id: instance.id,
        status: instance.status,
        createdAt: (instance as unknown as { created?: string }).created,
        metadata: instance.metadata as
          | { app?: string; userId?: string; teamId?: string }
          | undefined,
      }));

      return c.json(response);
    } catch (error) {
      console.error("[morph.list-instances] Failed to list instances:", error);
      return c.text("Failed to list instances", 500);
    }
  }
);
