// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalRunsList } from "./LocalRunsList";

const invalidateQueriesMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

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
  WebLogsPage: ({ taskRunId }: { taskRunId: string }) => (
    <div data-testid="web-logs-page">WebLogsPage:{taskRunId}</div>
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
  ActivityStream: ({ runId }: { runId: string }) => (
    <div data-testid="activity-stream">ActivityStream:{runId}</div>
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
          runDir: "/tmp/local_www_123",
          workspace: "/root/workspace",
          timeout: "30m",
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
    expect(container.textContent).toContain("Starting task");
    expect(container.textContent).toContain("StatusStrip:local_www_123");
    expect(container.textContent).toContain("Continue session");
    expect(container.textContent).toContain("RuntimeLifecycleCard:local_www_123");
    expect(container.textContent).toContain("RunInspectorPanel:local_www_123");
    expect(container.textContent).toContain("ActivityStream:tskrun_bridge_123");
    expect(container.textContent).toContain("WebLogsPage:tskrun_bridge_123");
    expect(container.textContent).toContain("LineageChainCard:tskrun_bridge_123");
    expect(container.textContent).toContain("RunApprovalLane:tskrun_bridge_123");
    expect(container.textContent).toContain("Open shared run page");
    expect(container.textContent).toContain("Open shared logs page");
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
});
