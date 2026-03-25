/**
 * Orchestration Routes
 *
 * Combined router that aggregates all orchestration sub-routers.
 * Split from the monolithic orchestrate.route.ts for maintainability.
 *
 * Sub-routers:
 * - tasks.route.ts - Core task management endpoints
 * - sync.route.ts - Bi-directional sync for head agents
 * - sessions.route.ts - Provider session binding
 * - events.route.ts - SSE real-time updates
 * - approvals.route.ts - Human-in-the-loop approvals
 * - learning.route.ts - Self-improving orchestration rules
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { orchestrateTasksRouter } from "./tasks.route";
import { orchestrateSyncRouter } from "./sync.route";
import { orchestrateSessionsRouter } from "./sessions.route";
import { orchestrateEventsRouter } from "./events.route";
import { orchestrateApprovalsRouter } from "./approvals.route";
import { orchestrateLearningRouter } from "./learning.route";
import { orchestrateInputRouter } from "./input.route";
import { orchestrateSimplifyRouter } from "./simplify.route";

export const orchestrateRouter = new OpenAPIHono();

// Mount all sub-routers
orchestrateRouter.route("/", orchestrateTasksRouter);
orchestrateRouter.route("/", orchestrateSyncRouter);
orchestrateRouter.route("/", orchestrateSessionsRouter);
orchestrateRouter.route("/", orchestrateEventsRouter);
orchestrateRouter.route("/", orchestrateApprovalsRouter);
orchestrateRouter.route("/", orchestrateLearningRouter);
orchestrateRouter.route("/", orchestrateInputRouter);
orchestrateRouter.route("/", orchestrateSimplifyRouter);

// Re-export for backwards compatibility
export { orchestrateTasksRouter } from "./tasks.route";
export { orchestrateSyncRouter } from "./sync.route";
export { orchestrateSessionsRouter } from "./sessions.route";
export { orchestrateEventsRouter } from "./events.route";
export { orchestrateApprovalsRouter } from "./approvals.route";
export { orchestrateLearningRouter } from "./learning.route";
export { orchestrateInputRouter } from "./input.route";
export { orchestrateSimplifyRouter } from "./simplify.route";
