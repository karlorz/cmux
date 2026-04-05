// @vitest-environment jsdom

import type { RunControlSummary } from "@cmux/shared";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RunInspectorPanel } from "./RunInspectorPanel";

type SummaryOverrides = Partial<
  Omit<
    RunControlSummary,
    "actions" | "approvals" | "continuation" | "lifecycle" | "timeout"
  >
> & {
  actions?: Partial<RunControlSummary["actions"]>;
  approvals?: Partial<RunControlSummary["approvals"]>;
  continuation?: Partial<RunControlSummary["continuation"]>;
  lifecycle?: Partial<RunControlSummary["lifecycle"]>;
  timeout?: Partial<RunControlSummary["timeout"]>;
};

const useQueryMock = vi.fn();
const runControlOptionsMock = vi.fn();
const convexQueryMock = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("@cmux/www-openapi-client/react-query", () => ({
  getApiV1CmuxOrchestrationRunControlByTaskRunIdOptions: (...args: unknown[]) =>
    runControlOptionsMock(...args),
}));

vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (...args: unknown[]) => convexQueryMock(...args),
}));

vi.mock("@cmux/convex/api", () => ({
  api: {
    providerSessions: {
      getResumeAncestry: "providerSessions.getResumeAncestry",
    },
  },
}));

vi.mock("@/components/TaskRunMemoryPanel", () => ({
  TaskRunMemoryPanel: ({ taskRunId }: { taskRunId: string }) => (
    <div>TaskRunMemoryPanel:{taskRunId}</div>
  ),
}));

type QueryResult = {
  data: unknown;
  isLoading: boolean;
};

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let reactActEnvironmentDescriptor: PropertyDescriptor | undefined;
let runControlQueryResult: QueryResult;
let ancestryQueryResult: QueryResult;

function createSummary(overrides: SummaryOverrides = {}): RunControlSummary {
  const base: RunControlSummary = {
    taskRunId: "local_www_123",
    taskId: "task_123",
    orchestrationId: "local_www_123",
    agentName: "claude/haiku-4.5",
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
      providerSessionId: "session_local_1234567890",
      providerThreadId: undefined,
      replyChannel: undefined,
      sessionStatus: undefined,
      sessionMode: undefined,
      lastActiveAt: 1712307600000,
      hasActiveBinding: true,
    },
    timeout: {
      inactivityTimeoutMinutes: 45,
      status: "active",
    },
  };

  return {
    ...base,
    ...overrides,
    lifecycle: {
      ...base.lifecycle,
      ...overrides.lifecycle,
    },
    approvals: {
      ...base.approvals,
      ...overrides.approvals,
    },
    actions: {
      ...base.actions,
      ...overrides.actions,
    },
    continuation: {
      ...base.continuation,
      ...overrides.continuation,
    },
    timeout: {
      ...base.timeout,
      ...overrides.timeout,
    },
  };
}

beforeEach(() => {
  reactActEnvironmentDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "IS_REACT_ACT_ENVIRONMENT",
  );
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    value: true,
  });

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  runControlQueryResult = {
    data: createSummary(),
    isLoading: false,
  };
  ancestryQueryResult = {
    data: undefined,
    isLoading: false,
  };

  useQueryMock.mockImplementation((query: { queryKey?: unknown[] }) => {
    if (Array.isArray(query.queryKey) && query.queryKey[0] === "query") {
      return runControlQueryResult;
    }
    return ancestryQueryResult;
  });
  runControlOptionsMock.mockImplementation((options: unknown) => ({
    queryKey: ["query", options],
  }));
  convexQueryMock.mockImplementation((_ref, args: unknown) => ({
    queryKey: ["convex", args],
  }));
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  if (reactActEnvironmentDescriptor) {
    Object.defineProperty(
      globalThis,
      "IS_REACT_ACT_ENVIRONMENT",
      reactActEnvironmentDescriptor,
    );
  } else {
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  }
});

describe("RunInspectorPanel", () => {
  it("derives session-tab details from run-control summary when ancestry is unavailable", async () => {
    runControlQueryResult.data = createSummary({
      continuation: {
        providerSessionId: "session_local_1234567890",
        hasActiveBinding: true,
        lastActiveAt: 1712307600000,
      },
    });
    ancestryQueryResult.data = undefined;

    await act(async () => {
      root.render(
        <RunInspectorPanel runId="local_www_123" teamSlugOrId="team-dev" />,
      );
    });

    const sessionTab = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Session"),
    );
    expect(sessionTab?.textContent).toContain("bound");

    await act(async () => {
      sessionTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Claude Session");
    expect(container.textContent).toContain("Derived from run control");
    expect(container.textContent).toContain("session_continuation");
    expect(container.textContent).toContain("session_local");
  });

  it("prefers ancestry-backed session details when available", async () => {
    ancestryQueryResult.data = {
      hasBoundSession: true,
      provider: "codex",
      status: "active",
      mode: "resume",
      replyChannel: "ui",
      providerSessionId: null,
      providerThreadId: "thread_abcdef1234567890",
      isResumedSession: true,
      createdAt: 1712307500000,
      lastActiveAt: 1712307600000,
    };

    await act(async () => {
      root.render(
        <RunInspectorPanel
          runId="local_www_123"
          teamSlugOrId="team-dev"
          taskRunContextId={"tskrun_123" as never}
        />,
      );
    });

    const sessionTab = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Session"),
    );

    await act(async () => {
      sessionTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Codex Session");
    expect(container.textContent).toContain("Resumed");
    expect(container.textContent).toContain("resume");
    expect(container.textContent).toContain("ui");
    expect(container.textContent).toContain("thread_abcdef");
    expect(container.textContent).not.toContain("Derived from run control");
  });
});
