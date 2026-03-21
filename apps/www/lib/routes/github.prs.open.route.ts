import { OpenAPIHono } from "@hono/zod-openapi";
import { githubPrsCloseRouter } from "./github.prs.close.route";
import { githubPrsDirectActionsRouter } from "./github.prs.direct-actions.route";
import { githubPrsMergeRouter } from "./github.prs.merge.route";
import { githubPrsOpenCreateRouter } from "./github.prs.open.create.route";

export const githubPrsOpenRouter = new OpenAPIHono();

githubPrsOpenRouter.route("/", githubPrsCloseRouter);
githubPrsOpenRouter.route("/", githubPrsDirectActionsRouter);
githubPrsOpenRouter.route("/", githubPrsMergeRouter);
githubPrsOpenRouter.route("/", githubPrsOpenCreateRouter);
