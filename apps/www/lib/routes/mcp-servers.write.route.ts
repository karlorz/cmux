import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { SuccessResponse, UpsertMcpServerBody } from "./mcp-servers.schemas";

export const mcpServersWriteRouter = new OpenAPIHono();

mcpServersWriteRouter.openapi(
  createRoute({
    method: "post",
    path: "/mcp-servers",
    tags: ["McpServers"],
    summary: "Create or update an MCP server configuration",
    request: {
      query: z.object({
        teamSlugOrId: z.string(),
      }),
      body: {
        content: {
          "application/json": {
            schema: UpsertMcpServerBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Configuration saved",
        content: {
          "application/json": {
            schema: SuccessResponse,
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
    const body = c.req.valid("json");

    await verifyTeamAccess({
      accessToken,
      teamSlugOrId: query.teamSlugOrId,
    });

    const convex = getConvex({ accessToken });
    const id = await convex.mutation(api.mcpServerConfigs.upsert, {
      teamSlugOrId: query.teamSlugOrId,
      name: body.name,
      displayName: body.displayName,
      type: body.type,
      ...(body.type === "stdio"
        ? {
            command: body.command,
            args: body.args,
          }
        : {
            url: body.url,
            ...(body.headers !== undefined ? { headers: body.headers } : {}),
          }),
      ...(body.envVars !== undefined ? { envVars: body.envVars } : {}),
      description: body.description,
      tags: body.tags,
      enabledClaude: body.enabledClaude,
      enabledCodex: body.enabledCodex,
      enabledGemini: body.enabledGemini,
      enabledOpencode: body.enabledOpencode,
      sourcePresetId: body.sourcePresetId,
      scope: body.scope,
      projectFullName: body.projectFullName,
    });

    return c.json({ success: true, id });
  },
);

mcpServersWriteRouter.openapi(
  createRoute({
    method: "delete",
    path: "/mcp-servers/{id}",
    tags: ["McpServers"],
    summary: "Delete an MCP server configuration",
    request: {
      params: z.object({
        id: z.string().describe("MCP server config document ID"),
      }),
      query: z.object({
        teamSlugOrId: z.string(),
      }),
    },
    responses: {
      200: {
        description: "Configuration deleted",
        content: {
          "application/json": {
            schema: SuccessResponse,
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

    const { id } = c.req.valid("param");
    const query = c.req.valid("query");

    await verifyTeamAccess({
      accessToken,
      teamSlugOrId: query.teamSlugOrId,
    });

    const convex = getConvex({ accessToken });
    await convex.mutation(api.mcpServerConfigs.remove, {
      teamSlugOrId: query.teamSlugOrId,
      id: id as Id<"mcpServerConfigs">,
    });

    return c.json({ success: true });
  },
);
