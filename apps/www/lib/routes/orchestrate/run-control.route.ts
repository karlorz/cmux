import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { RunControlSummarySchema } from "@cmux/shared";
import { mapDomainError } from "./_helpers";

export const orchestrateRunControlRouter = new OpenAPIHono();

async function resolveTaskRunIdFromRunIdentifier(input: {
  convex: ReturnType<typeof getConvex>;
  teamSlugOrId: string;
  runIdentifier: string;
}) {
  const directSummary = await input.convex.query(api.taskRuns.getRunControlSummary, {
    teamSlugOrId: input.teamSlugOrId,
    taskRunId: input.runIdentifier as Id<"taskRuns">,
  });
  if (directSummary) {
    return directSummary;
  }

  const localLaunch = await input.convex.query(api.localClaudeLaunches.getByOrchestrationId, {
    teamSlugOrId: input.teamSlugOrId,
    orchestrationId: input.runIdentifier,
  });
  if (!localLaunch?.taskRunId) {
    return null;
  }

  return input.convex.query(api.taskRuns.getRunControlSummary, {
    teamSlugOrId: input.teamSlugOrId,
    taskRunId: localLaunch.taskRunId as Id<"taskRuns">,
  });
}

orchestrateRunControlRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/v1/cmux/orchestration/run-control/{taskRunId}",
    tags: ["Orchestration"],
    summary: "Get shared run-control summary",
    description:
      "Return the shared run-control summary for a task run, combining interruption state, approvals, continuation capability, and checkpoint metadata.",
    request: {
      params: z.object({
        taskRunId: z.string().openapi({ description: "Task run ID or local orchestration ID" }),
      }),
      query: z.object({
        teamSlugOrId: z.string().openapi({ description: "Team slug or ID" }),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: RunControlSummarySchema,
          },
        },
        description: "Run-control summary retrieved successfully",
      },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Task run not found" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const { taskRunId } = c.req.valid("param");
    const { teamSlugOrId } = c.req.valid("query");

    try {
      await verifyTeamAccess({
        req: c.req.raw,
        accessToken,
        teamSlugOrId,
      });

      const convex = getConvex({ accessToken });
      const summary = await resolveTaskRunIdFromRunIdentifier({
        convex,
        teamSlugOrId,
        runIdentifier: taskRunId,
      });

      if (!summary) {
        return c.text("Run control summary not found", 404);
      }

      return c.json(summary);
    } catch (error) {
      console.error("[orchestrate] Failed to get run-control summary:", error);
      const mapped = mapDomainError(error);
      if (mapped) {
        return c.text(mapped.message, mapped.status);
      }
      return c.text("Failed to get run-control summary", 500);
    }
  },
);
