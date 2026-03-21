import { OpenAPIHono } from "@hono/zod-openapi";
import { githubPrsListRouter } from "./github.prs.list.route";

export const githubPrsRouter = new OpenAPIHono();

githubPrsRouter.route("/", githubPrsListRouter);
