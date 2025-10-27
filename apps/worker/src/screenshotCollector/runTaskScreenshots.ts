import type { ScreenshotUploadPayload } from "@cmux/shared";
import type { Id } from "@cmux/convex/dataModel";
import { promises as fs } from "node:fs";
import * as path from "node:path";

import { log } from "../logger";
import { startScreenshotCollection } from "./startScreenshotCollection";
import { uploadScreenshot } from "./upload";

export interface RunTaskScreenshotsOptions {
  taskId: Id<"tasks">;
  taskRunId: Id<"taskRuns">;
  token: string;
  convexUrl?: string;
  openAiApiKey?: string | null;
  anthropicApiKey?: string | null;
  anthropicBaseUrl?: string | null;
  customHeaderSource?: string | null;
  taskRunJwt?: string;
}

function parseCustomHeaders(
  raw: string | null | undefined,
  fallbackJwt?: string,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (raw) {
    const entries = raw
      .split(/[;\n,]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    for (const entry of entries) {
      const separatorIndex = entry.indexOf(":");
      if (separatorIndex === -1) continue;
      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      if (key && value) {
        headers[key.toLowerCase()] = value;
      }
    }
  }

  if (fallbackJwt && !headers["x-cmux-token"]) {
    headers["x-cmux-token"] = fallbackJwt;
  }

  return headers;
}

export async function runTaskScreenshots(
  options: RunTaskScreenshotsOptions,
): Promise<void> {
  const {
    taskId,
    taskRunId,
    token,
    convexUrl,
    openAiApiKey,
    anthropicApiKey,
    anthropicBaseUrl,
    customHeaderSource,
    taskRunJwt,
  } = options;

  const headers = parseCustomHeaders(customHeaderSource, taskRunJwt);

  log("INFO", "Starting automated screenshot workflow", {
    taskId,
    taskRunId,
    anthropicBaseUrl,
    hasOpenAiKey: Boolean(openAiApiKey),
    hasAnthropicKey: Boolean(anthropicApiKey),
  });

  const result = await startScreenshotCollection({
    openAiApiKey: openAiApiKey ?? undefined,
    anthropicApiKey: anthropicApiKey ?? undefined,
    anthropicBaseUrl: anthropicBaseUrl ?? undefined,
    anthropicHeaders: headers,
  });

  let imagePayload: ScreenshotUploadPayload["image"] | undefined;
  let status: ScreenshotUploadPayload["status"];
  let error: string | undefined;

  if (result.status === "completed" && result.screenshotPath) {
    try {
      const fileBuffer = await fs.readFile(result.screenshotPath);
      const fileName = path.basename(result.screenshotPath);
      imagePayload = {
        contentType: "image/png",
        data: fileBuffer.toString("base64"),
        fileName,
      };
      status = "completed";
      log("INFO", "Screenshot captured", {
        taskRunId,
        screenshotPath: result.screenshotPath,
        fileName,
      });
    } catch (readError) {
      status = "failed";
      error =
        readError instanceof Error ? readError.message : String(readError);
      log("ERROR", "Failed to read screenshot file", { taskRunId, error });
    }
  } else if (result.status === "skipped") {
    status = "skipped";
    error = result.reason;
    log("INFO", "Screenshot workflow skipped", {
      taskRunId,
      reason: result.reason,
    });
  } else if (result.status === "failed") {
    status = "failed";
    error = result.error;
    log("ERROR", "Screenshot workflow failed", {
      taskRunId,
      error: result.error,
    });
  } else {
    status = "failed";
    error = "Unknown screenshot workflow result";
    log("ERROR", "Screenshot workflow returned unknown status", {
      taskRunId,
      result,
    });
  }

  await uploadScreenshot({
    token,
    baseUrlOverride: convexUrl,
    payload: {
      taskId,
      runId: taskRunId,
      status,
      image: imagePayload,
      error,
    },
  });
}
