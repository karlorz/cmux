import { describe, expect, it } from "vitest";
import {
  buildLocalArtifactDisplay,
} from "./localRunArtifacts";
import type { LocalRunDetail } from "@cmux/www-openapi-client";

function createDetail(
  overrides: Partial<LocalRunDetail> = {},
): LocalRunDetail {
  return {
    orchestrationId: "local_www_test",
    agent: "claude/haiku-4.5",
    status: "running",
    prompt: "Inspect local flow",
    startedAt: "2026-04-05T09:00:00Z",
    completedAt: "2026-04-05T09:05:00Z",
    workspace: "/root/workspace",
    runDir: "/tmp/local_www_test",
    selectedVariant: "high",
    model: "claude-sonnet-4-6",
    gitBranch: "feat/local-runs",
    gitCommit: "abc123def456",
    devshVersion: "1.2.3",
    sessionId: "session_123",
    threadId: "thread_123",
    codexHome: "/tmp/codex",
    injectionMode: "active",
    lastInjectionAt: "2026-04-05T09:03:00Z",
    injectionCount: 2,
    checkpointRef: "cp_local_www_test_1",
    checkpointGeneration: 1,
    checkpointLabel: "before-apply",
    checkpointCreatedAt: 1712307780000,
    bridgedTaskId: "task_123",
    bridgedTaskRunId: "tskrun_123",
    result: "Applied local update",
    error: undefined,
    stdout: "stdout line",
    stderr: "stderr line",
    events: [
      {
        timestamp: "2026-04-05T09:00:01Z",
        type: "task_started",
        message: "Starting task",
      },
    ],
    artifactCard: undefined,
    ...overrides,
  };
}

describe("localRunArtifacts", () => {
  it("prefers route-level artifactDisplay when present", () => {
    const detail = createDetail({
      artifactDisplay: {
        result: "Server-normalized result",
        error: "Server-normalized error",
        summaryItems: [
          { label: "Model", value: "server-model", priority: "primary" },
        ],
        diagnosticGroups: [
          {
            key: "runtime",
            label: "Runtime",
            items: [
              {
                label: "devsh version",
                value: "9.9.9",
                priority: "secondary",
                section: "runtime",
              },
            ],
          },
        ],
        events: {
          countLabel: "1 event",
          feedEntries: [
            {
              _id: "local-event-0-2026-04-05T09:00:03Z",
              type: "error",
              summary: "Something happened",
              createdAt: 1743843603000,
            },
          ],
          rawEvents: [
            {
              timestamp: "2026-04-05T09:00:03Z",
              type: "error",
              message: "Something happened",
            },
          ],
          showRawEvents: false,
        },
        snapshots: {
          availableTabs: ["stderr"],
          preferredTab: "stderr",
          stderr: "stderr line",
        },
      },
      artifactCard: {
        result: "Older card result",
        error: "Older card error",
        summaryItems: [
          { label: "Model", value: "older-card-model", priority: "primary" },
        ],
        diagnosticGroups: [],
      },
      stdout: "stdout line",
      stderr: "stderr line",
      events: [
        {
          timestamp: "2026-04-05T09:00:03Z",
          type: "error",
          message: "Something happened",
        },
      ],
    });

    const display = buildLocalArtifactDisplay(detail);

    expect(display.result).toBe("Server-normalized result");
    expect(display.error).toBe("Server-normalized error");
    expect(display.summaryItems).toEqual([
      { label: "Model", value: "server-model", priority: "primary" },
    ]);
    expect(display.diagnosticGroups).toEqual([
      {
        key: "runtime",
        label: "Runtime",
        items: [
          {
            label: "devsh version",
            value: "9.9.9",
            priority: "secondary",
            section: "runtime",
          },
        ],
      },
    ]);
    expect(display.events).toEqual({
      countLabel: "1 event",
      feedEntries: [
        {
          _id: "local-event-0-2026-04-05T09:00:03Z",
          type: "error",
          summary: "Something happened",
          createdAt: 1743843603000,
        },
      ],
      rawEvents: [
        {
          timestamp: "2026-04-05T09:00:03Z",
          type: "error",
          message: "Something happened",
        },
      ],
      showRawEvents: false,
    });
    expect(display.snapshots).toEqual({
      availableTabs: ["stderr"],
      preferredTab: "stderr",
      stderr: "stderr line",
    });
  });

  it("falls back to shared display normalization when route-level artifactDisplay is absent", () => {
    const detail = createDetail({
      artifactCard: {
        result: "Server-normalized result",
        error: "Server-normalized error",
        summaryItems: [
          { label: "Model", value: "server-model", priority: "primary" },
        ],
        diagnosticGroups: [
          {
            key: "runtime",
            label: "Runtime",
            items: [
              {
                label: "devsh version",
                value: "9.9.9",
                priority: "secondary",
                section: "runtime",
              },
            ],
          },
        ],
      },
      stdout: "stdout line",
      stderr: "stderr line",
      events: [
        {
          timestamp: "2026-04-05T09:00:03Z",
          type: "error",
          message: "Something happened",
        },
      ],
    });

    const display = buildLocalArtifactDisplay(detail);

    expect(display.result).toBe("Server-normalized result");
    expect(display.error).toBe("Server-normalized error");
    expect(display.summaryItems).toEqual([
      { label: "Model", value: "server-model", priority: "primary" },
    ]);
    expect(display.diagnosticGroups).toEqual([
      {
        key: "runtime",
        label: "Runtime",
        items: [
          {
            label: "devsh version",
            value: "9.9.9",
            priority: "secondary",
            section: "runtime",
          },
        ],
      },
    ]);
    expect(display.snapshots.stdout).toBe("stdout line");
    expect(display.snapshots.stderr).toBe("stderr line");
    expect(display.events.countLabel).toBe("1 event");
    expect(display.events.rawEvents).toEqual([
      {
        timestamp: "2026-04-05T09:00:03Z",
        type: "error",
        message: "Something happened",
      },
    ]);
    expect(display.events.feedEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "error", summary: "Something happened" }),
      ]),
    );
  });
});
