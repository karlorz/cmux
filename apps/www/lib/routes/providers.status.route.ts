import { OpenAPIHono } from "@hono/zod-openapi";
import { providersStatusListRouter } from "./providers.status.list.route";

export const providersStatusRouter = new OpenAPIHono();

providersStatusRouter.route("/", providersStatusListRouter);
