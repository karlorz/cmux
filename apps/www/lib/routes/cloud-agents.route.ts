import { getConvex } from "@/lib/utils/get-convex";
import { stackServerAppJs } from "@/lib/utils/stack";
import { env } from "@/lib/utils/www-env";
import { api } from "@cmux/convex/api";
import type { Doc, Id } from "@cmux/convex/dataModel";
import {
  AGENT_CONFIGS,
  type AgentConfig,
  type EnvironmentResult,
} from "@cmux/shared/agentConfig";
import {
  generateUniqueBranchNames,
  generateUniqueBranchNamesFromTitle,
  getPRTitleFromTaskDescription,
  mergeApiKeysWithEnv,
} from "@/lib/utils/branch-name-generator";
import {
  createRoute,
  OpenAPIHono,
  z,
} from "@hono/zod-openapi";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { MorphCloudClient } from "morphcloud";
import { connectToWorkerManagement } from "@cmux/shared/socket";
import { parse as parseDotenv } from "dotenv";
import rawSwitchBranchScript from "@cmux/shared/scripts/switch-branch.ts?raw";
import { encodeEnvContentForEnvctl, envctlLoadCommand } from "./utils/ensure-env-vars";
import {
  configureGithubAccess,
  configureGitIdentity,
  fetchGitIdentityInputs,
} from "./sandboxes/git";
import { hydrateWorkspace } from "./sandboxes/hydration";
import { resolveTeamAndSnapshot } from "./sandboxes/snapshot";
import { loadEnvironmentEnvVars } from "./sandboxes/environment";
import {
  runMaintenanceScript,
  startDevScript,
} from "./sandboxes/startDevAndMaintenanceScript";
import type { HydrateRepoConfig } from "./sandboxes/hydration";
import { workerExec } from "@/lib/utils/workerExec";
import { retryOnOptimisticConcurrency } from "@/lib/utils/convexRetry";
import { selectGitIdentity } from "@/lib/utils/gitIdentity";
import { HTTPException } from "hono/http-exception";
import { Buffer } from "node:buffer";

const SWITCH_BRANCH_BUN_SCRIPT = rawSwitchBranchScript;

export const cloudAgentsRouter = new OpenAPIHono();

const ImagePayload = z
  .object({
    src: z.string(),
    fileName: z.string().optional(),
    altText: z.string(),
  })
  .openapi("AgentImagePayload");

const SpawnCloudAgentsBody = z
  .object({
    teamSlugOrId: z.string(),
    taskId: z.string(),
    taskDescription: z.string(),
    repoUrl: z.string().optional(),
    branch: z.string().optional(),
    selectedAgents: z.array(z.string()).optional(),
    environmentId: z.string().optional(),
    images: z.array(ImagePayload).optional(),
    theme: z.enum(["dark", "light", "system"]).optional(),
  })
  .openapi("SpawnCloudAgentsBody");

const AgentSpawnResultSchema = z.object({
  agentName: z.string(),
  taskRunId: z.string(),
  terminalId: z.string().optional(),
  vscodeUrl: z.string().optional(),
  workerUrl: z.string().optional(),
  success: z.boolean(),
  error: z.string().optional(),
});

const SpawnCloudAgentsResponse = z
  .object({
    results: z.array(AgentSpawnResultSchema),
    prTitle: z.string().optional(),
  })
  .openapi("SpawnCloudAgentsResponse");

