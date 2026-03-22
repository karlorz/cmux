/**
 * Compatibility shim for deprecated resume_tasks mutations.
 *
 * These stubs exist to suppress "Could not find public function" warnings
 * when a remote workspace (connected to the same shared Convex dev backend)
 * has clients still calling the old `resume_tasks:*` API surface.
 *
 * The current autopilot implementation uses HTTP actions at /api/autopilot/*
 * and internal mutations in taskRuns.ts instead.
 *
 * These stubs are intentionally no-ops that return success to prevent
 * error spam from stale clients. They should be removed once all clients
 * have migrated to the HTTP-based autopilot API.
 */

import { v } from "convex/values";
import { mutation } from "./_generated/server";

/**
 * @deprecated Use POST /api/autopilot/heartbeat instead.
 * This stub exists only for backward compatibility with stale clients.
 */
export const heartbeat = mutation({
  args: {
    taskRunId: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    message: v.optional(v.string()),
  }),
  handler: async (_ctx, _args) => {
    // No-op stub - real implementation is in autopilot_http.ts
    console.warn(
      "[resume_tasks:heartbeat] Deprecated mutation called. Use POST /api/autopilot/heartbeat instead."
    );
    return { ok: true, message: "deprecated - use /api/autopilot/heartbeat" };
  },
});

/**
 * @deprecated Use the HTTP-based autopilot API instead.
 * This stub exists only for backward compatibility with stale clients.
 */
export const claim = mutation({
  args: {
    taskRunId: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    message: v.optional(v.string()),
  }),
  handler: async (_ctx, _args) => {
    // No-op stub - there is no direct equivalent in the new API
    console.warn(
      "[resume_tasks:claim] Deprecated mutation called. This functionality has been replaced."
    );
    return { ok: true, message: "deprecated - functionality replaced" };
  },
});
