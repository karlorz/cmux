/**
 * HTTP endpoint for fetching permission deny rules from sandboxes.
 * Used by the www service during sandbox spawn to get deny patterns.
 *
 * GET /api/agent/permission-deny-rules
 * Auth: x-cmux-token header with valid task run JWT
 *
 * Query params:
 *   context: "task_sandbox" | "cloud_workspace" | "local_dev" (required)
 *   projectFullName?: string (owner/repo format)
 *
 * Returns: { ok: true, patterns: string[] } on success
 */

import { z } from "zod";
import { jsonResponse } from "../_shared/http-utils";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { getWorkerAuth } from "./users/utils/getWorkerAuth";

const GetPermissionDenyRulesQuerySchema = z.object({
  context: z.enum(["task_sandbox", "cloud_workspace", "local_dev"]),
  projectFullName: z.string().optional(),
});

/**
 * HTTP GET endpoint for sandbox agents to fetch their permission deny patterns.
 * The teamId is extracted from the JWT for security.
 */
export const getPermissionDenyRules = httpAction(async (ctx, req) => {
  const auth = await getWorkerAuth(req, {
    loggerPrefix: "[convex.permissionDenyRules]",
  });
  if (!auth) {
    console.error("[convex.permissionDenyRules] Auth failed for permission rules fetch");
    return jsonResponse({ code: 401, message: "Unauthorized" }, 401);
  }

  // Parse query parameters from URL
  const url = new URL(req.url);
  const queryParams = {
    context: url.searchParams.get("context"),
    projectFullName: url.searchParams.get("projectFullName") || undefined,
  };

  const validation = GetPermissionDenyRulesQuerySchema.safeParse(queryParams);
  if (!validation.success) {
    console.warn(
      "[convex.permissionDenyRules] Invalid query params",
      validation.error.format()
    );
    return jsonResponse(
      {
        code: 400,
        message: "Invalid query parameters",
        errors: validation.error.issues.map((i) => i.message),
      },
      400
    );
  }

  try {
    // Use the internal query - teamId comes from JWT, not user input
    const patterns = await ctx.runQuery(
      internal.permissionDenyRules.getForSandboxInternal,
      {
        teamId: auth.payload.teamId,
        context: validation.data.context,
        projectFullName: validation.data.projectFullName,
      }
    );

    return jsonResponse({ ok: true, patterns });
  } catch (error) {
    console.error("[convex.permissionDenyRules] Failed to fetch permission rules:", error);
    return jsonResponse(
      { code: 500, message: "Internal server error" },
      500
    );
  }
});
