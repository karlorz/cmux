import { OpenAPIHono } from "@hono/zod-openapi";
import { mcpServersListRouter } from "./mcp-servers.list.route";
import { mcpServersWriteRouter } from "./mcp-servers.write.route";

export const mcpServersRouter = new OpenAPIHono();

mcpServersRouter.route("/", mcpServersListRouter);
mcpServersRouter.route("/", mcpServersWriteRouter);
