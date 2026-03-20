import { OpenAPIHono } from "@hono/zod-openapi";
import { previewTestJobsDeleteRouter } from "./preview.test-jobs.delete.route";
import { previewTestJobsDetailRouter } from "./preview.test-jobs.detail.route";
import { previewTestJobsListRouter } from "./preview.test-jobs.list.route";
import { previewTestJobsRetryRouter } from "./preview.test-jobs.retry.route";

export const previewTestJobRunsRouter = new OpenAPIHono();

previewTestJobRunsRouter.route("/", previewTestJobsDeleteRouter);
previewTestJobRunsRouter.route("/", previewTestJobsDetailRouter);
previewTestJobRunsRouter.route("/", previewTestJobsListRouter);
previewTestJobRunsRouter.route("/", previewTestJobsRetryRouter);
