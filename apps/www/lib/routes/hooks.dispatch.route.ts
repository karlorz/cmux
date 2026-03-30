/**
 * Hooks Dispatch Route
 *
 * Provides GET /api/hooks/dispatch endpoint for fetching hook scripts.
 * This enables the "fetch-on-invoke" pattern where thin hook stubs in sandboxes
 * fetch current dispatch logic from the server, allowing hook updates without
 * requiring new sandbox images.
 *
 * Auth: x-cmux-token JWT (same as task-run APIs)
 * Response: text/plain shell script body
 * Cache: 60s max-age to balance freshness with performance
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  extractTaskRunJwtFromRequest,
  verifyTaskRunJwt,
} from "@/lib/utils/jwt-task-run";
import { getDispatchScript, isHookSupported } from "@cmux/shared/hook-registry";
import type { ProviderName, LifecycleEventType } from "@cmux/shared/provider-lifecycle-adapter";

const HooksDispatchQuerySchema = z.object({
  event: z.string().openapi({
    description: "Hook event type (e.g., session_start, session_stop)",
  }),
  provider: z.string().openapi({
    description: "Provider name (e.g., claude, codex, gemini)",
  }),
});

export const hooksDispatchRouter = new OpenAPIHono();

hooksDispatchRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/hooks/dispatch",
    tags: ["Hooks"],
    summary: "Fetch hook dispatch script for a given event and provider",
    request: {
      query: HooksDispatchQuerySchema,
    },
    responses: {
      200: {
        content: {
          "text/plain": {
            schema: z.string(),
          },
        },
        description: "Shell script for the requested hook",
      },
      400: { description: "Invalid event type or provider" },
      401: { description: "Unauthorized - missing or invalid JWT" },
      404: { description: "Hook not supported for this provider" },
    },
  }),
  async (c) => {
    // Verify JWT auth
    const token = extractTaskRunJwtFromRequest(c.req.raw);
    if (!token) {
      return c.text("Unauthorized: missing x-cmux-token header", 401);
    }

    const payload = await verifyTaskRunJwt(token);
    if (!payload) {
      return c.text("Unauthorized: invalid JWT", 401);
    }

    const { event, provider } = c.req.valid("query");

    // Validate provider is a known provider name
    const validProviders: ProviderName[] = [
      "claude",
      "codex",
      "gemini",
      "opencode",
      "amp",
      "grok",
      "qwen",
      "cursor",
    ];
    if (!validProviders.includes(provider as ProviderName)) {
      return c.text(`Invalid provider: ${provider}`, 400);
    }

    // Validate event is a known event type
    const validEvents: LifecycleEventType[] = [
      "session_start",
      "session_stop",
      "session_resumed",
      "session_finished",
      "stop_requested",
      "stop_blocked",
      "stop_failed",
      "prompt_submitted",
      "run_resumed",
      "error",
      "context_warning",
      "context_compacted",
      "memory_loaded",
      "memory_scope_changed",
      "tool_call",
      "tool_requested",
      "tool_completed",
      "approval_requested",
      "approval_resolved",
      "mcp_capabilities_negotiated",
    ];
    if (!validEvents.includes(event as LifecycleEventType)) {
      return c.text(`Invalid event type: ${event}`, 400);
    }

    // Check if hook is supported for this provider
    if (!isHookSupported(event as LifecycleEventType, provider as ProviderName)) {
      return c.text(
        `Hook "${event}" not supported for provider "${provider}"`,
        404
      );
    }

    // Get the dispatch script
    const script = getDispatchScript(
      event as LifecycleEventType,
      provider as ProviderName
    );
    if (!script) {
      return c.text(`No script available for hook "${event}"`, 404);
    }

    // Return script with cache header
    return c.text(script, 200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    });
  }
);
