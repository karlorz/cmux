import { OpenAPIHono } from "@hono/zod-openapi";
import { previewTestJobsAccessRouter } from "./preview.test-jobs.access.route";
import { previewTestJobsCreateRouter } from "./preview.test-jobs.create.route";
import { previewTestJobsDispatchRouter } from "./preview.test-jobs.dispatch.route";
import { previewTestJobRunsRouter } from "./preview.test-jobs.runs.route";

export const previewTestJobsRouter = new OpenAPIHono();

previewTestJobsRouter.route("/", previewTestJobsAccessRouter);
previewTestJobsRouter.route("/", previewTestJobsCreateRouter);
previewTestJobsRouter.route("/", previewTestJobsDispatchRouter);
previewTestJobsRouter.route("/", previewTestJobRunsRouter);
