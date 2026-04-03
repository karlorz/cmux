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
 * - run-control.route.ts - Shared run-control summary
 * - events.route.ts - SSE real-time updates
 * - approvals.route.ts - Human-in-the-loop approvals
 * - learning.route.ts - Self-improving orchestration rules
 * - checkpoint.route.ts - Checkpoint management
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { orchestrateTasksRouter } from "./tasks.route";
import { orchestrateSyncRouter } from "./sync.route";
import { orchestrateSessionsRouter } from "./sessions.route";
import { orchestrateRunControlRouter } from "./run-control.route";
import { orchestrateEventsRouter } from "./events.route";
import { orchestrateApprovalsRouter } from "./approvals.route";
import { orchestrateLearningRouter } from "./learning.route";
import { orchestrateInputRouter } from "./input.route";
import { orchestrateSimplifyRouter } from "./simplify.route";
import { orchestrateContextHealthRouter } from "./context-health.route";
import { orchestrateCheckpointRouter } from "./checkpoint.route";
import { orchestrateLocalSpawnRouter } from "./local-spawn.route";

export const orchestrateRouter = new OpenAPIHono();

// Mount all sub-routers
orchestrateRouter.route("/", orchestrateTasksRouter);
orchestrateRouter.route("/", orchestrateSyncRouter);
orchestrateRouter.route("/", orchestrateSessionsRouter);
orchestrateRouter.route("/", orchestrateRunControlRouter);
orchestrateRouter.route("/", orchestrateEventsRouter);
orchestrateRouter.route("/", orchestrateApprovalsRouter);
orchestrateRouter.route("/", orchestrateLearningRouter);
orchestrateRouter.route("/", orchestrateInputRouter);
orchestrateRouter.route("/", orchestrateSimplifyRouter);
orchestrateRouter.route("/", orchestrateContextHealthRouter);
orchestrateRouter.route("/", orchestrateCheckpointRouter);
orchestrateRouter.route("/", orchestrateLocalSpawnRouter);

// Re-export for backwards compatibility
export { orchestrateTasksRouter } from "./tasks.route";
export { orchestrateSyncRouter } from "./sync.route";
export { orchestrateSessionsRouter } from "./sessions.route";
export { orchestrateRunControlRouter } from "./run-control.route";
export { orchestrateEventsRouter } from "./events.route";
export { orchestrateApprovalsRouter } from "./approvals.route";
export { orchestrateLearningRouter } from "./learning.route";
export { orchestrateInputRouter } from "./input.route";
export { orchestrateSimplifyRouter } from "./simplify.route";
export { orchestrateContextHealthRouter } from "./context-health.route";
export { orchestrateCheckpointRouter } from "./checkpoint.route";
export { orchestrateLocalSpawnRouter } from "./local-spawn.route";
