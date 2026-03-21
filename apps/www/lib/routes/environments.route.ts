import { OpenAPIHono } from "@hono/zod-openapi";
import { environmentsGetRouter } from "./environments.get.route";
import { environmentsLifecycleRouter } from "./environments.lifecycle.route";
import { environmentsListRouter } from "./environments.list.route";
import { environmentsPortsRouter } from "./environments.ports.route";
import { environmentsSnapshotsRouter } from "./environments.snapshots.route";
import { environmentsUpdateRouter } from "./environments.update.route";
import { environmentsVarsRouter } from "./environments.vars.route";

export const environmentsRouter = new OpenAPIHono();

environmentsRouter.route("/", environmentsGetRouter);
environmentsRouter.route("/", environmentsLifecycleRouter);
environmentsRouter.route("/", environmentsListRouter);
environmentsRouter.route("/", environmentsPortsRouter);
environmentsRouter.route("/", environmentsSnapshotsRouter);
environmentsRouter.route("/", environmentsUpdateRouter);
environmentsRouter.route("/", environmentsVarsRouter);

