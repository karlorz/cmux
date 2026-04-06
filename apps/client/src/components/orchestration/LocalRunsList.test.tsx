// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalRunsList } from "./LocalRunsList";

const invalidateQueriesMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("./localRunArtifacts", async () => {
  const actual = await vi.importActual<typeof import("./localRunArtifacts")>("./localRunArtifacts");
  return {
    ...actual,
    formatLocalRunTimestamp: (timestamp?: string) => timestamp ?? null,
  };
});

vi.mock("@/lib/wwwOrigin", () => ({
  WWW_ORIGIN: "http://localhost:9779",
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/log-viewer/WebLogsPage", () => ({
  WebLogsPage: ({ taskRunId, entries }: { taskRunId?: string; entries?: Array<{ type: string; summary: string }> }) => (
    <div data-testid="web-logs-page">
      WebLogsPage:{taskRunId ?? "local"}
      {entries?.map((entry) => `${entry.type}:${entry.summary}`).join("|")}
    </div>
  ),
}));

vi.mock("@/components/dashboard/RunApprovalLane", () => ({
  RunApprovalLane: ({ taskRunId }: { taskRunId: string }) => (
    <div data-testid="run-approval-lane">RunApprovalLane:{taskRunId}</div>
  ),
}));

vi.mock("@/components/dashboard/LineageChainCard", () => ({
  LineageChainCard: ({ taskRunId }: { taskRunId: string }) => (
    <div data-testid="lineage-chain-card">LineageChainCard:{taskRunId}</div>
  ),
}));

vi.mock("@/components/ActivityStream", () => ({
  ActivityStream: ({ runId, entries }: { runId?: string; entries?: Array<{ type: string; summary: string }> }) => (
    <div data-testid="activity-stream">
      ActivityStream:{runId ?? "local"}
      {entries?.map((entry) => `${entry.type}:${entry.summary}`).join("|")}
    </div>
  ),
}));

vi.mock("@/components/dashboard/RunInspectorPanel", () => ({
  RunInspectorPanel: ({ runId }: { runId: string }) => (
    <div data-testid="run-inspector-panel">RunInspectorPanel:{runId}</div>
  ),
}));

vi.mock("@/components/dashboard/StatusStrip", () => ({
  StatusStrip: ({ runId }: { runId: string }) => (
    <div data-testid="status-strip">StatusStrip:{runId}</div>
  ),
}));

vi.mock("@/components/dashboard/RuntimeLifecycleCard", () => ({
  RuntimeLifecycleCard: ({ runId }: { runId: string }) => (
    <div data-testid="runtime-lifecycle-card">RuntimeLifecycleCard:{runId}</div>
  ),
}));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let queryClient: QueryClient;
let fetchMock: ReturnType<typeof vi.fn>;
let confirmMock: ReturnType<typeof vi.fn>;
let reactActEnvironmentDescriptor: PropertyDescriptor | undefined;

async function waitForAssertion(assertion: () => void, timeoutMs = 1000) {
  const start = Date.now();

  while (true) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() - start > timeoutMs) {
        throw error;
      }
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
  }
}

async function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const prototype = Object.getPrototypeOf(textarea) as HTMLTextAreaElement;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor?.set?.call(textarea, value);

  await act(async () => {
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function createJsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => body),
  };
}

beforeEach(() => {
  reactActEnvironmentDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "IS_REACT_ACT_ENVIRONMENT"
  );
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    value: true,
  });

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  invalidateQueriesMock.mockClear();
  toastSuccessMock.mockClear();
  toastErrorMock.mockClear();

  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  confirmMock = vi.fn(() => true);
  vi.stubGlobal("confirm", confirmMock);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  queryClient.clear();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (reactActEnvironmentDescriptor) {
    Object.defineProperty(
      globalThis,
      "IS_REACT_ACT_ENVIRONMENT",
      reactActEnvironmentDescriptor
    );
  } else {
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  }
});