cloudAgentsRouter.openapi(
  createRoute({
    method: "post",
    path: "/cloud/spawn-agents",
    tags: ["Cloud"],
    summary: "Spawn one or more agents in Morph-backed cloud sandboxes",
    request: {
      body: {
        content: {
          "application/json": {
            schema: SpawnCloudAgentsBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: SpawnCloudAgentsResponse,
          },
        },
        description: "Agents spawned successfully",
      },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      500: { description: "Failed to spawn agents" },
    },
  }),
  async (c) => {
    const user = await stackServerAppJs.getUser({ tokenStore: c.req.raw });
    if (!user) {
      return c.text("Unauthorized", 401);
    }
    const { accessToken } = await user.getAuthJson();
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const body = c.req.valid("json");
    const convex = getConvex({ accessToken });

    try {
      const taskId = typedZid("tasks").parse(body.taskId);
      const agentsToSpawn = resolveAgents(body.selectedAgents);
      if (agentsToSpawn.length === 0) {
        throw new HTTPException(400, {
          message: "No agent configurations matched the request",
        });
      }

      const {
        team,
        resolvedSnapshotId,
        environmentDataVaultKey,
        environmentMaintenanceScript,
        environmentDevScript,
      } = await resolveTeamAndSnapshot({
        req: c.req.raw,
        convex,
        teamSlugOrId: body.teamSlugOrId,
        environmentId: body.environmentId,
      });

      const environmentEnvVarsPromise = environmentDataVaultKey
        ? loadEnvironmentEnvVars(environmentDataVaultKey)
        : Promise.resolve<string | null>(null);

      const githubAccessTokenPromise = (async () => {
        const githubAccount = await user.getConnectedAccount("github");
        if (!githubAccount) {
          return {
            githubAccessTokenError: "GitHub account not found",
            githubAccessToken: null,
          } as const;
        }
        const { accessToken: githubAccessToken } =
          await githubAccount.getAccessToken();
        if (!githubAccessToken) {
          return {
            githubAccessTokenError: "GitHub access token not found",
            githubAccessToken: null,
          } as const;
        }
        return {
          githubAccessTokenError: null,
          githubAccessToken,
        } as const;
      })();

      const apiKeysDoc =
        (await convex.query(api.apiKeys.getAllForAgents, {
          teamSlugOrId: body.teamSlugOrId,
        })) ?? {};
      const mergedApiKeys = mergeApiKeysWithEnv(apiKeysDoc);

      let prTitle: string | null = null;
      try {
        const { title } = await getPRTitleFromTaskDescription(
          body.taskDescription,
          mergedApiKeys,
        );
        prTitle = title;
        await convex.mutation(api.tasks.setPullRequestTitle, {
          teamSlugOrId: body.teamSlugOrId,
          id: taskId,
          pullRequestTitle: title,
        });
      } catch (error) {
        console.error("[cloud.spawnAgents] Failed to generate PR title", error);
      }

      const branchNames = await generateBranchNamesForAgents({
        taskDescription: body.taskDescription,
        prTitle,
        agentCount: agentsToSpawn.length,
        apiKeys: mergedApiKeys,
      });

      const { githubAccessToken, githubAccessTokenError } =
        await githubAccessTokenPromise;
      if (githubAccessTokenError || !githubAccessToken) {
        throw new HTTPException(401, {
          message:
            githubAccessTokenError ??
            "Unable to obtain GitHub credentials for sandbox hydration",
        });
      }

      const gitIdentityInputs = await fetchGitIdentityInputs(
        convex,
        githubAccessToken,
      );

      const morphClient = new MorphCloudClient({
        apiKey: env.MORPH_API_KEY,
      });

      const environmentEnvVars = await environmentEnvVarsPromise;

      const results = await Promise.all(
        agentsToSpawn.map((agent, index) =>
          spawnCloudAgent({
            agent,
            newBranch: branchNames[index],
            context: {
              convex,
              teamSlugOrId: body.teamSlugOrId,
              taskId,
              taskDescription: body.taskDescription,
              repoUrl: body.repoUrl,
              branch: body.branch,
              environmentId: body.environmentId
                ? typedZid("environments").parse(body.environmentId)
                : undefined,
            images: body.images,
            mergedApiKeys,
            morphClient,
              resolvedSnapshotId,
              teamUuid: team.uuid,
              userId: user.id,
              gitIdentityInputs,
              githubAccessToken,
              environmentEnvVars,
              maintenanceScript: environmentMaintenanceScript ?? null,
              devScript: environmentDevScript ?? null,
            },
          }),
        ),
      );

      return c.json(
        {
          results,
          prTitle: prTitle ?? undefined,
        },
        200,
      );
    } catch (error) {
      if (error instanceof HTTPException) {
        return c.text(error.message, error.status);
      }
      console.error("[cloud.spawnAgents] Unexpected error", error);
      return c.text("Failed to spawn cloud agents", 500);
    }
  },
);

