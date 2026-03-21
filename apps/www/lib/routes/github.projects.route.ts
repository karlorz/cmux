/**
 * GitHub Projects v2 API routes
 *
 * Provides endpoints for listing and managing GitHub Projects for roadmap/planning.
 *
 * IMPORTANT: GitHub Apps CANNOT access user-owned Projects v2 (platform limitation).
 * For user-owned projects, we must use the user's OAuth token with "project" scope.
 * Organization projects can use either GitHub App or OAuth token.
 *
 * @see https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { githubProjectsDraftsRouter } from "./github.projects.drafts.route";
import { githubProjectsFieldsRouter } from "./github.projects.fields.route";
import { githubProjectsItemsRouter } from "./github.projects.items.route";
import { githubProjectsItemMutationsRouter } from "./github.projects.item-mutations.route";
import { githubProjectsListRouter } from "./github.projects.list.route";
import { githubProjectsPlanSyncRouter } from "./github.projects.plan-sync.route";
import { mapCmuxStatusToProjectStatus } from "../utils/github-projects";

export const githubProjectsRouter = new OpenAPIHono();
githubProjectsRouter.route("/", githubProjectsDraftsRouter);
githubProjectsRouter.route("/", githubProjectsFieldsRouter);
githubProjectsRouter.route("/", githubProjectsItemsRouter);
githubProjectsRouter.route("/", githubProjectsItemMutationsRouter);
githubProjectsRouter.route("/", githubProjectsListRouter);
githubProjectsRouter.route("/", githubProjectsPlanSyncRouter);

export { mapCmuxStatusToProjectStatus };
