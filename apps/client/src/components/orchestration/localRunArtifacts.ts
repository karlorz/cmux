import type {
  LocalRunArtifactArtifacts,
  LocalRunArtifactDisplay,
  LocalRunArtifactEvent,
  LocalRunArtifactFeedEntry,
  LocalRunArtifactMetadata,
  LocalRunArtifactMetadataGroup,
  LocalRunArtifactMetadataItem,
  LocalRunArtifactStreamTab,
} from "@cmux/shared";
import type { LocalRunDetail } from "@cmux/www-openapi-client";

function getLocalArtifactMetadata(
  detail: LocalRunDetail,
): LocalRunArtifactMetadata {
  return {
    timeout: detail.timeout,
    durationMs: detail.durationMs,
    selectedVariant: detail.selectedVariant,
    model: detail.model,
    gitBranch: detail.gitBranch,
    gitCommit: detail.gitCommit,
    devshVersion: detail.devshVersion,
    sessionId: detail.sessionId,
    threadId: detail.threadId,
    codexHome: detail.codexHome,
    injectionMode: detail.injectionMode,
    lastInjectionAt: detail.lastInjectionAt,
    injectionCount: detail.injectionCount,
    checkpointRef: detail.checkpointRef,
    checkpointGeneration: detail.checkpointGeneration,
    checkpointLabel: detail.checkpointLabel,
    checkpointCreatedAt: detail.checkpointCreatedAt,
  };
}

export function buildLocalMetadataItems(
  detail: LocalRunDetail,
): LocalRunArtifactMetadataItem[] {
  const metadata = getLocalArtifactMetadata(detail);

  return [
    { label: "Workspace", value: detail.workspace, priority: "primary" },
    { label: "Run directory", value: detail.runDir, priority: "primary" },
    { label: "Agent", value: detail.agent, priority: "primary" },
    { label: "Model", value: metadata.model, priority: "primary" },
    {
      label: "Prompt",
      value: detail.prompt,
      monospace: false,
      priority: "primary",
    },
    {
      label: "Checkpoint",
      value: metadata.checkpointLabel ?? metadata.checkpointRef,
      monospace: false,
      priority: "primary",
    },
    {
      label: "Completed",
      value: formatLocalRunTimestamp(detail.completedAt),
      monospace: false,
      priority: "primary",
    },
    {
      label: "Event count",
      value: formatLocalEventCount(detail.events),
      monospace: false,
      priority: "primary",
    },
    { label: "Variant", value: metadata.selectedVariant, priority: "primary" },
    {
      label: "Git branch",
      value: metadata.gitBranch,
      priority: "primary",
    },
    {
      label: "Git commit",
      value: metadata.gitCommit,
      priority: "secondary",
      section: "git",
    },
    {
      label: "devsh version",
      value: metadata.devshVersion,
      priority: "secondary",
      section: "runtime",
    },
    {
      label: "Session ID",
      value: metadata.sessionId,
      priority: "secondary",
      section: "continuation",
    },
    {
      label: "Thread ID",
      value: metadata.threadId,
      priority: "secondary",
      section: "continuation",
    },
    {
      label: "Codex home",
      value: metadata.codexHome,
      priority: "secondary",
      section: "runtime",
    },
    {
      label: "Injection mode",
      value: metadata.injectionMode,
      priority: "secondary",
      section: "continuation",
    },
    {
      label: "Last injection",
      value:
        formatLocalRunTimestamp(metadata.lastInjectionAt) ??
        metadata.lastInjectionAt,
      priority: "secondary",
      section: "continuation",
    },
    {
      label: "Injection count",
      value:
        typeof metadata.injectionCount === "number"
          ? String(metadata.injectionCount)
          : undefined,
      priority: "secondary",
      section: "continuation",
    },
    {
      label: "Checkpoint ref",
      value: metadata.checkpointRef,
      priority: "secondary",
      section: "continuation",
    },
    {
      label: "Checkpoint generation",
      value:
        typeof metadata.checkpointGeneration === "number"
          ? String(metadata.checkpointGeneration)
          : undefined,
      priority: "secondary",
      section: "continuation",
    },
    {
      label: "Checkpoint label",
      value: metadata.checkpointLabel,
      priority: "secondary",
      section: "continuation",
    },
    {
      label: "Checkpoint created",
      value:
        typeof metadata.checkpointCreatedAt === "number"
          ? formatLocalRunTimestamp(
              new Date(metadata.checkpointCreatedAt).toISOString(),
            )
          : undefined,
      priority: "secondary",
      section: "continuation",
    },
    {
      label: "Bridge task",
      value: detail.bridgedTaskId,
      priority: "secondary",
      section: "bridge",
    },
    {
      label: "Bridge run",
      value: detail.bridgedTaskRunId,
      priority: "secondary",
      section: "bridge",
    },
  ].filter((item): item is LocalRunArtifactMetadataItem => Boolean(item.value));
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

export function formatLocalEventCount(events?: LocalRunDetail["events"]) {
  const count = events?.length ?? 0;
  return count === 1 ? "1 event" : `${count} events`;
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

export function buildLocalEventEntries(
  events?: LocalRunDetail["events"],
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

export function buildLocalArtifactDisplay(
  detail: LocalRunDetail,
): LocalRunArtifactDisplay {
  const metadataItems = buildLocalMetadataItems(detail);
  const summaryItems = metadataItems.filter((item) => item.priority === "primary");
  const secondaryMetadataItems = metadataItems.filter(
    (item) => item.priority === "secondary",
  );
  const diagnosticGroups: LocalRunArtifactMetadataGroup[] = [
    {
      key: "git",
      label: "Git",
      items: secondaryMetadataItems.filter((item) => item.section === "git"),
    },
    {
      key: "runtime",
      label: "Runtime",
      items: secondaryMetadataItems.filter((item) => item.section === "runtime"),
    },
    {
      key: "continuation",
      label: "Continuation",
      items: secondaryMetadataItems.filter(
        (item) => item.section === "continuation",
      ),
    },
    {
      key: "bridge",
      label: "Bridge",
      items: secondaryMetadataItems.filter((item) => item.section === "bridge"),
    },
  ].filter((group) => group.items.length > 0);

  const hasStdout = Boolean(detail.stdout?.trim().length);
  const hasStderr = Boolean(detail.stderr?.trim().length);
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
  const feedEntries = buildLocalEventEntries(detail.events);

  return {
    result: detail.result,
    error: detail.error,
    summaryItems,
    diagnosticGroups,
    events: {
      countLabel: formatLocalEventCount(detail.events),
      feedEntries,
      rawEvents: detail.events ?? [],
      showRawEvents: !detail.bridgedTaskRunId && feedEntries.length === 0,
    },
    snapshots: {
      availableTabs,
      preferredTab,
      stdout: detail.stdout,
      stderr: detail.stderr,
    },
  };
}