function resolveAgents(selected?: string[]): AgentConfig[] {
  if (!selected || selected.length === 0) {
    return AGENT_CONFIGS;
  }
  return selected
    .map((name) => AGENT_CONFIGS.find((agent) => agent.name === name))
    .filter((agent): agent is AgentConfig => Boolean(agent));
}

async function generateBranchNamesForAgents({
  taskDescription,
  prTitle,
  agentCount,
  apiKeys,
}: {
  taskDescription: string;
  prTitle: string | null;
  agentCount: number;
  apiKeys: Record<string, string>;
}): Promise<string[]> {
  if (agentCount === 0) {
    return [];
  }
  if (prTitle) {
    return generateUniqueBranchNamesFromTitle(prTitle, agentCount);
  }
  const { branchNames } = await generateUniqueBranchNames(
    taskDescription,
    agentCount,
    apiKeys,
  );
  return branchNames;
}

interface SpawnContext {
  convex: ReturnType<typeof getConvex>;
  teamSlugOrId: string;
  taskId: Id<"tasks">;
  taskDescription: string;
  repoUrl?: string;
  branch?: string;
  environmentId?: Id<"environments">;
  images?: Array<{
    src: string;
    fileName?: string;
    altText: string;
  }>;
  mergedApiKeys: Record<string, string>;
  morphClient: MorphCloudClient;
  resolvedSnapshotId: string;
  teamUuid: string;
  userId: string;
  gitIdentityInputs: Awaited<ReturnType<typeof fetchGitIdentityInputs>>;
  githubAccessToken: string;
  environmentEnvVars: string | null;
  maintenanceScript: string | null;
  devScript: string | null;
}

