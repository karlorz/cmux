/**
 * Project REST API Routes
 *
 * Provides REST endpoints for project tracking:
 * - GET /api/projects - List projects for a team
 * - POST /api/projects - Create a new project
 * - GET /api/projects/:id - Get a single project
 * - PATCH /api/projects/:id - Update a project
 * - PUT /api/projects/:id/plan - Upsert project plan
 * - GET /api/projects/:id/progress - Get project progress metrics
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { projectCreateRouter } from "./project.create.route";
import { projectGetRouter } from "./project.get.route";
import { projectListRouter } from "./project.list.route";
import { projectPlanRouter } from "./project.plan.route";
import { projectUpdateRouter } from "./project.update.route";
// ============================================================================
// Router
// ============================================================================

export const projectRouter = new OpenAPIHono();

projectRouter.route("/", projectCreateRouter);
projectRouter.route("/", projectGetRouter);
projectRouter.route("/", projectListRouter);
projectRouter.route("/", projectPlanRouter);
projectRouter.route("/", projectUpdateRouter);

