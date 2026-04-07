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

export const LocalRunArtifactStopSchema = z.object({
  status: z.string(),
  signal: z.string().optional(),
  pid: z.number().optional(),
  message: z.string(),
});
export type LocalRunArtifactStop = z.infer<typeof LocalRunArtifactStopSchema>;

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
  stop: LocalRunArtifactStopSchema.optional(),
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
  stop: LocalRunArtifactStopSchema.optional(),
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

export type LocalRunArtifactDisplayInput = LocalRunArtifactCardInput & {
  artifactCard?: LocalRunArtifactCard;
  stop?: LocalRunArtifactStop;
};

type LocalRunArtifactCardInputItem = {
  label: string;
  value?: string | null;
  monospace?: boolean;
  priority: LocalRunArtifactMetadataPriority;
  section?: LocalRunArtifactMetadataSection;
};

type LocalRunArtifactCardSummaryItemInput = Omit<
  LocalRunArtifactCardInputItem,
  "section"
>;

function hasValue(
  item: LocalRunArtifactCardInputItem,
): item is LocalRunArtifactMetadataItem & { section: LocalRunArtifactMetadataSection } {
  return typeof item.value === "string";
}

function hasSummaryValue(
  item: LocalRunArtifactCardSummaryItemInput,
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

function getLocalEventCreatedAt(timestamp: string, fallbackIndex: number) {
  const parsed = Date.parse(timestamp);
  if (!Number.isNaN(parsed)) {
    return parsed;
  }

  return fallbackIndex;
}

function getLocalEventSummary(event: LocalRunArtifactEvent) {
  const message = event.message.trim();
  if (message.length > 0) {
    return message;
  }

  return event.type.replaceAll("_", " ");
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

export function buildLocalRunArtifactFeedEntries(
  events?: LocalRunArtifactEvent[],
): LocalRunArtifactFeedEntry[] {
  return (
    events?.map((event, index) => {
      const createdAt = getLocalEventCreatedAt(event.timestamp, index);
      const summary = getLocalEventSummary(event);
      const detail = event.message.trim();
      return {
        _id: `local-event-${index}-${event.timestamp}`,
        type: event.type,
        summary,
        detail: detail && detail !== summary ? detail : undefined,
        createdAt,
      };
    }) ?? []
  );
}

export function buildLocalRunArtifactSnapshots(input: Pick<LocalRunArtifactArtifacts, "stdout" | "stderr">): LocalRunArtifactSnapshots {
  const hasStdout = Boolean(input.stdout?.trim().length);
  const hasStderr = Boolean(input.stderr?.trim().length);
  const availableTabs: LocalRunArtifactStreamTab[] =
    hasStdout && hasStderr
      ? ["stdout", "stderr"]
      : hasStdout
        ? ["stdout"]
        : hasStderr
          ? ["stderr"]
          : ["stdout", "stderr"];
  const preferredTab: LocalRunArtifactStreamTab = hasStdout
    ? "stdout"
    : hasStderr
      ? "stderr"
      : "stdout";

  return {
    availableTabs,
    preferredTab,
    stdout: input.stdout,
    stderr: input.stderr,
  };
}

export function buildLocalRunArtifactCard(
  input: LocalRunArtifactCardInput,
): LocalRunArtifactCard {
  const summaryItemInputs: LocalRunArtifactCardSummaryItemInput[] = [
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
  ];
  const summaryItems = summaryItemInputs.filter(hasSummaryValue);

  const diagnosticItemInputs: LocalRunArtifactCardInputItem[] = [
    {
      label: "Git commit",
      value: input.gitCommit,
      priority: "secondary",
      section: "git",
    },
    {
      label: "devsh version",
      value: input.devshVersion,
      priority: "secondary",
      section: "runtime",
    },
    {
      label: "Session ID",
      value: input.sessionId,
      priority: "secondary",
      section: "continuation",
    },
    {
      label: "Thread ID",
      value: input.threadId,
      priority: "secondary",
      section: "continuation",
    },
    {
      label: "Codex home",
      value: input.codexHome,
      priority: "secondary",
      section: "runtime",
    },
    {
      label: "Injection mode",
      value: input.injectionMode,
      priority: "secondary",
      section: "continuation",
    },
    {
      label: "Last injection",
      value:
        formatLocalRunTimestamp(input.lastInjectionAt) ?? input.lastInjectionAt,
      priority: "secondary",
      section: "continuation",
    },
    {
      label: "Injection count",
      value:
        typeof input.injectionCount === "number"
          ? String(input.injectionCount)
          : undefined,
      priority: "secondary",
      section: "continuation",
    },
    {
      label: "Checkpoint ref",
      value: input.checkpointRef,
      priority: "secondary",
      section: "continuation",
    },
    {
      label: "Checkpoint generation",
      value:
        typeof input.checkpointGeneration === "number"
          ? String(input.checkpointGeneration)
          : undefined,
      priority: "secondary",
      section: "continuation",
    },
    {
      label: "Checkpoint label",
      value: input.checkpointLabel,
      priority: "secondary",
      section: "continuation",
    },
    {
      label: "Checkpoint created",
      value: formatLocalCheckpointCreatedAt(input.checkpointCreatedAt),
      priority: "secondary",
      section: "continuation",
    },
    {
      label: "Bridge task",
      value: input.bridgedTaskId,
      priority: "secondary",
      section: "bridge",
    },
    {
      label: "Bridge run",
      value: input.bridgedTaskRunId,
      priority: "secondary",
      section: "bridge",
    },
  ];
  const diagnosticItems = diagnosticItemInputs.filter(hasValue);

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

export function buildLocalRunArtifactDisplay(
  input: LocalRunArtifactDisplayInput,
): LocalRunArtifactDisplay {
  const artifactCard = input.artifactCard ?? buildLocalRunArtifactCard(input);
  const feedEntries = buildLocalRunArtifactFeedEntries(input.events);

  return {
    result: artifactCard.result,
    error: artifactCard.error,
    summaryItems: artifactCard.summaryItems,
    diagnosticGroups: artifactCard.diagnosticGroups,
    events: {
      countLabel: formatLocalEventCount(input.events),
      feedEntries,
      rawEvents: input.events ?? [],
      showRawEvents: !input.bridgedTaskRunId && feedEntries.length === 0,
    },
    snapshots: buildLocalRunArtifactSnapshots(input),
    stop: input.stop,
  };
}