async function spawnCloudAgent({
  agent,
  newBranch,
  context,
}: {
  agent: AgentConfig;
  newBranch: string;
  context: SpawnContext;
}) {
  const {
    convex,
    teamSlugOrId,
    taskId,
    taskDescription,
    repoUrl,
    branch,
    environmentId,
    images,
    mergedApiKeys,
    morphClient,
    resolvedSnapshotId,
    teamUuid,
    userId,
    gitIdentityInputs,
    githubAccessToken,
    environmentEnvVars,
    maintenanceScript,
    devScript,
  } = context;

  const worktreePath = "/root/workspace";
  let taskRunId: Id<"taskRuns"> | null = null;
  let taskRunJwt: string | null = null;
  let terminalId: string | null = null;
  let workerSocket: ReturnType<typeof connectToWorkerManagement> | null = null;

  try {
    const createRunResult = await convex.mutation(api.taskRuns.create, {
      teamSlugOrId,
      taskId,
      prompt: taskDescription,
      agentName: agent.name,
      newBranch,
      environmentId,
    });

    taskRunId = createRunResult.taskRunId;
    taskRunJwt = createRunResult.jwt;

    if (!taskRunId || !taskRunJwt) {
      throw new Error("Failed to establish task run context");
    }

    const taskDoc = await convex.query(api.tasks.getById, {
      teamSlugOrId,
      id: taskId,
    });

    const imageFiles = await prepareImageFiles({
      convex,
      teamSlugOrId,
      task: taskDoc,
      inlineImages: images,
    });
    const processedTaskDescription = replacePromptImageReferences({
      originalPrompt: taskDescription,
      images: imageFiles,
    });

    let envVars: Record<string, string> = {
      CMUX_PROMPT: processedTaskDescription,
      CMUX_TASK_RUN_ID: taskRunId,
      CMUX_TASK_RUN_JWT: taskRunJwt,
      PROMPT: processedTaskDescription,
    };

    if (environmentEnvVars && environmentEnvVars.trim().length > 0) {
      const parsed = parseDotenv(environmentEnvVars);
      if (Object.keys(parsed).length > 0) {
        const preserved = {
          CMUX_PROMPT: envVars.CMUX_PROMPT,
          CMUX_TASK_RUN_ID: envVars.CMUX_TASK_RUN_ID,
          PROMPT: envVars.PROMPT,
        };
        envVars = { ...envVars, ...parsed, ...preserved };
      }
    }

    let authFiles: EnvironmentResult["files"] = [];
    let startupCommands: string[] = [];

    if (agent.environment) {
      const envResult = await agent.environment({
        taskRunId,
        prompt: processedTaskDescription,
        taskRunJwt,
      });
      envVars = { ...envVars, ...envResult.env };
      authFiles = envResult.files;
      startupCommands = envResult.startupCommands || [];
    }

    if (typeof agent.applyApiKeys === "function") {
      const applied = await agent.applyApiKeys(mergedApiKeys);
      if (applied.env) envVars = { ...envVars, ...applied.env };
      if (applied.files) authFiles.push(...applied.files);
      if (applied.startupCommands) {
        startupCommands.push(...applied.startupCommands);
      }
    } else if (agent.apiKeys) {
      for (const keyConfig of agent.apiKeys) {
        const key = mergedApiKeys[keyConfig.envVar];
        if (key && key.trim()) {
          const injectName = keyConfig.mapToEnvVar || keyConfig.envVar;
          envVars[injectName] = key;
        }
      }
    }

    const processedArgs = agent.args.map((arg) =>
      arg.includes("$PROMPT") ? arg.replace(/\$PROMPT/g, "$CMUX_PROMPT") : arg,
    );
    const tmuxSessionName = sanitizeTmuxSessionName("cmux");

    const instance = await morphClient.instances.start({
      snapshotId: resolvedSnapshotId,
      ttlSeconds: 60 * 60,
      ttlAction: "pause",
      metadata: {
        app: "cmux-agent",
        teamId: teamUuid,
        agentName: agent.name,
        taskRunId,
        userId,
      },
    });
    await instance.setWakeOn(true, true);

    const exposed = instance.networking.httpServices;
    const vscodeService = exposed.find((s) => s.port === 39378);
    const workerService = exposed.find((s) => s.port === 39377);
    if (!vscodeService || !workerService) {
      await instance.stop().catch(() => {});
      throw new Error("VS Code or worker service not available");
    }

    if (environmentEnvVars && environmentEnvVars.trim().length > 0) {
      try {
        const encodedEnv = encodeEnvContentForEnvctl(environmentEnvVars);
        const loadRes = await instance.exec(envctlLoadCommand(encodedEnv));
        if (loadRes.exit_code !== 0) {
          console.error(
            "[cloud.spawnAgent] Env var bootstrap failed",
            loadRes.stderr?.slice(0, 200),
          );
        }
      } catch (error) {
        console.error(
          "[cloud.spawnAgent] Failed to apply environment env vars",
          error,
        );
      }
    }

    const [who, gh] = gitIdentityInputs;
    const { name, email } = selectGitIdentity(who, gh);
    await configureGitIdentity(instance, { name, email });
    await configureGithubAccess(instance, githubAccessToken);

    let repoConfig: HydrateRepoConfig | undefined;
    if (repoUrl) {
      const match = repoUrl.match(
        /github\.com\/?([^\s/]+)\/([^\s/.]+)(?:\.git)?/i,
      );
      if (!match) {
        throw new Error("Unsupported repo URL; expected GitHub URL");
      }
      const owner = match[1]!;
      const repoName = match[2]!;
      repoConfig = {
        owner,
        name: repoName,
        repoFull: `${owner}/${repoName}`,
        cloneUrl: `https://github.com/${owner}/${repoName}.git`,
        maskedCloneUrl: `https://github.com/${owner}/${repoName}.git`,
        depth: 1,
        baseBranch: branch || "main",
        newBranch,
      };
    }

    if (repoConfig) {
      await hydrateWorkspace({
        instance,
        repo: repoConfig,
      });
    }

    if (maintenanceScript || devScript) {
      (async () => {
        const maintenanceResult = maintenanceScript
          ? await runMaintenanceScript({
              instance,
              script: maintenanceScript,
            })
          : undefined;
        const devResult = devScript
          ? await startDevScript({
              instance,
              script: devScript,
            })
          : undefined;
        if (maintenanceResult?.error || devResult?.error) {
          await convex
            .mutation(api.taskRuns.updateEnvironmentError, {
              teamSlugOrId,
              id: taskRunId,
              maintenanceError: maintenanceResult?.error || undefined,
              devError: devResult?.error || undefined,
            })
            .catch((error) => {
              console.error(
                "[cloud.spawnAgent] Failed to record environment errors",
                error,
              );
            });
        }
      })().catch((error) => {
        console.error(
          "[cloud.spawnAgent] Background environment script failed",
          error,
        );
      });
    }

    workerSocket = await connectWorker(workerService.url);

    const branchSwitched = await runSwitchBranchScript({
      workerSocket,
      newBranch,
    });
    if (!branchSwitched) {
      throw new Error("Branch switch failed inside sandbox");
    }

    if (imageFiles.length > 0) {
      await ensurePromptDirectory(workerSocket, taskRunId);
      await uploadPromptImages(workerService.url, imageFiles);
    }

    const terminalCreationCommand = createTerminalCommand({
      agent,
      tmuxSessionName,
      envVars,
      startupCommands,
      taskRunId,
      taskRunJwt,
      processedTaskDescription,
      authFiles,
      commandArgs: processedArgs,
    });

    await sendCreateTerminal(workerSocket, terminalCreationCommand);
    workerSocket.disconnect();

    terminalId = taskRunId;

    await updateTaskRunMetadata({
      convex,
      teamSlugOrId,
      taskRunId,
      worktreePath,
      vscodeInfo: {
        provider: "morph",
        containerName: instance.id,
        status: "running",
        url: vscodeService.url,
        workspaceUrl: appendWorkspacePath(vscodeService.url),
        workerUrl: workerService.url,
      },
    });

    return {
      agentName: agent.name,
      taskRunId,
      terminalId: taskRunId,
      vscodeUrl: appendWorkspacePath(vscodeService.url),
      workerUrl: workerService.url,
      success: true as const,
    };
  } catch (error) {
    console.error("[cloud.spawnAgent] Error spawning agent", error);
    if (workerSocket) {
      try {
        workerSocket.disconnect();
      } catch (disconnectError) {
        console.error(
          "[cloud.spawnAgent] Failed to disconnect worker socket",
          disconnectError,
        );
      }
    }
    if (taskRunId) {
      await convex
        .mutation(api.taskRuns.fail, {
          teamSlugOrId,
          id: taskRunId,
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
          exitCode: 1,
        })
        .catch((mutationError) => {
          console.error(
            "[cloud.spawnAgent] Failed to mark task run as failed",
            mutationError,
          );
        });
    }
    return {
      agentName: agent.name,
      taskRunId: taskRunId ?? "",
      terminalId: terminalId ?? "",
      vscodeUrl: undefined,
      workerUrl: undefined,
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function sanitizeTmuxSessionName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

async function prepareImageFiles({
  convex,
  teamSlugOrId,
  task,
  inlineImages,
}: {
  convex: ReturnType<typeof getConvex>;
  teamSlugOrId: string;
  task: Doc<"tasks"> | null | undefined;
  inlineImages?: Array<{
    src: string;
    fileName?: string;
    altText: string;
  }>;
}): Promise<Array<{ path: string; base64: string; fileName: string }>> {
  const result: Array<{ path: string; base64: string; fileName: string }> = [];

  if (inlineImages && inlineImages.length > 0) {
    inlineImages.forEach((image, index) => {
      const sanitized =
        image.fileName?.replace(/[^\x20-\x7E]/g, "_").replace(/\s+/g, "_") ??
        `image_${index + 1}.png`;
      const base64 =
        image.src.includes(",") && image.src.startsWith("data:")
          ? image.src.split(",")[1] ?? ""
          : image.src;
      result.push({
        path: `/root/prompt/${sanitized}`,
        base64,
        fileName: sanitized,
      });
    });
  }

  if (task && task.images && task.images.length > 0) {
    const imageUrls = await convex.query(api.storage.getUrls, {
      teamSlugOrId,
      storageIds: task.images.map((image) => image.storageId),
    });
    const downloaded = await Promise.all(
      task.images.map(async (taskImage, index) => {
        const imageUrl = imageUrls.find(
          (url) => url.storageId === taskImage.storageId,
        );
        if (!imageUrl) {
          return null;
        }
        const response = await fetch(imageUrl.url);
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        const sanitized =
          taskImage.fileName?.replace(/[^\x20-\x7E]/g, "_").replace(/\s+/g, "_") ??
          `stored_image_${index + 1}.png`;
        return {
          path: `/root/prompt/${sanitized}`,
          base64,
          fileName: sanitized,
        };
      }),
    );
    downloaded
      .filter((img): img is { path: string; base64: string; fileName: string } => Boolean(img))
      .forEach((img) => result.push(img));
  }

  return result;
}

function replacePromptImageReferences({
  originalPrompt,
  images,
}: {
  originalPrompt: string;
  images: Array<{ path: string; base64: string; fileName: string }>;
}): string {
  let processed = originalPrompt;

  for (const image of images) {
    if (!image.fileName) continue;
    const escaped = image.fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    processed = processed.replace(new RegExp(escaped, "g"), image.path);

    const baseName = image.fileName.replace(/\.[^/.]+$/, "");
    if (processed.includes(baseName)) {
      const escapedBase = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      processed = processed.replace(new RegExp(escapedBase, "g"), image.path);
    }
  }

  return processed;
}

async function connectWorker(workerUrl: string) {
  const socket = connectToWorkerManagement({
    url: workerUrl,
    timeoutMs: 30_000,
    reconnectionAttempts: 3,
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timeout connecting to worker"));
    }, 30_000);

    socket.once("connect", () => {
      clearTimeout(timeout);
      resolve();
    });

    socket.once("connect_error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  return socket;
}

async function runSwitchBranchScript({
  workerSocket,
  newBranch,
}: {
  workerSocket: ReturnType<typeof connectToWorkerManagement>;
  newBranch: string;
}) {
  const scriptPath = `/tmp/cmux-switch-branch-${Date.now()}.ts`;
  const command = `
set -eu
cat <<'CMUX_SWITCH_BRANCH_EOF' > ${scriptPath}
${SWITCH_BRANCH_BUN_SCRIPT}
CMUX_SWITCH_BRANCH_EOF
bun run ${scriptPath}
EXIT_CODE=$?
rm -f ${scriptPath}
exit $EXIT_CODE
`;

  const { exitCode } = await workerExec({
    workerSocket,
    command: "bash",
    args: ["-lc", command],
    cwd: "/root/workspace",
    env: {
      CMUX_BRANCH_NAME: newBranch,
    },
    timeout: 60_000,
  });
  return exitCode === 0;
}

async function ensurePromptDirectory(
  workerSocket: ReturnType<typeof connectToWorkerManagement>,
  taskRunId: string,
) {
  await new Promise<void>((resolve) => {
    workerSocket.emit(
      "worker:exec",
      {
        command: "bash",
        args: [
          "-lc",
          `mkdir -p /root/prompt && chmod 777 /root/prompt && echo "Prompt dir ready for ${taskRunId}"`,
        ],
        cwd: "/root/workspace",
        env: {},
      },
      () => resolve(),
    );
  });
}

async function uploadPromptImages(
  workerUrl: string,
  imageFiles: Array<{ path: string; base64: string }>,
) {
  const base = new URL(workerUrl);
  for (const image of imageFiles) {
    const uploadUrl = new URL("/upload-image", base);
    const buffer = Buffer.from(image.base64, "base64");
    const formData = new FormData();
    formData.append(
      "image",
      new Blob([buffer], { type: "image/png" }),
      image.path.split("/").pop() ?? "image.png",
    );
    formData.append("path", image.path);
    const response = await fetch(uploadUrl, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload image: ${errorText}`);
    }
  }
}

function createTerminalCommand({
  agent,
  tmuxSessionName,
  envVars,
  startupCommands,
  taskRunId,
  taskRunJwt,
  processedTaskDescription,
  authFiles,
  commandArgs,
}: {
  agent: AgentConfig;
  tmuxSessionName: string;
  envVars: Record<string, string>;
  startupCommands: string[];
  taskRunId: Id<"taskRuns">;
  taskRunJwt: string;
  processedTaskDescription: string;
  authFiles: EnvironmentResult["files"];
  commandArgs: string[];
}) {
  const actualCommand = agent.command;
  const actualArgs = commandArgs.map((arg) =>
    arg === "$CMUX_PROMPT" ? processedTaskDescription : arg,
  );

  const shellEscaped = (value: string) => {
    if (value.includes("$CMUX_")) {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return `'${value.replace(/'/g, "'\\''")}'`;
  };

  const commandString = [actualCommand, ...commandArgs]
    .map(shellEscaped)
    .join(" ");

  const tmuxArgs = agent.name.toLowerCase().includes("codex")
    ? [
        "new-session",
        "-d",
        "-s",
        tmuxSessionName,
        "-c",
        "/root/workspace",
        actualCommand,
        ...actualArgs,
      ]
    : [
        "new-session",
        "-d",
        "-s",
        tmuxSessionName,
        "bash",
        "-lc",
        `exec ${commandString}`,
      ];

  return {
    terminalId: tmuxSessionName,
    command: "tmux",
    args: tmuxArgs,
    cols: 80,
    rows: 74,
    env: envVars,
    taskRunContext: {
      taskRunToken: taskRunJwt,
      prompt: processedTaskDescription,
      convexUrl: env.NEXT_PUBLIC_CONVEX_URL,
    },
    taskRunId,
    agentModel: agent.name,
    authFiles,
    startupCommands,
    cwd: "/root/workspace",
  };
}

async function sendCreateTerminal(
  workerSocket: ReturnType<typeof connectToWorkerManagement>,
  payload: ReturnType<typeof createTerminalCommand>,
) {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timeout waiting for terminal creation"));
    }, 30_000);

    workerSocket.emit("worker:create-terminal", payload, (result) => {
      clearTimeout(timeout);
      if (result?.error) {
        reject(
          result.error instanceof Error
            ? result.error
            : new Error(String(result.error)),
        );
        return;
      }
      resolve();
    });
  });
}

