import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { stackServerAppJs } from "@/lib/utils/stack";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { env } from "@/lib/utils/www-env";
import { api } from "@cmux/convex/api";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { randomBytes } from "node:crypto";

export const workspaceConfigsRouter = new OpenAPIHono();
const WORKSPACE_CONFIGS_LOG_PREFIX = "[workspace-configs]";

const WorkspaceConfigResponse = z
  .object({
    projectFullName: z.string(),
    maintenanceScript: z.string().optional(),
    envVarsContent: z.string(),
    updatedAt: z.number().optional(),
  })
  .openapi("WorkspaceConfigResponse");

const WorkspaceConfigQuery = z
  .object({
    teamSlugOrId: z.string(),
    projectFullName: z.string(),
  })
  .openapi("WorkspaceConfigQuery");

const WorkspaceConfigBody = z
  .object({
    teamSlugOrId: z.string(),
    projectFullName: z.string(),
    maintenanceScript: z.string().optional(),
    envVarsContent: z.string().default(""),
  })
  .openapi("WorkspaceConfigBody");

async function loadEnvVarsContent(
  dataVaultKey: string | undefined,
): Promise<string> {
  if (!dataVaultKey) return "";
  const store = await stackServerAppJs.getDataVaultStore("cmux-snapshot-envs");
  const value = await store.getValue(dataVaultKey, {
    secret: env.STACK_DATA_VAULT_SECRET,
  });
  return value ?? "";
}

workspaceConfigsRouter.openapi(
  createRoute({
    method: "get",
    path: "/workspace-configs",
    summary: "Get workspace configuration",
    tags: ["WorkspaceConfigs"],
    request: {
      query: WorkspaceConfigQuery,
    },
    responses: {
      200: {
        description: "Configuration retrieved",
        content: {
          "application/json": {
            schema: WorkspaceConfigResponse.nullable(),
          },
        },
      },
      401: { description: "Unauthorized" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) return c.text("Unauthorized", 401);

    const query = c.req.valid("query");

    await verifyTeamAccess({
      req: c.req.raw,
      teamSlugOrId: query.teamSlugOrId,
    });

    const convex = getConvex({ accessToken });
    const config = await convex
      .query(api.workspaceConfigs.get, {
        teamSlugOrId: query.teamSlugOrId,
        projectFullName: query.projectFullName,
      })
      .catch((error) => {
        console.error(
          `${WORKSPACE_CONFIGS_LOG_PREFIX}: Failed to query workspace config`,
          {
            teamSlugOrId: query.teamSlugOrId,
            projectFullName: query.projectFullName,
            error,
          },
        );
        throw new HTTPException(500, {
          message: `Unable to load workspace config for ${query.projectFullName} (team ${query.teamSlugOrId})`,
          cause: error,
        });
      });

    if (!config) {
      return c.json(null);
    }

    const envVarsContent = await loadEnvVarsContent(
      config.dataVaultKey,
    ).catch((error) => {
      console.error(
        `${WORKSPACE_CONFIGS_LOG_PREFIX}: Failed to load env vars for workspace config`,
        {
          teamSlugOrId: query.teamSlugOrId,
          projectFullName: config.projectFullName,
          dataVaultKey: config.dataVaultKey,
          error,
        },
      );
      throw new HTTPException(500, {
        message: `Unable to read workspace secrets for ${config.projectFullName}`,
        cause: error,
      });
    });

    return c.json({
      projectFullName: config.projectFullName,
      maintenanceScript: config.maintenanceScript ?? undefined,
      envVarsContent,
      updatedAt: config.updatedAt,
    });
  },
);

workspaceConfigsRouter.openapi(
  createRoute({
    method: "post",
    path: "/workspace-configs",
    summary: "Create or update workspace configuration",
    tags: ["WorkspaceConfigs"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: WorkspaceConfigBody,
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
            schema: WorkspaceConfigResponse,
          },
        },
      },
      400: { description: "Invalid request" },
      401: { description: "Unauthorized" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) return c.text("Unauthorized", 401);

    const body = c.req.valid("json");

    await verifyTeamAccess({
      req: c.req.raw,
      teamSlugOrId: body.teamSlugOrId,
    });

    const convex = getConvex({ accessToken });
    const existing = await convex
      .query(api.workspaceConfigs.get, {
        teamSlugOrId: body.teamSlugOrId,
        projectFullName: body.projectFullName,
      })
      .catch((error) => {
        console.error(
          `${WORKSPACE_CONFIGS_LOG_PREFIX}: Failed to read existing workspace config`,
          {
            teamSlugOrId: body.teamSlugOrId,
            projectFullName: body.projectFullName,
            error,
          },
        );
        throw new HTTPException(500, {
          message: `Unable to load existing workspace config for ${body.projectFullName} (team ${body.teamSlugOrId})`,
          cause: error,
        });
      });

    const store = await stackServerAppJs
      .getDataVaultStore("cmux-snapshot-envs")
      .catch((error) => {
        console.error(
          `${WORKSPACE_CONFIGS_LOG_PREFIX}: Failed to access data vault store`,
          {
            teamSlugOrId: body.teamSlugOrId,
            projectFullName: body.projectFullName,
            error,
          },
        );
        throw new HTTPException(500, {
          message: `Unable to access secure workspace storage for ${body.projectFullName}`,
          cause: error,
        });
      });
    const envVarsContent = body.envVarsContent ?? "";
    let dataVaultKey = existing?.dataVaultKey;
    if (!dataVaultKey) {
      dataVaultKey = `workspace_${randomBytes(16).toString("hex")}`;
    }

    try {
      await store.setValue(dataVaultKey, envVarsContent, {
        secret: env.STACK_DATA_VAULT_SECRET,
      });
    } catch (error) {
      console.error(
        `${WORKSPACE_CONFIGS_LOG_PREFIX}: Failed to persist env vars`,
        {
          teamSlugOrId: body.teamSlugOrId,
          projectFullName: body.projectFullName,
          dataVaultKey,
          error,
        },
      );
      throw new HTTPException(500, {
        message: `Unable to persist env vars for ${body.projectFullName}`,
        cause: error,
      });
    }

    await convex
      .mutation(api.workspaceConfigs.upsert, {
        teamSlugOrId: body.teamSlugOrId,
        projectFullName: body.projectFullName,
        maintenanceScript: body.maintenanceScript,
        dataVaultKey,
      })
      .catch((error) => {
        console.error(
          `${WORKSPACE_CONFIGS_LOG_PREFIX}: Failed to upsert workspace config`,
          {
            teamSlugOrId: body.teamSlugOrId,
            projectFullName: body.projectFullName,
            error,
          },
        );
        throw new HTTPException(500, {
          message: `Unable to save workspace config for ${body.projectFullName}`,
          cause: error,
        });
      });

    return c.json({
      projectFullName: body.projectFullName,
      maintenanceScript: body.maintenanceScript,
      envVarsContent,
      updatedAt: Date.now(),
    });
  },
);
