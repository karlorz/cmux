import { describe, expect, it } from "vitest";
import {
  buildLocalArtifactCard,
  buildLocalArtifactDisplay,
  buildLocalEventEntries,
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
  it("builds a fallback artifact card from raw local detail", () => {
    const card = buildLocalArtifactCard(createDetail());

    expect(card.summaryItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Workspace", value: "/root/workspace" }),
        expect.objectContaining({ label: "Model", value: "claude-sonnet-4-6" }),
      ]),
    );
    expect(card.diagnosticGroups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Git" }),
        expect.objectContaining({ label: "Continuation" }),
        expect.objectContaining({ label: "Bridge" }),
      ]),
    );
  });

  it("prefers route-level artifactCard while keeping events and snapshots local", () => {
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

  it("adapts raw local events into one shared feed entry list", () => {
    expect(buildLocalEventEntries(createDetail().events)).toEqual([
      expect.objectContaining({
        type: "task_started",
        summary: "Starting task",
      }),
    ]);
  });
});
