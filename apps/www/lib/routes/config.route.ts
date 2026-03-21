import { OpenAPIHono } from "@hono/zod-openapi";
import { configSandboxRouter } from "./config.sandbox.route";

export const configRouter = new OpenAPIHono();

configRouter.route("/", configSandboxRouter);