function appendWorkspacePath(vscodeUrl: string): string {
  try {
    const url = new URL(vscodeUrl);
    url.searchParams.set("folder", "/root/workspace");
    return url.toString();
  } catch {
    return vscodeUrl;
  }
}

async function updateTaskRunMetadata({
  convex,
  teamSlugOrId,
  taskRunId,
  worktreePath,
  vscodeInfo,
}: {
  convex: ReturnType<typeof getConvex>;
  teamSlugOrId: string;
  taskRunId: Id<"taskRuns">;
  worktreePath: string;
  vscodeInfo: {
    provider: "morph";
    containerName: string;
    status: "running";
    url: string;
    workspaceUrl: string;
    workerUrl: string;
  };
}) {
  await retryOnOptimisticConcurrency(() =>
    convex.mutation(api.taskRuns.updateWorktreePath, {
      teamSlugOrId,
      id: taskRunId,
      worktreePath,
    }),
  );

  await retryOnOptimisticConcurrency(() =>
    convex.mutation(api.taskRuns.updateVSCodeInstance, {
      teamSlugOrId,
      id: taskRunId,
      vscode: {
        provider: vscodeInfo.provider,
        containerName: vscodeInfo.containerName,
        status: vscodeInfo.status,
        url: vscodeInfo.url,
        workspaceUrl: vscodeInfo.workspaceUrl,
        startedAt: Date.now(),
        ports: {
          vscode: "39378",
          worker: "39377",
        },
      },
    }),
  );
}
