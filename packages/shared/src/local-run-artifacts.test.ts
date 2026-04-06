import { describe, expect, it } from "vitest";
import {
  LocalRunArtifactDisplaySchema,
  LocalRunArtifactEventsSchema,
  LocalRunArtifactFeedEntrySchema,
  LocalRunArtifactSnapshotsSchema,
} from "./local-run-artifacts";

describe("local-run-artifacts", () => {
  it("parses normalized feed entries", () => {
    expect(
      LocalRunArtifactFeedEntrySchema.parse({
        _id: "local-event-0-2026-04-05T09:00:01Z",
        type: "task_started",
        summary: "Starting task",
        detail: "Starting task",
        createdAt: 1712307601000,
      }),
    ).toMatchObject({
      _id: "local-event-0-2026-04-05T09:00:01Z",
      type: "task_started",
      summary: "Starting task",
      createdAt: 1712307601000,
    });
  });

  it("requires at least one snapshot tab", () => {
    expect(() =>
      LocalRunArtifactSnapshotsSchema.parse({
        availableTabs: [],
        preferredTab: "stdout",
      }),
    ).toThrow();

    expect(
      LocalRunArtifactSnapshotsSchema.parse({
        availableTabs: ["stderr"],
        preferredTab: "stderr",
        stderr: "stderr only output",
      }),
    ).toMatchObject({
      availableTabs: ["stderr"],
      preferredTab: "stderr",
      stderr: "stderr only output",
    });
  });

  it("parses one shared event feed without duplicated activity/log arrays", () => {
    expect(
      LocalRunArtifactEventsSchema.parse({
        countLabel: "2 events",
        feedEntries: [
          {
            _id: "local-event-0-2026-04-05T09:00:01Z",
            type: "task_started",
            summary: "Starting task",
            createdAt: 1712307601000,
          },
          {
            _id: "local-event-1-2026-04-05T09:00:03Z",
            type: "error",
            summary: "Something happened",
            detail: "Something happened",
            createdAt: 1712307603000,
          },
        ],
        rawEvents: [
          {
            timestamp: "2026-04-05T09:00:01Z",
            type: "task_started",
            message: "Starting task",
          },
          {
            timestamp: "2026-04-05T09:00:03Z",
            type: "error",
            message: "Something happened",
          },
        ],
        showRawEvents: false,
      }),
    ).toMatchObject({
      countLabel: "2 events",
      showRawEvents: false,
    });
  });

  it("parses the normalized Local Runs artifact display contract", () => {
    expect(
      LocalRunArtifactDisplaySchema.parse({
        result: "Applied local update",
        error: "Last retry failed before recovery",
        summaryItems: [
          {
            label: "Model",
            value: "claude-sonnet-4-6",
            priority: "primary",
          },
        ],
        diagnosticGroups: [
          {
            key: "continuation",
            label: "Continuation",
            items: [
              {
                label: "Session ID",
                value: "session_123",
                priority: "secondary",
                section: "continuation",
              },
            ],
          },
        ],
        events: {
          countLabel: "1 event",
          feedEntries: [
            {
              _id: "local-event-0-2026-04-05T09:00:01Z",
              type: "task_started",
              summary: "Starting task",
              createdAt: 1712307601000,
            },
          ],
          rawEvents: [
            {
              timestamp: "2026-04-05T09:00:01Z",
              type: "task_started",
              message: "Starting task",
            },
          ],
          showRawEvents: false,
        },
        snapshots: {
          availableTabs: ["stdout", "stderr"],
          preferredTab: "stdout",
          stdout: "stdout line",
          stderr: "stderr line",
        },
      }),
    ).toMatchObject({
      result: "Applied local update",
      error: "Last retry failed before recovery",
      events: { countLabel: "1 event" },
      snapshots: { preferredTab: "stdout" },
    });
  });
});
