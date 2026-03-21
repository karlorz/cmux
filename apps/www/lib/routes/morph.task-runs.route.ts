import { OpenAPIHono } from "@hono/zod-openapi";
import { morphTaskRunsPausedRouter } from "./morph.task-runs.paused.route";
import { morphTaskRunsRefreshGitHubAuthRouter } from "./morph.task-runs.refresh-github-auth.route";
import { morphTaskRunsResumeRouter } from "./morph.task-runs.resume.route";

export const morphTaskRunsRouter = new OpenAPIHono();

morphTaskRunsRouter.route("/", morphTaskRunsPausedRouter);
morphTaskRunsRouter.route("/", morphTaskRunsRefreshGitHubAuthRouter);
morphTaskRunsRouter.route("/", morphTaskRunsResumeRouter);
