import type { Doc } from "./_generated/dataModel";

export type RunControlAction =
  | "resolve_approval"
  | "continue_session"
  | "resume_checkpoint"
  | "append_instruction";

export type RunControlContinuationMode =
  | "session_continuation"
  | "checkpoint_restore"
  | "append_instruction"
  | "none";

export type RunControlLifecycleStatus =
  | "active"
  | "interrupted"
  | "completed"
  | "failed"
  | "skipped";

export type RunControlInterruptionStatus =
  | NonNullable<Doc<"taskRuns">["interruptionState"]>["status"]
  | "none";

export type RunControlRun = {
  taskRunId: string;
  taskId: string;
  runStatus: Doc<"taskRuns">["status"];
  agentName?: string;
  orchestrationId?: string;
  codexThreadId?: string;
  interruptionState?: {
    status: NonNullable<Doc<"taskRuns">["interruptionState"]>["status"];
    reason?: string;
    approvalRequestId?: string;
    blockedAt?: number;
    expiresAt?: number;
    resumeToken?: string;
    resolvedAt?: number;
    resolvedBy?: string;
    providerSessionId?: string;
    resumeTargetId?: string;
    checkpointRef?: string;
    checkpointGeneration?: number;
  };
};

export type RunControlApproval = {
  requestId: string;
  status: Doc<"approvalRequests">["status"];
  approvalType: Doc<"approvalRequests">["approvalType"];
  action: string;
  createdAt: number;
  context: {
    riskLevel?: "low" | "medium" | "high";
  };
};

export type RunControlSessionBinding = {
  provider: Doc<"providerSessionBindings">["provider"];
  agentName: string;
  mode: Doc<"providerSessionBindings">["mode"];
  providerSessionId?: string;
  providerThreadId?: string;
  replyChannel?: Doc<"providerSessionBindings">["replyChannel"];
  status: Doc<"providerSessionBindings">["status"];
  lastActiveAt?: number;
};

export type RunControlSummary = {
  taskRunId: string;
  taskId: string;
  orchestrationId?: string;
  agentName?: string;
  provider: string;
  runStatus: Doc<"taskRuns">["status"];
  lifecycle: {
    status: RunControlLifecycleStatus;
    interrupted: boolean;
    interruptionStatus: RunControlInterruptionStatus;
    reason?: string;
    blockedAt?: number;
    expiresAt?: number;
    resolvedAt?: number;
    resolvedBy?: string;
  };
  approvals: {
    pendingCount: number;
    pendingRequestIds: string[];
    currentRequestId?: string;
    latestRequestId?: string;
    latestStatus?: Doc<"approvalRequests">["status"];
    latestApprovalType?: Doc<"approvalRequests">["approvalType"];
    latestAction?: string;
    latestRiskLevel?: "low" | "medium" | "high";
    latestCreatedAt?: number;
  };
  actions: {
    availableActions: RunControlAction[];
    canResolveApproval: boolean;
    canContinueSession: boolean;
    canResumeCheckpoint: boolean;
    canAppendInstruction: boolean;
  };
  continuation: {
    mode: RunControlContinuationMode;
    providerSessionId?: string;
    providerThreadId?: string;
    resumeToken?: string;
    resumeTargetId?: string;
    checkpointRef?: string;
    checkpointGeneration?: number;
    replyChannel?: Doc<"providerSessionBindings">["replyChannel"];
    sessionStatus?: Doc<"providerSessionBindings">["status"];
    sessionMode?: Doc<"providerSessionBindings">["mode"];
    lastActiveAt?: number;
    hasActiveBinding: boolean;
  };
};

function isTerminalRunStatus(status: Doc<"taskRuns">["status"]): boolean {
  return status === "completed" || status === "failed" || status === "skipped";
}

function deriveLifecycleStatus(
  runStatus: Doc<"taskRuns">["status"],
  interruptionStatus: RunControlInterruptionStatus,
): RunControlLifecycleStatus {
  if (interruptionStatus !== "none") {
    return "interrupted";
  }

  if (runStatus === "completed") {
    return "completed";
  }
  if (runStatus === "failed") {
    return "failed";
  }
  if (runStatus === "skipped") {
    return "skipped";
  }

  return "active";
}

function deriveEffectiveInterruptionStatus(input: {
  storedStatus?: RunControlInterruptionStatus;
  hasPendingApproval: boolean;
}): RunControlInterruptionStatus {
  if (input.storedStatus && input.storedStatus !== "none") {
    return input.storedStatus;
  }

  if (input.hasPendingApproval) {
    return "approval_pending";
  }

  return "none";
}

function deriveProvider(
  agentName?: string,
  sessionBinding?: RunControlSessionBinding | null,
): string {
  if (sessionBinding?.provider) {
    return sessionBinding.provider;
  }

  if (!agentName) {
    return "unknown";
  }

  const provider = agentName.split("/")[0]?.trim().toLowerCase();
  return provider || "unknown";
}

