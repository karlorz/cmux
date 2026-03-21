import { OpenAPIHono } from "@hono/zod-openapi";
import { morphInstancesRouter } from "./morph.instances.route";
import { morphSetupInstanceRouter } from "./morph.setup-instance.route";
import { morphTaskRunsRouter } from "./morph.task-runs.route";

export const morphRouter = new OpenAPIHono();
morphRouter.route("/", morphInstancesRouter);
morphRouter.route("/", morphSetupInstanceRouter);
morphRouter.route("/", morphTaskRunsRouter);

// NOTE: CLI Credentials endpoint was removed for security reasons.
// The shared Morph API key should NEVER be exposed to clients.
// All Morph operations must be proxied through the backend which enforces
// proper team/user access controls.
