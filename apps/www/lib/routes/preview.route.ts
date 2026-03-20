import { OpenAPIHono } from "@hono/zod-openapi";
import { previewConfigsRouter } from "./preview.configs.route";
import { previewTestJobsRouter } from "./preview.test-jobs.route";

export const previewRouter = new OpenAPIHono();

previewRouter.route("/", previewConfigsRouter);
previewRouter.route("/", previewTestJobsRouter);
