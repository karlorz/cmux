# Native Workflow Dashboard Plan

## Problem

The cmux web dashboard is a task launcher, not a workflow surface. Agent execution is trapped inside the VS Code iframe. Users see "Running..." for 10-30 minutes with no visibility into what the agent is doing.

`taskRunLogChunks` (the original log streaming mechanism) was deprecated - `appendChunk()` is a no-op.

## Goal

Surface agent workflow **natively in the cmux web app** so users can see:
1. What the agent is currently doing (live activity stream)
2. What code is changing (live diffs)
3. What tests pass/fail (structured results)
4. What errors occurred (surfaced alerts, not buried in terminal)
5. What sub-agents are spawning (real-time orchestration view)

VS Code iframe becomes an optional "deep dive" tool, not the primary workflow surface.

## Architecture

```
Agent in Sandbox
  ├── Terminal output ──→ SSE/WebSocket ──→ Dashboard: Live Log Panel
  ├── Tool calls ───────→ Convex events ──→ Dashboard: Activity Timeline
  ├── File edits ───────→ Git diff stream → Dashboard: Live Diff Panel
  ├── Test results ─────→ Structured data → Dashboard: Test Results Badge
  ├── Errors ───────────→ Convex alerts ──→ Dashboard: Error Banner
  └── Git commits ──────→ Convex events ──→ Dashboard: Commit Timeline
```

## Phase 1: Agent Activity Stream (Foundation)

### What
A real-time activity stream showing what the agent is doing right now.

### Data Sources (Already Available)
- `orchestrationEvents` table in Convex (SSE streaming exists)
- Socket.IO events from apps/server (task lifecycle)
- `taskRunLogChunks` table structure (exists, write path disabled)

### Implementation

1. **Revive log chunk streaming**
   - Fix `appendChunk()` in `taskRunLogChunks.ts` (currently no-op)
   - Or: new SSE endpoint that streams from sandbox xterm
   - Or: pipe sandbox stdout/stderr to Convex via HTTP POST (like memory sync)

2. **Agent activity event types**
   ```typescript
   type AgentActivityEvent = {
     type: "tool_call" | "file_edit" | "file_read" | "bash_command" |
           "test_run" | "git_commit" | "error" | "thinking" | "sub_agent_spawn";
     timestamp: number;
     summary: string;        // "Edit src/auth/middleware.ts (+12/-3)"
     detail?: string;        // Full diff or command output
     duration_ms?: number;
   };
   ```

3. **Dashboard component: ActivityStream**
   - Route: alongside existing task run panels (new tab or always-visible sidebar)
   - Real-time updates via Convex subscription
   - Expandable entries (click to see full diff/output)
   - Auto-scroll to latest with "pin to bottom" toggle

### Files to Create/Modify
- `packages/convex/convex/taskRunActivity.ts` — NEW: activity event mutations + queries
- `packages/convex/convex/schema.ts` — NEW table: `taskRunActivity`
- `apps/client/src/components/ActivityStream.tsx` — NEW: real-time activity view
- `apps/client/src/routes/_layout.$teamSlugOrId.task.$taskId.run.$runId.activity.tsx` — NEW route

### Concrete Implementation (from codebase research 2026-03-19)

#### Data Flow

```
Claude PostToolUse hook → activity-hook.sh
  → curl POST /api/task-run/activity (JWT auth)
  → Convex taskRunActivity.insert()
  → Convex real-time subscription
  → Dashboard ActivityStream component
```

#### Step 1: Convex table `taskRunActivity`

File: `packages/convex/convex/schema.ts`

```typescript
taskRunActivity: defineTable({
  taskRunId: v.id("taskRuns"),
  type: v.string(),  // tool_call, file_edit, bash_command, test_run, git_commit, error
  toolName: v.optional(v.string()),
  summary: v.string(),  // "Edit src/auth.ts (+12/-3)"
  detail: v.optional(v.string()),
  durationMs: v.optional(v.number()),
  teamId: v.string(),
  createdAt: v.number(),
}).index("by_task_run", ["taskRunId", "createdAt"])
```

#### Step 2: HTTP endpoint

File: `packages/convex/convex/taskRunActivity_http.ts` (NEW)

Copy the proven pattern from `notifications_http.ts`:
- `getWorkerAuth(req)` for JWT validation
- Zod schema for request body
- `ctx.runMutation(internal.taskRunActivity.insert, ...)`

Register in `packages/convex/convex/http.ts`:
```typescript
http.route({ path: "/api/task-run/activity", method: "POST", handler: postTaskRunActivity });
```

#### Step 3: Claude PostToolUse hook

File: `packages/shared/src/providers/anthropic/environment.ts` (line ~393)

Existing PostToolUse only hooks `ExitPlanMode`. Expand matcher to `".*"` (all tools):

```typescript
PostToolUse: [{
  matcher: ".*",
  hooks: [{ type: "command", command: `${claudeLifecycleDir}/activity-hook.sh` }],
}],
```

