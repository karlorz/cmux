/**
 * HTTP endpoint for fetching agent policy rules from sandboxes.
 * Used by the refresh_policy_rules MCP tool to get latest rules at runtime.
 *
 * GET /api/agent/policy-rules
 * Auth: x-cmux-token header with valid task run JWT
 *
 * Query params:
 *   agentType: "claude" | "codex" | "gemini" | "opencode" (required)
 *   projectFullName?: string (owner/repo format)
 *   context: "task_sandbox" | "cloud_workspace" | "local_dev" (required)
 *
 * Returns: { ok: true, rules: PolicyRule[] } on success
 */

import { z } from "zod";
import { jsonResponse } from "../_shared/http-utils";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { getWorkerAuth } from "./users/utils/getWorkerAuth";

const GetPolicyRulesQuerySchema = z.object({
  agentType: z.enum(["claude", "codex", "gemini", "opencode"]),
  projectFullName: z.string().optional(),
  context: z.enum(["task_sandbox", "cloud_workspace", "local_dev"]),
});

/**
 * HTTP GET endpoint for sandbox agents to fetch their policy rules.
 * The teamId and userId are extracted from the JWT for security.
 */
export const getPolicyRules = httpAction(async (ctx, req) => {
  const auth = await getWorkerAuth(req, {
    loggerPrefix: "[convex.agentPolicyRules]",
  });
  if (!auth) {
    console.error("[convex.agentPolicyRules] Auth failed for policy rules fetch");
    return jsonResponse({ code: 401, message: "Unauthorized" }, 401);
  }

  // Parse query parameters from URL
  const url = new URL(req.url);
  const queryParams = {
    agentType: url.searchParams.get("agentType"),
    projectFullName: url.searchParams.get("projectFullName") || undefined,
    context: url.searchParams.get("context"),
  };

  const validation = GetPolicyRulesQuerySchema.safeParse(queryParams);
  if (!validation.success) {
    console.warn(
      "[convex.agentPolicyRules] Invalid query params",
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
    const rules = await ctx.runQuery(
      internal.agentPolicyRules.getForSandboxInternal,
      {
        teamId: auth.payload.teamId,
        userId: auth.payload.userId,
        agentType: validation.data.agentType,
        projectFullName: validation.data.projectFullName,
        context: validation.data.context,
      }
    );

    return jsonResponse({ ok: true, rules });
  } catch (error) {
    console.error("[convex.agentPolicyRules] Failed to fetch policy rules:", error);
    return jsonResponse(
      { code: 500, message: "Internal server error" },
      500
    );
  }
});
