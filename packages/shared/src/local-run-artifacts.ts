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
export type LocalRunArtifactArtifacts = z.infer<
  typeof LocalRunArtifactArtifactsSchema
>;

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
export type LocalRunArtifactMetadata = z.infer<
  typeof LocalRunArtifactMetadataSchema
>;

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

export const LocalRunArtifactCardSchema = z.object({
  result: z.string().optional(),
  error: z.string().optional(),
  summaryItems: z.array(LocalRunArtifactMetadataItemSchema),
  diagnosticGroups: z.array(LocalRunArtifactMetadataGroupSchema),
});
export type LocalRunArtifactCard = z.infer<typeof LocalRunArtifactCardSchema>;

export const LocalRunArtifactDisplaySchema = LocalRunArtifactCardSchema.extend({
  events: LocalRunArtifactEventsSchema,
  snapshots: LocalRunArtifactSnapshotsSchema,
});
export type LocalRunArtifactDisplay = z.infer<
  typeof LocalRunArtifactDisplaySchema
>;

export type LocalRunArtifactCardInput = LocalRunArtifactMetadata &
  LocalRunArtifactArtifacts & {
    workspace?: string;
    runDir?: string;
    agent?: string;
    prompt?: string;
    completedAt?: string;
    bridgedTaskId?: string;
    bridgedTaskRunId?: string;
  };

type LocalRunArtifactCardInputItem = {
  label: string;
  value?: string | null;
  monospace?: boolean;
  priority: LocalRunArtifactMetadataPriority;
  section?: LocalRunArtifactMetadataSection;
};

function hasValue(
  item: LocalRunArtifactCardInputItem,
): item is LocalRunArtifactMetadataItem {
  return typeof item.value === "string";
}

function createDiagnosticGroup(
  key: LocalRunArtifactMetadataSection,
  label: string,
  items: LocalRunArtifactMetadataItem[],
): LocalRunArtifactMetadataGroup {
  return { key, label, items };
}

export function formatLocalRunTimestamp(timestamp?: string) {
  if (!timestamp) {
    return null;
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatLocalEventCount(events?: LocalRunArtifactEvent[]) {
  const count = events?.length ?? 0;
  return count === 1 ? "1 event" : `${count} events`;
}

function formatLocalCheckpointCreatedAt(epochMs?: number) {
  if (typeof epochMs !== "number") {
    return undefined;
  }

  return formatLocalRunTimestamp(new Date(epochMs).toISOString()) ?? undefined;
}

export function buildLocalRunArtifactCard(
  input: LocalRunArtifactCardInput,
): LocalRunArtifactCard {
  const summaryItems = [
    { label: "Workspace", value: input.workspace, priority: "primary" },
    { label: "Run directory", value: input.runDir, priority: "primary" },
    { label: "Agent", value: input.agent, priority: "primary" },
    { label: "Model", value: input.model, priority: "primary" },
    {
      label: "Prompt",
      value: input.prompt,
      monospace: false,
      priority: "primary",
    },
    {
      label: "Checkpoint",
      value: input.checkpointLabel ?? input.checkpointRef,
      monospace: false,
      priority: "primary",
    },
    {
      label: "Completed",
      value: formatLocalRunTimestamp(input.completedAt) ?? input.completedAt,
      monospace: false,
      priority: "primary",
    },
    {
      label: "Event count",
      value: formatLocalEventCount(input.events),
      monospace: false,
      priority: "primary",
    },
    { label: "Variant", value: input.selectedVariant, priority: "primary" },
    { label: "Git branch", value: input.gitBranch, priority: "primary" },
  ].filter(hasValue);

  const diagnosticItems = [
    {
      label: "Git commit",
      value: input.gitCommit,
      priority: "secondary" as const,
      section: "git" as const,
    },
    {
      label: "devsh version",
      value: input.devshVersion,
      priority: "secondary" as const,
      section: "runtime" as const,
    },
    {
      label: "Session ID",
      value: input.sessionId,
      priority: "secondary" as const,
      section: "continuation" as const,
    },
    {
      label: "Thread ID",
      value: input.threadId,
      priority: "secondary" as const,
      section: "continuation" as const,
    },
    {
      label: "Codex home",
      value: input.codexHome,
      priority: "secondary" as const,
      section: "runtime" as const,
    },
    {
      label: "Injection mode",
      value: input.injectionMode,
      priority: "secondary" as const,
      section: "continuation" as const,
    },
    {
      label: "Last injection",
      value:
        formatLocalRunTimestamp(input.lastInjectionAt) ?? input.lastInjectionAt,
      priority: "secondary" as const,
      section: "continuation" as const,
    },
    {
      label: "Injection count",
      value:
        typeof input.injectionCount === "number"
          ? String(input.injectionCount)
          : undefined,
      priority: "secondary" as const,
      section: "continuation" as const,
    },
    {
      label: "Checkpoint ref",
      value: input.checkpointRef,
      priority: "secondary" as const,
      section: "continuation" as const,
    },
    {
      label: "Checkpoint generation",
      value:
        typeof input.checkpointGeneration === "number"
          ? String(input.checkpointGeneration)
          : undefined,
      priority: "secondary" as const,
      section: "continuation" as const,
    },
    {
      label: "Checkpoint label",
      value: input.checkpointLabel,
      priority: "secondary" as const,
      section: "continuation" as const,
    },
    {
      label: "Checkpoint created",
      value: formatLocalCheckpointCreatedAt(input.checkpointCreatedAt),
      priority: "secondary" as const,
      section: "continuation" as const,
    },
    {
      label: "Bridge task",
      value: input.bridgedTaskId,
      priority: "secondary" as const,
      section: "bridge" as const,
    },
    {
      label: "Bridge run",
      value: input.bridgedTaskRunId,
      priority: "secondary" as const,
      section: "bridge" as const,
    },
  ].filter(hasValue);

  return {
    result: input.result,
    error: input.error,
    summaryItems,
    diagnosticGroups: [
      createDiagnosticGroup(
        "git",
        "Git",
        diagnosticItems.filter((item) => item.section === "git"),
      ),
      createDiagnosticGroup(
        "runtime",
        "Runtime",
        diagnosticItems.filter((item) => item.section === "runtime"),
      ),
      createDiagnosticGroup(
        "continuation",
        "Continuation",
        diagnosticItems.filter((item) => item.section === "continuation"),
      ),
      createDiagnosticGroup(
        "bridge",
        "Bridge",
        diagnosticItems.filter((item) => item.section === "bridge"),
      ),
    ].filter((group) => group.items.length > 0),
  };
}
