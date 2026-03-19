# Phase 0.5.1: Activity Stream Implementation Spec

## Overview
Add real-time agent activity events to the cmux web dashboard.
Claude PostToolUse hook → HTTP POST → Convex → real-time subscription → ActivityStream component.

## Files to Create

### 1. `packages/convex/convex/taskRunActivity.ts`

```typescript
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

// Schema addition for schema.ts:
// taskRunActivity: defineTable({
//   taskRunId: v.id("taskRuns"),
//   type: v.string(),
//   toolName: v.optional(v.string()),
//   summary: v.string(),
//   detail: v.optional(v.string()),
//   durationMs: v.optional(v.number()),
//   teamId: v.string(),
//   createdAt: v.number(),
// })
//   .index("by_task_run", ["taskRunId", "createdAt"])
//   .index("by_team", ["teamId", "createdAt"]),

export const insert = internalMutation({
  args: {
    taskRunId: v.id("taskRuns"),
    type: v.string(),
    toolName: v.optional(v.string()),
    summary: v.string(),
    detail: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    teamId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("taskRunActivity", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const getByTaskRun = query({
  args: {
    taskRunId: v.id("taskRuns"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("taskRunActivity")
      .withIndex("by_task_run", (q) => q.eq("taskRunId", args.taskRunId))
      .order("desc")
      .take(args.limit ?? 100);
  },
});
```

### 2. `packages/convex/convex/taskRunActivity_http.ts`

Copy pattern from `notifications_http.ts` (line 23-100):

```typescript
import { z } from "zod";
import { jsonResponse } from "../_shared/http-utils";
import { internal } from "./_generated/api";
import { httpAction, internalMutation } from "./_generated/server";
import { getWorkerAuth } from "./users/utils/getWorkerAuth";
import { typedZid } from "@cmux/shared/utils/typed-zid";

const ActivityEventSchema = z.object({
  taskRunId: typedZid("taskRuns"),
  type: z.enum(["tool_call", "file_edit", "file_read", "bash_command",
                 "test_run", "git_commit", "error", "thinking"]),
  toolName: z.string().optional(),
  summary: z.string().max(500),
  detail: z.string().max(10000).optional(),
  durationMs: z.number().optional(),
});

export const postActivity = httpAction(async (ctx, req) => {
  const auth = await getWorkerAuth(req, { loggerPrefix: "[taskRunActivity]" });
  if (!auth) return jsonResponse({ code: 401, message: "Unauthorized" }, 401);

  // Content-Type check
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("application/json")) {
    return jsonResponse({ code: 415, message: "Content-Type must be application/json" }, 415);
  }

  let json: unknown;
  try { json = await req.json(); } catch {
    return jsonResponse({ code: 400, message: "Invalid JSON" }, 400);
  }

  const validation = ActivityEventSchema.safeParse(json);
  if (!validation.success) {
    return jsonResponse({ code: 400, message: "Invalid input" }, 400);
  }

  const { taskRunId, ...eventData } = validation.data;

  // Verify ownership
  if (auth.payload.taskRunId !== taskRunId) {
    return jsonResponse({ code: 401, message: "Unauthorized" }, 401);
  }

  await ctx.runMutation(internal.taskRunActivity.insert, {
    taskRunId,
    teamId: auth.payload.teamId,
    ...eventData,
  });

  return jsonResponse({ ok: true }, 200);
});
```

### 3. Register route in `packages/convex/convex/http.ts`

After line 141 (agent-stopped route):

```typescript
import { postActivity } from "./taskRunActivity_http";

http.route({
  path: "/api/task-run/activity",
  method: "POST",
  handler: postActivity,
});
```

### 4. Activity hook script in `packages/shared/src/providers/anthropic/environment.ts`

Add to the lifecycle scripts section (alongside plan-hook.sh, stop-hook.sh):

```bash
#!/bin/bash
# activity-hook.sh - Posts agent tool-use events to cmux dashboard
set -eu
EVENT=$(cat)
TOOL_NAME=$(echo "$EVENT" | jq -r '.tool_use.name // "unknown"')
TOOL_INPUT=$(echo "$EVENT" | jq -r '.tool_use.input | tostring' | head -c 200)

# Map tool names to activity types
case "$TOOL_NAME" in
  Edit|Write|NotebookEdit) TYPE="file_edit" ;;
  Read)                     TYPE="file_read" ;;
  Bash)                     TYPE="bash_command" ;;
  Grep|Glob)                TYPE="file_read" ;;
  *)                        TYPE="tool_call" ;;
esac

# Build summary from tool input
case "$TOOL_NAME" in
  Edit)  SUMMARY="Edit $(echo "$EVENT" | jq -r '.tool_use.input.file_path // ""' | sed 's|.*/||')" ;;
  Read)  SUMMARY="Read $(echo "$EVENT" | jq -r '.tool_use.input.file_path // ""' | sed 's|.*/||')" ;;
  Write) SUMMARY="Write $(echo "$EVENT" | jq -r '.tool_use.input.file_path // ""' | sed 's|.*/||')" ;;
  Bash)  SUMMARY="Run: $(echo "$EVENT" | jq -r '.tool_use.input.command // ""' | head -c 80)" ;;
  *)     SUMMARY="$TOOL_NAME" ;;
esac

# Non-blocking POST
(
  curl -s -X POST "${CMUX_CALLBACK_URL}/api/task-run/activity" \
    -H "Content-Type: application/json" \
    -H "x-cmux-token: ${CMUX_TASK_RUN_JWT}" \
    -d "$(jq -n --arg trid "$CMUX_TASK_RUN_ID" --arg type "$TYPE" \
           --arg tool "$TOOL_NAME" --arg summary "$SUMMARY" \
           '{taskRunId: $trid, type: $type, toolName: $tool, summary: $summary}')" \
    >> /root/lifecycle/activity-hook.log 2>&1 || true
) &
exit 0
```

### 5. Expand PostToolUse matcher in environment.ts

Change line 395 from:
```typescript
matcher: "ExitPlanMode",
```
To:
```typescript
matcher: "Edit|Write|Bash|Read|Grep|Glob|NotebookEdit|Agent",
```

Keep ExitPlanMode hook separate (it has its own logic). Add new entry:
```typescript
PostToolUse: [
  {
    matcher: "ExitPlanMode",
    hooks: [{ type: "command", command: `${claudeLifecycleDir}/plan-hook.sh` }],
  },
  {
    matcher: "Edit|Write|Bash|Read|Grep|Glob|NotebookEdit|Agent",
    hooks: [{ type: "command", command: `${claudeLifecycleDir}/activity-hook.sh` }],
  },
],
```

### 6. `apps/client/src/components/ActivityStream.tsx`

React component using Convex real-time subscription:

```tsx
// Key props: taskRunId
// Uses: useQuery(api.taskRunActivity.getByTaskRun, { taskRunId })
// Renders: timeline of events with icons per type
// Features: auto-scroll, expandable detail, relative timestamps
```

### 7. Route: `apps/client/src/routes/_layout.$teamSlugOrId.task.$taskId.run.$runId.activity.tsx`

New tab alongside existing vscode/memory/orchestration tabs.

## Testing

- `packages/convex/convex/taskRunActivity.test.ts` — insert + query
- `packages/convex/convex/taskRunActivity_http.test.ts` — auth + validation
- Manual: run task with Claude, verify events appear in dashboard

## Effort: 3-5 days