export function buildRunControlSummary(input: {
  run: RunControlRun;
  approvals: RunControlApproval[];
  sessionBinding: RunControlSessionBinding | null;
}): RunControlSummary {
  const { run, approvals, sessionBinding } = input;
  const approvalsByNewest = [...approvals].sort((a, b) => b.createdAt - a.createdAt);
  const pendingApprovals = approvalsByNewest.filter((approval) => approval.status === "pending");
  const interruptionStatus = deriveEffectiveInterruptionStatus({
    storedStatus: run.interruptionState?.status ?? "none",
    hasPendingApproval: pendingApprovals.length > 0,
  });
  const lifecycleStatus = deriveLifecycleStatus(run.runStatus, interruptionStatus);
  const terminalRun = isTerminalRunStatus(run.runStatus);
  const pendingRequestIds = pendingApprovals.map((approval) => approval.requestId);
  const latestApproval = approvalsByNewest[0];
  const currentRequestId =
    run.interruptionState?.approvalRequestId ?? pendingApprovals[0]?.requestId;

  const providerSessionId =
    sessionBinding?.providerSessionId ?? run.interruptionState?.providerSessionId;
  const providerThreadId =
    sessionBinding?.providerThreadId ?? run.codexThreadId;
  const hasActiveBinding = sessionBinding?.status === "active";
  const hasActiveSessionIdentifier = Boolean(providerSessionId || providerThreadId);
  const approvalBlocked =
    interruptionStatus === "approval_pending" || pendingApprovals.length > 0;
  const canResumeCheckpoint =
    !approvalBlocked &&
    !terminalRun &&
    interruptionStatus === "checkpoint_pending" &&
    Boolean(run.interruptionState?.checkpointRef);
  const canContinueSession =
    !approvalBlocked &&
    !terminalRun &&
    interruptionStatus !== "checkpoint_pending" &&
    hasActiveSessionIdentifier &&
    (sessionBinding ? hasActiveBinding : true);
  const canAppendInstruction =
    !approvalBlocked &&
    !terminalRun &&
    !canContinueSession &&
    !canResumeCheckpoint;
  const canResolveApproval = pendingApprovals.length > 0;

  const availableActions: RunControlAction[] = [];
  if (canResolveApproval) {
    availableActions.push("resolve_approval");
  }
  if (canContinueSession) {
    availableActions.push("continue_session");
  }
  if (canResumeCheckpoint) {
    availableActions.push("resume_checkpoint");
  }
  if (canAppendInstruction) {
    availableActions.push("append_instruction");
  }

  let continuationMode: RunControlContinuationMode = "none";
  if (canResumeCheckpoint) {
    continuationMode = "checkpoint_restore";
  } else if (canContinueSession) {
    continuationMode = "session_continuation";
  } else if (canAppendInstruction) {
    continuationMode = "append_instruction";
  }

  return {
    taskRunId: run.taskRunId,
    taskId: run.taskId,
    orchestrationId: run.orchestrationId,
    agentName: run.agentName,
    provider: deriveProvider(run.agentName, sessionBinding),
    runStatus: run.runStatus,
    lifecycle: {
      status: lifecycleStatus,
      interrupted: interruptionStatus !== "none",
      interruptionStatus,
      reason: run.interruptionState?.reason,
      blockedAt: run.interruptionState?.blockedAt,
      expiresAt: run.interruptionState?.expiresAt,
      resolvedAt: run.interruptionState?.resolvedAt,
      resolvedBy: run.interruptionState?.resolvedBy,
    },
    approvals: {
      pendingCount: pendingApprovals.length,
      pendingRequestIds,
      currentRequestId,
      latestRequestId: latestApproval?.requestId,
      latestStatus: latestApproval?.status,
      latestApprovalType: latestApproval?.approvalType,
      latestAction: latestApproval?.action,
      latestRiskLevel: latestApproval?.context.riskLevel,
      latestCreatedAt: latestApproval?.createdAt,
    },
    actions: {
      availableActions,
      canResolveApproval,
      canContinueSession,
      canResumeCheckpoint,
      canAppendInstruction,
    },
    continuation: {
      mode: continuationMode,
      providerSessionId,
      providerThreadId,
      resumeToken: run.interruptionState?.resumeToken,
      resumeTargetId: run.interruptionState?.resumeTargetId,
      checkpointRef: run.interruptionState?.checkpointRef,
      checkpointGeneration: run.interruptionState?.checkpointGeneration,
      replyChannel: sessionBinding?.replyChannel,
      sessionStatus: sessionBinding?.status,
      sessionMode: sessionBinding?.mode,
      lastActiveAt: sessionBinding?.lastActiveAt,
      hasActiveBinding,
    },
  };
}
