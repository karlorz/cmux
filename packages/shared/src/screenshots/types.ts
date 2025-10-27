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

export const ScreenshotUploadPayloadSchema = z.object({
  taskId: typedZid("tasks"),
  runId: typedZid("taskRuns"),
  status: z.enum(["completed", "failed", "skipped"]),
  image: z
    .object({
      contentType: z.string(),
      data: z
        .string()
        .regex(/^[A-Za-z0-9+/=]+$/, "Invalid base64 image payload"),
      fileName: z.string().optional(),
    })
    .optional(),
  error: z.string().optional(),
});
export type ScreenshotUploadPayload = z.infer<
  typeof ScreenshotUploadPayloadSchema
>;

export const ScreenshotUploadResponseSchema = z.object({
  ok: z.literal(true),
  storageId: z.string().optional(),
});
export type ScreenshotUploadResponse = z.infer<
  typeof ScreenshotUploadResponseSchema
>;
