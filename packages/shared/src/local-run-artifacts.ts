import { z } from "zod";

export const LocalRunArtifactEventSchema = z.object({
  timestamp: z.string(),
  type: z.string(),
  message: z.string(),
});
export type LocalRunArtifactEvent = z.infer<typeof LocalRunArtifactEventSchema>;

export const LocalRunArtifactArtifactsSchema = z.object({
  result: z.string().optional(),
  error: z.string().optional(),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
  events: z.array(LocalRunArtifactEventSchema).optional(),
});
export type LocalRunArtifactArtifacts = z.infer<typeof LocalRunArtifactArtifactsSchema>;

export const LocalRunArtifactMetadataSchema = z.object({
  timeout: z.string().optional(),
  durationMs: z.number().optional(),
  selectedVariant: z.string().optional(),
  model: z.string().optional(),
  gitBranch: z.string().optional(),
  gitCommit: z.string().optional(),
  devshVersion: z.string().optional(),
  sessionId: z.string().optional(),
  threadId: z.string().optional(),
  codexHome: z.string().optional(),
  injectionMode: z.string().optional(),
  lastInjectionAt: z.string().optional(),
  injectionCount: z.number().optional(),
  checkpointRef: z.string().optional(),
  checkpointGeneration: z.number().optional(),
  checkpointLabel: z.string().optional(),
  checkpointCreatedAt: z.number().optional(),
});
export type LocalRunArtifactMetadata = z.infer<typeof LocalRunArtifactMetadataSchema>;

export const LocalRunArtifactMetadataPrioritySchema = z.enum([
  "primary",
  "secondary",
]);
export type LocalRunArtifactMetadataPriority = z.infer<
  typeof LocalRunArtifactMetadataPrioritySchema
>;

export const LocalRunArtifactMetadataSectionSchema = z.enum([
  "git",
  "runtime",
  "continuation",
  "bridge",
]);
export type LocalRunArtifactMetadataSection = z.infer<
  typeof LocalRunArtifactMetadataSectionSchema
>;

export const LocalRunArtifactMetadataItemSchema = z.object({
  label: z.string(),
  value: z.string(),
  monospace: z.boolean().optional(),
  priority: LocalRunArtifactMetadataPrioritySchema,
  section: LocalRunArtifactMetadataSectionSchema.optional(),
});
export type LocalRunArtifactMetadataItem = z.infer<
  typeof LocalRunArtifactMetadataItemSchema
>;

export const LocalRunArtifactMetadataGroupSchema = z.object({
  key: LocalRunArtifactMetadataSectionSchema,
  label: z.string(),
  items: z.array(LocalRunArtifactMetadataItemSchema),
});
export type LocalRunArtifactMetadataGroup = z.infer<
  typeof LocalRunArtifactMetadataGroupSchema
>;

export const LocalRunArtifactStreamTabSchema = z.enum(["stdout", "stderr"]);
export type LocalRunArtifactStreamTab = z.infer<
  typeof LocalRunArtifactStreamTabSchema
>;

export const LocalRunArtifactFeedEntrySchema = z.object({
  _id: z.string(),
  type: z.string(),
  summary: z.string(),
  toolName: z.string().optional(),
  detail: z.string().optional(),
  durationMs: z.number().optional(),
  createdAt: z.number(),
});
export type LocalRunArtifactFeedEntry = z.infer<
  typeof LocalRunArtifactFeedEntrySchema
>;

export const LocalRunArtifactEventsSchema = z.object({
  countLabel: z.string(),
  feedEntries: z.array(LocalRunArtifactFeedEntrySchema),
  rawEvents: z.array(LocalRunArtifactEventSchema),
  showRawEvents: z.boolean(),
});
export type LocalRunArtifactEvents = z.infer<
  typeof LocalRunArtifactEventsSchema
>;

export const LocalRunArtifactSnapshotsSchema = z.object({
  availableTabs: z.array(LocalRunArtifactStreamTabSchema).min(1),
  preferredTab: LocalRunArtifactStreamTabSchema,
  stdout: z.string().optional(),
  stderr: z.string().optional(),
});
export type LocalRunArtifactSnapshots = z.infer<
  typeof LocalRunArtifactSnapshotsSchema
>;

export const LocalRunArtifactDisplaySchema = z.object({
  result: z.string().optional(),
  error: z.string().optional(),
  summaryItems: z.array(LocalRunArtifactMetadataItemSchema),
  diagnosticGroups: z.array(LocalRunArtifactMetadataGroupSchema),
  events: LocalRunArtifactEventsSchema,
  snapshots: LocalRunArtifactSnapshotsSchema,
});
export type LocalRunArtifactDisplay = z.infer<
  typeof LocalRunArtifactDisplaySchema
>;
