# Q4 Phase 2: Approval Channel Bridge

## Background

Claude Code v2.1.78 introduced `--channels` permission relay:
- Channel servers can forward tool approval prompts to user's phone
- Enables mobile approval without active terminal session

## Current cmux Approval Flow

```
Agent needs approval → Convex approvalRequests table → Web UI ApprovalRequestCard → User clicks Allow/Deny → Agent continues
```

**Files:**
- `apps/client/src/components/orchestration/ApprovalRequestCard.tsx`
- `packages/convex/convex/approvals.ts` (mutations)
- `packages/devsh-memory-mcp/src/tools/` (resolve_approval)

## Goal

Bridge Claude's `--channels` protocol to cmux's existing approval broker, enabling:
1. Mobile push notifications for approvals
2. Approve/deny from phone via cmux UI
3. No dependency on Claude's proprietary phone relay

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Claude Agent (sandbox)                   │
│  --channels cmux://approvals                                │
└─────────────────────┬───────────────────────────────────────┘
                      │ WebSocket/SSE
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   cmux Channel Server                        │
│  apps/server/lib/routes/channels.route.ts (NEW)             │
│  - Receives permission requests from Claude                  │
│  - Creates Convex approvalRequest                           │
│  - Waits for resolution via SSE                             │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   Convex + Web UI                            │
│  - approvalRequests table (existing)                        │
│  - ApprovalRequestCard (existing)                           │
│  - Mobile push via web notifications (NEW)                  │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Steps

### Step 1: Study Claude Channel Protocol
- [ ] Find channel server spec in Claude Code docs
- [ ] Understand wire format for permission requests
- [ ] Identify response format for allow/deny

### Step 2: Create Channel Server Route
- [ ] `apps/server/lib/routes/channels.route.ts`
- [ ] Register as MCP-style channel endpoint
- [ ] Handle incoming permission requests
- [ ] Create Convex approvalRequest

### Step 3: Bridge Resolution
- [ ] SSE endpoint for agent to wait on approval
- [ ] Forward Convex resolution to waiting agent
- [ ] Handle timeouts gracefully

### Step 4: Mobile Push (Optional)
- [ ] Web Push notifications for pending approvals
- [ ] Service worker for background notifications
- [ ] Deep link to approval card

## Dependencies

- Claude Code `--channels` protocol documentation
- Existing Convex approval infrastructure
- Web Push API for notifications

## Status

- [ ] Research Claude channel protocol spec
- [ ] Design channel server route
- [ ] Implement and test
