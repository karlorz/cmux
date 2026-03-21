import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { getPveLxcClient } from "@/lib/utils/pve-lxc-client";
import { PVE_LXC_SNAPSHOT_PRESETS } from "@/lib/utils/pve-lxc-defaults";
import { getActiveSandboxProvider } from "@/lib/utils/sandbox-provider";
import { stackServerAppJs } from "@/lib/utils/stack";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { env } from "@/lib/utils/www-env";
import { api } from "@cmux/convex/api";
import { SNAPSHOT_PROVIDERS } from "@cmux/shared/provider-types";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { validateExposedPorts } from "@cmux/shared/utils/validate-exposed-ports";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { MorphCloudClient } from "morphcloud";
import { randomBytes } from "node:crypto";
import {
  detectInstanceProvider,
  withMorphRetry,
} from "./environments.helpers";
import { SNAPSHOT_CLEANUP_COMMANDS } from "./sandboxes/cleanup";

const CreateEnvironmentBody = z
  .object({
    teamSlugOrId: z.string(),
    name: z.string(),
    instanceId: z.string(),
    envVarsContent: z.string(),
    selectedRepos: z.array(z.string()).optional(),
    description: z.string().optional(),
    maintenanceScript: z.string().optional(),
    devScript: z.string().optional(),
    exposedPorts: z.array(z.number()).optional(),
  })
  .openapi("CreateEnvironmentBody");

const CreateEnvironmentResponse = z
  .object({
    id: z.string(),
    snapshotId: z.string(),
    snapshotProvider: z.enum(SNAPSHOT_PROVIDERS),
  })
  .openapi("CreateEnvironmentResponse");

const sanitizePortsOrThrow = (ports: readonly number[]): number[] => {
  const validation = validateExposedPorts(ports);
  if (validation.reserved.length > 0) {
    throw new HTTPException(400, {
      message: `Reserved ports cannot be exposed: ${validation.reserved.join(", ")}`,
    });
  }
  if (validation.invalid.length > 0) {
    throw new HTTPException(400, {
      message: `Invalid ports provided: ${validation.invalid.join(", ")}`,
    });
  }
  return validation.sanitized;
};

export const environmentsLifecycleRouter = new OpenAPIHono();

environmentsLifecycleRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/environments",
    tags: ["Environments"],
    summary: "Create a new environment with snapshot",
    request: {
      body: {
        content: {
          "application/json": {
            schema: CreateEnvironmentBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: CreateEnvironmentResponse,
          },
        },
        description: "Environment created successfully",
      },
      401: { description: "Unauthorized" },
      500: { description: "Failed to create environment" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) return c.text("Unauthorized", 401);

    const body = c.req.valid("json");

    try {
      const team = await verifyTeamAccess({
        req: c.req.raw,
        teamSlugOrId: body.teamSlugOrId,
      });

      const sanitizedPorts =
        body.exposedPorts && body.exposedPorts.length > 0
          ? sanitizePortsOrThrow(body.exposedPorts)
          : [];

      const provider = getActiveSandboxProvider().provider;
      const instanceProvider = detectInstanceProvider(body.instanceId);
      if (instanceProvider !== "other" && instanceProvider !== provider) {
        return c.text(
          "Forbidden: Instance provider does not match active sandbox provider",
          403,
        );
      }

      const persistDataVaultPromise = (async () => {
        const dataVaultKey = `env_${randomBytes(16).toString("hex")}`;
        const store =
          await stackServerAppJs.getDataVaultStore("cmux-snapshot-envs");
        await store.setValue(dataVaultKey, body.envVarsContent, {
          secret: env.STACK_DATA_VAULT_SECRET,
        });
        return { dataVaultKey };
      })();

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
        const client = new MorphCloudClient({ apiKey: env.MORPH_API_KEY });
        const instance = await withMorphRetry(
          () => client.instances.get({ instanceId: body.instanceId }),
          "instances.get (create environment)",
        );

        const instanceTeamId = instance.metadata?.teamId;
        if (instanceTeamId && instanceTeamId !== team.uuid) {
          return c.text("Forbidden: Instance does not belong to this team", 403);
        }

        await instance.exec(SNAPSHOT_CLEANUP_COMMANDS);

        const snapshot = await instance.snapshot();
        snapshotId = snapshot.id;
        snapshotProvider = "morph";
      }

      const convexClient = getConvex({ accessToken });
      const { dataVaultKey } = await persistDataVaultPromise;
      const environmentId = await convexClient.mutation(api.environments.create, {
        teamSlugOrId: body.teamSlugOrId,
        name: body.name,
        snapshotId,
        snapshotProvider,
        templateVmid,
        dataVaultKey,
        selectedRepos: body.selectedRepos,
        description: body.description,
        maintenanceScript: body.maintenanceScript,
        devScript: body.devScript,
        exposedPorts: sanitizedPorts.length > 0 ? sanitizedPorts : undefined,
      });

      return c.json({
        id: environmentId,
        snapshotId,
        snapshotProvider,
      });
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      console.error("Failed to create environment:", error);
      return c.text("Failed to create environment", 500);
    }
  },
);

