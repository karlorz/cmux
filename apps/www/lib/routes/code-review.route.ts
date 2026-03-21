import { OpenAPIHono } from "@hono/zod-openapi";
import { codeReviewSimpleRouter } from "./code-review.simple.route";
import { codeReviewStartRouter } from "./code-review.start.route";

export const codeReviewRouter = new OpenAPIHono();

codeReviewRouter.route("/", codeReviewSimpleRouter);
codeReviewRouter.route("/", codeReviewStartRouter);

