import { describe, expect, it } from "vitest";
import {
  buildLocalRunArtifactDisplay,
  LocalRunArtifactCardSchema,
  LocalRunArtifactDisplaySchema,
  LocalRunArtifactEventsSchema,
  LocalRunArtifactFeedEntrySchema,
  LocalRunArtifactSnapshotsSchema,
  LocalRunArtifactStopSchema,
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

  it("parses the shared Local Runs artifact card contract", () => {
    expect(
      LocalRunArtifactCardSchema.parse({
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
      }),
    ).toMatchObject({
      result: "Applied local update",
      error: "Last retry failed before recovery",
      summaryItems: [expect.objectContaining({ label: "Model" })],
    });
  });

  it("parses the shared Local Runs stop artifact contract", () => {
    expect(
      LocalRunArtifactStopSchema.parse({
        status: "stopped",
        signal: "SIGTERM",
        pid: 4242,
        message: "Sent SIGTERM to process 4242",
      }),
    ).toMatchObject({
      status: "stopped",
      signal: "SIGTERM",
      pid: 4242,
      message: "Sent SIGTERM to process 4242",
    });
  });

  it("builds the normalized Local Runs artifact display contract", () => {
    expect(
      buildLocalRunArtifactDisplay({
        result: "Applied local update",
        error: "Last retry failed before recovery",
        workspace: "/root/workspace",
        model: "claude-sonnet-4-6",
        stdout: "stdout line",
        stderr: "stderr line",
        events: [
          {
            timestamp: "2026-04-05T09:00:01Z",
            type: "task_started",
            message: "Starting task",
          },
        ],
        stop: {
          status: "stopped",
          signal: "SIGTERM",
          pid: 4242,
          message: "Sent SIGTERM to process 4242",
        },
      }),
    ).toMatchObject({
      result: "Applied local update",
      error: "Last retry failed before recovery",
      summaryItems: [expect.objectContaining({ label: "Workspace" }), expect.anything(), expect.anything()],
      events: {
        countLabel: "1 event",
        feedEntries: [
          expect.objectContaining({ type: "task_started", summary: "Starting task" }),
        ],
        showRawEvents: false,
      },
      snapshots: { preferredTab: "stdout", availableTabs: ["stdout", "stderr"] },
      stop: {
        status: "stopped",
        signal: "SIGTERM",
        pid: 4242,
        message: "Sent SIGTERM to process 4242",
      },
    });
  });

  it("reuses a supplied artifact card when building display data", () => {
    expect(
      buildLocalRunArtifactDisplay({
        artifactCard: {
          result: "Server-normalized result",
          error: "Server-normalized error",
          summaryItems: [
            {
              label: "Model",
              value: "server-model",
              priority: "primary",
            },
          ],
          diagnosticGroups: [],
        },
        stdout: "",
        stderr: "stderr only output",
        events: [],
      }),
    ).toMatchObject({
      result: "Server-normalized result",
      error: "Server-normalized error",
      summaryItems: [
        expect.objectContaining({ label: "Model", value: "server-model" }),
      ],
      snapshots: { preferredTab: "stderr", availableTabs: ["stderr"] },
      events: { countLabel: "0 events", showRawEvents: true },
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
