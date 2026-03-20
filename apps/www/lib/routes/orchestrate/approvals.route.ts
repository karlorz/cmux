/**
 * Orchestration Approvals Routes
 *
 * Human-in-the-loop approval broker endpoints:
 * - GET /orchestrate/approvals/:orchestrationId/pending - Get pending approvals
 * - POST /orchestrate/approvals/:requestId/resolve - Resolve approval
 * - GET /orchestrate/approvals/team/:teamSlugOrId - Get team approvals
 */

import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api } from "@cmux/convex/api";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { mapDomainError, ApprovalRequestSchema, extractTeamFromJwt } from "./_helpers";

export const orchestrateApprovalsRouter = new OpenAPIHono();

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/orchestrate/approvals/:orchestrationId/pending
 * Get pending approval requests for an orchestration.
 */
orchestrateApprovalsRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/orchestrate/approvals/{orchestrationId}/pending",
    tags: ["Orchestration", "Approvals"],
    summary: "Get pending approvals",
    description: "Get pending approval requests for an orchestration. Used by head agents to check for human input needed.",
    request: {
      params: z.object({
        orchestrationId: z.string().openapi({ description: "Orchestration ID" }),
      }),
      query: z.object({
        teamSlugOrId: z.string().optional().openapi({ description: "Team slug or ID (extracted from JWT if not provided)" }),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.array(ApprovalRequestSchema),
          },
        },
        description: "Pending approvals retrieved successfully",
      },
      401: { description: "Unauthorized" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const authHeader = c.req.header("Authorization");
    const accessToken = await getAccessTokenFromRequest(c.req.raw);

    let teamSlugOrId: string | undefined = c.req.valid("query").teamSlugOrId;

    if (!accessToken && authHeader?.startsWith("Bearer ")) {
      teamSlugOrId = teamSlugOrId ?? extractTeamFromJwt(authHeader);
      if (!teamSlugOrId) {
        return c.text("Invalid JWT", 401);
      }
    }

    if (!teamSlugOrId) {
      return c.text("teamSlugOrId required", 400);
    }

    const { orchestrationId } = c.req.valid("param");

    try {
      if (!accessToken) {
        return c.text("OAuth token required", 401);
      }

      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });
      const convex = getConvex({ accessToken });

      const approvals = await convex.query(api.approvalBroker.getPendingByOrchestration, {
        teamSlugOrId,
        orchestrationId,
      });

      return c.json(approvals);
    } catch (error) {
      console.error("[orchestrate] Failed to get pending approvals:", error);
      return c.text("Failed to get pending approvals", 500);
    }
  }
);

/**
 * POST /api/orchestrate/approvals/:requestId/resolve
 * Resolve an approval request (approve or deny).
 */
orchestrateApprovalsRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/orchestrate/approvals/{requestId}/resolve",
    tags: ["Orchestration", "Approvals"],
    summary: "Resolve approval request",
    description: "Resolve a pending approval request. Allows approve/deny with various granularities.",
    request: {
      params: z.object({
        requestId: z.string().openapi({ description: "Approval request ID (apr_xxx format)" }),
      }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              teamSlugOrId: z.string().optional().openapi({ description: "Team slug or ID" }),
              resolution: z.enum(["allow", "allow_once", "allow_session", "deny", "deny_always"]).openapi({
                description: "Resolution decision",
              }),
              note: z.string().optional().openapi({ description: "Optional note explaining the decision" }),
            }),
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
              success: z.boolean(),
              status: z.string(),
            }),
          },
        },
        description: "Approval resolved successfully",
      },
      400: { description: "Invalid request" },
      401: { description: "Unauthorized" },
      404: { description: "Approval request not found" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const { requestId } = c.req.valid("param");
    const { teamSlugOrId, resolution, note } = c.req.valid("json");

    if (!teamSlugOrId) {
      return c.text("teamSlugOrId required", 400);
    }

    try {
      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });
      const convex = getConvex({ accessToken });

      const result = await convex.mutation(api.approvalBroker.resolveRequest, {
        teamSlugOrId,
        requestId,
        resolution,
        note,
      });

      return c.json(result);
    } catch (error) {
      console.error("[orchestrate] Failed to resolve approval:", error);
      const mapped = mapDomainError(error);
      if (mapped) return c.text(mapped.message, mapped.status);
      return c.text("Failed to resolve approval", 500);
    }
  }
);

/**
 * GET /api/orchestrate/approvals/team/:teamSlugOrId
 * Get all pending approvals for a team (dashboard view).
 */
orchestrateApprovalsRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/orchestrate/approvals/team/{teamSlugOrId}",
    tags: ["Orchestration", "Approvals"],
    summary: "Get team pending approvals",
    description: "Get all pending approval requests for a team. Used by dashboard to show all approvals needing attention.",
    request: {
      params: z.object({
        teamSlugOrId: z.string().openapi({ description: "Team slug or ID" }),
      }),
      query: z.object({
        limit: z.coerce.number().optional().openapi({ description: "Maximum number of approvals to return" }),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.array(ApprovalRequestSchema),
          },
        },
        description: "Pending approvals retrieved successfully",
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

    const { teamSlugOrId } = c.req.valid("param");
    const { limit } = c.req.valid("query");

    try {
      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });
      const convex = getConvex({ accessToken });

      const approvals = await convex.query(api.approvalBroker.getPendingByTeam, {
        teamSlugOrId,
        limit,
      });

      return c.json(approvals);
    } catch (error) {
      console.error("[orchestrate] Failed to get team approvals:", error);
      return c.text("Failed to get team approvals", 500);
    }
  }
);
