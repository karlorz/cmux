import { SNAPSHOT_PROVIDERS } from "@cmux/shared/provider-types";
import { z } from "@hono/zod-openapi";

export const GetEnvironmentResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    snapshotId: z.string(),
    snapshotProvider: z.enum(SNAPSHOT_PROVIDERS),
    templateVmid: z.number().optional(),
    dataVaultKey: z.string(),
    selectedRepos: z.array(z.string()).optional(),
    description: z.string().optional(),
    maintenanceScript: z.string().optional(),
    devScript: z.string().optional(),
    exposedPorts: z.array(z.number()).optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .openapi("GetEnvironmentResponse");

export const ListEnvironmentsResponseSchema = z
  .array(GetEnvironmentResponseSchema)
  .openapi("ListEnvironmentsResponse");

export const UpdateEnvironmentBodySchema = z
  .object({
    teamSlugOrId: z.string(),
    name: z.string().trim().min(1).optional(),
    description: z.string().optional(),
    maintenanceScript: z.string().optional(),
    devScript: z.string().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.maintenanceScript !== undefined ||
      value.devScript !== undefined,
    "At least one field must be provided",
  )
  .openapi("UpdateEnvironmentBody");
