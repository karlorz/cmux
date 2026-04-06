import type {
  LocalRunArtifactCard,
  LocalRunArtifactDisplay,
  LocalRunArtifactEvent,
  LocalRunArtifactFeedEntry,
  LocalRunArtifactStreamTab,
} from "@cmux/shared";
import {
  buildLocalRunArtifactCard as buildSharedLocalRunArtifactCard,
  formatLocalEventCount,
  formatLocalRunTimestamp,
} from "@cmux/shared";
import type { LocalRunDetail } from "@cmux/www-openapi-client";

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

export function buildLocalArtifactCard(
  detail: LocalRunDetail,
): LocalRunArtifactCard {
  return buildSharedLocalRunArtifactCard(detail);
}

export function buildLocalArtifactDisplay(
  detail: LocalRunDetail,
): LocalRunArtifactDisplay {
  const artifactCard = detail.artifactCard ?? buildLocalArtifactCard(detail);

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
    result: artifactCard.result,
    error: artifactCard.error,
    summaryItems: artifactCard.summaryItems,
    diagnosticGroups: artifactCard.diagnosticGroups,
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
