import { z } from "zod";

export const RUN_CONTROL_DEFAULT_TIMEOUT_MINUTES = 45;

export const RunControlActionSchema = z.enum([
  "resolve_approval",
  "continue_session",
  "resume_checkpoint",
  "append_instruction",
]);

export const RunControlContinuationModeSchema = z.enum([
  "session_continuation",
  "checkpoint_restore",
  "append_instruction",
  "none",
]);

export const RunControlInterruptionStatusSchema = z.enum([
  "none",
  "approval_pending",
  "paused_by_operator",
  "sandbox_paused",
  "context_overflow",
  "rate_limited",
  "timed_out",
  "checkpoint_pending",
  "handoff_pending",
  "user_input_required",
]);

export const RunControlLifecycleStatusSchema = z.enum([
  "active",
  "interrupted",
  "completed",
  "failed",
  "skipped",
]);

export const RunControlActivitySourceSchema = z.enum([
  "spawn",
  "file_write",
  "git_commit",
  "live_diff",
  "approval_resolved",
  "session_continue",
  "checkpoint_restore",
  "manual",
]);

export const RunControlTimeoutStatusSchema = z.enum([
  "active",
  "paused_for_approval",
  "timed_out",
]);

export const RunControlSummarySchema = z.object({
  taskRunId: z.string(),
  taskId: z.string(),
  orchestrationId: z.string().optional(),
  agentName: z.string().optional(),
  provider: z.string(),
  runStatus: z.enum(["pending", "running", "completed", "failed", "skipped"]),
  lifecycle: z.object({
    status: RunControlLifecycleStatusSchema,
    interrupted: z.boolean(),
    interruptionStatus: RunControlInterruptionStatusSchema,
    reason: z.string().optional(),
    blockedAt: z.number().optional(),
    expiresAt: z.number().optional(),
    resolvedAt: z.number().optional(),
    resolvedBy: z.string().optional(),
  }),
  approvals: z.object({
    pendingCount: z.number(),
    pendingRequestIds: z.array(z.string()),
    currentRequestId: z.string().optional(),
    latestRequestId: z.string().optional(),
    latestStatus: z
      .enum(["pending", "approved", "denied", "expired", "cancelled"])
      .optional(),
    latestApprovalType: z
      .enum([
        "tool_permission",
        "review_request",
        "deployment",
        "cost_override",
        "escalation",
        "risky_action",
      ])
      .optional(),
    latestAction: z.string().optional(),
    latestRiskLevel: z.enum(["low", "medium", "high"]).optional(),
    latestCreatedAt: z.number().optional(),
  }),
  actions: z.object({
    availableActions: z.array(RunControlActionSchema),
    canResolveApproval: z.boolean(),
    canContinueSession: z.boolean(),
    canResumeCheckpoint: z.boolean(),
    canAppendInstruction: z.boolean(),
  }),
  continuation: z.object({
    mode: RunControlContinuationModeSchema,
    providerSessionId: z.string().optional(),
    providerThreadId: z.string().optional(),
    resumeToken: z.string().optional(),
    resumeTargetId: z.string().optional(),
    checkpointRef: z.string().optional(),
    checkpointGeneration: z.number().optional(),
    replyChannel: z.enum(["mailbox", "sse", "pty", "ui"]).optional(),
    sessionStatus: z.enum(["active", "suspended", "expired", "terminated"]).optional(),
    sessionMode: z.enum(["head", "worker", "reviewer"]).optional(),
    lastActiveAt: z.number().optional(),
    hasActiveBinding: z.boolean(),
  }),
  timeout: z.object({
    inactivityTimeoutMinutes: z.number(),
    status: RunControlTimeoutStatusSchema,
    lastActivityAt: z.number().optional(),
    lastActivitySource: RunControlActivitySourceSchema.optional(),
    lastFileWriteAt: z.number().optional(),
    lastGitCommitAt: z.number().optional(),
    lastLiveDiffAt: z.number().optional(),
    lastCheckpointAt: z.number().optional(),
    nextTimeoutAt: z.number().optional(),
    timedOutAt: z.number().optional(),
    timeoutReason: z.string().optional(),
  }),
});

export const RunControlInspectRequestSchema = z.object({
  teamSlugOrId: z.string(),
});

export const RunControlApprovalRequestSchema = z.object({
  teamSlugOrId: z.string(),
  requestId: z.string().optional(),
  resolution: z
    .enum(["allow", "allow_once", "allow_session", "deny", "deny_always"])
    .default("allow_once"),
  note: z.string().optional(),
});

export const RunControlContinueRequestSchema = z.object({
  teamSlugOrId: z.string(),
  instruction: z.string().optional(),
  priority: z.enum(["high", "normal", "low"]).optional(),
});

export const RunControlResumeRequestSchema = z.object({
  teamSlugOrId: z.string(),
  instruction: z.string().optional(),
  priority: z.enum(["high", "normal", "low"]).optional(),
});

export const RunControlAppendInstructionRequestSchema = z.object({
  teamSlugOrId: z.string(),
  instruction: z.string().min(1),
  priority: z.enum(["high", "normal", "low"]).optional(),
});

export const RunControlCommandResponseSchema = z.object({
  success: z.boolean(),
  action: z.enum(["inspect", "approve", "continue", "resume", "append_instruction"]),
  summary: RunControlSummarySchema,
  requestId: z.string().optional(),
  queuedInputId: z.string().optional(),
  queueDepth: z.number().optional(),
  message: z.string().optional(),
});

export type RunControlAction = z.infer<typeof RunControlActionSchema>;
export type RunControlContinuationMode = z.infer<
  typeof RunControlContinuationModeSchema
>;
export type RunControlInterruptionStatus = z.infer<
  typeof RunControlInterruptionStatusSchema
>;
export type RunControlLifecycleStatus = z.infer<
  typeof RunControlLifecycleStatusSchema
>;
export type RunControlActivitySource = z.infer<
  typeof RunControlActivitySourceSchema
>;
export type RunControlTimeoutStatus = z.infer<
  typeof RunControlTimeoutStatusSchema
>;
export type RunControlSummary = z.infer<typeof RunControlSummarySchema>;
export type RunControlInspectRequest = z.infer<
  typeof RunControlInspectRequestSchema
>;
export type RunControlApprovalRequest = z.infer<
  typeof RunControlApprovalRequestSchema
>;
export type RunControlContinueRequest = z.infer<
  typeof RunControlContinueRequestSchema
>;
export type RunControlResumeRequest = z.infer<
  typeof RunControlResumeRequestSchema
>;
export type RunControlAppendInstructionRequest = z.infer<
  typeof RunControlAppendInstructionRequestSchema
>;
export type RunControlCommandResponse = z.infer<
  typeof RunControlCommandResponseSchema
>;
