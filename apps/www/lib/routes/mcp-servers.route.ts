import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { api } from "@cmux/convex/api";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import {
  formatMcpServerConfigList,
  formatMcpServerPresetList,
  McpServerListQuery,
  McpServersListResponse,
} from "./mcp-servers.schemas";
import { mcpServersWriteRouter } from "./mcp-servers.write.route";

export const mcpServersRouter = new OpenAPIHono();

mcpServersRouter.route("/", mcpServersWriteRouter);

mcpServersRouter.openapi(
  createRoute({
    method: "get",
    path: "/mcp-servers",
    tags: ["McpServers"],
    summary: "List MCP server configurations and presets",
    request: {
      query: McpServerListQuery,
    },
    responses: {
      200: {
        description: "List of MCP server configs and presets",
        content: {
          "application/json": {
            schema: McpServersListResponse,
          },
        },
      },
      401: { description: "Unauthorized" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const query = c.req.valid("query");
    await verifyTeamAccess({
      accessToken,
      teamSlugOrId: query.teamSlugOrId,
    });

    const convex = getConvex({ accessToken });
    const configs = await convex.query(api.mcpServerConfigs.list, {
      teamSlugOrId: query.teamSlugOrId,
      ...(query.scope ? { scope: query.scope } : {}),
      ...(query.projectFullName
        ? { projectFullName: query.projectFullName }
        : {}),
    });

    return c.json({
      configs: formatMcpServerConfigList(configs),
      presets: formatMcpServerPresetList(),
    });
  },
);
