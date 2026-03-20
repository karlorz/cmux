/**
 * Sandboxes Routes
 *
 * Combined router aggregating all sandbox sub-routers.
 * Gradually migrating from monolithic sandboxes.route.ts.
 *
 * Sub-routers:
 * - start.route.ts - /start, /prewarm ✅
 * - lifecycle.route.ts - /stop, /resume, /status ✅
 * - config.route.ts - /setup-providers, /refresh-github-auth, /env, /run-scripts ✅
 * - features.route.ts - /publish-devcontainer, /ssh, /discover-repos, /live-diff ✅
 */

// Re-export the main router (still contains most routes during migration)
export { sandboxesRouter } from "../sandboxes.route";

// Export sub-routers for direct use
export { sandboxesStartRouter } from "./start.route";
export { sandboxesLifecycleRouter } from "./lifecycle.route";
export { sandboxesFeaturesRouter } from "./features.route";
export { sandboxesConfigRouter } from "./config.route";

// Export helpers for use by route modules
export * from "./_helpers";
