import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { z } from "zod";

const heartbeatWorkspaceSchema = z.object({
  workspaceId: z.string(),
  taskId: z.string().optional(),
  taskRunId: z.string().optional(),
  title: z.string(),
  preview: z.string().optional(),
  phase: z.string(),
  tmuxSessionName: z.string(),
  lastActivityAt: z.number(),
  latestEventSeq: z.number(),
  lastEventAt: z.number().optional(),
});

const heartbeatBodySchema = z.object({
  teamId: z.string(),
  userId: z.string(),
  machineId: z.string(),
  displayName: z.string(),
  tailscaleHostname: z.string().optional(),
  tailscaleIPs: z.array(z.string()),
  status: z.enum(["online", "offline", "unknown"]),
  lastSeenAt: z.number(),
  lastWorkspaceSyncAt: z.number().optional(),
  workspaces: z.array(heartbeatWorkspaceSchema),
});

export const ingestHeartbeat = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody: unknown = await request.json();
  const parseResult = heartbeatBodySchema.safeParse(rawBody);
  if (!parseResult.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request body", details: parseResult.error.issues }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const body = parseResult.data;

  await ctx.runMutation(internal.mobileMachines.upsertHeartbeatInternal, {
    teamId: body.teamId,
    userId: body.userId,
    machineId: body.machineId,
    displayName: body.displayName,
    tailscaleHostname: body.tailscaleHostname,
    tailscaleIPs: body.tailscaleIPs,
    status: body.status,
    lastSeenAt: body.lastSeenAt,
    lastWorkspaceSyncAt: body.lastWorkspaceSyncAt,
  });

  await ctx.runMutation(
    internal.mobileWorkspaces.replaceMachineWorkspaceSnapshotInternal,
    {
      teamId: body.teamId,
      userId: body.userId,
      machineId: body.machineId,
      workspaces: body.workspaces,
    },
  );

  return new Response(JSON.stringify({ accepted: true }), {
    status: 202,
    headers: { "content-type": "application/json" },
  });
});
