import { describe, expect, it } from "vitest";
import {
  buildRunControlSummary,
  type RunControlApproval,
  type RunControlRun,
  type RunControlSessionBinding,
} from "./runControlSummary";

function createRun(overrides?: Partial<RunControlRun>): RunControlRun {
  return {
    taskRunId: "run_123",
    taskId: "task_123",
    runStatus: "running",
    agentName: "claude/sonnet-4",
    orchestrationId: "orch_123",
    interruptionState: undefined,
    codexThreadId: undefined,
    ...overrides,
  };
}

function createApproval(overrides?: Partial<RunControlApproval>): RunControlApproval {
  return {
    requestId: "apr_123",
    status: "pending",
    approvalType: "tool_permission",
    action: "Bash: rm -rf node_modules",
    createdAt: 100,
    context: {},
    ...overrides,
  };
}

function createBinding(
  overrides?: Partial<RunControlSessionBinding>,
): RunControlSessionBinding {
  return {
    provider: "claude",
    agentName: "claude/sonnet-4",
    mode: "worker",
    providerSessionId: "sess_123",
    providerThreadId: undefined,
    replyChannel: "sse",
    status: "active",
    lastActiveAt: 200,
    ...overrides,
  };
}

describe("runControlSummary", () => {
  it("prioritizes approval resolution over continuation lanes", () => {
    const summary = buildRunControlSummary({
      run: createRun({
        interruptionState: {
          status: "approval_pending",
          approvalRequestId: "apr_456",
          blockedAt: 111,
          providerSessionId: "sess_123",
        },
      }),
      approvals: [createApproval({ requestId: "apr_456" })],
      sessionBinding: createBinding(),
    });

    expect(summary.actions.canResolveApproval).toBe(true);
    expect(summary.actions.canContinueSession).toBe(false);
    expect(summary.actions.canResumeCheckpoint).toBe(false);
    expect(summary.actions.canAppendInstruction).toBe(false);
    expect(summary.actions.availableActions).toEqual(["resolve_approval"]);
    expect(summary.continuation.mode).toBe("none");
    expect(summary.approvals.currentRequestId).toBe("apr_456");
    expect(summary.timeout.status).toBe("paused_for_approval");
  });

  it("surfaces checkpoint restore as the primary continuation mode", () => {
    const summary = buildRunControlSummary({
      run: createRun({
        interruptionState: {
          status: "checkpoint_pending",
          checkpointRef: "cp_123",
          checkpointGeneration: 2,
          blockedAt: 111,
        },
      }),
      approvals: [],
      sessionBinding: createBinding(),
    });

    expect(summary.actions.canResumeCheckpoint).toBe(true);
    expect(summary.actions.canContinueSession).toBe(false);
    expect(summary.actions.availableActions).toEqual(["resume_checkpoint"]);
    expect(summary.continuation.mode).toBe("checkpoint_restore");
    expect(summary.continuation.checkpointRef).toBe("cp_123");
  });

  it("uses an active session binding for session continuation", () => {
    const summary = buildRunControlSummary({
      run: createRun({
        agentName: "codex/gpt-5.1-codex",
      }),
      approvals: [],
      sessionBinding: createBinding({
        provider: "codex",
        agentName: "codex/gpt-5.1-codex",
        providerSessionId: undefined,
        providerThreadId: "thread_123",
      }),
    });

    expect(summary.provider).toBe("codex");
    expect(summary.actions.canContinueSession).toBe(true);
    expect(summary.actions.availableActions).toEqual(["continue_session"]);
    expect(summary.continuation.mode).toBe("session_continuation");
    expect(summary.continuation.providerThreadId).toBe("thread_123");
  });

  it("falls back to append instruction when no active continuation exists", () => {
    const summary = buildRunControlSummary({
      run: createRun({
        agentName: "gemini/pro",
        interruptionState: {
          status: "user_input_required",
          blockedAt: 111,
        },
      }),
      approvals: [],
      sessionBinding: createBinding({
        provider: "gemini",
        agentName: "gemini/pro",
        providerSessionId: undefined,
        status: "terminated",
      }),
    });

    expect(summary.actions.canContinueSession).toBe(false);
    expect(summary.actions.canAppendInstruction).toBe(true);
    expect(summary.actions.availableActions).toEqual(["append_instruction"]);
    expect(summary.continuation.mode).toBe("append_instruction");
  });

  it("uses the stored codex thread id when no session binding exists", () => {
    const summary = buildRunControlSummary({
      run: createRun({
        agentName: "codex/gpt-5.1-codex",
        codexThreadId: "thread_fallback",
      }),
      approvals: [],
      sessionBinding: null,
    });

    expect(summary.actions.canContinueSession).toBe(true);
    expect(summary.continuation.providerThreadId).toBe("thread_fallback");
    expect(summary.continuation.mode).toBe("session_continuation");
  });

  it("returns no actions for terminal runs", () => {
    const summary = buildRunControlSummary({
      run: createRun({
        runStatus: "completed",
      }),
      approvals: [],
      sessionBinding: createBinding(),
    });

    expect(summary.lifecycle.status).toBe("completed");
    expect(summary.actions.availableActions).toEqual([]);
    expect(summary.continuation.mode).toBe("none");
    expect(summary.timeout.nextTimeoutAt).toBeUndefined();
  });

  it("derives latest approval fields from newest createdAt even when input is unsorted", () => {
    const summary = buildRunControlSummary({
      run: createRun({
        interruptionState: {
          status: "approval_pending",
        },
      }),
      approvals: [
        createApproval({
          requestId: "apr_old",
          createdAt: 100,
          action: "older action",
        }),
        createApproval({
          requestId: "apr_new",
          createdAt: 300,
          action: "newer action",
          context: { riskLevel: "high" },
        }),
      ],
      sessionBinding: createBinding(),
    });

    expect(summary.approvals.latestRequestId).toBe("apr_new");
    expect(summary.approvals.latestAction).toBe("newer action");
    expect(summary.approvals.latestRiskLevel).toBe("high");
    expect(summary.approvals.pendingRequestIds).toEqual(["apr_new", "apr_old"]);
  });

  it("treats pending approvals as interrupted even without stored interruption state", () => {
    const summary = buildRunControlSummary({
      run: createRun(),
      approvals: [createApproval()],
      sessionBinding: createBinding(),
    });

    expect(summary.lifecycle.status).toBe("interrupted");
    expect(summary.lifecycle.interrupted).toBe(true);
    expect(summary.lifecycle.interruptionStatus).toBe("approval_pending");
    expect(summary.actions.canResolveApproval).toBe(true);
    expect(summary.actions.canContinueSession).toBe(false);
    expect(summary.actions.availableActions).toEqual(["resolve_approval"]);
    expect(summary.timeout.status).toBe("paused_for_approval");
  });

  it("surfaces timeout metadata and keeps terminal failures as failed", () => {
    const summary = buildRunControlSummary({
      run: createRun({
        runStatus: "failed",
        interruptionState: {
          status: "timed_out",
          reason: "Timed out waiting for activity",
          blockedAt: 2_000,
        },
        runControlState: {
          inactivityTimeoutMinutes: 45,
          lastActivityAt: 1_000,
          lastActivitySource: "live_diff",
          lastLiveDiffAt: 1_000,
          timeoutTriggeredAt: 3_000,
          timeoutReason: "No activity detected for 45 minutes",
        },
      }),
      approvals: [],
      sessionBinding: createBinding(),
    });

    expect(summary.lifecycle.status).toBe("failed");
    expect(summary.lifecycle.interruptionStatus).toBe("timed_out");
    expect(summary.timeout.status).toBe("timed_out");
    expect(summary.timeout.lastActivitySource).toBe("live_diff");
    expect(summary.timeout.timedOutAt).toBe(3_000);
    expect(summary.timeout.timeoutReason).toBe(
      "No activity detected for 45 minutes",
    );
  });
});