The `activity-hook.sh` script:
- Reads tool_use JSON from stdin
- Extracts tool name + input summary
- Background POST to `/api/task-run/activity` with JWT auth
- Non-blocking (runs in background, exits immediately)

Auth pattern already proven: `CMUX_CALLBACK_URL` + `x-cmux-token: ${CMUX_TASK_RUN_JWT}`

#### Step 4: Codex fallback

Codex writes `/root/lifecycle/codex-turns.jsonl` per turn. Background process parses this file and POSTs activity events. Lower fidelity than Claude hooks but works.

#### Step 5: Dashboard component

Files:
- `apps/client/src/components/ActivityStream.tsx` (NEW)
- `apps/client/src/routes/_layout.$teamSlugOrId.task.$taskId.run.$runId.activity.tsx` (NEW route)

Uses `useQuery(api.taskRunActivity.getByTaskRunId)` for real-time Convex subscription.

#### Files Summary

| Action | File | What |
|--------|------|------|
| CREATE | `packages/convex/convex/taskRunActivity.ts` | Mutations + queries |
| CREATE | `packages/convex/convex/taskRunActivity_http.ts` | HTTP endpoint |
| CREATE | `apps/client/src/components/ActivityStream.tsx` | Dashboard UI |
| CREATE | `apps/client/src/routes/...activity.tsx` | Route |
| MODIFY | `packages/convex/convex/schema.ts` | Add table |
| MODIFY | `packages/convex/convex/http.ts` | Register route |
| MODIFY | `packages/shared/src/providers/anthropic/environment.ts` | Add hook |

#### Why This Works

- Reuses proven JWT + HTTP POST + Convex mutation pattern (same as crown/complete, notifications)
- Claude PostToolUse hook already exists for ExitPlanMode — just expand the matcher
- Convex real-time subscriptions give instant UI updates
- Non-blocking: hook script runs in background, doesn't slow agent

### Effort: 3-5 days for Claude foundation, +2 days for Codex fallback

### Implementation Status - COMPLETE
- `taskRunActivity.ts` - Convex mutations + queries
- `taskRunActivity_http.ts` - HTTP endpoint for agent hooks
- `ActivityStream.tsx` - Dashboard UI component with filtering, search, export
- Route integrated into task run view

## Phase 2: Live Diff Panel - COMPLETE

### What
Show code changes as they happen, without needing the VS Code iframe.

### Implementation - DONE
- `LiveDiffPanel.tsx` - Real-time diff viewer with fallback to committed diff
- `useLiveDiff.ts` - Hook for fetching live git diff from running sandboxes
- Polls every 10s while running, shows committed diff when stopped

## Phase 3: Structured Test Results - COMPLETE

### What
Parse test output into structured pass/fail badges.

### Implementation - DONE
- `TestResultsPanel.tsx` - Dashboard component with pass/fail badges
- `parse-test-output.ts` - Parser for vitest, jest, pytest, go test formats
- Real-time updates via Convex subscription

## Phase 4: Error Surfacing - COMPLETE

### What
Agent errors visible immediately in dashboard, not buried in terminal scroll.

### Implementation - DONE
- `error-hook.sh` - Claude StopFailure hook posts to activity endpoint
- Activity stream shows error events with red banner styling
- Real-time via Convex subscription

## Updated Priority Matrix

| Priority | Feature | Why First |
|----------|---------|-----------|
| **P0** | Activity stream (Phase 1) | Foundation for all workflow visibility |
| **P0** | Error surfacing (Phase 4) | Users need to know when things fail |
| **P1** | Live diff panel (Phase 2) | Most requested: "what code changed?" |
| **P1** | Launch 1: PR Comment → Agent | First user-facing launch |
| **P2** | Test results (Phase 3) | Nice-to-have structured view |
| **P2** | Launch 2: Operator screenshots | Builds on activity stream |
| **P3** | Launch 3: Swipe review | Builds on diff panel |

## Design Constraint

Keep the iframe as an option. Some users will always want full VS Code. The native dashboard should be the **default view** with a "Open in VS Code" button for deep dives.

```
┌─ Task Run View ──────────────────────────────────┐
│                                                    │
│  Tabs: [Activity] [Diff] [Memory] [VS Code]       │
│                                                    │
│  Activity (default):                               │
│  ┌──────────────────────────────────────────────┐ │
│  │ 10:01 ● Agent started (claude/opus-4.6)      │ │
│  │ 10:02 ○ Read src/auth/middleware.ts           │ │
│  │ 10:03 ● Edit src/auth/middleware.ts (+12/-3)  │ │
│  │ 10:04 ○ Run: bun test auth → ✓ 3 passed      │ │
│  │ 10:05 ○ Commit: "fix: validate JWT expiry"   │ │
│  │ 10:06 ● PR created: #123                      │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  [Open in VS Code]  [View Full Diff]  [Stop Agent] │
└────────────────────────────────────────────────────┘
```
