import { OpenAPIHono } from "@hono/zod-openapi";
import { githubDefaultBranchRouter } from "./github.branches.default.route";
import { githubBranchesListRouter } from "./github.branches.list.route";

export const githubBranchesRouter = new OpenAPIHono();

githubBranchesRouter.route("/", githubDefaultBranchRouter);
githubBranchesRouter.route("/", githubBranchesListRouter);
