// @vitest-environment jsdom

import type { Id } from "@cmux/convex/dataModel";
import type { RunControlSummary } from "@cmux/www-openapi-client";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RuntimeLifecycleCard } from "./RuntimeLifecycleCard";

type SummaryOverrides = Partial<
  Omit<RunControlSummary, "actions" | "approvals" | "continuation" | "lifecycle">
> & {
  actions?: Partial<RunControlSummary["actions"]>;
  approvals?: Partial<RunControlSummary["approvals"]>;
  continuation?: Partial<RunControlSummary["continuation"]>;
  lifecycle?: Partial<RunControlSummary["lifecycle"]>;
};

type MockQueryResult = {
  data?: RunControlSummary;
  error: unknown;
  isLoading: boolean;
};

const useQueryMock = vi.fn();
const runControlOptionsMock = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("@cmux/www-openapi-client/react-query", () => ({
  getApiV1CmuxOrchestrationRunControlByTaskRunIdOptions: (...args: unknown[]) =>
    runControlOptionsMock(...args),
}));

const taskRunId = "tskrun_test_123" as Id<"taskRuns">;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let queryResult: MockQueryResult;
let reactActEnvironmentDescriptor: PropertyDescriptor | undefined;

function createSummary(overrides: SummaryOverrides = {}): RunControlSummary {
  const base: RunControlSummary = {
    taskRunId,
    taskId: "task_123",
    orchestrationId: "orch_123",
    agentName: "codex/gpt-5.4-xhigh",
    provider: "codex",
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
      providerSessionId: "session_1234567890",
      providerThreadId: "thread_1234567890",
      sessionStatus: "active",
      lastActiveAt: 1710000000000,
      hasActiveBinding: true,
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

  queryResult = {
    data: undefined,
    error: null,
    isLoading: false,
  };

  useQueryMock.mockImplementation(() => queryResult);
  runControlOptionsMock.mockImplementation((options: unknown) => options);
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
      reactActEnvironmentDescriptor
    );
    return;
  }
  Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
});

describe("RuntimeLifecycleCard", () => {
  it("reads from the shared run-control summary and distinguishes session continuation", async () => {
    queryResult.data = createSummary();

    await act(async () => {
      root.render(
        <RuntimeLifecycleCard taskRunId={taskRunId} teamSlugOrId="team-dev" />
      );
    });

    expect(runControlOptionsMock).toHaveBeenCalledWith({
      path: { taskRunId },
      query: { teamSlugOrId: "team-dev" },
    });
    expect(container.textContent).toContain("Run Control");
    expect(container.textContent).toContain("Continue session");
    expect(container.textContent).toContain(
      "It does not restore from a checkpoint snapshot"
    );
    expect(container.textContent).not.toContain("Resume checkpoint");
  });

  it("prioritizes approval resolution when approvals block continuation", async () => {
    queryResult.data = createSummary({
      lifecycle: {
        status: "interrupted",
        interrupted: true,
        interruptionStatus: "approval_pending",
        reason: "Needs confirmation before editing production config",
      },
      approvals: {
        pendingCount: 1,
        pendingRequestIds: ["apr_123"],
        currentRequestId: "apr_123",
        latestRequestId: "apr_123",
        latestStatus: "pending",
        latestApprovalType: "risky_action",
        latestAction: "Edit production config",
        latestRiskLevel: "high",
        latestCreatedAt: 1710000000000,
      },
      actions: {
        availableActions: ["resolve_approval"],
        canResolveApproval: true,
        canContinueSession: false,
        canResumeCheckpoint: false,
        canAppendInstruction: false,
      },
      continuation: {
        mode: "none",
        providerSessionId: undefined,
        providerThreadId: undefined,
        sessionStatus: undefined,
        lastActiveAt: undefined,
      },
    });

    await act(async () => {
      root.render(
        <RuntimeLifecycleCard taskRunId={taskRunId} teamSlugOrId="team-dev" />
      );
    });

    expect(container.textContent).toContain("Resolve approval");
    expect(container.textContent).toContain("approval blocking continuation");
    expect(container.textContent).toContain("Edit production config");
    expect(container.textContent).toContain("Risk: High");
  });

  it("uses append-instruction wording instead of implying generic resume parity", async () => {
    queryResult.data = createSummary({
      actions: {
        availableActions: ["append_instruction"],
        canResolveApproval: false,
        canContinueSession: false,
        canResumeCheckpoint: false,
        canAppendInstruction: true,
      },
      continuation: {
        mode: "append_instruction",
        providerSessionId: undefined,
        providerThreadId: undefined,
        sessionStatus: undefined,
      },
    });

    await act(async () => {
      root.render(
        <RuntimeLifecycleCard taskRunId={taskRunId} teamSlugOrId="team-dev" />
      );
    });

    expect(container.textContent).toContain("Append instruction");
    expect(container.textContent).toContain(
      "use Append instruction rather than a generic resume"
    );
    expect(container.textContent).not.toContain("Resume checkpoint");
  });
});
