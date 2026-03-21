# Q2 Phase 2: Operator Visual Verification

## Background

After coding agents complete their work, an operator agent can navigate the preview environment, take screenshots, and post them to the PR for visual verification.

## Current Infrastructure

**Already Available:**
- `magnitude-core@^0.3.0` in `apps/worker/package.json`
- `runBrowserAgentFromPrompt.ts` - CDP connection, Claude reasoning
- CDP ports: 39381 (HTTP), 39382 (WebSocket) in edge routers
- noVNC on port 39380 for visual debugging
- `postPreviewComment()` pipeline for GitHub comments
- Crown evaluation with video/image uploads

## Goal

Add post-task screenshot verification:
1. After coding agent completes → trigger verification task
2. Browser agent navigates preview URL
3. Capture screenshots of key pages
4. Post gallery to PR comment

## Design

### 1. Verification Task Type

```typescript
// packages/convex/convex/schema.ts
tasks: defineTable({
  // ...existing fields
  taskType: v.optional(v.union(
    v.literal("coding"),
    v.literal("verification"),  // NEW
    v.literal("review")
  )),
  parentTaskId: v.optional(v.id("tasks")), // Link to coding task
})
```

### 2. Post-Task Trigger

```typescript
// After task completion, optionally spawn verification
async function maybeSpawnVerification(taskId: Id<"tasks">) {
  const task = await ctx.db.get(taskId);
  if (task.taskType !== "coding") return;
  if (!task.previewUrl) return;

  await ctx.db.insert("tasks", {
    taskType: "verification",
    parentTaskId: taskId,
    prompt: `Navigate to ${task.previewUrl} and capture screenshots`,
    // ...
  });
}
```

### 3. Screenshot Capture Tool

New MCP tool for browser agent:

```typescript
{
  name: "capture_screenshot",
  description: "Capture screenshot of current page",
  inputSchema: {
    properties: {
      filename: { type: "string" },
      fullPage: { type: "boolean", default: false }
    }
  }
}
```

### 4. Gallery Comment

Reuse `postPreviewComment()` with screenshot gallery format:

```markdown
## Visual Verification Results

| Page | Screenshot |
|------|------------|
| Home | ![home](url) |
| Dashboard | ![dashboard](url) |

✅ All pages rendered correctly
```

## Implementation

### Phase 2a: Task Type & Trigger (1 day)
- [ ] Add taskType field to tasks schema
- [ ] Add verification trigger after task completion
- [ ] Link verification to parent coding task

### Phase 2b: Screenshot Tool (1 day)
- [ ] Add capture_screenshot MCP tool
- [ ] Store screenshots to Convex storage
- [ ] Return URLs for gallery

### Phase 2c: Gallery Comment (0.5 day)
- [ ] Format screenshot gallery markdown
- [ ] Post to PR using existing pipeline

### Phase 2d: UI Integration (Optional)
- [ ] Show verification status in dashboard
- [ ] Display screenshot gallery in task details

## Files to Modify

- `packages/convex/convex/schema.ts` - Add taskType
- `packages/convex/convex/tasks.ts` - Add verification trigger
- `packages/devsh-memory-mcp/src/tools/` - Add capture_screenshot
- `packages/convex/convex/github_pr_comments.ts` - Gallery format

## Status

**Already Implemented:**
- [x] Phase 2a: Task Type & Trigger - `operatorVerification.ts`, `operatorVerification_actions.ts`
- [x] Phase 2b: Screenshot Tool - `taskRuns.ts` triggers on completion
- [x] Phase 2c: Gallery Comment - `postOperatorScreenshotComment` in `github_pr_comments.ts`
- [x] Phase 2d: UI Integration - Verification status badge in `RunScreenshotGallery.tsx` (PR #739)

The full Phase 2 pipeline is already implemented:
1. Task run completes → `updateStatus` schedules `triggerOperatorVerification` (5s delay)
2. Verification checks eligibility → sandbox worker triggers screenshot collection
3. Worker POSTs results → `handleVerificationResult` stores and schedules GitHub comment
4. `postScreenshotsToGitHub` posts gallery to PR
