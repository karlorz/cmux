import { z } from "@hono/zod-openapi";

export const FileDiffSchema = z.object({
  filePath: z.string(),
  diffText: z.string(),
});
