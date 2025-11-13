import { z } from "zod";
import { typedZid } from "../utils/typed-zid";

export const ScreenshotCollectionStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
]);
export type ScreenshotCollectionStatus = z.infer<
  typeof ScreenshotCollectionStatusSchema
>;

export const ScreenshotStoredImageSchema = z.object({
  storageId: z.string(),
  mimeType: z.string(),
  fileName: z.string().optional(),
  commitSha: z.string(),
});
export type ScreenshotStoredImage = z.infer<
  typeof ScreenshotStoredImageSchema
>;

export const ScreenshotUploadPayloadSchema = z.object({
  taskId: typedZid("tasks"),
  runId: typedZid("taskRuns"),
  status: z.enum(["completed", "failed", "skipped"]),
  images: z.array(ScreenshotStoredImageSchema).optional(),
  error: z.string().optional(),
});
export type ScreenshotUploadPayload = z.infer<
  typeof ScreenshotUploadPayloadSchema
>;

export const ScreenshotUploadResponseSchema = z.object({
  ok: z.literal(true),
  storageIds: z.array(z.string()).optional(),
  screenshotSetId: typedZid("taskRunScreenshotSets").optional(),
});
export type ScreenshotUploadResponse = z.infer<
  typeof ScreenshotUploadResponseSchema
>;

export const ScreenshotUploadUrlRequestSchema = z.object({
  contentType: z.string(),
});
export type ScreenshotUploadUrlRequest = z.infer<
  typeof ScreenshotUploadUrlRequestSchema
>;

export const ScreenshotUploadUrlResponseSchema = z.object({
  ok: z.literal(true),
  uploadUrl: z.string(),
});
export type ScreenshotUploadUrlResponse = z.infer<
  typeof ScreenshotUploadUrlResponseSchema
>;

export const RunScreenshotImageSchema = ScreenshotStoredImageSchema.extend({
  url: z.string().nullable(),
});
export type RunScreenshotImage = z.infer<typeof RunScreenshotImageSchema>;

export const RunScreenshotSetSchema = z.object({
  id: typedZid("taskRunScreenshotSets"),
  status: z.enum(["completed", "failed", "skipped"]),
  commitSha: z.string().optional(),
  capturedAt: z.number(),
  error: z.string().optional(),
  images: z.array(RunScreenshotImageSchema),
});
export type RunScreenshotSet = z.infer<typeof RunScreenshotSetSchema>;

export const RunScreenshotsRequestSchema = z.object({
  taskId: typedZid("tasks"),
  runId: typedZid("taskRuns"),
  limit: z.number().int().min(1).max(20).optional(),
  statusFilter: z
    .array(z.enum(["completed", "failed", "skipped"]))
    .optional(),
});
export type RunScreenshotsRequest = z.infer<
  typeof RunScreenshotsRequestSchema
>;

export const RunScreenshotsResponseSchema = z.object({
  ok: z.literal(true),
  screenshotSets: z.array(RunScreenshotSetSchema),
});
export type RunScreenshotsResponse = z.infer<
  typeof RunScreenshotsResponseSchema
>;
