import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  devboxProviderValidator,
  runtimeProviderValidator,
  snapshotProviderValidator,
} from "../_shared/provider-validators";

const convexSchema = defineSchema({
  teams: defineTable({
    teamId: v.string(),
    // Human-friendly slug used in URLs (internal)
    slug: v.optional(v.string()),
    // Display name from Stack (display_name)
    displayName: v.optional(v.string()),
    // Optional alternate/internal name
    name: v.optional(v.string()),
    // Profile image URL (Stack may send null; omit when null)
    profileImageUrl: v.optional(v.string()),
    // Client metadata blobs from Stack
    clientMetadata: v.optional(v.any()),
    clientReadOnlyMetadata: v.optional(v.any()),
    // Server metadata from Stack
    serverMetadata: v.optional(v.any()),
    // Timestamp from Stack (created_at_millis)
    createdAtMillis: v.optional(v.number()),
    // Local bookkeeping
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_teamId", ["teamId"]) // For fast resolution by teamId
    .index("by_slug", ["slug"]), // For resolving slug -> teamId
  // Stack team membership records
  teamMemberships: defineTable({
    teamId: v.string(), // canonical team UUID
    userId: v.string(),
    role: v.optional(v.union(v.literal("owner"), v.literal("member"))),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_team_user", ["teamId", "userId"]) // check membership quickly
    .index("by_user", ["userId"]) // list teams for a user
    .index("by_team", ["teamId"]),
  // Stack team permission assignments
  teamPermissions: defineTable({
    teamId: v.string(),
    userId: v.string(),
    permissionId: v.string(), // e.g., "$update_team" or "team_member"
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_team_user", ["teamId", "userId"]) // list permissions for a user in team
    .index("by_user", ["userId"]) // all permissions for a user
    .index("by_team", ["teamId"]) // all permissions in a team
    .index("by_team_user_perm", ["teamId", "userId", "permissionId"]),
  // Stack user directory
  users: defineTable({
    userId: v.string(),
    // Basic identity
    primaryEmail: v.optional(v.string()), // nulls omitted
    primaryEmailVerified: v.optional(v.boolean()),
    primaryEmailAuthEnabled: v.optional(v.boolean()),
    displayName: v.optional(v.string()),
    profileImageUrl: v.optional(v.string()),
    // Team selection
    selectedTeamId: v.optional(v.string()),
    selectedTeamDisplayName: v.optional(v.string()),
    selectedTeamProfileImageUrl: v.optional(v.string()),
    // Security flags
    hasPassword: v.optional(v.boolean()),
    otpAuthEnabled: v.optional(v.boolean()),
    passkeyAuthEnabled: v.optional(v.boolean()),
    // Timestamps from Stack
    signedUpAtMillis: v.optional(v.number()),
    lastActiveAtMillis: v.optional(v.number()),
    // Metadata blobs
    clientMetadata: v.optional(v.any()),
    clientReadOnlyMetadata: v.optional(v.any()),
    serverMetadata: v.optional(v.any()),
    // OAuth providers observed in webhook payloads
    oauthProviders: v.optional(
      v.array(
        v.object({
          id: v.string(),
          accountId: v.string(),
          email: v.optional(v.string()),
        })
      )
    ),
    // Anonymous flag
    isAnonymous: v.optional(v.boolean()),
    // Onboarding
    onboardingCompletedAt: v.optional(v.number()), // Timestamp when user completed/skipped onboarding
    // Local bookkeeping
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"]) // For fast lookup by Stack user id
    .index("by_email", ["primaryEmail"])
    .index("by_selected_team", ["selectedTeamId"]),
  tasks: defineTable({
    text: v.string(),
    isCompleted: v.boolean(),
    isArchived: v.optional(v.boolean()),
    pinned: v.optional(v.boolean()),
    isPreview: v.optional(v.boolean()),
    isLocalWorkspace: v.optional(v.boolean()),
    isCloudWorkspace: v.optional(v.boolean()),
    linkedFromCloudTaskRunId: v.optional(v.id("taskRuns")), // For local workspaces created from a cloud task run's git diff viewer
    description: v.optional(v.string()),
    pullRequestTitle: v.optional(v.string()),
    pullRequestDescription: v.optional(v.string()),
    projectFullName: v.optional(v.string()),
    baseBranch: v.optional(v.string()),
    worktreePath: v.optional(v.string()),
    generatedBranchName: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    lastActivityAt: v.optional(v.number()), // Updated on run start or notification received, for sorting
    userId: v.string(), // Link to user who created the task
    teamId: v.string(),
    environmentId: v.optional(v.id("environments")),
    crownEvaluationStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("in_progress"),
        v.literal("succeeded"),
        v.literal("error"),
      ),
    ), // State of crown evaluation workflow
    crownEvaluationError: v.optional(v.string()), // Error message if crown evaluation failed
    /** Stored evaluation data for retry (JSON string with prompt, candidates, etc.) */
    crownEvaluationRetryData: v.optional(v.string()),
    /** Number of times the user has retried crown evaluation */
    crownEvaluationRetryCount: v.optional(v.number()),
    /** Timestamp of the last retry attempt */
    crownEvaluationLastRetryAt: v.optional(v.number()),
    /** True when refreshing a succeeded evaluation (vs retrying a failed one) */
    crownEvaluationIsRefreshing: v.optional(v.boolean()),
    mergeStatus: v.optional(
      v.union(
        v.literal("none"), // No PR activity yet
        v.literal("pr_draft"), // PR created as draft
        v.literal("pr_open"), // PR opened and ready for review
        v.literal("pr_approved"), // PR has been approved
        v.literal("pr_changes_requested"), // PR has changes requested
        v.literal("pr_merged"), // PR has been merged
        v.literal("pr_closed") // PR closed without merging
      )
    ),
    images: v.optional(
      v.array(
        v.object({
          storageId: v.id("_storage"), // Convex storage ID
          fileName: v.optional(v.string()),
          altText: v.string(),
        })
      )
    ),
    screenshotStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("running"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("skipped"),
      ),
    ),
    screenshotRunId: v.optional(v.id("taskRuns")),
    screenshotRequestId: v.optional(v.string()),
    screenshotRequestedAt: v.optional(v.number()),
    screenshotCompletedAt: v.optional(v.number()),
    screenshotError: v.optional(v.string()),
    screenshotStorageId: v.optional(v.id("_storage")),
    screenshotMimeType: v.optional(v.string()),
    screenshotFileName: v.optional(v.string()),
    screenshotCommitSha: v.optional(v.string()),
    latestScreenshotSetId: v.optional(v.id("taskRunScreenshotSets")),
    /** Denormalized: ID of the selected task run (crowned run, or latest non-archived run) */
    selectedTaskRunId: v.optional(v.id("taskRuns")),
    // GitHub Projects v2 linkage (Phase 2: Task <-> Project Linkage)
    githubProjectId: v.optional(v.string()), // Project node ID (PVT_xxx)
    githubProjectItemId: v.optional(v.string()), // Project item node ID (PVTI_xxx)
    githubProjectInstallationId: v.optional(v.number()), // GitHub App installation ID
    githubProjectOwner: v.optional(v.string()), // Project owner login (org or user)
    githubProjectOwnerType: v.optional(v.string()), // "organization" or "user"
  })
    .index("by_created", ["createdAt"])
    .index("by_user", ["userId", "createdAt"])
    .index("by_team_user", ["teamId", "userId"])
    .index("by_team_user_archived", ["teamId", "userId", "isArchived"])
    .index("by_team_user_created", ["teamId", "userId", "createdAt"])
    .index("by_team_user_merge_updated", ["teamId", "userId", "mergeStatus", "updatedAt"])
    .index("by_team_user_activity", ["teamId", "userId", "lastActivityAt"])
    .index("by_team_user_active", ["teamId", "userId", "isArchived", "isPreview", "lastActivityAt"])
    .index("by_pinned", ["pinned", "teamId", "userId"])
    .index("by_team_user_preview", ["teamId", "userId", "isPreview"])
    .index("by_team_preview", ["teamId", "isPreview"])
    .index("by_linked_cloud_task_run", ["linkedFromCloudTaskRunId"])
    .index("by_crown_status", ["crownEvaluationStatus", "updatedAt"])
    .index("by_github_project_item", ["githubProjectItemId"]),

  taskRuns: defineTable({
    taskId: v.id("tasks"),
    parentRunId: v.optional(v.id("taskRuns")), // For tree structure
    startingCommitSha: v.optional(v.string()), // Commit SHA when run started (for diff baseline)
    prompt: v.string(), // The prompt that will be passed to claude
    agentName: v.optional(v.string()), // Name of the agent that ran this task (e.g., "claude/sonnet-4")
    selectedVariant: v.optional(v.string()), // Optional effort/reasoning selection for this run
    taskClass: v.optional(
      v.union(
        v.literal("routine"),
        v.literal("deep-coding"),
        v.literal("review"),
        v.literal("eval"),
        v.literal("architecture"),
        v.literal("large-context")
      )
    ), // Task class for automatic model selection
    agentSelectionSource: v.optional(
      v.union(
        v.literal("explicit"),
        v.literal("task-class-default"),
        v.literal("system-default")
      )
    ), // How the agent was selected
    summary: v.optional(v.string()), // Markdown summary of the run
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("skipped")
    ),
    isArchived: v.optional(v.boolean()), // Whether this run is hidden from default views
    isLocalWorkspace: v.optional(v.boolean()),
    isCloudWorkspace: v.optional(v.boolean()),
    isPreviewJob: v.optional(v.boolean()), // Whether this is a preview job that should auto-run screenshots
    // Optional log retained for backward compatibility; no longer written to.
    log: v.optional(v.string()), // CLI output log (deprecated)
    worktreePath: v.optional(v.string()), // Path to the git worktree for this run
    newBranch: v.optional(v.string()), // The generated branch name for this run
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
    exitCode: v.optional(v.number()),
    environmentError: v.optional(
      v.object({
        devError: v.optional(v.string()),
        maintenanceError: v.optional(v.string()),
      }),
    ),
    errorMessage: v.optional(v.string()), // Error message when run fails early
    userId: v.string(), // Link to user who created the run
    teamId: v.string(),
    environmentId: v.optional(v.id("environments")),
    isCrowned: v.optional(v.boolean()), // Whether this run won the crown evaluation
    crownReason: v.optional(v.string()), // LLM's reasoning for why this run was crowned
    pullRequestUrl: v.optional(v.string()), // URL of the PR
    pullRequestIsDraft: v.optional(v.boolean()), // Whether the PR is a draft
    pullRequestState: v.optional(
      v.union(
        v.literal("none"), // no PR exists yet
        v.literal("draft"), // PR exists and is draft
        v.literal("open"), // PR exists and is open/ready for review
        v.literal("merged"), // PR merged
        v.literal("closed"), // PR closed without merge
        v.literal("unknown") // fallback/unsure
      )
    ),
    pullRequestNumber: v.optional(v.number()), // Numeric PR number on provider
    pullRequests: v.optional(
      v.array(
        v.object({
          repoFullName: v.string(),
          url: v.optional(v.string()),
          number: v.optional(v.number()),
          state: v.union(
            v.literal("none"),
            v.literal("draft"),
            v.literal("open"),
            v.literal("merged"),
            v.literal("closed"),
            v.literal("unknown")
          ),
          isDraft: v.optional(v.boolean()),
        })
      )
    ),
    diffsLastUpdated: v.optional(v.number()), // Timestamp when diffs were last fetched/updated
    screenshotStorageId: v.optional(v.id("_storage")),
    screenshotCapturedAt: v.optional(v.number()),
    screenshotMimeType: v.optional(v.string()),
    screenshotFileName: v.optional(v.string()),
    screenshotCommitSha: v.optional(v.string()),
    latestScreenshotSetId: v.optional(v.id("taskRunScreenshotSets")),
    // AI-generated claims about the run (for verification/review)
    claims: v.optional(
      v.array(
        v.object({
          claim: v.string(),
          evidence: v.object({
            type: v.string(),
            screenshotIndex: v.optional(v.number()),
            filePath: v.optional(v.string()),
            startLine: v.optional(v.number()),
            endLine: v.optional(v.number()),
          }),
          timestamp: v.number(),
        })
      )
    ),
    claimsGeneratedAt: v.optional(v.number()),
    // VSCode instance information
    vscode: v.optional(
      v.object({
        provider: runtimeProviderValidator, // Extensible for future providers
        containerName: v.optional(v.string()), // For Docker provider
        status: v.union(
          v.literal("starting"),
          v.literal("running"),
          v.literal("stopped")
        ),
        statusMessage: v.optional(v.string()), // Human-readable status (e.g., "Pulling Docker image...")
        ports: v.optional(
          v.object({
            vscode: v.string(),
            worker: v.string(),
            extension: v.optional(v.string()),
            proxy: v.optional(v.string()),
            vnc: v.optional(v.string()),
          })
        ),
        url: v.optional(v.string()), // The VSCode URL
        workspaceUrl: v.optional(v.string()), // The workspace URL
        vncUrl: v.optional(v.string()), // The VNC websocket URL for browser preview
        xtermUrl: v.optional(v.string()), // The xterm terminal backend URL
        startedAt: v.optional(v.number()),
        stoppedAt: v.optional(v.number()),
        lastAccessedAt: v.optional(v.number()), // Track when user last accessed the container
        keepAlive: v.optional(v.boolean()), // User requested to keep container running
        scheduledStopAt: v.optional(v.number()), // When container is scheduled to stop
      })
    ),
    networking: v.optional(
      v.array(
        v.object({
          status: v.union(
            v.literal("starting"),
            v.literal("running"),
            v.literal("stopped")
          ),
          port: v.number(),
          url: v.string(),
        })
      )
    ),
    customPreviews: v.optional(
      v.array(
        v.object({
          url: v.string(),
          createdAt: v.number(),
        })
      )
    ),
    // Auto-discovered git repos in the sandbox (for custom environments where user clones repos)
    discoveredRepos: v.optional(v.array(v.string())), // GitHub repos found in sandbox (e.g., ["owner/repo"])
    // Orchestration head agent fields (Phase 1)
    isOrchestrationHead: v.optional(v.boolean()), // Whether this run is an orchestration head agent
    orchestrationId: v.optional(v.string()), // Unique orchestration ID for this head agent session
    orchestrationHeartbeat: v.optional(v.number()), // Last heartbeat from head agent (epoch ms)
    orchestrationStatus: v.optional(
      v.union(
        v.literal("running"),
        v.literal("completed"),
        v.literal("failed")
      )
    ), // Head agent's reported status
    // PTY session tracking for terminal attachment/reconnection
    ptySessionId: v.optional(v.string()), // cmux-pty session ID or tmux session name
    ptyBackend: v.optional(v.union(v.literal("cmux-pty"), v.literal("tmux"))), // Which backend manages the terminal
    // Autopilot mode (Phase 6: Long-Running Sessions)
    autopilotConfig: v.optional(
      v.object({
        enabled: v.boolean(),
        totalMinutes: v.number(), // Total autopilot duration in minutes
        turnMinutes: v.number(), // Minutes per turn
        wrapUpMinutes: v.number(), // Time before deadline to wrap up
        startedAt: v.number(), // When autopilot started (epoch ms)
        lastHeartbeat: v.optional(v.number()), // Last heartbeat timestamp (epoch ms)
      })
    ),
    autopilotStatus: v.optional(
      v.union(
        v.literal("running"),
        v.literal("paused"),
        v.literal("wrap-up"),
        v.literal("completed"),
        v.literal("stopped")
      )
    ),
    codexThreadId: v.optional(v.string()), // Codex CLI thread-id for session resume
    // PR Comment → Agent: link back to source comment for result posting
    githubCommentId: v.optional(v.number()), // GitHub comment ID that triggered this run
    githubCommentUrl: v.optional(v.string()), // URL to the source comment
    // Phase 2: Operator visual verification status
    operatorVerificationStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("running"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("skipped")
      )
    ),
    operatorVerificationError: v.optional(v.string()),
    // Context usage tracking (Phase 5c)
    contextUsage: v.optional(
      v.object({
        totalInputTokens: v.number(), // Cumulative input tokens
        totalOutputTokens: v.number(), // Cumulative output tokens
        contextWindow: v.optional(v.number()), // Model's context window size
        usagePercent: v.optional(v.number()), // Current usage as percentage of context window
        lastUpdated: v.number(), // Timestamp of last update
      })
    ),
    // Interruption state (Phase 7: Unified pause/approval model, P2: Runtime interruptions)
    // Tracks when an agent is blocked and why, enabling unified handling of
    // approvals, operator pauses, sandbox pauses, and checkpoint-based resume
    interruptionState: v.optional(
      v.object({
        status: v.union(
          v.literal("none"), // Not interrupted
          v.literal("approval_pending"), // Waiting for approval (linked to approvalRequests)
          v.literal("paused_by_operator"), // Operator requested pause
          v.literal("sandbox_paused"), // Underlying sandbox is paused
          v.literal("context_overflow"), // Context window exceeded
          v.literal("rate_limited"), // Provider rate limit hit
          v.literal("timed_out"), // Approval or action timed out
          // P2: Extended interruption types for generalized runtime model
          v.literal("checkpoint_pending"), // Waiting for checkpoint save to complete
          v.literal("handoff_pending"), // Waiting for handoff to another agent
          v.literal("user_input_required") // Waiting for user elicitation response
        ),
        reason: v.optional(v.string()), // Human-readable explanation
        approvalRequestId: v.optional(v.string()), // Link to approvalRequests.requestId
        blockedAt: v.number(), // When interruption started
        expiresAt: v.optional(v.number()), // Auto-resume or expire time
        resumeToken: v.optional(v.string()), // Provider-specific resume state
        resolvedAt: v.optional(v.number()), // When interruption was resolved
        resolvedBy: v.optional(v.string()), // User ID who resolved
        // P2: Provider session binding for resume ancestry
        providerSessionId: v.optional(v.string()), // Provider's session/thread ID (e.g., Codex thread_id)
        resumeTargetId: v.optional(v.string()), // Target for SendMessage resume (agent or session ID)
        // P2: Checkpoint reference for replay-safe resume
        checkpointRef: v.optional(v.string()), // Reference to checkpoint state (LangGraph-style)
        checkpointGeneration: v.optional(v.number()), // Monotonic counter for checkpoint ordering
      })
    ),
    runControlState: v.optional(
      v.object({
        inactivityTimeoutMinutes: v.number(),
        lastActivityAt: v.number(),
        lastActivitySource: v.union(
          v.literal("spawn"),
          v.literal("file_write"),
          v.literal("git_commit"),
          v.literal("live_diff"),
          v.literal("approval_resolved"),
          v.literal("session_continue"),
          v.literal("checkpoint_restore"),
          v.literal("manual")
        ),
        lastFileWriteAt: v.optional(v.number()),
        lastGitCommitAt: v.optional(v.number()),
        lastLiveDiffAt: v.optional(v.number()),
        lastCheckpointAt: v.optional(v.number()),
        timeoutTriggeredAt: v.optional(v.number()),
        timeoutReason: v.optional(v.string()),
      })
    ),
    // /simplify pre-merge gate tracking
    simplifyPassedAt: v.optional(v.number()), // Timestamp when /simplify completed successfully
    simplifyMode: v.optional(v.string()), // Which mode was used: "quick", "full", "staged-only"
    simplifySkippedReason: v.optional(v.string()), // If skipped, why (e.g., "no code changes", "user override")
  })
    .index("by_task", ["taskId", "createdAt"])
    .index("by_parent", ["parentRunId"])
    .index("by_status", ["status"])
    .index("by_vscode_status", ["vscode.status"])
    .index("by_vscode_container_name", ["vscode.containerName"])
    .index("by_user", ["userId", "createdAt"])
    .index("by_team_user", ["teamId", "userId"])
    .index("by_team_user_status_created", ["teamId", "userId", "status", "createdAt"])
    .index("by_pull_request_url", ["pullRequestUrl"])
    .index("by_orchestration_head_status", ["isOrchestrationHead", "orchestrationStatus"])
    .index("by_orchestration_head_status_heartbeat", [
      "isOrchestrationHead",
      "orchestrationStatus",
      "orchestrationHeartbeat",
    ])
    .index("by_team_orchestration_head", ["teamId", "orchestrationId", "isOrchestrationHead"])
    .index("by_task_class", ["taskClass", "createdAt"]),

  // Junction table linking taskRuns to pull requests by PR identity
  // Enables efficient lookup of taskRuns when a PR webhook fires
  taskRunPullRequests: defineTable({
    taskRunId: v.id("taskRuns"),
    teamId: v.string(),
    repoFullName: v.string(), // owner/repo
    prNumber: v.number(),
    createdAt: v.number(),
  })
    .index("by_task_run", ["taskRunId"])
    .index("by_pr", ["teamId", "repoFullName", "prNumber"]),

  taskRunScreenshotSets: defineTable({
    taskId: v.id("tasks"),
    runId: v.id("taskRuns"),
    status: v.union(
      v.literal("completed"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    hasUiChanges: v.optional(v.boolean()),
    commitSha: v.optional(v.string()),
    capturedAt: v.number(),
    error: v.optional(v.string()),
    images: v.array(
      v.object({
        storageId: v.id("_storage"),
        mimeType: v.string(),
        fileName: v.optional(v.string()),
        // @deprecated - use the top-level commitSha field instead
        commitSha: v.optional(v.string()),
        description: v.optional(v.string()),
      }),
    ),
    videos: v.optional(
      v.array(
        v.object({
          storageId: v.id("_storage"),
          mimeType: v.string(),
          fileName: v.optional(v.string()),
          description: v.optional(v.string()),
        }),
      ),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_task_capturedAt", ["taskId", "capturedAt"])
    .index("by_run_capturedAt", ["runId", "capturedAt"]),
  taskVersions: defineTable({
    taskId: v.id("tasks"),
    version: v.number(),
    diff: v.string(),
    summary: v.string(),
    createdAt: v.number(),
    userId: v.string(),
    teamId: v.string(),
    files: v.array(
      v.object({
        path: v.string(),
        changes: v.string(),
      })
    ),
  })
    .index("by_task", ["taskId", "version"])
    .index("by_team_user", ["teamId", "userId"]),

  automatedCodeReviewJobs: defineTable({
    teamId: v.optional(v.string()),
    repoFullName: v.string(),
    repoUrl: v.string(),
    prNumber: v.optional(v.number()),
    commitRef: v.string(),
    headCommitRef: v.optional(v.string()),
    baseCommitRef: v.optional(v.string()),
    requestedByUserId: v.string(),
    jobType: v.optional(v.union(v.literal("pull_request"), v.literal("comparison"))),
    comparisonSlug: v.optional(v.string()),
    comparisonBaseOwner: v.optional(v.string()),
    comparisonBaseRef: v.optional(v.string()),
    comparisonHeadOwner: v.optional(v.string()),
    comparisonHeadRef: v.optional(v.string()),
    state: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    sandboxInstanceId: v.optional(v.string()), // `morphvm_` prefix indicates Morph-managed instance IDs
    callbackTokenHash: v.optional(v.string()),
    callbackTokenIssuedAt: v.optional(v.number()),
    errorCode: v.optional(v.string()),
    errorDetail: v.optional(v.string()),
    codeReviewOutput: v.optional(v.record(v.string(), v.any())),
  })
    .index("by_team_repo_pr", ["teamId", "repoFullName", "prNumber", "createdAt"])
    .index("by_team_repo_pr_updated", [
      "teamId",
      "repoFullName",
      "prNumber",
      "updatedAt",
    ])
    .index("by_team_repo_comparison", [
      "teamId",
      "repoFullName",
      "comparisonSlug",
      "createdAt",
    ])
    .index("by_team_repo_comparison_updated", [
      "teamId",
      "repoFullName",
      "comparisonSlug",
      "updatedAt",
    ])
    .index("by_repo_comparison_commit", [
      "repoFullName",
      "comparisonSlug",
      "commitRef",
      "updatedAt",
    ])
    .index("by_state_updated", ["state", "updatedAt"])
    .index("by_team_created", ["teamId", "createdAt"]),

  automatedCodeReviewVersions: defineTable({
    jobId: v.id("automatedCodeReviewJobs"),
    teamId: v.optional(v.string()),
    requestedByUserId: v.string(),
    repoFullName: v.string(),
    repoUrl: v.string(),
    prNumber: v.optional(v.number()),
    commitRef: v.string(),
    headCommitRef: v.optional(v.string()),
    baseCommitRef: v.optional(v.string()),
    jobType: v.optional(v.union(v.literal("pull_request"), v.literal("comparison"))),
    comparisonSlug: v.optional(v.string()),
    comparisonBaseOwner: v.optional(v.string()),
    comparisonBaseRef: v.optional(v.string()),
    comparisonHeadOwner: v.optional(v.string()),
    comparisonHeadRef: v.optional(v.string()),
    sandboxInstanceId: v.optional(v.string()), // `morphvm_` prefix indicates Morph-managed instance IDs
    codeReviewOutput: v.record(v.string(), v.any()),
    createdAt: v.number(),
  })
    .index("by_job", ["jobId"])
    .index("by_team_pr", ["teamId", "repoFullName", "prNumber", "createdAt"]),

  automatedCodeReviewFileOutputs: defineTable({
    jobId: v.id("automatedCodeReviewJobs"),
    teamId: v.optional(v.string()),
    repoFullName: v.string(),
    prNumber: v.optional(v.number()),
    commitRef: v.string(),
    headCommitRef: v.optional(v.string()),
    baseCommitRef: v.optional(v.string()),
    jobType: v.optional(v.union(v.literal("pull_request"), v.literal("comparison"))),
    comparisonSlug: v.optional(v.string()),
    comparisonBaseOwner: v.optional(v.string()),
    comparisonBaseRef: v.optional(v.string()),
    comparisonHeadOwner: v.optional(v.string()),
    comparisonHeadRef: v.optional(v.string()),
    sandboxInstanceId: v.optional(v.string()),
    filePath: v.string(),
    codexReviewOutput: v.any(),
    // Language used for tooltip/comment generation (e.g., "en", "zh-Hant", "ja")
    // Optional for backward compatibility with existing records
    tooltipLanguage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_job", ["jobId", "createdAt"])
    .index("by_job_file", ["jobId", "filePath"])
    .index("by_team_repo_pr_commit", [
      "teamId",
      "repoFullName",
      "prNumber",
      "commitRef",
      "createdAt",
    ])
    .index("by_team_repo_pr_lang", [
      "teamId",
      "repoFullName",
      "prNumber",
      "tooltipLanguage",
      "createdAt",
    ])
    .index("by_team_repo_comparison_commit", [
      "teamId",
      "repoFullName",
      "comparisonSlug",
      "commitRef",
      "createdAt",
    ])
    .index("by_team_repo_comparison_lang", [
      "teamId",
      "repoFullName",
      "comparisonSlug",
      "tooltipLanguage",
      "createdAt",
    ]),

  repos: defineTable({
    fullName: v.string(),
    org: v.string(),
    name: v.string(),
    gitRemote: v.string(),
    provider: v.optional(v.string()), // e.g. "github", "gitlab", etc.
    userId: v.string(),
    teamId: v.string(),
    // Provider metadata (GitHub App)
    providerRepoId: v.optional(v.number()),
    ownerLogin: v.optional(v.string()),
    ownerType: v.optional(
      v.union(v.literal("User"), v.literal("Organization"))
    ),
    visibility: v.optional(v.union(v.literal("public"), v.literal("private"))),
    defaultBranch: v.optional(v.string()),
    connectionId: v.optional(v.id("providerConnections")),
    lastSyncedAt: v.optional(v.number()),
    lastPushedAt: v.optional(v.number()),
    // Manual repos (added via custom URL input)
    manual: v.optional(v.boolean()),
  })
    .index("by_org", ["org"])
    .index("by_gitRemote", ["gitRemote"])
    .index("by_team_user", ["teamId", "userId"]) // legacy user scoping
    .index("by_team", ["teamId"]) // team-scoped listing
    .index("by_providerRepoId", ["teamId", "providerRepoId"]) // provider id lookup
    .index("by_connection", ["connectionId"])
    .index("by_team_fullName", ["teamId", "fullName"]),
  branches: defineTable({
    repo: v.string(), // legacy string repo name (fullName)
    repoId: v.optional(v.id("repos")), // canonical link to repos table
    name: v.string(),
    userId: v.string(),
    teamId: v.string(),
    lastCommitSha: v.optional(v.string()),
    lastActivityAt: v.optional(v.number()),
    lastKnownBaseSha: v.optional(v.string()),
    lastKnownMergeCommitSha: v.optional(v.string()),
  })
    .index("by_repo", ["repo"])
    .index("by_repoId", ["repoId"]) // new canonical lookup
    .index("by_team_user", ["teamId", "userId"]) // legacy user scoping
    .index("by_team", ["teamId"]),
  taskRunLogChunks: defineTable({
    taskRunId: v.id("taskRuns"),
    content: v.string(), // Log content chunk
    userId: v.string(),
    teamId: v.string(),
  })
    .index("by_taskRun", ["taskRunId"])
    .index("by_team_user", ["teamId", "userId"]),
  taskRunActivity: defineTable({
    taskRunId: v.id("taskRuns"),
    // Activity type: tool_call, file_edit, file_read, bash_command, test_run, git_commit, error,
    // session_start, session_stop, session_resumed, session_finished, context_warning, context_compacted,
    // memory_loaded, memory_scope_changed, user_prompt, subagent_start, subagent_stop,
    // notification, stop_requested, stop_blocked, stop_failed, tool_requested, tool_completed,
    // approval_requested, approval_resolved, prompt_submitted, run_resumed, mcp_capabilities_negotiated
    // (Phase 4 lifecycle parity + P1/P5 extensions)
    type: v.string(),
    toolName: v.optional(v.string()),
    summary: v.string(),
    detail: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    teamId: v.string(),
    createdAt: v.number(),
    // Context health fields (for context_warning/context_compacted events)
    severity: v.optional(v.string()), // "info", "warning", "critical"
    warningType: v.optional(v.string()), // "memory_bloat", "tool_output", "prompt_size", "capacity", "token_limit"
    currentUsage: v.optional(v.number()),
    maxCapacity: v.optional(v.number()),
    usagePercent: v.optional(v.number()),
    // Context compacted fields
    previousBytes: v.optional(v.number()),
    newBytes: v.optional(v.number()),
    reductionPercent: v.optional(v.number()),
    // Stop lifecycle fields (Phase 4 - stop_requested/blocked/failed events)
    stopSource: v.optional(v.string()), // "user", "hook", "autopilot", "policy", "timeout", "error"
    exitCode: v.optional(v.number()),
    continuationPrompt: v.optional(v.string()),
    // Approval fields (Phase 4 - approval_requested/resolved events)
    approvalId: v.optional(v.string()),
    resolution: v.optional(v.string()), // "allow", "allow_once", "allow_session", "deny", "deny_always", "timeout"
    resolvedBy: v.optional(v.string()),
    // Memory scope fields (Phase 4 - memory_scope_changed events)
    scopeType: v.optional(v.string()), // "team", "repo", "user", "run"
    scopeBytes: v.optional(v.number()),
    scopeAction: v.optional(v.string()), // "injected", "updated", "cleared"
    // Prompt/Turn tracking fields (P1 - prompt_submitted/session_finished/run_resumed)
    promptSource: v.optional(v.string()), // "user", "operator", "hook", "queue", "handoff"
    turnNumber: v.optional(v.number()),
    promptLength: v.optional(v.number()),
    turnCount: v.optional(v.number()),
    providerSessionId: v.optional(v.string()),
    // Resume fields (P1 - run_resumed events)
    resumeReason: v.optional(v.string()), // "checkpoint", "reconnect", "handoff", "retry", "manual"
    previousTaskRunId: v.optional(v.string()),
    previousSessionId: v.optional(v.string()),
    checkpointRef: v.optional(v.string()),
    // MCP runtime fields (P5 - mcp_capabilities_negotiated events)
    serverName: v.optional(v.string()),
    serverId: v.optional(v.string()),
    protocolVersion: v.optional(v.string()),
    transport: v.optional(v.string()), // "stdio", "http", "sse", "websocket"
    mcpCapabilities: v.optional(v.string()), // JSON stringified capabilities object
    toolCount: v.optional(v.number()),
    resourceCount: v.optional(v.number()),
    mcpSessionId: v.optional(v.string()),
  })
    .index("by_task_run", ["taskRunId", "createdAt"])
    .index("by_team", ["teamId", "createdAt"]),
  taskRunResourceMetrics: defineTable({
    taskRunId: v.id("taskRuns"),
    cpuPercent: v.number(), // CPU usage percentage (0-100)
    memoryMB: v.number(), // Memory usage in megabytes
    memoryPercent: v.number(), // Memory usage as percentage of total
    timestamp: v.number(), // When this sample was taken
    teamId: v.string(),
  })
    .index("by_task_run", ["taskRunId", "timestamp"])
    .index("by_team", ["teamId", "timestamp"]),
  apiKeys: defineTable({
    envVar: v.string(), // e.g. "GEMINI_API_KEY"
    value: v.string(), // The actual API key value (encrypted in a real app)
    displayName: v.string(), // e.g. "Gemini API Key"
    description: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    userId: v.string(),
    teamId: v.string(),
    // Codex OAuth token refresh tracking (only used when envVar === "CODEX_AUTH_JSON")
    tokenExpiresAt: v.optional(v.number()), // Epoch ms from parsed expires_at
    lastSuccessfulRefreshAt: v.optional(v.number()), // Epoch ms of last successful refresh
    lastRefreshAttemptAt: v.optional(v.number()), // Last refresh attempt timestamp
    lastRefreshError: v.optional(v.string()), // Error from last failed refresh
    refreshFailureCount: v.optional(v.number()), // Consecutive failures for backoff
  })
    .index("by_envVar", ["envVar"])
    .index("by_team_user", ["teamId", "userId"])
    .index("by_team", ["teamId"]),
  workspaceSettings: defineTable({
    worktreePath: v.optional(v.string()), // Custom path for git worktrees
    autoPrEnabled: v.optional(v.boolean()), // Auto-create PR for crown winner (default: false)
    autoSyncEnabled: v.optional(v.boolean()), // Auto-sync local workspace to cloud (default: true)
    bypassAnthropicProxy: v.optional(v.boolean()), // When true, Claude connects directly to custom Anthropic base URL
    nextLocalWorkspaceSequence: v.optional(v.number()), // Counter for local workspace naming
    alwaysForcePush: v.optional(v.boolean()), // Legacy field - kept for schema compatibility
    // Git settings
    branchPrefix: v.optional(v.string()), // Prefix for generated branch names (default: "dev/")
    // Worktree mode settings (Codex-style)
    worktreeMode: v.optional(
      v.union(v.literal("legacy"), v.literal("codex-style"))
    ), // "legacy" = ~/cmux/<repo>/origin/, "codex-style" = use existing local repos
    codexWorktreePathPattern: v.optional(v.string()), // Base path for codex-style worktrees (default: ~/.cmux/worktrees/). ShortId and repoName are appended automatically.
    // Heatmap review settings
    heatmapModel: v.optional(v.string()), // Model to use for heatmap review (e.g., "anthropic-haiku-4-5", "cmux-heatmap-2")
    heatmapThreshold: v.optional(v.number()), // Score threshold for filtering (0-1, default: 0)
    heatmapTooltipLanguage: v.optional(v.string()), // Language for tooltip text (e.g., "en", "zh-Hant", "ja")
    heatmapColors: v.optional(
      v.object({
        line: v.object({ start: v.string(), end: v.string() }), // Line background gradient colors
        token: v.object({ start: v.string(), end: v.string() }), // Token highlight gradient colors
      })
    ),
    // Shell wrapper settings for task sandboxes
    enableShellWrappers: v.optional(v.boolean()), // When true, inject gh/git wrappers to block dangerous commands (default: false)
    // Obsidian vault configuration
    vaultConfig: v.optional(
      v.object({
        type: v.union(v.literal("local"), v.literal("github")),
        // Local Obsidian vault name for obsidian:// links (default: "obsidian_vault")
        vaultName: v.optional(v.string()),
        // Local vault settings
        localPath: v.optional(v.string()),
        // GitHub vault settings
        githubOwner: v.optional(v.string()),
        githubRepo: v.optional(v.string()),
        githubPath: v.optional(v.string()), // Path within repo (default: "")
        githubBranch: v.optional(v.string()), // Branch name (default: "main")
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    userId: v.string(),
    teamId: v.string(),
  }).index("by_team_user", ["teamId", "userId"]),

  // Per-team model enable/disable preferences
  // Uses blacklist pattern: disabledModels array lists agent names to hide
  // Default behavior: all models enabled (empty disabledModels array)
  modelPreferences: defineTable({
    disabledModels: v.array(v.string()), // Array of agent names to hide, e.g. ["claude/haiku-4.5"]
    createdAt: v.number(),
    updatedAt: v.number(),
    userId: v.string(),
    teamId: v.string(),
  }).index("by_team_user", ["teamId", "userId"]),

  // Per-team model visibility overrides
  // Uses blacklist pattern: hiddenModels array lists globally enabled models hidden for a team
  // Default behavior: all globally enabled models are visible (empty hiddenModels array)
  teamModelVisibility: defineTable({
    teamId: v.string(),
    hiddenModels: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    updatedBy: v.optional(v.string()),
  }).index("by_team", ["teamId"]),

  // Source repo mappings for Codex-style worktrees
  // Maps projects to local repo paths per user
  sourceRepoMappings: defineTable({
    projectFullName: v.string(), // e.g., "owner/repo"
    localRepoPath: v.string(), // e.g., "/Users/karlchow/Desktop/code/cmux"
    lastVerifiedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    userId: v.string(),
    teamId: v.string(),
  })
    .index("by_team_user_project", ["teamId", "userId", "projectFullName"])
    .index("by_team_user", ["teamId", "userId"]),

  // Worktree registry for tracking active worktrees (settings page)
  worktreeRegistry: defineTable({
    worktreePath: v.string(),
    sourceRepoPath: v.string(),
    projectFullName: v.string(),
    branchName: v.string(),
    shortId: v.string(),
    mode: v.union(v.literal("legacy"), v.literal("codex-style")),
    taskRunIds: v.optional(v.array(v.id("taskRuns"))),
    lastUsedAt: v.number(),
    createdAt: v.number(),
    userId: v.string(),
    teamId: v.string(),
  })
    .index("by_team_user", ["teamId", "userId"])
    .index("by_worktree_path", ["worktreePath"]),
  workspaceConfigs: defineTable({
    projectFullName: v.string(),
    maintenanceScript: v.optional(v.string()),
    dataVaultKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    userId: v.string(),
    teamId: v.string(),
  }).index("by_team_user_repo", ["teamId", "userId", "projectFullName"]),
  previewConfigs: defineTable({
    teamId: v.string(),
    createdByUserId: v.optional(v.string()),
    repoFullName: v.string(),
    repoProvider: v.optional(v.literal("github")),
    repoInstallationId: v.optional(v.number()),
    repoDefaultBranch: v.optional(v.string()),
    environmentId: v.optional(v.id("environments")),
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("paused"),
        v.literal("disabled"),
      ),
    ),
    lastRunAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_team_repo", ["teamId", "repoFullName"])
    .index("by_team", ["teamId", "updatedAt"])
    .index("by_team_status", ["teamId", "status", "updatedAt"])
    .index("by_environment", ["environmentId"])
    .index("by_installation_repo", ["repoInstallationId", "repoFullName"]),
  previewRuns: defineTable({
    previewConfigId: v.id("previewConfigs"),
    teamId: v.string(),
    repoFullName: v.string(),
    repoInstallationId: v.optional(v.number()),
    prNumber: v.number(),
    prUrl: v.string(),
    prTitle: v.optional(v.string()), // PR title from GitHub
    prDescription: v.optional(v.string()), // PR body/description from GitHub
    headSha: v.string(),
    baseSha: v.optional(v.string()),
    headRef: v.optional(v.string()), // Branch name in head repo
    headRepoFullName: v.optional(v.string()), // Fork repo full name (if from fork)
    headRepoCloneUrl: v.optional(v.string()), // Fork repo clone URL (if from fork)
    taskRunId: v.optional(v.id("taskRuns")),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("skipped"),
      v.literal("superseded"), // Marked when a newer commit's preview run replaces this one
    ),
    supersededBy: v.optional(v.id("previewRuns")), // Reference to the newer run that superseded this one
    stateReason: v.optional(v.string()),
    dispatchedAt: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    screenshotSetId: v.optional(v.id("taskRunScreenshotSets")),
    githubCommentUrl: v.optional(v.string()),
    githubCommentId: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_config_status", ["previewConfigId", "status", "createdAt"])
    .index("by_config_head", ["previewConfigId", "headSha"])
    .index("by_config_pr", ["previewConfigId", "prNumber", "createdAt"])
    .index("by_config_pr_head", ["previewConfigId", "prNumber", "headSha"]) // For commit-aware duplicate detection
    .index("by_team_created", ["teamId", "createdAt"]),
  crownEvaluations: defineTable({
    taskId: v.id("tasks"),
    evaluatedAt: v.number(),
    winnerRunId: v.id("taskRuns"),
    candidateRunIds: v.array(v.id("taskRuns")),
    evaluationPrompt: v.string(),
    evaluationResponse: v.string(),
    createdAt: v.number(),
    userId: v.string(),
    teamId: v.string(),
    /** Whether this evaluation was produced by fallback due to AI service failure */
    isFallback: v.optional(v.boolean()),
    /** Human-readable note about the evaluation process (e.g., fallback details) */
    evaluationNote: v.optional(v.string()),
    /** True if all candidates had empty or placeholder diffs at evaluation time */
    hadEmptyDiffs: v.optional(v.boolean()),
    /** Number of auto-refresh attempts (max 2 to prevent infinite loops) */
    autoRefreshCount: v.optional(v.number()),
    /** Timestamp of last auto-refresh attempt */
    lastAutoRefreshAt: v.optional(v.number()),
  })
    .index("by_task", ["taskId"])
    .index("by_winner", ["winnerRunId"])
    .index("by_team_user", ["teamId", "userId"])
    .index("by_empty_diffs", ["hadEmptyDiffs", "evaluatedAt"]),
  containerSettings: defineTable({
    maxRunningContainers: v.optional(v.number()), // Max containers to keep running (default: 5)
    reviewPeriodMinutes: v.optional(v.number()), // Minutes to keep container after task completion (default: 60)
    autoCleanupEnabled: v.optional(v.boolean()), // Enable automatic cleanup (default: true)
    stopImmediatelyOnCompletion: v.optional(v.boolean()), // Stop containers immediately when tasks complete (default: false)
    minContainersToKeep: v.optional(v.number()), // Minimum containers to always keep alive (default: 0)
    createdAt: v.number(),
    updatedAt: v.number(),
    userId: v.string(),
    teamId: v.string(),
  }).index("by_team_user", ["teamId", "userId"]),

  // User-uploaded editor settings (VS Code, Cursor, Windsurf)
  // For cmux.sh web users who can't auto-detect local settings
  userEditorSettings: defineTable({
    teamId: v.string(),
    userId: v.string(),
    settingsJson: v.optional(v.string()), // settings.json content
    keybindingsJson: v.optional(v.string()), // keybindings.json content
    snippets: v.optional(
      v.array(
        v.object({
          name: v.string(), // filename e.g. "javascript.json"
          content: v.string(), // snippet file content
        })
      )
    ),
    extensions: v.optional(v.string()), // newline-separated extension IDs
    updatedAt: v.number(),
  }).index("by_team_user", ["teamId", "userId"]),

  // System and user comments attached to a task
  taskComments: defineTable({
    taskId: v.id("tasks"),
    content: v.string(),
    userId: v.string(), // "cmux" for system comments; otherwise the author user id
    teamId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_task", ["taskId", "createdAt"]) // fetch comments for a task chronologically
    .index("by_team_task", ["teamId", "taskId", "createdAt"]) // scoped by team
    .index("by_team_user", ["teamId", "userId"]),

  comments: defineTable({
    url: v.string(), // Full URL of the website where comment was created
    page: v.string(), // Page URL/path where comment was created
    pageTitle: v.string(), // Page title for reference
    nodeId: v.string(), // CSS selector path to the element
    x: v.number(), // X position ratio within the element (0-1)
    y: v.number(), // Y position ratio within the element (0-1)
    content: v.string(), // Comment text content
    resolved: v.optional(v.boolean()), // Whether comment is resolved
    archived: v.optional(v.boolean()), // Whether comment is archived
    userId: v.string(), // User who created the comment
    teamId: v.string(),
    profileImageUrl: v.optional(v.string()), // User's profile image URL
    userAgent: v.string(), // Browser user agent
    screenWidth: v.number(), // Screen width when comment was created
    screenHeight: v.number(), // Screen height when comment was created
    devicePixelRatio: v.number(), // Device pixel ratio
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_url", ["url", "createdAt"])
    .index("by_page", ["page", "createdAt"])
    .index("by_user", ["userId", "createdAt"])
    .index("by_resolved", ["resolved", "createdAt"])
    .index("by_team_user", ["teamId", "userId"]),

  commentReplies: defineTable({
    commentId: v.id("comments"),
    userId: v.string(),
    teamId: v.string(),
    content: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_comment", ["commentId", "createdAt"])
    .index("by_user", ["userId", "createdAt"])
    .index("by_team_user", ["teamId", "userId"]),

  // GitHub App installation connections (team-scoped, but teamId may be set later)
  providerConnections: defineTable({
    teamId: v.optional(v.string()), // Canonical team UUID; may be set post-install
    connectedByUserId: v.optional(v.string()), // Stack user who linked the install (when known)
    type: v.literal("github_app"),
    installationId: v.number(),
    accountLogin: v.optional(v.string()), // org or user login
    accountId: v.optional(v.number()),
    accountType: v.optional(
      v.union(v.literal("User"), v.literal("Organization"))
    ),
    isActive: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_installationId", ["installationId"]) // resolve installation -> connection
    .index("by_team", ["teamId"]) // list connections for team
    .index("by_team_type", ["teamId", "type"]),

  // Environments for teams
  environments: defineTable({
    name: v.string(), // Human-friendly environment name
    teamId: v.string(), // Team that owns this environment
    userId: v.string(), // User who created the environment
    snapshotId: v.optional(v.string()), // Canonical snapshot identifier (snapshot_*)
    snapshotProvider: v.optional(snapshotProviderValidator),
    templateVmid: v.optional(v.number()), // PVE template VMID (for pve-lxc/pve-vm)
    dataVaultKey: v.string(), // Key for StackAuth DataBook (stores encrypted env vars)
    selectedRepos: v.optional(v.array(v.string())), // List of repository full names
    description: v.optional(v.string()), // Optional description
    maintenanceScript: v.optional(v.string()),
    devScript: v.optional(v.string()),
    exposedPorts: v.optional(v.array(v.number())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_team", ["teamId", "createdAt"])
    .index("by_team_user", ["teamId", "userId"])
    .index("by_dataVaultKey", ["dataVaultKey"]),

  environmentSnapshotVersions: defineTable({
    environmentId: v.id("environments"),
    teamId: v.string(),
    morphSnapshotId: v.optional(v.string()), // Legacy field for backfill
    snapshotId: v.optional(v.string()),
    snapshotProvider: v.optional(snapshotProviderValidator),
    templateVmid: v.optional(v.number()), // PVE template VMID (for pve-lxc/pve-vm)
    version: v.number(),
    createdAt: v.number(),
    createdByUserId: v.string(),
    label: v.optional(v.string()),
    maintenanceScript: v.optional(v.string()),
    devScript: v.optional(v.string()),
  })
    .index("by_environment_version", ["environmentId", "version"])
    .index("by_environment_createdAt", ["environmentId", "createdAt"])
    .index("by_team_createdAt", ["teamId", "createdAt"])
    .index("by_team_snapshot", ["teamId", "snapshotId"]),

  // Webhook deliveries for idempotency and auditing
  webhookDeliveries: defineTable({
    provider: v.string(), // e.g. "github"
    deliveryId: v.string(), // X-GitHub-Delivery
    installationId: v.optional(v.number()),
    payloadHash: v.string(), // sha256 of payload body
    receivedAt: v.number(),
  }).index("by_deliveryId", ["deliveryId"]),

  // Short-lived, single-use install state tokens for mapping installation -> team
  installStates: defineTable({
    nonce: v.string(),
    teamId: v.string(),
    userId: v.string(),
    iat: v.number(),
    exp: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("used"),
      v.literal("expired")
    ),
    createdAt: v.number(),
    returnUrl: v.optional(v.string()),
  }).index("by_nonce", ["nonce"]),

  // Pull Requests ingested from GitHub (via webhook or backfill)
  pullRequests: defineTable({
    // Identity within provider and repo context
    provider: v.literal("github"),
    installationId: v.number(),
    repositoryId: v.optional(v.number()),
    repoFullName: v.string(), // owner/repo
    number: v.number(), // PR number
    providerPrId: v.optional(v.number()), // GitHub numeric id

    // Team scoping
    teamId: v.string(),

    // Core fields
    title: v.string(),
    state: v.union(v.literal("open"), v.literal("closed")),
    merged: v.optional(v.boolean()),
    draft: v.optional(v.boolean()),
    authorLogin: v.optional(v.string()),
    authorId: v.optional(v.number()),
    htmlUrl: v.optional(v.string()),

    // Branch and commit info
    baseRef: v.optional(v.string()),
    headRef: v.optional(v.string()),
    baseSha: v.optional(v.string()),
    headSha: v.optional(v.string()),
    mergeCommitSha: v.optional(v.string()),

    // Timestamps
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    closedAt: v.optional(v.number()),
    mergedAt: v.optional(v.number()),

    // Misc metrics
    commentsCount: v.optional(v.number()),
    reviewCommentsCount: v.optional(v.number()),
    commitsCount: v.optional(v.number()),
    additions: v.optional(v.number()),
    deletions: v.optional(v.number()),
    changedFiles: v.optional(v.number()),
  })
    .index("by_team", ["teamId", "updatedAt"]) // list by team, recent first client-side
    .index("by_team_state", ["teamId", "state", "updatedAt"]) // filter by state
    .index("by_team_repo_number", ["teamId", "repoFullName", "number"]) // upsert key
    .index("by_installation", ["installationId", "updatedAt"]) // debug/ops
    .index("by_repo", ["repoFullName", "updatedAt"]),

  // GitHub Actions workflow runs
  githubWorkflowRuns: defineTable({
    // Identity within provider and repo context
    provider: v.literal("github"),
    installationId: v.number(),
    repositoryId: v.optional(v.number()),
    repoFullName: v.string(), // owner/repo

    // Workflow run identity
    runId: v.number(), // GitHub's run ID
    runNumber: v.number(), // Run number within repo

    // Team scoping
    teamId: v.string(),

    // Workflow info
    workflowId: v.number(),
    workflowName: v.string(),

    // Run details
    name: v.optional(v.string()), // Run name (can be custom)
    event: v.string(), // Event that triggered the run (push, pull_request, etc.)
    status: v.optional(
      v.union(
        v.literal("queued"),
        v.literal("in_progress"),
        v.literal("completed"),
        v.literal("pending"),
        v.literal("waiting")
      )
    ),
    conclusion: v.optional(
      v.union(
        v.literal("success"),
        v.literal("failure"),
        v.literal("neutral"),
        v.literal("cancelled"),
        v.literal("skipped"),
        v.literal("timed_out"),
        v.literal("action_required")
      )
    ),

    // Branch and commit info
    headBranch: v.optional(v.string()),
    headSha: v.optional(v.string()),

    // URLs
    htmlUrl: v.optional(v.string()),

    // Timestamps
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    runStartedAt: v.optional(v.number()),
    runCompletedAt: v.optional(v.number()),

    // Run times (in seconds)
    runDuration: v.optional(v.number()),

    // Actor info
    actorLogin: v.optional(v.string()),
    actorId: v.optional(v.number()),

    // Triggering PR (if applicable)
    triggeringPrNumber: v.optional(v.number()),
  })
    .index("by_team", ["teamId", "updatedAt"]) // list by team, recent first
    .index("by_team_repo", ["teamId", "repoFullName", "updatedAt"]) // filter by repo
    .index("by_team_workflow", ["teamId", "workflowId", "updatedAt"]) // filter by workflow
    .index("by_installation", ["installationId", "updatedAt"]) // debug/ops
    .index("by_runId", ["runId"]) // unique lookup
    .index("by_repo_runNumber", ["repoFullName", "runNumber"]) // unique per repo
    .index("by_repo_sha", ["repoFullName", "headSha", "runStartedAt"]), // filter by SHA for PR

  // GitHub Check Runs (for Vercel, deployments, etc.)
  githubCheckRuns: defineTable({
    // Identity
    provider: v.literal("github"),
    installationId: v.number(),
    repositoryId: v.optional(v.number()),
    repoFullName: v.string(),
    checkRunId: v.number(), // GitHub check run ID

    // Team scoping
    teamId: v.string(),

    // Check run details
    name: v.string(), // Check name (e.g., "Vercel - cmux-client")
    status: v.optional(
      v.union(
        v.literal("queued"),
        v.literal("in_progress"),
        v.literal("completed"),
        v.literal("pending"),
        v.literal("waiting")
      )
    ),
    conclusion: v.optional(
      v.union(
        v.literal("success"),
        v.literal("failure"),
        v.literal("neutral"),
        v.literal("cancelled"),
        v.literal("skipped"),
        v.literal("timed_out"),
        v.literal("action_required")
      )
    ),

    // Commit info
    headSha: v.string(),

    // URLs
    htmlUrl: v.optional(v.string()),

    // Timestamps
    updatedAt: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),

    // App info (e.g., Vercel)
    appName: v.optional(v.string()),
    appSlug: v.optional(v.string()),

    // Triggering PR (if applicable)
    triggeringPrNumber: v.optional(v.number()),
  })
    .index("by_team", ["teamId", "updatedAt"])
    .index("by_team_repo", ["teamId", "repoFullName", "updatedAt"])
    .index("by_team_repo_pr", ["teamId", "repoFullName", "triggeringPrNumber", "updatedAt"])
    .index("by_installation_checkRunId", ["installationId", "checkRunId"])
    .index("by_checkRunId", ["checkRunId"])
    .index("by_headSha", ["headSha", "updatedAt"]),

  // GitHub Deployments (Vercel, etc.)
  githubDeployments: defineTable({
    provider: v.literal("github"),
    installationId: v.number(),
    repositoryId: v.optional(v.number()),
    repoFullName: v.string(),
    deploymentId: v.number(),
    teamId: v.string(),

    // Deployment details
    sha: v.string(),
    ref: v.optional(v.string()),
    task: v.optional(v.string()),
    environment: v.optional(v.string()),
    description: v.optional(v.string()),

    // Creator info
    creatorLogin: v.optional(v.string()),

    // Timestamps
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),

    // Current status (from latest deployment_status)
    state: v.optional(
      v.union(
        v.literal("error"),
        v.literal("failure"),
        v.literal("pending"),
        v.literal("in_progress"),
        v.literal("queued"),
        v.literal("success")
      )
    ),
    statusDescription: v.optional(v.string()),
    targetUrl: v.optional(v.string()),
    environmentUrl: v.optional(v.string()),
    logUrl: v.optional(v.string()),

    // Triggering PR (if applicable)
    triggeringPrNumber: v.optional(v.number()),
  })
    .index("by_team", ["teamId", "updatedAt"])
    .index("by_team_repo", ["teamId", "repoFullName", "updatedAt"])
    .index("by_deploymentId", ["deploymentId"])
    .index("by_sha", ["sha", "updatedAt"]),

  // GitHub Commit Statuses (legacy status API)
  githubCommitStatuses: defineTable({
    provider: v.literal("github"),
    installationId: v.number(),
    repositoryId: v.optional(v.number()),
    repoFullName: v.string(),
    statusId: v.number(),
    teamId: v.string(),

    // Status details
    sha: v.string(),
    state: v.union(
      v.literal("error"),
      v.literal("failure"),
      v.literal("pending"),
      v.literal("success")
    ),
    context: v.string(),
    description: v.optional(v.string()),
    targetUrl: v.optional(v.string()),

    // Creator info
    creatorLogin: v.optional(v.string()),

    // Timestamps
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),

    // Triggering PR (if applicable)
    triggeringPrNumber: v.optional(v.number()),
  })
    .index("by_team", ["teamId", "updatedAt"])
    .index("by_team_repo", ["teamId", "repoFullName", "updatedAt"])
    .index("by_statusId", ["statusId"])
    .index("by_sha_context", ["sha", "context", "updatedAt"])
    .index("by_sha", ["sha", "updatedAt"]),

  // Host screenshot collector releases synced from GitHub releases
  hostScreenshotCollectorReleases: defineTable({
    version: v.string(), // e.g., "0.1.0-20241211120000-abc1234"
    commitSha: v.string(), // Full git commit SHA
    storageId: v.id("_storage"), // Convex file storage ID for the bundled JS
    isStaging: v.boolean(), // Whether this is for staging (cmux-internal-dev-agent) or production (cmux-agent)
    isLatest: v.boolean(), // Whether this is the latest release for its environment
    releaseUrl: v.optional(v.string()), // GitHub release URL
    createdAt: v.number(),
  })
    .index("by_version", ["version"])
    .index("by_staging_latest", ["isStaging", "isLatest", "createdAt"])
    .index("by_staging_created", ["isStaging", "createdAt"]),

  // Task notifications for alerting users of task run completions/failures
  taskNotifications: defineTable({
    taskId: v.id("tasks"),
    taskRunId: v.optional(v.id("taskRuns")), // The run that triggered this notification
    teamId: v.string(),
    userId: v.string(),
    type: v.union(
      v.literal("run_completed"),
      v.literal("run_failed"),
      v.literal("run_needs_input"),
    ),
    message: v.optional(v.string()), // Optional summary message
    readAt: v.optional(v.number()), // Null/undefined means unread
    createdAt: v.number(),
  })
    .index("by_team_user_created", ["teamId", "userId", "createdAt"]) // List notifications for user
    .index("by_team_user_unread", ["teamId", "userId", "readAt", "createdAt"]) // Filter unread
    .index("by_task", ["taskId", "createdAt"]) // Get notifications for a task
    .index("by_task_user_unread", ["taskId", "userId", "readAt"]), // Check unread per task

  // Explicit unread tracking for task runs
  // Row exists = unread, no row = read (safe default)
  unreadTaskRuns: defineTable({
    taskRunId: v.id("taskRuns"),
    taskId: v.optional(v.id("tasks")), // Denormalized for efficient querying (optional for migration)
    userId: v.string(),
    teamId: v.string(),
  })
    .index("by_run_user", ["taskRunId", "userId"]) // Check if run is unread
    .index("by_user", ["userId"]) // Get all unread runs for a user
    .index("by_team_user", ["teamId", "userId"]) // Get unread runs for a user in a team
    .index("by_task_user", ["taskId", "userId"]), // Get unread runs for a task

  mobileMachines: defineTable({
    teamId: v.string(),
    userId: v.string(),
    machineId: v.string(),
    displayName: v.string(),
    tailscaleHostname: v.optional(v.string()),
    tailscaleIPs: v.array(v.string()),
    status: v.union(
      v.literal("online"),
      v.literal("offline"),
      v.literal("unknown")
    ),
    lastSeenAt: v.number(),
    lastWorkspaceSyncAt: v.optional(v.number()),
  })
    .index("by_machineId", ["machineId"])
    .index("by_team_user_machine", ["teamId", "userId", "machineId"])
    .index("by_team_user_last_seen", ["teamId", "userId", "lastSeenAt"]),

  mobileWorkspaces: defineTable({
    teamId: v.string(),
    userId: v.string(),
    workspaceId: v.string(),
    machineId: v.string(),
    taskId: v.optional(v.string()),
    taskRunId: v.optional(v.string()),
    title: v.string(),
    preview: v.optional(v.string()),
    phase: v.string(),
    tmuxSessionName: v.string(),
    lastActivityAt: v.number(),
    latestEventSeq: v.number(),
    lastEventAt: v.optional(v.number()),
  })
    .index("by_workspaceId", ["workspaceId"])
    .index("by_team_user_workspace", ["teamId", "userId", "workspaceId"])
    .index("by_machine_last_activity", ["machineId", "lastActivityAt"])
    .index("by_team_user_last_activity", ["teamId", "userId", "lastActivityAt"]),

  mobileWorkspaceEvents: defineTable({
    teamId: v.string(),
    userId: v.string(),
    workspaceId: v.string(),
    eventSeq: v.number(),
    kind: v.string(),
    preview: v.optional(v.string()),
    createdAt: v.number(),
    shouldNotify: v.boolean(),
  })
    .index("by_workspace_event", ["workspaceId", "eventSeq"])
    .index("by_team_user_created", ["teamId", "userId", "createdAt"])
    .index("by_team_user_notify", ["teamId", "userId", "shouldNotify", "createdAt"]),

  mobileUserWorkspaceState: defineTable({
    teamId: v.string(),
    userId: v.string(),
    workspaceId: v.string(),
    lastReadEventSeq: v.number(),
    pinned: v.optional(v.boolean()),
    archived: v.optional(v.boolean()),
    updatedAt: v.number(),
  })
    .index("by_team_user_workspace", ["teamId", "userId", "workspaceId"])
    .index("by_team_user_updated", ["teamId", "userId", "updatedAt"]),

  devicePushTokens: defineTable({
    teamId: v.string(),
    userId: v.string(),
    token: v.string(),
    environment: v.union(v.literal("development"), v.literal("production")),
    platform: v.string(),
    bundleId: v.string(),
    deviceId: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_team_user_updated", ["teamId", "userId", "updatedAt"])
    .index("by_team_user_device", ["teamId", "userId", "deviceId"]),

  // Track Morph instance activity for cleanup cron decisions
  // DEPRECATED: Use sandboxInstanceActivity for new code (provider-agnostic)
  morphInstanceActivity: defineTable({
    instanceId: v.string(), // Morph instance ID (morphvm_xxx)
    lastPausedAt: v.optional(v.number()), // When instance was last paused by cron
    lastResumedAt: v.optional(v.number()), // When instance was last resumed via UI
    stoppedAt: v.optional(v.number()), // When instance was permanently stopped
  }).index("by_instanceId", ["instanceId"]),

  // Unified sandbox instance activity tracking (provider-agnostic)
  // Supports: morph, e2b, pve-lxc, docker, daytona, and future providers
  sandboxInstanceActivity: defineTable({
    instanceId: v.string(), // Instance ID (morphvm_xxx, pvelxc-xxx, etc.)
    provider: runtimeProviderValidator,
    vmid: v.optional(v.number()), // PVE VMID
    hostname: v.optional(v.string()), // PVE hostname (instanceId for new instances)
    snapshotId: v.optional(v.string()),
    snapshotProvider: v.optional(snapshotProviderValidator),
    templateVmid: v.optional(v.number()),
    // Activity timestamps
    lastPausedAt: v.optional(v.number()), // When instance was last paused by cron
    lastResumedAt: v.optional(v.number()), // When instance was last resumed via UI
    stoppedAt: v.optional(v.number()), // When instance was permanently stopped/deleted
    // Metadata for tracking
    teamId: v.optional(v.string()), // Team that owns this instance
    userId: v.optional(v.string()), // User that created this instance
    isCloudWorkspace: v.optional(v.boolean()), // Whether this sandbox was created for a task-backed cloud workspace
    createdAt: v.optional(v.number()), // When the activity record was created
  })
    .index("by_instanceId", ["instanceId"])
    .index("by_vmid", ["vmid"])
    .index("by_provider", ["provider"])
    .index("by_provider_stopped", ["provider", "stoppedAt"]) // For cleanup queries
    .index("by_team", ["teamId"]),
  // User-owned devbox instances (standalone sandboxes not tied to task runs)
  devboxInstances: defineTable({
    devboxId: v.string(), // Friendly ID (cr_xxxxxxxx) for CLI users
    userId: v.string(), // Owner user ID
    teamId: v.string(), // Team scope
    name: v.optional(v.string()), // User-friendly name
    source: v.optional(v.union(v.literal("cli"), v.literal("web"))), // Where instance was created
    status: v.union(
      v.literal("running"),
      v.literal("paused"),
      v.literal("stopped"),
      v.literal("unknown")
    ),
    environmentId: v.optional(v.id("environments")), // Optional linked environment
    metadata: v.optional(v.record(v.string(), v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastAccessedAt: v.optional(v.number()), // When user last accessed the instance
    stoppedAt: v.optional(v.number()), // When instance was stopped
  })
    .index("by_devboxId", ["devboxId"])
    .index("by_team_user", ["teamId", "userId", "createdAt"])
    .index("by_team", ["teamId", "createdAt"])
    .index("by_user", ["userId", "createdAt"])
    .index("by_status", ["status", "updatedAt"]),

  // Provider-specific info for devbox instances (maps our ID to provider details)
  devboxInfo: defineTable({
    devboxId: v.string(), // Our friendly ID (cr_xxxxxxxx)
    provider: devboxProviderValidator, // Provider name (extensible for future providers)
    providerInstanceId: v.string(), // Provider's instance ID (e.g., morphvm_xxx)
    snapshotId: v.optional(v.string()), // Snapshot ID used to create the instance
    createdAt: v.number(),
  })
    .index("by_devboxId", ["devboxId"])
    .index("by_providerInstanceId", ["providerInstanceId"]),

  // E2B instance activity tracking (for managing instance lifecycle)
  e2bInstanceActivity: defineTable({
    instanceId: v.string(), // E2B sandbox instance ID
    lastResumedAt: v.optional(v.number()),
    lastPausedAt: v.optional(v.number()),
    stoppedAt: v.optional(v.number()),
  }).index("by_instanceId", ["instanceId"]),

  // Modal instance activity tracking (for managing instance lifecycle)
  modalInstanceActivity: defineTable({
    instanceId: v.string(), // Modal sandbox instance ID
    lastResumedAt: v.optional(v.number()),
    lastPausedAt: v.optional(v.number()),
    stoppedAt: v.optional(v.number()),
    gpu: v.optional(v.string()), // GPU config used (e.g., "T4", "A100", "H100:2")
  }).index("by_instanceId", ["instanceId"]),

  // Prewarmed Morph instances for fast task startup.
  // Instances are provisioned with a specific repo already cloned,
  // triggered when a user starts typing a task description.
  warmPool: defineTable({
    instanceId: v.string(), // Morph instance ID (morphvm_xxx)
    snapshotId: v.string(), // Snapshot used to create this instance
    status: v.union(
      v.literal("provisioning"), // Instance is being created + repo cloning
      v.literal("ready"), // Instance ready with repo cloned
      v.literal("claimed"), // Claimed by a task
      v.literal("failed") // Failed to provision
    ),
    teamId: v.string(), // Team that requested the prewarm
    userId: v.string(), // User that requested the prewarm
    repoUrl: v.optional(v.string()), // GitHub repo URL (if repo-specific)
    branch: v.optional(v.string()), // Base branch
    vscodeUrl: v.optional(v.string()), // Pre-resolved VSCode URL
    workerUrl: v.optional(v.string()), // Pre-resolved worker URL
    claimedAt: v.optional(v.number()),
    claimedByTaskRunId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    errorMessage: v.optional(v.string()),
  })
    .index("by_status", ["status", "createdAt"])
    .index("by_instanceId", ["instanceId"])
    .index("by_team_status", ["teamId", "status", "createdAt"]),

  // Provider override configurations for custom proxies and endpoints
  // Enables teams to customize base URLs, API formats, and fallback chains
  providerOverrides: defineTable({
    teamId: v.string(),
    providerId: v.string(), // e.g., "anthropic", "openai", "custom-proxy"
    baseUrl: v.optional(v.string()),
    apiFormat: v.optional(
      v.union(
        v.literal("anthropic"),
        v.literal("openai"),
        v.literal("bedrock"),
        v.literal("vertex"),
        v.literal("passthrough")
      )
    ),
    apiKeyEnvVar: v.optional(v.string()),
    customHeaders: v.optional(v.record(v.string(), v.string())),
    fallbacks: v.optional(
      v.array(
        v.object({
          modelName: v.string(),
          priority: v.number(),
        })
      )
    ),
    enabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_team_provider", ["teamId", "providerId"])
    .index("by_team", ["teamId"]),

  // Global model catalog for dynamic discovery and admin management
  // Stores both curated models (from AGENT_CATALOG) and discovered models (from provider APIs)
  models: defineTable({
    name: v.string(), // Stable ID, e.g. "claude/opus-4.6", "opencode/gpt-5-nano"
    displayName: v.string(), // Human-readable label, e.g. "Opus 4.6"
    vendor: v.string(), // Vendor for grouping, e.g. "anthropic", "openai", "opencode"
    source: v.union(v.literal("curated"), v.literal("discovered")), // Origin of the model
    discoveredFrom: v.optional(v.string()), // Discovery source, e.g. "opencode-zen"
    discoveredAt: v.optional(v.number()), // When the model was discovered
    requiredApiKeys: v.array(v.string()), // Environment variables required, e.g. ["ANTHROPIC_API_KEY"]
    tier: v.union(v.literal("free"), v.literal("paid")), // Pricing tier
    tags: v.array(v.string()), // Tags for filtering, e.g. ["reasoning", "free", "latest"]
    enabled: v.boolean(), // System-global enabled state for true deprecation/removal
    sortOrder: v.number(), // For drag-drop reordering
    disabled: v.optional(v.boolean()), // Model-level disabled flag (different from enabled)
    disabledReason: v.optional(v.string()), // Reason shown when disabled
    variants: v.optional(
      v.array(
        v.object({
          id: v.string(),
          displayName: v.string(),
          description: v.optional(v.string()),
        })
      )
    ), // Thinking/reasoning mode variants
    defaultVariant: v.optional(v.string()), // Default variant ID
    contextWindow: v.optional(v.number()), // Max input tokens
    maxOutputTokens: v.optional(v.number()), // Max output tokens
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_vendor", ["vendor"])
    .index("by_enabled", ["enabled", "sortOrder"])
    .index("by_source", ["source"]),

  // Agent memory snapshots - synced from sandbox memory files on agent completion
  // Stores knowledge, daily logs, tasks, and mailbox content for each task run
  agentMemorySnapshots: defineTable({
    taskRunId: v.id("taskRuns"),
    teamId: v.string(),
    userId: v.string(),
    agentName: v.optional(v.string()),
    memoryType: v.union(
      v.literal("knowledge"),
      v.literal("daily"),
      v.literal("tasks"),
      v.literal("mailbox"),
      v.literal("events"),
      // Behavior memory types (self-improving preferences)
      v.literal("behavior_hot"),
      v.literal("behavior_corrections"),
      v.literal("behavior_domain"),
      v.literal("behavior_project"),
      v.literal("behavior_index")
    ),
    content: v.string(),
    fileName: v.optional(v.string()),
    date: v.optional(v.string()), // YYYY-MM-DD for daily logs
    truncated: v.optional(v.boolean()),
    createdAt: v.number(),
    // Phase 4: Memory freshness metadata
    lastUsedAt: v.optional(v.number()), // When this snapshot was last loaded into a sandbox
    usageCount: v.optional(v.number()), // How many times loaded
    freshnessScore: v.optional(v.number()), // 0.0-1.0, decays over time
    lastFreshnessUpdate: v.optional(v.number()), // When freshness was last calculated
    // Phase 5: Memory scope model (IronClaw-inspired)
    // Enables layered reads with write isolation per scope
    scope: v.optional(
      v.union(
        v.literal("team"), // team/shared - org-wide policy & runbooks
        v.literal("repo"), // repo/shared - project conventions
        v.literal("user"), // user/private - operator preferences
        v.literal("run") // run/local - ephemeral task notes
      )
    ),
    projectFullName: v.optional(v.string()), // For repo-scoped memory (e.g., "owner/repo")
  })
    .index("by_task_run", ["taskRunId", "memoryType"])
    .index("by_team_type", ["teamId", "memoryType", "createdAt"])
    .index("by_team_created", ["teamId", "createdAt"])
    .index("by_team_freshness", ["teamId", "memoryType", "freshnessScore"])
    // Phase 5: Scoped memory indexes
    .index("by_team_scope_type", ["teamId", "scope", "memoryType", "createdAt"])
    .index("by_repo_type", ["projectFullName", "memoryType", "createdAt"])
    .index("by_user_type", ["userId", "memoryType", "createdAt"]),

  // Normalized behavior rules for self-improving memory (S15 provenance)
  // Enables fast querying, cross-run seeding, and provenance tracking
  agentBehaviorRules: defineTable({
    teamId: v.string(),
    userId: v.optional(v.string()),
    projectFullName: v.optional(v.string()), // e.g., "karlorz/cmux"
    namespace: v.string(), // e.g., "coding", "research", "communication"
    scope: v.union(
      v.literal("hot"), // Always-loaded rules
      v.literal("domain"), // Domain-specific rules
      v.literal("project") // Project-specific rules
    ),
    status: v.union(
      v.literal("candidate"), // Seen but not confirmed
      v.literal("active"), // Confirmed and in use
      v.literal("suppressed"), // User-suppressed
      v.literal("archived") // Decayed/archived
    ),
    text: v.string(), // The rule content
    sourceType: v.union(
      v.literal("user_correction"), // From explicit user feedback
      v.literal("stop_hook_reflection"), // From agent self-reflection
      v.literal("manual_promotion"), // Manually promoted by user
      v.literal("manual_import") // Imported from external source
    ),
    sourceTaskRunId: v.optional(v.id("taskRuns")),
    sourceSnapshotId: v.optional(v.id("agentMemorySnapshots")),
    confidence: v.number(), // 0.0 to 1.0
    timesSeen: v.number(), // How many times this rule was seen
    timesUsed: v.number(), // How many times this rule was applied
    lastUsedAt: v.optional(v.number()), // Timestamp of last application
    lastConfirmedAt: v.optional(v.number()), // Timestamp of last user confirmation
    staleScore: v.optional(v.number()), // Decay score for archival
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_team_status", ["teamId", "status", "updatedAt"])
    .index("by_team_scope_status", ["teamId", "scope", "status"])
    .index("by_team_namespace_status", ["teamId", "namespace", "status"])
    .index("by_team_project_status", ["teamId", "projectFullName", "status"])
    .index("by_team_updated", ["teamId", "updatedAt"]),

  // Behavior events log for provenance tracking (S15)
  // Append-only log of rule applications, corrections, promotions, and demotions
  agentBehaviorEvents: defineTable({
    teamId: v.string(),
    userId: v.optional(v.string()),
    taskRunId: v.optional(v.id("taskRuns")),
    ruleId: v.optional(v.id("agentBehaviorRules")),
    eventType: v.union(
      v.literal("correction_logged"), // User provided correction
      v.literal("reflection_logged"), // Agent self-reflection
      v.literal("rule_promoted"), // Rule promoted to active
      v.literal("rule_demoted"), // Rule demoted from active
      v.literal("rule_forgotten"), // Rule permanently removed
      v.literal("rule_suppressed"), // Rule suppressed by user
      v.literal("rule_used") // Rule was applied in a run (provenance)
    ),
    // Event payload - varies by eventType
    wrongAction: v.optional(v.string()), // For corrections
    correctAction: v.optional(v.string()), // For corrections
    learnedRule: v.optional(v.string()), // Derived rule text
    context: v.optional(v.string()), // Additional context
    previousStatus: v.optional(v.string()), // For status changes
    newStatus: v.optional(v.string()), // For status changes
    appliedInContext: v.optional(v.string()), // For rule_used: where it was applied
    createdAt: v.number(),
  })
    .index("by_team_type", ["teamId", "eventType", "createdAt"])
    .index("by_task_run", ["taskRunId", "createdAt"])
    .index("by_rule", ["ruleId", "createdAt"])
    .index("by_team_created", ["teamId", "createdAt"]),

  // Orchestration-specific rules for head-agent learning (S15 orchestration layer)
  // Distinct from agentBehaviorRules: uses "lane" instead of "namespace",
  // links to orchestration runs, and focuses on orchestration strategy learning.
  agentOrchestrationRules: defineTable({
    teamId: v.string(),
    userId: v.optional(v.string()),
    projectFullName: v.optional(v.string()),
    lane: v.union(
      v.literal("hot"), // Always-loaded orchestration rules
      v.literal("orchestration"), // Orchestration-specific rules
      v.literal("project") // Project-specific orchestration rules
    ),
    status: v.union(
      v.literal("candidate"),
      v.literal("active"),
      v.literal("dismissed"),
      // Deprecated: kept for backwards compatibility, treated as "dismissed"
      v.literal("suppressed"),
      v.literal("archived")
    ),
    text: v.string(),
    sourceType: v.union(
      v.literal("user_correction"),
      v.literal("run_review"), // From post-run review
      v.literal("manual_promotion"),
      v.literal("manual_import")
    ),
    sourceTaskRunId: v.optional(v.id("taskRuns")),
    sourceSnapshotId: v.optional(v.id("agentMemorySnapshots")),
    linkedOrchestrationId: v.optional(v.string()), // Links to orchestration run
    confidence: v.number(),
    timesSeen: v.number(),
    timesUsed: v.number(),
    lastUsedAt: v.optional(v.number()),
    lastConfirmedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_team_status", ["teamId", "status", "updatedAt"])
    .index("by_team_lane_status", ["teamId", "lane", "status"])
    .index("by_team_project_status", ["teamId", "projectFullName", "status"])
    .index("by_team_updated", ["teamId", "updatedAt"]),

  // Orchestration learning events log (append-only)
  // Captures orchestrator-specific learnings separate from generic behavior corrections
  agentOrchestrationLearningEvents: defineTable({
    teamId: v.string(),
    userId: v.optional(v.string()),
    taskRunId: v.optional(v.id("taskRuns")),
    ruleId: v.optional(v.id("agentOrchestrationRules")),
    orchestrationId: v.optional(v.string()),
    eventType: v.union(
      v.literal("learning_logged"),
      v.literal("error_logged"),
      v.literal("feature_request_logged"),
      v.literal("rule_promoted"),
      v.literal("rule_dismissed"),
      // Deprecated: kept for backwards compatibility
      v.literal("rule_suppressed"),
      v.literal("rule_forgotten"),
      v.literal("rule_used")
    ),
    text: v.string(),
    metadataJson: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_team_type", ["teamId", "eventType", "createdAt"])
    .index("by_task_run", ["taskRunId", "createdAt"])
    .index("by_rule", ["ruleId", "createdAt"])
    .index("by_orchestration", ["orchestrationId", "createdAt"])
    .index("by_team_created", ["teamId", "createdAt"]),

  // Orchestration skill candidates - repeated patterns that could become reusable skills
  agentOrchestrationSkillCandidates: defineTable({
    teamId: v.string(),
    projectFullName: v.optional(v.string()),
    patternKey: v.string(), // Hash/key identifying the repeated pattern
    title: v.string(),
    summary: v.string(),
    sourceRuleIds: v.array(v.id("agentOrchestrationRules")),
    recurrenceCount: v.number(),
    status: v.union(
      v.literal("candidate"),
      v.literal("approved"),
      v.literal("extracted"), // Converted to a real skill
      v.literal("rejected")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_team_status", ["teamId", "status", "updatedAt"])
    .index("by_team_pattern", ["teamId", "patternKey"])
    .index("by_team_recurrence", ["teamId", "recurrenceCount"]),

  // Provider health tracking for circuit breaker and resilience patterns
  // Tracks latency, success rate, and circuit state per provider
  providerHealth: defineTable({
    providerId: v.string(), // Provider ID (e.g., "anthropic", "openai", "openrouter")
    status: v.union(
      v.literal("healthy"),
      v.literal("degraded"),
      v.literal("unhealthy")
    ),
    circuitState: v.union(
      v.literal("closed"),
      v.literal("open"),
      v.literal("half-open")
    ),
    failureCount: v.number(),
    successRate: v.number(), // 0.0 to 1.0
    latencyP50: v.number(), // Median latency in ms
    latencyP99: v.number(), // 99th percentile latency in ms
    totalRequests: v.number(),
    lastCheck: v.number(), // Timestamp of last health check
    lastError: v.optional(v.string()), // Most recent error message
    teamId: v.optional(v.string()), // Optional team scope (null = global)
  })
    .index("by_provider", ["providerId"])
    .index("by_team_provider", ["teamId", "providerId"])
    .index("by_status", ["status", "lastCheck"]),

  // Task queue for multi-agent orchestration
  // Enables priority-based task assignment and dependency management
  orchestrationTasks: defineTable({
    taskId: v.optional(v.id("tasks")), // Link to main task (optional for standalone orchestration)
    taskRunId: v.optional(v.id("taskRuns")), // Link to task run (optional)
    teamId: v.string(),
    userId: v.string(),
    priority: v.number(), // 0 = highest priority
    status: v.union(
      v.literal("pending"), // Waiting to be assigned
      v.literal("assigned"), // Assigned to an agent
      v.literal("running"), // Currently executing
      v.literal("completed"), // Successfully completed
      v.literal("failed"), // Failed with error
      v.literal("cancelled") // Cancelled by user or system
    ),
    assignedAgentName: v.optional(v.string()), // Agent assigned to this task
    assignedSandboxId: v.optional(v.string()), // Sandbox instance running this task
    dependencies: v.optional(v.array(v.id("orchestrationTasks"))), // Tasks that must complete first
    dependents: v.optional(v.array(v.id("orchestrationTasks"))), // Tasks waiting on this one
    prompt: v.string(), // Task description/prompt
    result: v.optional(v.string()), // Task result (when completed)
    errorMessage: v.optional(v.string()), // Error message (when failed)
    parentTaskId: v.optional(v.id("orchestrationTasks")), // For sub-task hierarchy
    metadata: v.optional(v.record(v.string(), v.any())), // Additional context
    createdAt: v.number(),
    updatedAt: v.number(),
    assignedAt: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    // Retry tracking for background worker
    retryCount: v.optional(v.number()), // Current retry attempt
    lastRetryAt: v.optional(v.number()), // Timestamp of last retry
    nextRetryAfter: v.optional(v.number()), // When to retry next (ms since epoch)
  })
    .index("by_team_status", ["teamId", "status", "updatedAt"])
    .index("by_team_status_priority", ["teamId", "status", "priority"])
    .index("by_assigned_agent", ["assignedAgentName", "status"])
    .index("by_parent", ["parentTaskId", "createdAt"])
    .index("by_task_run", ["taskRunId"])
    .index("by_status_started", ["status", "startedAt"])
    .index("by_status", ["status", "createdAt"]),

  // Uploaded orchestration bundles (debug case files)
  // Stores exported orchestration runs for sharing and analysis
  orchestrationBundles: defineTable({
    orchestrationId: v.string(), // The orchestration ID from the bundle
    teamId: v.string(),
    userId: v.string(),
    bundleVersion: v.string(), // Version of the export format (e.g., "1.0.0")
    exportedAt: v.string(), // ISO timestamp when bundle was exported
    prompt: v.optional(v.string()), // Original orchestration prompt
    status: v.string(), // Final status: completed, failed, partial, running
    summary: v.object({
      totalTasks: v.number(),
      completedTasks: v.number(),
      failedTasks: v.number(),
      pendingTasks: v.number(),
      runningTasks: v.number(),
    }),
    tasksJson: v.string(), // JSON array of task info
    eventsJson: v.optional(v.string()), // JSON array of events (optional)
    source: v.union(v.literal("local"), v.literal("cloud")), // Where the bundle originated
    createdAt: v.number(), // When uploaded to Convex
  })
    .index("by_orchestration", ["orchestrationId"])
    .index("by_team", ["teamId", "createdAt"]),

  // Agent orchestration messages for inter-agent communication
  // Messages sent via orchestrate sendMessage mutation are stored here
  // and synced to running sandboxes via MAILBOX.json updates
  agentOrchestrateMessages: defineTable({
    taskRunId: v.id("taskRuns"),
    teamId: v.string(),
    userId: v.string(),
    messageId: v.string(), // Unique message ID (msg_xxx)
    messageType: v.union(
      v.literal("handoff"),
      v.literal("request"),
      v.literal("status")
    ),
    senderName: v.string(), // Agent name or user identifier
    recipientName: v.optional(v.string()), // Agent name or "*" for broadcast
    content: v.string(), // Message content
    read: v.boolean(),
    timestamp: v.number(),
    createdAt: v.number(),
  })
    .index("by_task_run", ["taskRunId", "createdAt"])
    .index("by_task_run_unread", ["taskRunId", "read", "createdAt"])
    .index("by_team", ["teamId", "createdAt"])
    .index("by_recipient", ["recipientName", "read", "createdAt"]),

  // Orchestration events for typed agent communication
  // Persists AgentCommEvent events for audit, replay, and SSE delivery
  orchestrationEvents: defineTable({
    eventId: v.string(), // Unique event ID (evt_xxx)
    orchestrationId: v.string(), // Orchestration this event belongs to
    eventType: v.union(
      // Task lifecycle events
      v.literal("task_spawn_requested"),
      v.literal("task_started"),
      v.literal("task_status_changed"),
      v.literal("task_completed"),
      // Worker communication events
      v.literal("worker_message"),
      v.literal("worker_status"),
      // Approval events
      v.literal("approval_required"),
      v.literal("approval_resolved"),
      // Plan and orchestration events
      v.literal("plan_updated"),
      v.literal("orchestration_completed"),
      v.literal("provider_session_bound"),
      // Session lifecycle events (Phase 4)
      v.literal("session_started"),
      v.literal("session_resumed"),
      v.literal("session_stop_requested"),
      v.literal("session_stop_blocked"),
      v.literal("session_stop_failed"),
      // Memory and instructions events (Phase 4)
      v.literal("instructions_loaded"),
      v.literal("memory_loaded"),
      v.literal("memory_updated"),
      v.literal("memory_pruned"), // Legacy alias for memory_updated with action=archive
      v.literal("memory_scope_changed"), // P4: Scope transitions during session
      // Context health events (Phase 4)
      v.literal("context_warning"),
      v.literal("context_compacted"),
      // Operator input queue events
      v.literal("operator_input_queued"),
      v.literal("operator_input_drained"),
      v.literal("queue_full_rejected"),
      // Prompt/Turn tracking events (P1 Lifecycle Parity)
      v.literal("prompt_submitted"),
      v.literal("session_finished"),
      v.literal("run_resumed"),
      // Tool lifecycle events (P1 Lifecycle Parity)
      v.literal("tool_requested"),
      v.literal("tool_completed"),
      // MCP runtime events (P5 Lifecycle Parity)
      v.literal("mcp_capabilities_negotiated")
    ),
    teamId: v.string(),
    taskId: v.optional(v.string()), // Related orchestration task ID
    taskRunId: v.optional(v.id("taskRuns")), // Related task run
    correlationId: v.optional(v.string()), // For request-response tracking
    payload: v.any(), // Event-specific data (JSON)
    createdAt: v.number(),
  })
    .index("by_orchestration", ["orchestrationId", "createdAt"])
    .index("by_orchestration_type", ["orchestrationId", "eventType", "createdAt"])
    .index("by_team", ["teamId", "createdAt"])
    .index("by_task", ["taskId", "createdAt"])
    .index("by_task_run", ["taskRunId", "createdAt"])
    .index("by_event_id", ["eventId"]),

  // Operator input queue for steering head agents during active turns
  // Bounded queue that holds operator instructions until next turn boundary
  operatorInputQueue: defineTable({
    orchestrationId: v.string(), // Orchestration this input is for
    taskRunId: v.optional(v.id("taskRuns")), // Specific task run (optional)
    teamId: v.string(),
    userId: v.string(), // User who submitted the input
    content: v.string(), // The steering instruction
    priority: v.union(
      v.literal("high"), // Process first (interrupts, urgent corrections)
      v.literal("normal"), // Default priority
      v.literal("low") // Background guidance
    ),
    queuedAt: v.number(), // When input was queued
    processedAt: v.optional(v.number()), // When input was drained (null = pending)
    drainedBatchId: v.optional(v.string()), // Groups inputs drained together
  })
    .index("by_orchestration_pending", ["orchestrationId", "processedAt", "priority", "queuedAt"])
    .index("by_task_run_pending", ["taskRunId", "processedAt", "priority", "queuedAt"])
    .index("by_team", ["teamId", "queuedAt"]),

  // Provider session bindings for task-bound resume and continuity
  // Persists provider-specific session IDs (Claude session, Codex thread) per task
  providerSessionBindings: defineTable({
    orchestrationId: v.string(), // Parent orchestration
    taskId: v.string(), // Orchestration task ID
    taskRunId: v.optional(v.id("taskRuns")), // Link to task run
    teamId: v.string(),
    agentName: v.string(), // e.g., "claude/opus-4.5", "codex/gpt-5.1-codex"
    provider: v.union(
      v.literal("claude"),
      v.literal("codex"),
      v.literal("gemini"),
      v.literal("opencode"),
      v.literal("amp"),
      v.literal("grok"),
      v.literal("cursor"),
      v.literal("qwen")
    ),
    mode: v.union(v.literal("head"), v.literal("worker"), v.literal("reviewer")),
    // Provider-specific session identifiers
    providerSessionId: v.optional(v.string()), // Claude session ID
    providerThreadId: v.optional(v.string()), // Codex thread ID
    providerConversationId: v.optional(v.string()), // Generic conversation ID
    // Communication channel preference
    replyChannel: v.optional(
      v.union(v.literal("mailbox"), v.literal("sse"), v.literal("pty"), v.literal("ui"))
    ),
    // Lifecycle tracking
    status: v.union(
      v.literal("active"),
      v.literal("suspended"),
      v.literal("expired"),
      v.literal("terminated")
    ),
    lastActiveAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_orchestration", ["orchestrationId", "createdAt"])
    .index("by_task", ["taskId"])
    .index("by_task_run", ["taskRunId"])
    .index("by_team_provider", ["teamId", "provider", "status"])
    .index("by_team_agent", ["teamId", "agentName", "status"]),

  // Runtime Lineage - Append-only record of run-to-run relationships
  // Tracks how runs relate to earlier runs for durable resume ancestry.
  // Unlike providerSessionBindings (mutable current state), these records are never updated.
  runtimeLineage: defineTable({
    teamId: v.string(),
    // Current run being created/resumed
    taskRunId: v.id("taskRuns"),
    // Previous run this continues from (null for initial runs)
    previousTaskRunId: v.optional(v.id("taskRuns")),
    // How this run continues from the previous
    continuationMode: v.union(
      v.literal("initial"), // First run, no previous
      v.literal("retry"), // Automatic retry after failure
      v.literal("manual_resume"), // User explicitly resumed
      v.literal("checkpoint_restore"), // Restored from checkpoint
      v.literal("session_continuation"), // Provider session continuation (Claude --resume)
      v.literal("handoff"), // Handoff from another agent
      v.literal("reconnect") // Network reconnect to same session
    ),
    // Provider session identifiers (copied at time of lineage creation)
    providerSessionId: v.optional(v.string()), // Claude session ID
    providerThreadId: v.optional(v.string()), // Codex thread ID
    // Resume context
    resumeReason: v.optional(v.string()), // Human-readable reason
    checkpointRef: v.optional(v.string()), // Checkpoint reference if checkpoint_restore
    checkpointGeneration: v.optional(v.number()), // Checkpoint generation number
    // Actor/trigger that initiated this continuation
    actor: v.optional(
      v.union(
        v.literal("system"), // Automatic (retry, reconnect)
        v.literal("user"), // User action in UI
        v.literal("operator"), // Operator/admin action
        v.literal("agent"), // Agent initiated (handoff)
        v.literal("hook"), // Hook triggered
        v.literal("queue") // Queue processor
      )
    ),
    // Metadata
    agentName: v.optional(v.string()), // Agent at time of lineage
    orchestrationId: v.optional(v.string()), // Parent orchestration if any
    createdAt: v.number(), // Immutable - when this lineage was recorded
  })
    .index("by_task_run", ["taskRunId"]) // Find lineage for a specific run
    .index("by_previous_run", ["previousTaskRunId"]) // Find runs that continued from a given run
    .index("by_team", ["teamId", "createdAt"]) // Team lineage history
    .index("by_orchestration", ["orchestrationId", "createdAt"]), // Orchestration lineage

  // Approval requests for human-in-the-loop orchestration
  // Stores pending approvals for risky actions, review requests, and policy escalations
  approvalRequests: defineTable({
    orchestrationId: v.string(), // Parent orchestration
    taskId: v.optional(v.string()), // Related orchestration task
    taskRunId: v.optional(v.id("taskRuns")), // Related task run
    teamId: v.string(),
    requestId: v.string(), // Unique approval request ID (apr_xxx)
    // Source of the approval request
    source: v.union(
      v.literal("tool_use"), // Claude SDK tool permission
      v.literal("head_agent"), // Head agent review request
      v.literal("worker_agent"), // Worker escalation
      v.literal("policy"), // Policy-triggered approval
      v.literal("system") // System-generated (e.g., timeout warning)
    ),
    // Type of approval needed
    approvalType: v.union(
      v.literal("tool_permission"), // Tool use approval (Bash, Edit, etc.)
      v.literal("review_request"), // Code review request
      v.literal("deployment"), // Deployment approval
      v.literal("cost_override"), // Budget override request
      v.literal("escalation"), // General escalation to human
      v.literal("risky_action") // Risky action warning
    ),
    // What action is being requested
    action: v.string(), // e.g., "Bash: rm -rf node_modules", "Edit: src/main.ts"
    // Context for the approval decision
    context: v.object({
      agentName: v.string(), // Who is requesting
      filePath: v.optional(v.string()), // Affected file if applicable
      command: v.optional(v.string()), // Command if applicable
      reasoning: v.optional(v.string()), // Why the agent wants this
      riskLevel: v.optional(
        v.union(v.literal("low"), v.literal("medium"), v.literal("high"))
      ),
    }),
    // Optional payload for additional data
    payload: v.optional(v.any()),
    // Approval status
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("denied"),
      v.literal("expired"),
      v.literal("cancelled")
    ),
    // Resolution details
    resolvedBy: v.optional(v.string()), // User ID who resolved
    resolvedAt: v.optional(v.number()),
    resolution: v.optional(
      v.union(
        v.literal("allow"),
        v.literal("allow_once"),
        v.literal("allow_session"),
        v.literal("deny"),
        v.literal("deny_always")
      )
    ),
    resolutionNote: v.optional(v.string()), // Optional note from resolver
    // Timing
    expiresAt: v.optional(v.number()), // Auto-expire if not resolved
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_orchestration", ["orchestrationId", "createdAt"])
    .index("by_orchestration_status", ["orchestrationId", "status", "createdAt"])
    .index("by_team", ["teamId", "createdAt"])
    .index("by_team_status", ["teamId", "status", "createdAt"])
    .index("by_task", ["taskId", "createdAt"])
    .index("by_task_run", ["taskRunId", "createdAt"])
    .index("by_request_id", ["requestId"]),

  // Projects for grouping related tasks and tracking aggregate progress
  // Supports plan storage, Obsidian integration, and progress metrics
  projects: defineTable({
    teamId: v.string(),
    userId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    // Project goals (high-level objectives)
    goals: v.optional(
      v.array(
        v.object({
          id: v.string(),
          title: v.string(),
          completed: v.boolean(),
        })
      )
    ),
    // Project status
    status: v.union(
      v.literal("planning"),
      v.literal("active"),
      v.literal("paused"),
      v.literal("completed"),
      v.literal("archived")
    ),
    // Progress metrics (denormalized for efficient queries)
    totalTasks: v.optional(v.number()),
    completedTasks: v.optional(v.number()),
    failedTasks: v.optional(v.number()),
    // External linkages
    obsidianNotePath: v.optional(v.string()), // Path to linked Obsidian note
    githubProjectId: v.optional(v.string()), // GitHub Projects v2 node ID (PVT_xxx)
    // GitHub Project linking metadata (for URL-based linking)
    githubProjectUrl: v.optional(v.string()), // Raw URL, stored even if resolve fails
    githubProjectOwner: v.optional(v.string()), // Parsed from URL: owner login
    githubProjectNumber: v.optional(v.number()), // Parsed from URL: project number
    githubProjectOwnerType: v.optional(
      v.union(v.literal("user"), v.literal("organization"))
    ),
    // Cached GitHub Project item counts (refreshed on demand)
    githubItemsTotal: v.optional(v.number()),
    githubItemsDone: v.optional(v.number()),
    githubItemsInProgress: v.optional(v.number()),
    githubItemsCachedAt: v.optional(v.number()), // Epoch ms of last cache refresh
    // Orchestration plan (stored inline for fast access)
    plan: v.optional(
      v.object({
        orchestrationId: v.string(),
        headAgent: v.string(),
        description: v.optional(v.string()),
        tasks: v.array(
          v.object({
            id: v.string(),
            prompt: v.string(),
            agentName: v.string(),
            status: v.string(),
            dependsOn: v.optional(v.array(v.string())),
            priority: v.optional(v.number()),
            orchestrationTaskId: v.optional(v.string()),
          })
        ),
        updatedAt: v.string(), // ISO timestamp
      })
    ),
    // Count of currently running/assigned orchestration tasks
    runningTasks: v.optional(v.number()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_team", ["teamId", "updatedAt"])
    .index("by_team_status", ["teamId", "status", "updatedAt"])
    .index("by_team_user", ["teamId", "userId", "updatedAt"]),

  // Project milestones for tracking progress and deadlines
  milestones: defineTable({
    projectId: v.id("projects"),
    teamId: v.string(),
    userId: v.string(),
    // Milestone details
    title: v.string(),
    description: v.optional(v.string()),
    // Due date (epoch ms)
    dueDate: v.optional(v.number()),
    // Milestone status
    status: v.union(
      v.literal("not_started"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("overdue")
    ),
    // Progress tracking (optional, can be calculated from tasks)
    totalTasks: v.optional(v.number()),
    completedTasks: v.optional(v.number()),
    // Ordering within project (lower = earlier)
    sortOrder: v.number(),
    // Timestamps
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId", "sortOrder"])
    .index("by_team", ["teamId", "dueDate"])
    .index("by_team_status", ["teamId", "status", "dueDate"]),

  // Feed events for team activity stream
  feedEvents: defineTable({
    teamId: v.string(),
    userId: v.optional(v.string()),
    // Event type
    eventType: v.union(
      v.literal("task_completed"),
      v.literal("task_failed"),
      v.literal("task_interrupted"),
      v.literal("task_resumed"),
      v.literal("pr_merged"),
      v.literal("pr_opened"),
      v.literal("pr_closed"),
      v.literal("agent_started"),
      v.literal("agent_error"),
      v.literal("approval_required"),
      v.literal("approval_resolved"),
      v.literal("milestone_completed"),
      v.literal("project_created"),
      v.literal("orchestration_completed")
    ),
    // Event details
    title: v.string(),
    description: v.optional(v.string()),
    // Related entities
    taskId: v.optional(v.id("tasks")),
    taskRunId: v.optional(v.id("taskRuns")),
    projectId: v.optional(v.id("projects")),
    orchestrationTaskId: v.optional(v.id("orchestrationTasks")),
    // Metadata
    agentName: v.optional(v.string()),
    repoFullName: v.optional(v.string()),
    prNumber: v.optional(v.number()),
    prUrl: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
  })
    .index("by_team", ["teamId", "createdAt"])
    .index("by_team_type", ["teamId", "eventType", "createdAt"])
    .index("by_team_repo", ["teamId", "repoFullName", "createdAt"]),

  // MCP runtime capabilities - negotiated capabilities from active MCP sessions
  // Stores the actual capabilities that were negotiated at runtime, separate from
  // static server configuration. Used for operator visibility into what tools,
  // resources, and prompts are actually available during a task run.
  mcpRuntimeCapabilities: defineTable({
    // Link to task run where capability was negotiated
    taskRunId: v.id("taskRuns"),
    teamId: v.string(),
    // Server identity
    serverName: v.string(),
    configId: v.optional(v.id("mcpServerConfigs")),
    // Protocol info
    protocolVersion: v.string(),
    // Negotiated capabilities
    capabilities: v.object({
      tools: v.optional(v.array(v.string())),
      resources: v.optional(v.array(v.string())),
      prompts: v.optional(v.array(v.string())),
      tasks: v.optional(v.boolean()),
      roots: v.optional(v.boolean()),
      sampling: v.optional(v.boolean()),
      elicitation: v.optional(v.boolean()),
    }),
    // Transport info
    transport: v.union(v.literal("stdio"), v.literal("http"), v.literal("sse")),
    sessionId: v.optional(v.string()),
    // Connection state
    status: v.union(
      v.literal("connecting"),
      v.literal("connected"),
      v.literal("disconnected"),
      v.literal("error")
    ),
    errorMessage: v.optional(v.string()),
    // Timestamps
    connectedAt: v.optional(v.number()),
    lastActiveAt: v.number(),
    disconnectedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_task_run", ["taskRunId"])
    .index("by_team", ["teamId"])
    .index("by_server", ["serverName", "taskRunId"]),

  // MCP server configurations (central, cloud-based MCP management)
  // Users configure MCP servers in the web UI; these are injected into sandboxes
  // at startup. Borrows the per-agent enable pattern from cc-switch.
  mcpServerConfigs: defineTable({
    // Human-readable name (used as key in agent config, e.g. "context7")
    name: v.string(),
    // Display name shown in UI (e.g. "Context7 Documentation")
    displayName: v.string(),
    // MCP server transport config. Older records may omit type and should be treated as stdio.
    type: v.optional(v.union(v.literal("stdio"), v.literal("http"), v.literal("sse"))),
    command: v.optional(v.string()),
    args: v.optional(v.array(v.string())),
    url: v.optional(v.string()),
    headers: v.optional(v.record(v.string(), v.string())),
    // Optional environment variables for this MCP server
    envVars: v.optional(v.record(v.string(), v.string())),
    description: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    // Per-agent enable flags (following cc-switch pattern)
    enabledClaude: v.boolean(),
    enabledCodex: v.boolean(),
    enabledGemini: v.boolean(),
    enabledOpencode: v.boolean(),
    // If created from a preset, stores the preset name for UI distinction
    sourcePresetId: v.optional(v.string()),
    // Scope: global applies to all tasks, workspace scopes to a specific repo
    scope: v.union(v.literal("global"), v.literal("workspace")),
    // For workspace scope: the repo full name (e.g. "owner/repo")
    projectFullName: v.optional(v.string()),
    // Ownership
    userId: v.string(),
    teamId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_team_scope", ["teamId", "scope"])
    .index("by_team_project", ["teamId", "projectFullName"]),

  // Raw agent config storage for Claude Code and Codex CLI
  agentConfigs: defineTable({
    // Agent type: claude or codex
    agentType: v.union(v.literal("claude"), v.literal("codex")),
    // Scope: global applies to all tasks, workspace scopes to a specific repo
    scope: v.union(v.literal("global"), v.literal("workspace")),
    // For workspace scope: the repo full name (e.g. "owner/repo")
    projectFullName: v.optional(v.string()),
    // Raw config content (JSON for Claude, TOML for Codex)
    rawConfig: v.string(),
    // Validation status
    isValid: v.boolean(),
    validationError: v.optional(v.string()),
    // Ownership
    userId: v.string(),
    teamId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_team_agent", ["teamId", "agentType"])
    .index("by_team_agent_scope", ["teamId", "agentType", "scope"]),

  // Supervisor profiles for head-agent orchestration behavior
  // Standardizes how head agents plan, delegate, and review sub-agent work
  supervisorProfiles: defineTable({
    name: v.string(), // e.g. "Careful Reviewer", "Fast Delegator"
    description: v.optional(v.string()),
    // Model selection for the supervisor agent
    model: v.string(), // e.g. "claude/opus-4.6", "claude/sonnet-4.6"
    // Reasoning level: how much thinking the supervisor does before delegating
    reasoningLevel: v.union(
      v.literal("low"), // Quick decisions, minimal planning
      v.literal("medium"), // Balanced analysis before delegation
      v.literal("high") // Deep reasoning, detailed planning
    ),
    // Review posture: how strictly the supervisor reviews sub-agent output
    reviewPosture: v.union(
      v.literal("permissive"), // Accept most results
      v.literal("balanced"), // Standard review
      v.literal("strict") // Thorough review, may reject and retry
    ),
    // Delegation style: how the supervisor distributes work
    delegationStyle: v.union(
      v.literal("parallel"), // Maximize parallel execution
      v.literal("sequential"), // One task at a time
      v.literal("adaptive") // Choose based on task dependencies
    ),
    // Whether this is a built-in preset or user-created
    isPreset: v.optional(v.boolean()),
    // Ownership
    userId: v.string(),
    teamId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_team_name", ["teamId", "name"]),

  // Team orchestration settings - controls auto head-agent and sub-agent behavior
  orchestrationSettings: defineTable({
    teamId: v.string(),
    // Auto head-agent mode: when enabled, cloud workspaces automatically act as head agents
    autoHeadAgent: v.optional(v.boolean()), // Default: false
    // Default coding agent for sub-agent spawning
    defaultCodingAgent: v.optional(v.string()), // e.g. "codex/gpt-5.4-xhigh"
    // Default supervisor profile for head agents
    defaultSupervisorProfileId: v.optional(v.id("supervisorProfiles")),
    // Auto-spawn settings
    autoSpawnEnabled: v.optional(v.boolean()), // Allow head agents to auto-spawn sub-agents
    maxConcurrentSubAgents: v.optional(v.number()), // Limit concurrent sub-agents (default: 3)
    // Allowed repos for auto-orchestration (empty = all repos)
    allowedRepos: v.optional(v.array(v.string())), // ["owner/repo1", "owner/repo2"]
    // Sub-agent provider preferences
    preferredProviders: v.optional(v.array(v.string())), // ["codex", "claude", "gemini"]
    // Cost controls
    dailyBudgetCents: v.optional(v.number()), // Daily spending limit in cents
    maxTaskDurationMinutes: v.optional(v.number()), // Max duration per sub-agent task
    // /simplify pre-merge gate settings
    requireSimplifyBeforeMerge: v.optional(v.boolean()), // Default: false - require /simplify before task completion
    simplifyMode: v.optional(v.union(
      v.literal("quick"),
      v.literal("full"),
      v.literal("staged-only")
    )), // Default: "quick" - which /simplify mode to enforce
    simplifyTimeoutMinutes: v.optional(v.number()), // Default: 10 - timeout for simplify enforcement
    // Ownership
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_team", ["teamId"]),

  // Operator presets - user-configurable bundles of orchestration settings
  operatorPresets: defineTable({
    teamId: v.string(),
    userId: v.string(), // Creator
    // Display
    name: v.string(),
    description: v.optional(v.string()),
    icon: v.optional(v.string()), // Lucide icon name
    // Spawn settings
    taskClass: v.optional(
      v.union(
        v.literal("routine"),
        v.literal("deep-coding"),
        v.literal("review"),
        v.literal("eval"),
        v.literal("architecture"),
        v.literal("large-context")
      )
    ), // Task class for automatic model selection
    agentName: v.optional(v.string()), // Explicit agent (overrides taskClass)
    selectedVariant: v.optional(v.string()), // Effort/reasoning level
    supervisorProfileId: v.optional(v.id("supervisorProfiles")),
    priority: v.number(), // Queue priority (1-10)
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_team_user", ["teamId", "userId"])
    .index("by_team_name", ["teamId", "name"]),

  // Session activity tracking for visual change dashboards
  sessionActivity: defineTable({
    // Link to task run
    taskRunId: v.id("taskRuns"),
    // Session identifier (from autopilot)
    sessionId: v.string(),
    // Timing
    startedAt: v.string(),
    endedAt: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    // Git state
    startCommit: v.string(),
    endCommit: v.optional(v.string()),
    // Commits made during session
    commits: v.array(
      v.object({
        sha: v.string(),
        message: v.string(),
        timestamp: v.string(),
        filesChanged: v.number(),
        additions: v.number(),
        deletions: v.number(),
      })
    ),
    // PRs merged during session
    prsMerged: v.array(
      v.object({
        number: v.number(),
        title: v.string(),
        url: v.string(),
        mergedAt: v.string(),
        additions: v.number(),
        deletions: v.number(),
        filesChanged: v.number(),
      })
    ),
    // Files changed with details
    filesChanged: v.array(
      v.object({
        path: v.string(),
        additions: v.number(),
        deletions: v.number(),
        status: v.union(
          v.literal("added"),
          v.literal("modified"),
          v.literal("deleted"),
          v.literal("renamed")
        ),
      })
    ),
    // Aggregated stats for quick display
    stats: v.object({
      totalCommits: v.number(),
      totalPRs: v.number(),
      totalFiles: v.number(),
      totalAdditions: v.number(),
      totalDeletions: v.number(),
    }),
    // Ownership
    teamId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_taskRun", ["taskRunId"])
    .index("by_session", ["sessionId"])
    .index("by_team", ["teamId"])
    .index("by_team_time", ["teamId", "startedAt"]),

  // Centralized agent policy rules (Phase: Agent Policy Management)
  // Manages rules that apply to spawned agent sandboxes with scope hierarchy:
  // system > team > workspace > user (most specific wins)
  agentPolicyRules: defineTable({
    // Identity
    ruleId: v.string(), // "apr_xxx" format for stable external references
    name: v.string(), // Human-readable name
    description: v.optional(v.string()),

    // Scope hierarchy: system > team > workspace > user
    scope: v.union(
      v.literal("system"), // Applies to all sandboxes (cmux-managed)
      v.literal("team"), // Applies to team workspaces
      v.literal("workspace"), // Applies to specific repo
      v.literal("user") // User-specific override
    ),

    // Targeting fields (set based on scope)
    teamId: v.optional(v.string()), // For team/workspace/user scope
    projectFullName: v.optional(v.string()), // For workspace scope (owner/repo)
    userId: v.optional(v.string()), // For user scope

    // Agent targeting (empty = all agents)
    agents: v.optional(v.array(v.string())), // ["claude", "codex", "gemini", "opencode"]

    // Environment context targeting
    contexts: v.optional(
      v.array(
        v.union(
          v.literal("task_sandbox"), // Regular task spawns
          v.literal("cloud_workspace"), // Head agent / long-running workspaces
          v.literal("local_dev") // Desktop/local development
        )
      )
    ),

    // Rule content
    category: v.union(
      v.literal("git_policy"),
      v.literal("security"),
      v.literal("workflow"),
      v.literal("tool_restriction"),
      v.literal("custom")
    ),
    ruleText: v.string(), // Markdown text to inject into agent instructions
    priority: v.number(), // Lower = higher priority (for conflict resolution within same scope)

    // Status
    status: v.union(
      v.literal("active"),
      v.literal("disabled"),
      v.literal("deprecated")
    ),

    // Audit fields
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.optional(v.string()), // userId who created the rule
  })
    .index("by_scope", ["scope", "status"])
    .index("by_team", ["teamId", "status"])
    .index("by_team_scope", ["teamId", "scope", "status"])
    .index("by_project", ["projectFullName", "status"])
    .index("by_team_project", ["teamId", "projectFullName", "status"]) // Workspace scope with team isolation
    .index("by_user", ["userId", "status"])
    .index("by_ruleId", ["ruleId"]), // For upsert lookups

  // Phase 3: Swipe Code Review - Review Sessions
  // Tracks per-file review decisions (approve/reject) for PR reviews
  prReviewSessions: defineTable({
    teamId: v.string(),
    userId: v.string(),
    // Link to either a task run or external PR
    taskRunId: v.optional(v.id("taskRuns")),
    // External PR info (when not linked to a task run)
    repoFullName: v.optional(v.string()),
    prNumber: v.optional(v.number()),
    prUrl: v.optional(v.string()),
    // GitHub installation ID for API access
    installationId: v.optional(v.number()),
    // Session status
    status: v.union(
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("abandoned")
    ),
    // Counts for quick display
    totalFiles: v.number(),
    reviewedFiles: v.number(),
    approvedFiles: v.number(),
    changesRequestedFiles: v.number(),
    // Heatmap data (JSON string of PRHeatmapResult)
    heatmapData: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_team", ["teamId", "createdAt"])
    .index("by_team_user", ["teamId", "userId", "createdAt"])
    .index("by_task_run", ["taskRunId"]),

  // Phase 3: Swipe Code Review - File Decisions
  // Individual file review decisions within a session
  prReviewFileDecisions: defineTable({
    sessionId: v.id("prReviewSessions"),
    filePath: v.string(),
    decision: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("changes_requested"),
      v.literal("skipped")
    ),
    comment: v.optional(v.string()),
    // Risk score from heatmap
    riskScore: v.optional(v.number()),
    // Undo stack for reverting decisions
    undoStack: v.optional(
      v.array(
        v.object({
          decision: v.string(),
          comment: v.optional(v.string()),
          timestamp: v.number(),
        })
      )
    ),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_session", ["sessionId", "createdAt"])
    .index("by_session_file", ["sessionId", "filePath"]),

  // Phase 3: PR Merge Queue
  // Ordered queue for safe, sequential PR merging after review
  prMergeQueue: defineTable({
    teamId: v.string(),
    userId: v.string(),
    // PR info
    repoFullName: v.string(),
    prNumber: v.number(),
    prUrl: v.string(),
    prTitle: v.optional(v.string()),
    // Link to review session
    sessionId: v.optional(v.id("prReviewSessions")),
    // Queue status
    status: v.union(
      v.literal("queued"), // Waiting in queue
      v.literal("checks_pending"), // CI running
      v.literal("ready"), // CI passed, ready to merge
      v.literal("merging"), // Merge in progress
      v.literal("merged"), // Successfully merged
      v.literal("failed"), // Merge failed
      v.literal("cancelled") // Removed from queue
    ),
    // Queue position (lower = higher priority)
    position: v.number(),
    // Risk score from review (affects queue priority)
    riskScore: v.optional(v.number()),
    // GitHub check status
    checksPassedAt: v.optional(v.number()),
    // Merge details
    mergedAt: v.optional(v.number()),
    mergeCommitSha: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_team_status", ["teamId", "status", "position"])
    .index("by_team_repo", ["teamId", "repoFullName", "status"])
    .index("by_pr", ["repoFullName", "prNumber"])
    .index("by_session", ["sessionId"]),

  // Scheduled Tasks - recurring agent task execution
  // Enables "always-on" agents like Claude /loop and Cursor Automations
  scheduledTasks: defineTable({
    teamId: v.string(),
    userId: v.string(),
    // Task configuration
    name: v.string(), // Human-readable name
    description: v.optional(v.string()),
    prompt: v.string(), // The prompt to execute
    // Target repository (optional - for repo-scoped tasks)
    repoFullName: v.optional(v.string()),
    branch: v.optional(v.string()),
    // Agent configuration
    agentName: v.string(), // e.g., "claude/opus-4.5", "codex/gpt-5.1-codex"
    // Schedule configuration (cron-style)
    scheduleType: v.union(
      v.literal("interval"), // Every N minutes/hours
      v.literal("daily"), // Once per day at specific time
      v.literal("weekly"), // Once per week at specific day/time
      v.literal("cron") // Full cron expression
    ),
    // For interval: minutes between runs
    intervalMinutes: v.optional(v.number()),
    // For daily/weekly: hour (0-23) and minute (0-59) in UTC
    hourUTC: v.optional(v.number()),
    minuteUTC: v.optional(v.number()),
    // For weekly: day of week (0=Sunday, 6=Saturday)
    dayOfWeek: v.optional(v.number()),
    // For cron: full cron expression (e.g., "0 9 * * 1-5")
    cronExpression: v.optional(v.string()),
    // Execution status
    status: v.union(
      v.literal("active"), // Scheduled and running
      v.literal("paused"), // Temporarily disabled
      v.literal("disabled") // Permanently disabled
    ),
    // Execution tracking
    lastRunAt: v.optional(v.number()),
    lastRunTaskId: v.optional(v.id("tasks")),
    lastRunStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("running"),
        v.literal("completed"),
        v.literal("failed")
      )
    ),
    nextRunAt: v.optional(v.number()), // Pre-calculated next execution time
    runCount: v.number(), // Total executions
    failureCount: v.number(), // Consecutive failures (for backoff)
    // Limits
    maxConcurrentRuns: v.optional(v.number()), // Default 1
    maxRunsPerDay: v.optional(v.number()), // Rate limiting
    runsToday: v.optional(v.number()), // Counter reset daily
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_team", ["teamId", "status"])
    .index("by_team_user", ["teamId", "userId", "status"])
    .index("by_next_run", ["status", "nextRunAt"])
    .index("by_repo", ["repoFullName", "status"]),

  // Scheduled Task Runs - execution history
  scheduledTaskRuns: defineTable({
    scheduledTaskId: v.id("scheduledTasks"),
    teamId: v.string(),
    // Linked task/run
    taskId: v.optional(v.id("tasks")),
    taskRunId: v.optional(v.id("taskRuns")),
    // Execution details
    status: v.union(
      v.literal("pending"), // Waiting to start
      v.literal("spawning"), // Creating sandbox
      v.literal("running"), // Agent executing
      v.literal("completed"), // Success
      v.literal("failed"), // Error
      v.literal("skipped") // Skipped (e.g., previous run still active)
    ),
    triggeredAt: v.number(), // When schedule triggered
    startedAt: v.optional(v.number()), // When agent started
    completedAt: v.optional(v.number()),
    // Result
    errorMessage: v.optional(v.string()),
    // Output summary (for quick display)
    summary: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
  })
    .index("by_scheduled_task", ["scheduledTaskId", "createdAt"])
    .index("by_team", ["teamId", "createdAt"])
    .index("by_status", ["status", "triggeredAt"]),

  // Permission deny rules for Claude Code settings.json
  // These are the "deny" patterns in permissions.deny that restrict tool access
  // Separate from policy rules which are markdown instructions injected into CLAUDE.md
  permissionDenyRules: defineTable({
    // Identity
    ruleId: v.string(), // "pdr_xxx" format for stable external references
    pattern: v.string(), // e.g., "Bash(gh pr create:*)"
    description: v.string(), // Human-readable explanation

    // Scope hierarchy: system > team > workspace
    scope: v.union(
      v.literal("system"), // cmux-managed defaults
      v.literal("team"), // Team-wide override
      v.literal("workspace") // Repo-specific
    ),

    // Targeting fields (set based on scope)
    teamId: v.optional(v.string()), // For team/workspace scope
    projectFullName: v.optional(v.string()), // For workspace scope (owner/repo)

    // Environment context targeting (when this rule applies)
    contexts: v.array(
      v.union(
        v.literal("task_sandbox"), // Regular task spawns
        v.literal("cloud_workspace"), // Head agent / cloud workspaces
        v.literal("local_dev") // Desktop/local development
      )
    ),

    // Status
    enabled: v.boolean(),
    priority: v.number(), // Lower = higher priority (for ordering/conflict resolution)

    // Audit fields
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.optional(v.string()), // userId who created the rule
  })
    .index("by_scope", ["scope", "enabled"])
    .index("by_team", ["teamId", "enabled"])
    .index("by_team_scope", ["teamId", "scope", "enabled"])
    .index("by_ruleId", ["ruleId"]),

  // Alerts for observability
  alerts: defineTable({
    alertId: v.string(), // Unique alert identifier
    teamId: v.string(),
    userId: v.optional(v.string()), // User who triggered the alert (if applicable)

    // Alert details
    severity: v.union(
      v.literal("info"),
      v.literal("warning"),
      v.literal("error"),
      v.literal("critical")
    ),
    category: v.union(
      v.literal("sandbox"),
      v.literal("provider"),
      v.literal("orchestration"),
      v.literal("auth"),
      v.literal("system")
    ),
    title: v.string(),
    message: v.string(),
    metadata: v.optional(v.any()), // Additional context

    // Tracing
    traceId: v.optional(v.string()),

    // Status
    resolvedAt: v.optional(v.number()),
    acknowledgedAt: v.optional(v.number()),
    acknowledgedBy: v.optional(v.string()), // userId who acknowledged

    // Timestamps
    createdAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_team_severity", ["teamId", "severity"])
    .index("by_team_unresolved", ["teamId", "resolvedAt"])
    .index("by_alertId", ["alertId"]),

  // SLA metrics for tracking
  slaMetrics: defineTable({
    teamId: v.string(),
    metricName: v.string(), // e.g., "sandbox_spawn_p95", "task_completion_rate"
    value: v.number(),
    unit: v.string(), // "ms", "percent", "count"
    timestamp: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_team_metric", ["teamId", "metricName"])
    .index("by_team_metric_time", ["teamId", "metricName", "timestamp"]),

  // MCP Tool Registry for tool suggestions (Q4 Phase 4)
  mcpTools: defineTable({
    name: v.string(), // Unique tool identifier, e.g., "context7", "devsh-memory-mcp"
    displayName: v.string(), // Human-readable name
    description: v.string(), // What the tool does
    keywords: v.array(v.string()), // Keywords for matching
    category: v.union(
      v.literal("documentation"),
      v.literal("memory"),
      v.literal("code"),
      v.literal("testing"),
      v.literal("deployment"),
      v.literal("general")
    ),
    defaultEnabled: v.boolean(), // Auto-enable for all tasks
    // Optional: MCP server configuration
    serverConfig: v.optional(
      v.object({
        command: v.optional(v.string()), // Command to start server
        url: v.optional(v.string()), // URL for HTTP-based servers
        env: v.optional(v.any()), // Environment variables
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_category", ["category"])
    .index("by_default_enabled", ["defaultEnabled"]),

  // Team-specific tool preferences
  teamToolPreferences: defineTable({
    teamId: v.string(),
    toolName: v.string(), // References mcpTools.name
    enabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_team_tool", ["teamId", "toolName"]),

  // Tool usage tracking for learning from selections (Phase 19 enhancement)
  toolUsageStats: defineTable({
    teamId: v.string(),
    toolName: v.string(),
    selectionCount: v.number(), // Times tool was selected for a task
    lastSelectedAt: v.number(),
    // Optional: track prompt patterns that led to selection
    recentPromptKeywords: v.optional(v.array(v.string())),
  })
    .index("by_team", ["teamId"])
    .index("by_team_tool", ["teamId", "toolName"])
    .index("by_selection_count", ["teamId", "selectionCount"]),

  // Vault note access tracking - tracks when agents/users access Obsidian vault notes
  vaultNoteAccess: defineTable({
    teamId: v.string(), // canonical team UUID (string, not Id, for consistency with other tables)
    notePath: v.string(), // e.g., "5-Projects/GitHub/cmux/_Overview.md"
    noteTitle: v.optional(v.string()),
    lastAccessedAt: v.number(), // timestamp
    lastAccessedBy: v.optional(v.string()), // agent name or user email
    accessCount: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_team_path", ["teamId", "notePath"])
    .index("by_team_recent", ["teamId", "lastAccessedAt"]),
});

export default convexSchema;
