import { z } from "@hono/zod-openapi";

export const PreviewTestImageSchema = z.object({
  storageId: z.string(),
  mimeType: z.string(),
  fileName: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
});

export const PreviewTestVideoSchema = z.object({
  storageId: z.string(),
  mimeType: z.string(),
  fileName: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
});

export const PreviewTestScreenshotSetSchema = z.object({
  _id: z.string(),
  status: z.enum(["completed", "failed", "skipped"]),
  hasUiChanges: z.boolean().optional().nullable(),
  capturedAt: z.number(),
  error: z.string().optional().nullable(),
  images: z.array(PreviewTestImageSchema),
  videos: z.array(PreviewTestVideoSchema).optional().nullable(),
});

export const PreviewTestRunSchema = z.object({
  _id: z.string(),
  prNumber: z.number(),
  prUrl: z.string(),
  prTitle: z.string().optional().nullable(),
  repoFullName: z.string(),
  headSha: z.string(),
  status: z.enum(["pending", "running", "completed", "failed", "skipped"]),
  stateReason: z.string().optional().nullable(),
  taskId: z.string().optional().nullable(),
  taskRunId: z.string().optional().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  dispatchedAt: z.number().optional().nullable(),
  startedAt: z.number().optional().nullable(),
  completedAt: z.number().optional().nullable(),
  configRepoFullName: z.string().optional().nullable(),
  screenshotSet: PreviewTestScreenshotSetSchema.optional().nullable(),
});

export const PreviewTestRunDetailSchema = PreviewTestRunSchema.extend({
  prDescription: z.string().optional().nullable(),
  baseSha: z.string().optional().nullable(),
  headRef: z.string().optional().nullable(),
  taskId: z.string().optional().nullable(),
  environmentId: z.string().optional().nullable(),
});