environmentsLifecycleRouter.openapi(
  createRoute({
    method: "delete" as const,
    path: "/environments/{id}",
    tags: ["Environments"],
    summary: "Delete an environment",
    request: {
      params: z.object({
        id: z.string(),
      }),
      query: z.object({
        teamSlugOrId: z.string(),
      }),
    },
    responses: {
      204: { description: "Environment deleted successfully" },
      401: { description: "Unauthorized" },
      404: { description: "Environment not found" },
      500: { description: "Failed to delete environment" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) return c.text("Unauthorized", 401);

    const { id } = c.req.valid("param");
    const { teamSlugOrId } = c.req.valid("query");

    try {
      const convexClient = getConvex({ accessToken });
      const environmentId = typedZid("environments").parse(id);

      const environment = await convexClient.query(api.environments.get, {
        teamSlugOrId,
        id: environmentId,
      });

      if (!environment) {
        return c.text("Environment not found", 404);
      }

      const snapshotVersions =
        (await convexClient.query(api.environmentSnapshots.list, {
          teamSlugOrId,
          environmentId,
        })) ?? [];

      const provider =
        environment.snapshotProvider ?? getActiveSandboxProvider().provider;

      if (provider === "pve-lxc") {
        const pveClient = getPveLxcClient();
        const presetTemplateVmids = new Set(
          PVE_LXC_SNAPSHOT_PRESETS.flatMap((preset) =>
            preset.versions.map((v) => v.templateVmid),
          ),
        );

        const templateVmids = new Set<number>();
        if (environment.templateVmid) {
          templateVmids.add(environment.templateVmid);
        }
        snapshotVersions.forEach((version) => {
          if (version.templateVmid) {
            templateVmids.add(version.templateVmid);
          }
        });

        for (const vmid of templateVmids) {
          if (!Number.isFinite(vmid)) continue;

          if (vmid < 200 || presetTemplateVmids.has(vmid)) {
            console.log(
              `[environments.delete] Skipping PVE template cleanup for protected VMID ${vmid}`,
            );
            continue;
          }

          try {
            await pveClient.deleteContainer(vmid);
            console.log(
              `[environments.delete] Deleted PVE template container ${vmid}`,
            );
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            if (
              message.includes("404") ||
              message.includes("Not found") ||
              message.includes("does not exist") ||
              message.includes("locked")
            ) {
              console.warn(
                `[environments.delete] PVE template ${vmid} skipped (already deleted or locked)`,
              );
              continue;
            }
            console.error(
              `[environments.delete] Failed to delete PVE template ${vmid}:`,
              message,
            );
            return c.text("Failed to delete environment", 500);
          }
        }
      }

      await convexClient.mutation(api.environments.remove, {
        teamSlugOrId,
        id: environmentId,
      });

      return c.body(null, 204);
    } catch (error) {
      console.error("Failed to delete environment:", error);
      return c.text("Failed to delete environment", 500);
    }
  },
);
