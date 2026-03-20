/**
 * Sandboxes Routes
 *
 * Combined router aggregating all sandbox sub-routers.
 * Gradually migrating from monolithic sandboxes.route.ts.
 *
 * Sub-routers:
 * - lifecycle.route.ts - /stop, /resume, /status ✅
 *
 * TODO: Remaining routes to extract:
 * - start.route.ts - POST /sandboxes/start (~1120 lines)
 * - config.route.ts - /setup-providers, /refresh-github-auth, /env, /run-scripts
 * - features.route.ts - /publish-devcontainer, /ssh, /discover-repos, /live-diff, /prewarm
 */

// Re-export the main router (still contains most routes during migration)
export { sandboxesRouter } from "../sandboxes.route";

// Export sub-routers for direct use
export { sandboxesLifecycleRouter } from "./lifecycle.route";

// Export helpers for use by route modules
export * from "./_helpers";