describe("LocalRunsList", () => {
  it("loads local runs and expands details with logs and events", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/orchestrate/list-local")) {
        return createJsonResponse({
          runs: [
            {
              orchestrationId: "local_www_123",
              agent: "claude/haiku-4.5",
              status: "running",
              prompt: "Inspect auth flow",
              startedAt: "2026-04-05T09:00:00Z",
              runDir: "/tmp/local_www_123",
              workspace: "/root/workspace",
              bridgedTaskId: "task_123",
              bridgedTaskRunId: "tskrun_bridge_123",
            },
          ],
          count: 1,
        });
      }

      if (url.includes("/api/orchestrate/local-runs/local_www_123?")) {
        return createJsonResponse({
          orchestrationId: "local_www_123",
          agent: "claude/haiku-4.5",
          status: "running",
          prompt: "Inspect auth flow",
          startedAt: "2026-04-05T09:00:00Z",
          completedAt: "2026-04-05T09:05:00Z",
          selectedVariant: "high",
          model: "claude-sonnet-4-6",
          gitBranch: "feat/local-runs",
          gitCommit: "abc123def456",
          devshVersion: "1.2.3",
          runDir: "/tmp/local_www_123",
          workspace: "/root/workspace",
          timeout: "30m",
          sessionId: "session_123",
          injectionMode: "active",
          lastInjectionAt: "2026-04-05T09:03:00Z",
          injectionCount: 2,
          checkpointRef: "cp_local_www_123_1",
          checkpointGeneration: 1,
          checkpointLabel: "before-apply",
          checkpointCreatedAt: 1712307780000,
          bridgedTaskId: "task_123",
          bridgedTaskRunId: "tskrun_bridge_123",
          stdout: "stdout line",
          stderr: "stderr line",
          events: [
            {
              timestamp: "2026-04-05T09:00:01Z",
              type: "task_started",
              message: "Starting task",
            },
          ],
        });
      }

      if (url.includes("/api/v1/cmux/orchestration/run-control/local_www_123")) {
        return createJsonResponse({
          taskRunId: "tskrun_bridge_123",
          taskId: "task_123",
          orchestrationId: "local_www_123",
          provider: "claude",
          runStatus: "running",
          lifecycle: {
            status: "active",
            interrupted: false,
            interruptionStatus: "none",
          },
          approvals: {
            pendingCount: 0,
            pendingRequestIds: [],
          },
          actions: {
            availableActions: ["continue_session"],
            canResolveApproval: false,
            canContinueSession: true,
            canResumeCheckpoint: false,
            canAppendInstruction: false,
          },
          continuation: {
            mode: "session_continuation",
            hasActiveBinding: true,
          },
          timeout: {
            inactivityTimeoutMinutes: 30,
            status: "active",
          },
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <LocalRunsList teamSlugOrId="team-dev" />
        </QueryClientProvider>
      );
    });

    await waitForAssertion(() => {
      expect(container.textContent).toContain("local_www_123");
    });
    const showDetailsButton = container.querySelector('button[title="Show details"]') as HTMLButtonElement | null;
    expect(showDetailsButton).not.toBeNull();

    await act(async () => {
      showDetailsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitForAssertion(() => {
      expect(container.textContent).toContain("stdout line");
    });

    expect(container.textContent).toContain("stdout line");

    await act(async () => {
      const stderrTab = Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.trim() === "stderr"
      );
      stderrTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitForAssertion(() => {
      expect(container.textContent).toContain("stderr line");
    });

    expect(container.textContent).toContain("stderr line");
    expect(container.textContent).toContain("StatusStrip:local_www_123");
    expect(container.textContent).toContain("Continue session");
    expect(container.textContent).toContain("RuntimeLifecycleCard:local_www_123");
    expect(container.textContent).toContain("RunInspectorPanel:local_www_123");
    expect(container.textContent).toContain("ActivityStream:tskrun_bridge_123");
    expect(container.textContent).toContain("WebLogsPage:tskrun_bridge_123");
    expect(container.textContent).toContain("LineageChainCard:tskrun_bridge_123");
    expect(container.textContent).toContain("RunApprovalLane:tskrun_bridge_123");
    expect(container.textContent).toContain("Open shared run page");
    expect(container.textContent).toContain("Open shared activity page");
    expect(container.textContent).toContain("Open shared logs page");
    expect(container.textContent).toContain("high");
    expect(container.textContent).toContain("claude-sonnet-4-6");
    expect(container.textContent).toContain("feat/local-runs");
    expect(container.textContent).toContain("before-apply");
    expect(container.textContent).toContain("Show details (12)");

    await act(async () => {
      const showDiagnosticsButton = Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("Show details")
      );
      showDiagnosticsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitForAssertion(() => {
      expect(container.textContent).toContain("Diagnostic metadata");
      expect(container.textContent).toContain("Git");
      expect(container.textContent).toContain("Runtime");
      expect(container.textContent).toContain("Continuation");
      expect(container.textContent).toContain("Bridge");
    });

    expect(container.textContent).toContain("/tmp/local_www_123");
    expect(container.textContent).toContain("task_123");
    expect(container.textContent).toContain("tskrun_bridge_123");
    expect(container.textContent).toContain("high");
    expect(container.textContent).toContain("claude-sonnet-4-6");
    expect(container.textContent).toContain("feat/local-runs");
    expect(container.textContent).toContain("abc123def456");
    expect(container.textContent).toContain("1.2.3");
    expect(container.textContent).toContain("session_123");
    expect(container.textContent).toContain("active");
    expect(container.textContent).toContain("2");
    expect(container.textContent).toContain("cp_local_www_123_1");
    expect(container.textContent).toContain("before-apply");
    expect(container.textContent).toContain("1 event");
  });

  it("renders local-derived activity and logs for unbridged runs", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/orchestrate/list-local")) {
        return createJsonResponse({
          runs: [
            {
              orchestrationId: "local_www_unbridged",
              agent: "claude/haiku-4.5",
              status: "running",
              prompt: "Inspect local flow",
            },
          ],
          count: 1,
        });
      }

      if (url.includes("/api/orchestrate/local-runs/local_www_unbridged?")) {
        return createJsonResponse({
          orchestrationId: "local_www_unbridged",
          agent: "claude/haiku-4.5",
          status: "running",
          prompt: "Inspect local flow",
          stdout: "stdout line",
          stderr: "stderr line",
          result: "Applied local update",
          error: "Last retry failed before recovery",
          model: "claude-sonnet-4-6",
          events: [
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
        });
      }

      if (url.includes("/api/v1/cmux/orchestration/run-control/local_www_unbridged")) {
        return createJsonResponse({
          taskRunId: "local_www_unbridged",
          taskId: "local_www_unbridged",
          orchestrationId: "local_www_unbridged",
          provider: "claude",
          runStatus: "running",
          lifecycle: {
            status: "active",
            interrupted: false,
            interruptionStatus: "none",
          },
          approvals: {
            pendingCount: 0,
            pendingRequestIds: [],
          },
          actions: {
            availableActions: ["append_instruction"],
            canResolveApproval: false,
            canContinueSession: false,
            canResumeCheckpoint: false,
            canAppendInstruction: true,
          },
          continuation: {
            mode: "append_instruction",
            hasActiveBinding: false,
          },
          timeout: {
            inactivityTimeoutMinutes: 30,
            status: "active",
          },
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <LocalRunsList teamSlugOrId="team-dev" />
        </QueryClientProvider>
      );
    });

    await waitForAssertion(() => {
      expect(container.textContent).toContain("local_www_unbridged");
    });

    const showDetailsButton = container.querySelector('button[title="Show details"]') as HTMLButtonElement | null;
    await act(async () => {
      showDetailsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitForAssertion(() => {
      expect(container.textContent).toContain("ActivityStream:local");
    });

    await waitForAssertion(() => {
      expect(container.textContent).toContain("stdout line");
    });

    expect(container.textContent).toContain("stdout line");

    await act(async () => {
      const stderrTab = Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.trim() === "stderr"
      );
      stderrTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitForAssertion(() => {
      expect(container.textContent).toContain("stderr line");
    });

    expect(container.textContent).toContain("Artifact summary");
    expect(container.textContent).toContain("claude-sonnet-4-6");
    expect(container.textContent).not.toContain("Show details (");
    expect(container.textContent).toContain("Applied local update");
    expect(container.textContent).toContain("Last retry failed before recovery");
    expect(container.textContent).toContain("task_started:Starting task");
    expect(container.textContent).toContain("error:Something happened");
    expect(container.textContent).toContain("WebLogsPage:local");
    expect(container.textContent).toContain("stderr line");
    expect(container.textContent).not.toContain("Local raw events");
    expect(container.textContent).not.toContain("No events recorded yet.");
    expect(container.textContent).not.toContain("LineageChainCard:");
    expect(container.textContent).not.toContain("RunApprovalLane:");
    expect(container.textContent).not.toContain("Open shared run page");
  });

  it("auto-selects stderr snapshots when stdout is empty", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/orchestrate/list-local")) {
        return createJsonResponse({
          runs: [
            {
              orchestrationId: "local_www_stderr_only",
              agent: "claude/haiku-4.5",
              status: "running",
              prompt: "Inspect stderr only",
            },
          ],
          count: 1,
        });
      }

      if (url.includes("/api/orchestrate/local-runs/local_www_stderr_only?")) {
        return createJsonResponse({
          orchestrationId: "local_www_stderr_only",
          agent: "claude/haiku-4.5",
          status: "running",
          prompt: "Inspect stderr only",
          stdout: "",
          stderr: "stderr only output",
          events: [],
        });
      }

      if (url.includes("/api/v1/cmux/orchestration/run-control/local_www_stderr_only")) {
        return createJsonResponse({ error: "Not found" }, 404);
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <LocalRunsList teamSlugOrId="team-dev" />
        </QueryClientProvider>
      );
    });

    await waitForAssertion(() => {
      expect(container.textContent).toContain("local_www_stderr_only");
    });

    const showDetailsButton = container.querySelector('button[title="Show details"]') as HTMLButtonElement | null;
    await act(async () => {
      showDetailsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitForAssertion(() => {
      expect(container.textContent).toContain("stderr only output");
    });

    expect(container.textContent).not.toContain("(empty)");
    expect(container.textContent).not.toContain("stdoutstderr");
    expect(container.textContent).toContain("stderr");
  });

  it("uses shared run-control actions before falling back to local inject and still stops runs", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/orchestrate/list-local")) {
        return createJsonResponse({
          runs: [
            {
              orchestrationId: "local_www_456",
              agent: "claude/haiku-4.5",
              status: "running",
              prompt: "Do the thing",
            },
          ],
          count: 1,
        });
      }

      if (url.includes("/api/orchestrate/local-runs/local_www_456?")) {
        return createJsonResponse({
          orchestrationId: "local_www_456",
          agent: "claude/haiku-4.5",
          status: "running",
          prompt: "Do the thing",
          stdout: "working",
          events: [],
        });
      }

      if (url.includes("/api/v1/cmux/orchestration/run-control/local_www_456")) {
        return createJsonResponse({
          taskRunId: "tskrun_bridge_456",
          taskId: "task_456",
          orchestrationId: "local_www_456",
          provider: "claude",
          runStatus: "running",
          lifecycle: {
            status: "active",
            interrupted: false,
            interruptionStatus: "none",
          },
          approvals: {
            pendingCount: 0,
            pendingRequestIds: [],
          },
          actions: {
            availableActions: ["continue_session"],
            canResolveApproval: false,
            canContinueSession: true,
            canResumeCheckpoint: false,
            canAppendInstruction: false,
          },
          continuation: {
            mode: "session_continuation",
            hasActiveBinding: true,
          },
          timeout: {
            inactivityTimeoutMinutes: 30,
            status: "active",
          },
        });
      }

      if (url.includes("/api/run-control/continue/local_www_456")) {
        return createJsonResponse({
          success: true,
          action: "continue",
          summary: {
            taskRunId: "tskrun_bridge_456",
            taskId: "task_456",
            orchestrationId: "local_www_456",
            provider: "claude",
            runStatus: "running",
            lifecycle: {
              status: "active",
              interrupted: false,
              interruptionStatus: "none",
            },
            approvals: {
              pendingCount: 0,
              pendingRequestIds: [],
            },
            actions: {
              availableActions: ["continue_session"],
              canResolveApproval: false,
              canContinueSession: true,
              canResumeCheckpoint: false,
              canAppendInstruction: false,
            },
            continuation: {
              mode: "session_continuation",
              hasActiveBinding: true,
            },
            timeout: {
              inactivityTimeoutMinutes: 30,
              status: "active",
            },
          },
        });
      }

      if (url.endsWith("/stop")) {
        return createJsonResponse({ signal: "SIGTERM" });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <LocalRunsList teamSlugOrId="team-dev" />
        </QueryClientProvider>
      );
    });

    await waitForAssertion(() => {
      expect(container.textContent).toContain("local_www_456");
    });

    const expandButton = container.querySelector('button[title="Show details"]') as HTMLButtonElement | null;
    await act(async () => {
      expandButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitForAssertion(() => {
      expect(container.querySelector("textarea")).not.toBeNull();
    });

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();
    if (!textarea) {
      throw new Error("Expected textarea to exist");
    }

    await setTextareaValue(textarea, "Please add tests");

    expect(container.textContent).toContain("Uses the default instruction when left blank.");

    const continueButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Continue session"),
    ) as HTMLButtonElement | undefined;
    expect(continueButton).toBeDefined();
    expect(continueButton?.disabled).toBe(false);

    await act(async () => {
      continueButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitForAssertion(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:9779/api/run-control/continue/local_www_456",
        expect.objectContaining({
          method: "POST",
          credentials: "include",
        })
      );
    });

    expect(toastSuccessMock).toHaveBeenCalledWith("Continue session queued");

    const stopButton = container.querySelector('button[title="Stop local run"]') as HTMLButtonElement | null;
    expect(stopButton).not.toBeNull();

    await act(async () => {
      stopButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitForAssertion(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:9779/api/orchestrate/local-runs/local_www_456/stop",
        expect.objectContaining({
          method: "POST",
          credentials: "include",
        })
      );
    });
    expect(confirmMock).toHaveBeenCalledWith("Stop local run local_www_456?");
    expect(toastSuccessMock).toHaveBeenCalledWith("Stop requested with SIGTERM");
  });

  it("shows default-instruction helper text for shared follow-up controls", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/orchestrate/list-local")) {
        return createJsonResponse({
          runs: [
            {
              orchestrationId: "local_www_default_helper",
              agent: "claude/haiku-4.5",
              status: "running",
              prompt: "Do the thing",
            },
          ],
          count: 1,
        });
      }

      if (url.includes("/api/orchestrate/local-runs/local_www_default_helper?")) {
        return createJsonResponse({
          orchestrationId: "local_www_default_helper",
          agent: "claude/haiku-4.5",
          status: "running",
          prompt: "Do the thing",
          stdout: "working",
          events: [],
        });
      }

      if (url.includes("/api/v1/cmux/orchestration/run-control/local_www_default_helper")) {
        return createJsonResponse({
          taskRunId: "tskrun_bridge_helper",
          taskId: "task_helper",
          orchestrationId: "local_www_default_helper",
          provider: "claude",
          runStatus: "running",
          lifecycle: {
            status: "active",
            interrupted: false,
            interruptionStatus: "none",
          },
          approvals: {
            pendingCount: 0,
            pendingRequestIds: [],
          },
          actions: {
            availableActions: ["continue_session"],
            canResolveApproval: false,
            canContinueSession: true,
            canResumeCheckpoint: false,
            canAppendInstruction: false,
          },
          continuation: {
            mode: "session_continuation",
            hasActiveBinding: true,
          },
          timeout: {
            inactivityTimeoutMinutes: 30,
            status: "active",
          },
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <LocalRunsList teamSlugOrId="team-dev" />
        </QueryClientProvider>
      );
    });

    await waitForAssertion(() => {
      expect(container.textContent).toContain("local_www_default_helper");
    });

    const expandButton = container.querySelector('button[title="Show details"]') as HTMLButtonElement | null;
    await act(async () => {
      expandButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitForAssertion(() => {
      expect(container.textContent).toContain("Uses the default instruction when left blank.");
    });
  });

  it("uses local session metadata to label fallback continuation controls", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/orchestrate/list-local")) {
        return createJsonResponse({
          runs: [
            {
              orchestrationId: "local_www_789",
              agent: "claude/haiku-4.5",
              status: "running",
              prompt: "Keep going",
            },
          ],
          count: 1,
        });
      }

      if (url.includes("/api/orchestrate/local-runs/local_www_789?")) {
        return createJsonResponse({
          orchestrationId: "local_www_789",
          agent: "claude/haiku-4.5",
          status: "running",
          prompt: "Keep going",
          sessionId: "session_local_789",
          injectionMode: "active",
          stdout: "working",
          events: [],
        });
      }

      if (url.includes("/api/v1/cmux/orchestration/run-control/local_www_789")) {
        return createJsonResponse({ error: "Not found" }, 404);
      }

      if (url.includes("/api/orchestrate/local-runs/local_www_789/inject")) {
        return createJsonResponse({
          runId: "local_www_789",
          mode: "active",
          message: "Continue with the current task.",
          injectionCount: 1,
          controlLane: "continue_session",
          continuationMode: "session_continuation",
          availableActions: ["continue_session"],
          sessionId: "session_local_789",
        });
      }

      if (url.includes("/api/run-control/resume/local_www_789")) {
        return createJsonResponse({
          action: "resume",
          summary: {
            taskRunId: "tskrun_local_789",
            taskId: "task_local_789",
            orchestrationId: "local_www_789",
            provider: "claude",
            runStatus: "running",
            lifecycle: {
              status: "active",
              interrupted: false,
              interruptionStatus: "checkpoint_pending",
            },
            approvals: {
              pendingCount: 0,
              pendingRequestIds: [],
            },
            actions: {
              availableActions: ["resume_checkpoint"],
              canResolveApproval: false,
              canContinueSession: false,
              canResumeCheckpoint: true,
              canAppendInstruction: false,
            },
            continuation: {
              mode: "checkpoint_restore",
              hasActiveBinding: false,
              checkpointRef: "cp_local_www_789_2",
              checkpointGeneration: 2,
            },
            timeout: {
              inactivityTimeoutMinutes: 30,
              status: "active",
            },
          },
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <LocalRunsList teamSlugOrId="team-dev" />
        </QueryClientProvider>
      );
    });

    await waitForAssertion(() => {
      expect(container.textContent).toContain("local_www_789");
    });

    const expandButton = container.querySelector('button[title="Show details"]') as HTMLButtonElement | null;
    await act(async () => {
      expandButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitForAssertion(() => {
      expect(container.querySelector("textarea")).not.toBeNull();
    });

    expect(container.textContent).toContain("Continue session");
    expect(container.textContent).toContain("RunInspectorPanel:local_www_789");

    const continueButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Continue session"),
    ) as HTMLButtonElement | undefined;
    expect(continueButton).toBeDefined();
    expect(continueButton?.disabled).toBe(false);

    await act(async () => {
      continueButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitForAssertion(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:9779/api/orchestrate/local-runs/local_www_789/inject",
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          body: JSON.stringify({
            teamSlugOrId: "team-dev",
            message: "Continue with the current task.",
          }),
        })
      );
    });

    expect(toastSuccessMock).toHaveBeenCalledWith("Continue session queued");
  });

  it("prefers checkpoint-backed resume for local artifact continuation controls", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/orchestrate/list-local")) {
        return createJsonResponse({
          runs: [
            {
              orchestrationId: "local_www_999",
              agent: "claude/haiku-4.5",
              status: "running",
              prompt: "Resume me",
            },
          ],
          count: 1,
        });
      }

      if (url.includes("/api/orchestrate/local-runs/local_www_999?")) {
        return createJsonResponse({
          orchestrationId: "local_www_999",
          agent: "claude/haiku-4.5",
          status: "running",
          prompt: "Resume me",
          checkpointRef: "cp_local_www_999_3",
          checkpointGeneration: 3,
          checkpointLabel: "pre-fix",
          stdout: "working",
          events: [],
        });
      }

      if (url.includes("/api/v1/cmux/orchestration/run-control/local_www_999")) {
        return createJsonResponse({ error: "Not found" }, 404);
      }

      if (url.includes("/api/orchestrate/local-runs/local_www_999/resume")) {
        return createJsonResponse({
          runId: "local_www_999",
          mode: "checkpoint_restore",
          message: "Resume the interrupted task.",
          controlLane: "resume_checkpoint",
          continuationMode: "checkpoint_restore",
          availableActions: ["resume_checkpoint"],
          checkpointRef: "cp_local_www_999_3",
          checkpointGeneration: 3,
          checkpointLabel: "pre-fix",
        });
      }

      if (url.includes("/api/orchestrate/local-runs/local_www_999/inject")) {
        throw new Error("Unexpected local inject call for checkpoint resume");
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <LocalRunsList teamSlugOrId="team-dev" />
        </QueryClientProvider>
      );
    });

    await waitForAssertion(() => {
      expect(container.textContent).toContain("local_www_999");
    });

    const expandButton = container.querySelector('button[title="Show details"]') as HTMLButtonElement | null;
    await act(async () => {
      expandButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitForAssertion(() => {
      expect(container.querySelector("textarea")).not.toBeNull();
    });

    expect(container.textContent).toContain("Resume checkpoint");
    expect(container.textContent).toContain("RunInspectorPanel:local_www_999");
    expect(container.textContent).toContain("pre-fix");
    expect(container.textContent).toContain("Show details (3)");

    await act(async () => {
      const showDiagnosticsButton = Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("Show details")
      );
      showDiagnosticsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitForAssertion(() => {
      expect(container.textContent).toContain("cp_local_www_999_3");
    });

    expect(container.textContent).toContain("pre-fix");

    const resumeButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Resume checkpoint"),
    ) as HTMLButtonElement | undefined;
    expect(resumeButton).toBeDefined();

    await act(async () => {
      resumeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitForAssertion(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:9779/api/orchestrate/local-runs/local_www_999/resume",
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          body: JSON.stringify({
            teamSlugOrId: "team-dev",
            message: "Resume the interrupted task.",
          }),
        })
      );
    });

    expect(toastSuccessMock).toHaveBeenCalledWith("Resume checkpoint queued");
  });

  it("creates a local checkpoint and refreshes local metadata", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/orchestrate/list-local")) {
        return createJsonResponse({
          runs: [
            {
              orchestrationId: "local_www_cp",
              agent: "claude/haiku-4.5",
              status: "running",
              prompt: "Checkpoint me",
            },
          ],
          count: 1,
        });
      }

      if (url.includes("/api/orchestrate/local-runs/local_www_cp?")) {
        return createJsonResponse({
          orchestrationId: "local_www_cp",
          agent: "claude/haiku-4.5",
          status: "running",
          prompt: "Checkpoint me",
          checkpointRef: "cp_local_www_cp_1",
          checkpointGeneration: 1,
          stdout: "working",
          events: [],
        });
      }

      if (url.includes("/api/v1/cmux/orchestration/run-control/local_www_cp")) {
        return createJsonResponse({ error: "Not found" }, 404);
      }

      if (url.includes("/api/orchestrate/local-runs/local_www_cp/checkpoint")) {
        return createJsonResponse({
          runId: "local_www_cp",
          runDir: "/tmp/local_www_cp",
          checkpointRef: "cp_local_www_cp_1",
          checkpointGeneration: 1,
          label: undefined,
          createdAt: "2026-04-05T09:04:00Z",
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <LocalRunsList teamSlugOrId="team-dev" />
        </QueryClientProvider>
      );
    });

    await waitForAssertion(() => {
      expect(container.textContent).toContain("local_www_cp");
    });

    const expandButton = container.querySelector('button[title="Show details"]') as HTMLButtonElement | null;
    await act(async () => {
      expandButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitForAssertion(() => {
      expect(container.querySelector('button[title="Create checkpoint"]')).not.toBeNull();
    });

    const checkpointButton = container.querySelector('button[title="Create checkpoint"]') as HTMLButtonElement | null;
    expect(checkpointButton).not.toBeNull();

    await act(async () => {
      checkpointButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitForAssertion(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:9779/api/orchestrate/local-runs/local_www_cp/checkpoint",
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          body: JSON.stringify({
            teamSlugOrId: "team-dev",
          }),
        })
      );
    });

    expect(toastSuccessMock).toHaveBeenCalledWith("Checkpoint created: cp_local_www_cp_1");
    await waitForAssertion(() => {
      expect(container.textContent).toContain("RunInspectorPanel:local_www_cp");
      expect(container.textContent).toContain("Resume checkpoint");
      expect(container.textContent).toContain("Show details (2)");
    });

    await act(async () => {
      const showDiagnosticsButton = Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("Show details")
      );
      showDiagnosticsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitForAssertion(() => {
      expect(container.textContent).toContain("cp_local_www_cp_1");
    });
  });
});
