import {
  getAccessTokenFromRequest,
  getUserFromRequest,
} from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

const OrchestrateMessageRequestSchema = z
  .object({
    taskRunId: z
      .string()
      .regex(/^[a-z0-9]+$/, "Invalid task run ID format")
      .openapi({
        description: "Task run ID (Convex document ID)",
        example: "ns7xyz123abc",
      }),
    message: z.string().openapi({
      description: "Message content to send to the agent",
      example: "Fix the login bug",
    }),
    messageType: z
      .enum(["handoff", "request", "status"])
      .openapi({
        description:
          'Message type: handoff (transfer work), request (ask to do something), or status (progress update)',
        example: "request",
      }),
    teamSlugOrId: z.string().openapi({
      description: "Team slug or ID (for authorization)",
      example: "my-team",
    }),
  })
  .openapi("OrchestrateMessageRequest");

const OrchestrateMessageResponseSchema = z
  .object({
    ok: z.boolean().openapi({
      description: "Whether the message was successfully sent",
      example: true,
    }),
    message: z.string().optional().openapi({
      description: "Confirmation message",
      example: "Message sent to agent",
    }),
  })
  .openapi("OrchestrateMessageResponse");

export const orchestrateRouter = new OpenAPIHono();

/**
 * POST /api/orchestrate/message
 * Send a message to a running agent via the mailbox MCP.
 * The message is written to the agent's MAILBOX.json file.
 */
orchestrateRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/orchestrate/message",
    tags: ["Orchestration"],
    summary: "Send message to running agent",
    description:
      "Send a message to a running agent via the mailbox MCP. The message is written to MAILBOX.json in the sandbox.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: OrchestrateMessageRequestSchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: OrchestrateMessageResponseSchema,
          },
        },
        description: "Message sent successfully",
      },
      400: {
        description: "Invalid request",
      },
      401: {
        description: "Unauthorized",
      },
      404: {
        description: "Task run not found",
      },
      500: {
        description: "Server error",
      },
    },
  }),
  async (c) => {
    // Check authentication
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const user = await getUserFromRequest(c.req.raw);
    if (!user) {
      return c.text("Unauthorized", 401);
    }

    // Get validated request body from zod-openapi middleware
    // This automatically handles JSON parse errors and validation as 400s
    const { taskRunId, message, messageType, teamSlugOrId } = c.req.valid("json");

    // Verify user has access to this team
    await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });

    // Get Convex client
    const convex = getConvex({ accessToken });

    // Fetch task run to verify it exists and belongs to this team
    const taskRun = await convex.query(api.taskRuns.get, {
      id: taskRunId as Id<"taskRuns">,
      teamSlugOrId,
    });

    if (!taskRun) {
      return c.text("Task run not found", 404);
    }

    // Verify user owns this task run
    if (taskRun.userId !== user.id) {
      return c.text("Unauthorized", 401);
    }

    // Send message via mutation
    try {
      await convex.mutation(api.orchestrate.sendMessage, {
        taskRunId: taskRunId as Id<"taskRuns">,
        message,
        messageType,
        senderName: user.displayName || "user",
        timestamp: Date.now(),
      });

      return c.json(
        {
          ok: true,
          message: `Message sent to agent (type: ${messageType})`,
        },
        200
      );
    } catch (error) {
      console.error("[orchestrate] Failed to send message:", error);
      return c.text("Failed to send message", 500);
    }
  }
);
