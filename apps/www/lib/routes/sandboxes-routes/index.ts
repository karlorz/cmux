/**
 * Sandboxes Routes
 *
 * Re-exports the sandboxes router from the main route file.
 * Helpers have been extracted to _helpers.ts for future modularization.
 *
 * TODO: Split the main sandboxes.route.ts into focused modules:
 * - start.route.ts - POST /sandboxes/start (~1120 lines)
 * - lifecycle.route.ts - /stop, /resume, /status
 * - config.route.ts - /setup-providers, /refresh-github-auth, /env, /run-scripts
 * - features.route.ts - /publish-devcontainer, /ssh, /discover-repos, /live-diff, /prewarm
 */

// Re-export the router from the main file for now
export { sandboxesRouter } from "../sandboxes.route";

// Export helpers for use by route modules
export * from "./_helpers";
