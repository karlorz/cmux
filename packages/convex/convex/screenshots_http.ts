import {
  RunScreenshotsRequestSchema,
  ScreenshotUploadPayloadSchema,
  ScreenshotUploadUrlRequestSchema,
} from "@cmux/shared/convex-safe";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import { getWorkerAuth } from "./users/utils/getWorkerAuth";

const JSON_HEADERS = {
  "Content-Type": "application/json",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function ensureJsonRequest(
  req: Request
): Promise<{ json: unknown } | Response> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonResponse(
      { code: 415, message: "Content-Type must be application/json" },
      415
    );
  }

  try {
    const json = await req.json();
    return { json };
  } catch {
    return jsonResponse({ code: 400, message: "Invalid JSON body" }, 400);
  }
}

export const uploadScreenshot = httpAction(async (ctx, req) => {
  const auth = await getWorkerAuth(req, { loggerPrefix: "[screenshots]" });
  if (!auth) {
    throw jsonResponse({ code: 401, message: "Unauthorized" }, 401);
  }

  const parsed = await ensureJsonRequest(req);
  if (parsed instanceof Response) return parsed;

  const validation = ScreenshotUploadPayloadSchema.safeParse(parsed.json);
  if (!validation.success) {
    console.warn(
      "[screenshots] Invalid screenshot upload payload",
      validation.error
    );
    return jsonResponse({ code: 400, message: "Invalid input" }, 400);
  }

  const payload = validation.data;

  const run = await ctx.runQuery(internal.taskRuns.getById, {
    id: payload.runId,
  });
  if (!run) {
    return jsonResponse({ code: 404, message: "Task run not found" }, 404);
  }

  if (
    run.teamId !== auth.payload.teamId ||
    run.userId !== auth.payload.userId ||
    run.taskId !== payload.taskId
  ) {
    return jsonResponse({ code: 401, message: "Unauthorized" }, 401);
  }

  const task = await ctx.runQuery(internal.tasks.getByIdInternal, {
    id: run.taskId,
  });
  if (!task) {
    return jsonResponse({ code: 404, message: "Task not found" }, 404);
  }

  const storedScreens = (payload.images ?? []).map((image) => ({
    storageId: image.storageId as Id<"_storage">,
    mimeType: image.mimeType,
    fileName: image.fileName,
    commitSha: image.commitSha,
  }));

  if (payload.status === "completed") {
    if (!payload.images || payload.images.length === 0) {
      return jsonResponse(
        { code: 400, message: "At least one screenshot image is required" },
        400
      );
    }
  }

  const screenshotSetId = await ctx.runMutation(
    internal.tasks.recordScreenshotResult,
    {
      taskId: run.taskId,
      runId: payload.runId,
      status: payload.status,
      screenshots: storedScreens,
      error: payload.error,
    }
  );

  const resolvedScreenshotSetId =
    screenshotSetId === null ? undefined : screenshotSetId;

  const primaryScreenshot = storedScreens[0];

  if (primaryScreenshot) {
    await ctx.runMutation(internal.taskRuns.updateScreenshotMetadata, {
      id: payload.runId,
      storageId: primaryScreenshot.storageId,
      mimeType: primaryScreenshot.mimeType,
      fileName: primaryScreenshot.fileName,
      commitSha: primaryScreenshot.commitSha,
      screenshotSetId: resolvedScreenshotSetId,
    });
  } else if (payload.status !== "completed") {
    await ctx.runMutation(internal.taskRuns.clearScreenshotMetadata, {
      id: payload.runId,
    });
  }

  return jsonResponse({
    ok: true,
    storageIds: storedScreens.map((shot) => shot.storageId),
    screenshotSetId: resolvedScreenshotSetId,
  });
});

export const createScreenshotUploadUrl = httpAction(async (ctx, req) => {
  const auth = await getWorkerAuth(req, { loggerPrefix: "[screenshots]" });
  if (!auth) {
    throw jsonResponse({ code: 401, message: "Unauthorized" }, 401);
  }

  const parsed = await ensureJsonRequest(req);
  if (parsed instanceof Response) return parsed;

  const validation = ScreenshotUploadUrlRequestSchema.safeParse(parsed.json);
  if (!validation.success) {
    console.warn(
      "[screenshots] Invalid upload URL request payload",
      validation.error
    );
    return jsonResponse({ code: 400, message: "Invalid input" }, 400);
  }

  const uploadUrl = await ctx.storage.generateUploadUrl();
  return jsonResponse({ ok: true, uploadUrl });
});

export const getRunScreenshots = httpAction(async (ctx, req) => {
  const auth = await getWorkerAuth(req, { loggerPrefix: "[screenshots]" });
  if (!auth) {
    throw jsonResponse({ code: 401, message: "Unauthorized" }, 401);
  }

  const parsed = await ensureJsonRequest(req);
  if (parsed instanceof Response) return parsed;

  const validation = RunScreenshotsRequestSchema.safeParse(parsed.json);
  if (!validation.success) {
    console.warn(
      "[screenshots] Invalid run screenshot request payload",
      validation.error
    );
    return jsonResponse({ code: 400, message: "Invalid input" }, 400);
  }

  const data = validation.data;
  const normalizedLimit = Math.max(1, Math.min(20, data.limit ?? 4));

  const run = await ctx.runQuery(internal.taskRuns.getById, {
    id: data.runId,
  });
  if (!run) {
    return jsonResponse({ code: 404, message: "Task run not found" }, 404);
  }

  if (
    run.teamId !== auth.payload.teamId ||
    run.userId !== auth.payload.userId ||
    run.taskId !== data.taskId
  ) {
    return jsonResponse({ code: 401, message: "Unauthorized" }, 401);
  }

  const rawSets = await ctx.db
    .query("taskRunScreenshotSets")
    .withIndex("by_run_capturedAt", (q) => q.eq("runId", data.runId))
    .order("desc")
    .take(20);

  const filteredSets = data.statusFilter
    ? rawSets.filter((set) => data.statusFilter?.includes(set.status))
    : rawSets;
  const limitedSets = filteredSets.slice(0, normalizedLimit);

  const screenshotSets = await Promise.all(
    limitedSets.map(async (set) => {
      const images = await Promise.all(
        set.images.map(async (image) => {
          const url = await ctx.storage.getUrl(image.storageId);
          return {
            storageId: image.storageId,
            mimeType: image.mimeType,
            fileName: image.fileName,
            commitSha: image.commitSha,
            url: url ?? null,
          };
        })
      );
      return {
        id: set._id,
        status: set.status,
        commitSha: set.commitSha ?? undefined,
        capturedAt: set.capturedAt,
        error: set.error ?? undefined,
        images,
      };
    })
  );

  return jsonResponse({
    ok: true,
    screenshotSets,
  });
});
