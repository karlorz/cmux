import { OpenAPIHono } from "@hono/zod-openapi";
import { modelsDiscoveryRouter } from "./models.discovery.route";
import { modelsEnabledRouter } from "./models.enabled.route";
import { modelsListRouter } from "./models.list.route";
import { modelsReorderRouter } from "./models.reorder.route";

export const modelsRouter = new OpenAPIHono();

modelsRouter.route("/", modelsDiscoveryRouter);
modelsRouter.route("/", modelsEnabledRouter);
modelsRouter.route("/", modelsListRouter);
modelsRouter.route("/", modelsReorderRouter);

