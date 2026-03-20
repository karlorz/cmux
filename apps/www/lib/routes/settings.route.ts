import { OpenAPIHono } from "@hono/zod-openapi";
import { settingsProviderConnectionRouter } from "./settings.provider-connection.route";
import { settingsTestAnthropicConnectionRouter } from "./settings.test-anthropic-connection.route";

export const settingsRouter = new OpenAPIHono();

settingsRouter.route("/", settingsProviderConnectionRouter);
settingsRouter.route("/", settingsTestAnthropicConnectionRouter);
