import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { getPveLxcClient } from "@/lib/utils/pve-lxc-client";
import { getActiveSandboxProvider } from "@/lib/utils/sandbox-provider";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { env } from "@/lib/utils/www-env";
import { api } from "@cmux/convex/api";
import { SNAPSHOT_PROVIDERS } from "@cmux/shared/provider-types";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { MorphCloudClient } from "morphcloud";
import {
  detectInstanceProvider,
  withMorphRetry,
} from "./environments.helpers";
import { SNAPSHOT_CLEANUP_COMMANDS } from "./sandboxes/cleanup";

const SnapshotVersionResponse = z
  .object({
    id: z.string(),
    version: z.number(),
    snapshotId: z.string(),
    snapshotProvider: z.enum(SNAPSHOT_PROVIDERS),
    templateVmid: z.number().optional(),
    createdAt: z.number(),
    createdByUserId: z.string(),
    label: z.string().optional(),
    isActive: z.boolean(),
    maintenanceScript: z.string().optional(),
    devScript: z.string().optional(),
  })
  .openapi("SnapshotVersionResponse");

const ListSnapshotVersionsResponse = z
  .array(SnapshotVersionResponse)
  .openapi("ListSnapshotVersionsResponse");

const CreateSnapshotVersionBody = z
  .object({
    teamSlugOrId: z.string(),
    instanceId: z.string(),
    label: z.string().optional(),
    activate: z.boolean().optional(),
    maintenanceScript: z.string().optional(),
    devScript: z.string().optional(),
  })
  .openapi("CreateSnapshotVersionBody");

const CreateSnapshotVersionResponse = z
  .object({
    snapshotVersionId: z.string(),
    snapshotId: z.string(),
    snapshotProvider: z.enum(SNAPSHOT_PROVIDERS),
    version: z.number(),
  })
  .openapi("CreateSnapshotVersionResponse");

const ActivateSnapshotVersionBody = z
  .object({
    teamSlugOrId: z.string(),
  })
  .openapi("ActivateSnapshotVersionBody");

const ActivateSnapshotVersionResponse = z
  .object({
    snapshotId: z.string(),
    snapshotProvider: z.enum(SNAPSHOT_PROVIDERS),
    templateVmid: z.number().optional(),
    version: z.number(),
  })
  .openapi("ActivateSnapshotVersionResponse");

export const environmentsSnapshotsRouter = new OpenAPIHono();

environmentsSnapshotsRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/environments/{id}/snapshots",
    tags: ["Environments"],
    summary: "List snapshot versions for an environment",
    request: {
      params: z.object({
        id: z.string(),
      }),
      query: z.object({
        teamSlugOrId: z.string(),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: ListSnapshotVersionsResponse,
          },
        },
        description: "Snapshot versions retrieved successfully",
      },
      401: { description: "Unauthorized" },
      404: { description: "Environment not found" },
      500: { description: "Failed to list snapshot versions" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) return c.text("Unauthorized", 401);

    const { id } = c.req.valid("param");
    const { teamSlugOrId } = c.req.valid("query");

    try {
      const environmentId = typedZid("environments").parse(id);
      const convexClient = getConvex({ accessToken });
      const [environment, versions] = await Promise.all([
        convexClient.query(api.environments.get, {
          teamSlugOrId,
          id: environmentId,
        }),
        convexClient.query(api.environmentSnapshots.list, {
          teamSlugOrId,
          environmentId,
        }),
      ]);

      if (!environment) {
        return c.text("Environment not found", 404);
      }

      const mapped = versions.map((version) => {
        if (!version.snapshotId || !version.snapshotProvider) {
          throw new Error(
            `Snapshot version ${version._id} is missing snapshot metadata`,
          );
        }
        return {
          id: String(version._id),
          version: version.version,
          snapshotId: version.snapshotId,
          snapshotProvider: version.snapshotProvider,
          templateVmid: version.templateVmid ?? undefined,
          createdAt: version.createdAt,
          createdByUserId: version.createdByUserId,
          label: version.label ?? undefined,
          isActive: version.isActive,
          maintenanceScript: version.maintenanceScript ?? undefined,
          devScript: version.devScript ?? undefined,
        };
      });

      return c.json(mapped);
    } catch (error) {
      console.error("Failed to list snapshot versions:", error);
      return c.text("Failed to list snapshot versions", 500);
    }
  },
);

environmentsSnapshotsRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/environments/{id}/snapshots",
    tags: ["Environments"],
    summary: "Create a new snapshot version from a running instance",
    request: {
      params: z.object({
        id: z.string(),
      }),
      body: {
        content: {
          "application/json": {
            schema: CreateSnapshotVersionBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: CreateSnapshotVersionResponse,
          },
        },
        description: "Snapshot version created successfully",
      },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Environment not found" },
      500: { description: "Failed to create snapshot version" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) return c.text("Unauthorized", 401);

    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const environmentId = typedZid("environments").parse(id);

    try {
      const team = await verifyTeamAccess({
        req: c.req.raw,
        teamSlugOrId: body.teamSlugOrId,
      });

      const convexClient = getConvex({ accessToken });
      const provider = getActiveSandboxProvider().provider;
      const instanceProvider = detectInstanceProvider(body.instanceId);
      if (instanceProvider !== "other" && instanceProvider !== provider) {
        return c.text(
          "Forbidden: Instance provider does not match active sandbox provider",
          403,
        );
      }

      let snapshotId: string;
      let snapshotProvider:
        | "morph"
        | "pve-lxc"
        | "pve-vm"
        | "docker"
        | "daytona"
        | "other";
      let templateVmid: number | undefined;

      const resolvedProvider =
        instanceProvider !== "other" ? instanceProvider : provider;

      if (resolvedProvider === "pve-lxc") {
        const pveClient = getPveLxcClient();
        const pveInstance = await pveClient.instances.get({
          instanceId: body.instanceId,
        });

        if (pveInstance.status !== "running") {
          await pveInstance.start();
        }

        await pveInstance.exec(SNAPSHOT_CLEANUP_COMMANDS);

        const template = await pveClient.createTemplateFromContainer(
          body.instanceId,
        );
        snapshotId = template.snapshotId;
        templateVmid = template.templateVmid;
        snapshotProvider = "pve-lxc";
      } else {
        const morphClient = new MorphCloudClient({ apiKey: env.MORPH_API_KEY });
        const instance = await withMorphRetry(
          () => morphClient.instances.get({ instanceId: body.instanceId }),
          "instances.get (create snapshot)",
        );

        const metadata = instance.metadata;
        const instanceTeamId = metadata?.teamId;
        if (instanceTeamId && instanceTeamId !== team.uuid) {
          return c.text("Forbidden: Instance does not belong to this team", 403);
        }
        const metadataEnvironmentId = metadata?.environmentId;
        if (metadataEnvironmentId && metadataEnvironmentId !== id) {
          return c.text(
            "Forbidden: Instance does not belong to this environment",
            403,
          );
        }

        await instance.exec(SNAPSHOT_CLEANUP_COMMANDS);

        const snapshot = await instance.snapshot();
        snapshotId = snapshot.id;
        snapshotProvider = "morph";
      }

      const creation = await convexClient.mutation(
        api.environmentSnapshots.create,
        {
          teamSlugOrId: body.teamSlugOrId,
          environmentId,
          snapshotId,
          snapshotProvider,
          templateVmid,
          label: body.label,
          activate: body.activate,
          maintenanceScript: body.maintenanceScript,
          devScript: body.devScript,
        },
      );

      return c.json({
        snapshotVersionId: String(creation.snapshotVersionId),
        snapshotId,
        snapshotProvider,
        version: creation.version,
      });
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      if (error instanceof Error && error.message === "Environment not found") {
        return c.text("Environment not found", 404);
      }
      console.error("Failed to create snapshot version:", error);
      return c.text("Failed to create snapshot version", 500);
    }
  },
);

environmentsSnapshotsRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/environments/{id}/snapshots/{snapshotVersionId}/activate",
    tags: ["Environments"],
    summary: "Activate a snapshot version for an environment",
    request: {
      params: z.object({
        id: z.string(),
        snapshotVersionId: z.string(),
      }),
      body: {
        content: {
          "application/json": {
            schema: ActivateSnapshotVersionBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: ActivateSnapshotVersionResponse,
          },
        },
        description: "Snapshot version activated successfully",
      },
      401: { description: "Unauthorized" },
      404: { description: "Snapshot version not found" },
      500: { description: "Failed to activate snapshot version" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) return c.text("Unauthorized", 401);

    const { id, snapshotVersionId } = c.req.valid("param");
    const body = c.req.valid("json");

    try {
      const environmentId = typedZid("environments").parse(id);
      const versionId = typedZid("environmentSnapshotVersions").parse(
        snapshotVersionId,
      );
      const convexClient = getConvex({ accessToken });

      await verifyTeamAccess({
        req: c.req.raw,
        teamSlugOrId: body.teamSlugOrId,
      });

      const result = await convexClient.mutation(
        api.environmentSnapshots.activate,
        {
          teamSlugOrId: body.teamSlugOrId,
          environmentId,
          snapshotVersionId: versionId,
        },
      );

      return c.json(result);
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      if (
        error instanceof Error &&
        error.message === "Snapshot version not found"
      ) {
        return c.text("Snapshot version not found", 404);
      }
      if (error instanceof Error && error.message === "Environment not found") {
        return c.text("Environment not found", 404);
      }
      console.error("Failed to activate snapshot version:", error);
      return c.text("Failed to activate snapshot version", 500);
    }
  },
);
