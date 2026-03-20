import { OpenAPIHono } from "@hono/zod-openapi";
import { providersEnabledRouter } from "./providers.enabled.route";
import { providersOverridesRouter } from "./providers.overrides.route";
import { providersTestRouter } from "./providers.test.route";

export const providersRouter = new OpenAPIHono();

providersRouter.route("/", providersEnabledRouter);
providersRouter.route("/", providersOverridesRouter);
providersRouter.route("/", providersTestRouter);
