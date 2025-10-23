# CMUX Plan Mode with GPT-5 Pro - Complete Documentation Index

## Overview

This documentation provides a comprehensive guide for implementing a **Plan Mode** that integrates GPT-5 Pro with cmux's task management system. The plan mode allows users to:

1. Chat with GPT-5 Pro about their codebase
2. Get AI-generated task recommendations
3. Submit those tasks to cmux for parallel agent execution

---

## Documentation Files

### 1. **PLAN_MODE_ARCHITECTURE.md** (506 lines)
**The Comprehensive Blueprint**

Complete architectural analysis of cmux covering:
- **Chat/Task Interface UI** - All frontend components and their locations
- **Task Submission Flow** - Step-by-step frontend and backend flow
- **Backend Structure** - Hono routes, Convex schemas, and data models
- **Existing AI/LLM Integrations** - How agents are currently configured and spawned
- **Repository Integration** - How git repos are accessed and cloned
- **Task Execution Flow** - Complete lifecycle from task creation to completion
- **Data Flow Architecture** - Visual diagrams showing component interactions
- **Integration Points** - Where to add plan mode functionality

**Use this when**: You need to understand the full architecture or find specific files/functions.

### 2. **PLAN_MODE_QUICK_START.md** (442 lines)
**Step-by-Step Implementation Guide**

Ready-to-implement code examples showing:
- Create new chat component (`PlanModeChat.tsx`)
- Build GPT-5 Pro integration route (`gpt-5-plan.route.ts`)
- Extend Convex schema for plan sessions
- Connect chat output to task submission
- Gather codebase context for GPT
- Add task tracking for plan mode
- Test the integration end-to-end

**Use this when**: You're ready to start coding the implementation.

### 3. **PLAN_MODE_REFERENCE.md** (431 lines)
**Quick Reference and Lookup Guide**

Fast lookup for:
- File locations with line numbers
- Key data structures and TypeScript types
- API endpoints (existing and new)
- Task lifecycle ASCII diagram
- Socket.IO events reference
- Component hierarchy
- Convex queries called
- Schema validation requirements
- Environment setup
- Testing checklist
- Troubleshooting guide

**Use this when**: You need to quickly find a file path, data structure, or endpoint.

---

## Quick Navigation

### I need to understand...

**How does task submission work?**
- See: PLAN_MODE_ARCHITECTURE.md > Section 2: "Task Submission Flow"
- Reference: `/root/workspace/apps/client/src/routes/_layout.$teamSlugOrId.dashboard.tsx` (lines 366-531)

**Where does the UI live?**
- See: PLAN_MODE_ARCHITECTURE.md > Section 1: "Chat/Task Interface UI"
- Reference: `/root/workspace/apps/client/src/components/dashboard/`

**How are agents configured?**
- See: PLAN_MODE_ARCHITECTURE.md > Section 4: "Existing AI/LLM Integrations"
- Reference: `/root/workspace/packages/shared/src/agentConfig.ts`

**How does the backend handle tasks?**
- See: PLAN_MODE_ARCHITECTURE.md > Section 3: "Backend Structure"
- Reference: `/root/workspace/apps/server/src/socket-handlers.ts` (line 382)

**How do I implement plan mode?**
- See: PLAN_MODE_QUICK_START.md (entire file)
- Start with: Creating a new chat component
- End with: Testing the integration

**What files do I need to modify?**
- See: PLAN_MODE_REFERENCE.md > "File Locations Reference"
- Key files: hono-app.ts, schema.ts, dashboard.tsx

---

## Implementation Roadmap

### Phase 1: Backend API
1. Create GPT-5 Pro route: `/root/workspace/apps/www/lib/routes/gpt-5-plan.route.ts`
2. Add route to Hono app: `/root/workspace/apps/www/lib/hono-app.ts`
3. Update Convex schema: `/root/workspace/packages/convex/convex/schema.ts`

### Phase 2: Frontend Components
1. Create chat component: `/root/workspace/apps/client/src/components/plan-mode/`
2. Build route: `/root/workspace/apps/client/src/routes/_layout.$teamSlugOrId.plan-mode.tsx`
3. Add hooks: `/root/workspace/apps/client/src/hooks/usePlanMode.ts`

### Phase 3: Integration
1. Connect chat to task submission (existing socket.io event)
2. Store plan session references in Convex
3. Display plan session link in task details

### Phase 4: Testing & Refinement
1. End-to-end testing
2. Performance optimization
3. Error handling and edge cases

---

## Key Concepts

### Task Submission Flow
```
User Input (Dashboard or Plan Mode)
    ↓
Create Task in Convex (optimistic update)
    ↓
Emit "start-task" via Socket.IO
    ↓
Server validates with Zod schema
    ↓
Generate PR title with LLM
    ↓
Spawn selected agents in parallel
    ↓
Each agent creates taskRun and starts execution
    ↓
Emit "task-started" event back to client
```

### Repository Integration
```
User selects repo + branch
    ↓
Query GitHub via Convex (api.github.getReposByOrg)
    ↓
Get branches via Convex (api.github.getBranches)
    ↓
Task clones repo to Docker container
    ↓
Creates git worktree for isolation
    ↓
Agent CLI operates in worktree
    ↓
Changes captured as git diff
    ↓
Optional: Create pull request
```

### Plan Mode Flow
```
User chats with GPT-5 Pro
    ↓
Send codebase context (file structure, README, package.json)
    ↓
GPT-5 Pro analyzes and provides recommendations
    ↓
Extract task suggestions from response
    ↓
User clicks "Submit as Task"
    ↓
Convert task suggestion to task description
    ↓
Follow standard task submission flow
    ↓
Store plan session ID for reference
```

---

## Critical Implementation Points

### 1. Schema Validation (Required)
All Hono routes MUST:
```typescript
request: {
  body: {
    content: { "application/json": { schema: YourZodSchema } },
    required: true,  // CRITICAL: Must include
  },
}
```

### 2. Authentication Context
Always use `runWithAuth()` for async operations:
```typescript
runWithAuth(token, authJson, () => {
  // Your async code here
});
```

### 3. Convex Rules
- Use `authQuery`/`authMutation` for user context
- Cannot use Node APIs (use `crypto.subtle`)
- Add indexes for efficient queries

### 4. Socket.IO Events
- Validate all data with Zod schemas
- Always call callbacks (even on error)
- Use `rt.emit()` to broadcast

---

## File Summary

| File | Purpose | Key Lines |
|------|---------|-----------|
| **PLAN_MODE_ARCHITECTURE.md** | Complete architectural guide | 506 lines |
| **PLAN_MODE_QUICK_START.md** | Step-by-step implementation | 442 lines |
| **PLAN_MODE_REFERENCE.md** | Quick lookup guide | 431 lines |
| **/root/workspace/apps/client/src/routes/_layout.$teamSlugOrId.dashboard.tsx** | Main task interface | 366-531 |
| **/root/workspace/apps/server/src/socket-handlers.ts** | Socket event handler | 382+ |
| **/root/workspace/apps/www/lib/hono-app.ts** | Main API app | 118+ |
| **/root/workspace/packages/convex/convex/schema.ts** | Database schemas | 94-142 |
| **/root/workspace/packages/shared/src/agentConfig.ts** | Agent configurations | Full file |

---

## Next Steps

1. **Read** PLAN_MODE_ARCHITECTURE.md to understand the system
2. **Reference** PLAN_MODE_REFERENCE.md while coding
3. **Follow** PLAN_MODE_QUICK_START.md for implementation
4. **Test** following the testing checklist
5. **Deploy** and iterate based on feedback

---

## Support Files

All documentation is stored in `/root/workspace/`:
```
/root/workspace/
├── PLAN_MODE_INDEX.md           ← You are here
├── PLAN_MODE_ARCHITECTURE.md    ← Full blueprint
├── PLAN_MODE_QUICK_START.md     ← Code examples
├── PLAN_MODE_REFERENCE.md       ← Quick lookup
└── CLAUDE.md                    ← Project guidelines
```

---

## Key Contact Points

### Frontend Integration Points
- Dashboard: `/root/workspace/apps/client/src/routes/_layout.$teamSlugOrId.dashboard.tsx`
- Components: `/root/workspace/apps/client/src/components/dashboard/`
- Convex hooks: `useMutation(api.tasks.create)`, `useQuery(api.tasks.get)`

### Backend Integration Points
- Hono routes: `/root/workspace/apps/www/lib/routes/`
- Socket handlers: `/root/workspace/apps/server/src/socket-handlers.ts`
- Convex mutations: `/root/workspace/packages/convex/convex/tasks.ts`

### Agent Integration Points
- Configs: `/root/workspace/packages/shared/src/agentConfig.ts`
- Spawner: `/root/workspace/apps/server/src/agentSpawner.ts`
- Environment: `/root/workspace/apps/server/src/workspace.ts`

---

## Architecture Summary

```
┌─────────────────────────────────────────────────┐
│  Frontend (React + TanStack Router + Convex)   │
│  - Dashboard: Direct task submission            │
│  - Plan Mode: Chat-based task generation       │
└────────────────┬────────────────────────────────┘
                 │ Socket.IO + Convex
┌────────────────▼────────────────────────────────┐
│  Backend (Hono + Socket.IO)                     │
│  - GPT-5 Pro integration route                  │
│  - Task submission handler                      │
│  - Agent spawning orchestration                 │
└────────────────┬────────────────────────────────┘
                 │ Convex Database
┌────────────────▼────────────────────────────────┐
│  Database (Convex)                              │
│  - tasks table                                  │
│  - taskRuns table                               │
│  - planSessions table (new)                     │
│  - repos, branches tables                       │
└────────────────┬────────────────────────────────┘
                 │ Async Worker
┌────────────────▼────────────────────────────────┐
│  Execution (Docker/Morph)                       │
│  - Agent containers spawned in parallel         │
│  - Isolated git worktrees                       │
│  - VSCode instances                             │
└─────────────────────────────────────────────────┘
```

---

## Version Info

- **Created**: October 23, 2025
- **For**: cmux application (Claude Code orchestration)
- **Branch**: cmux/add-plan-mode-for-gpt-5-pro-prompts-yg0xh
- **Node Version**: 24+
- **Tech Stack**: React, TypeScript, Convex, Hono, Socket.IO, Docker

---

## Questions?

Refer to the specific documentation file:
- **Architecture questions** → PLAN_MODE_ARCHITECTURE.md
- **Implementation questions** → PLAN_MODE_QUICK_START.md
- **File/API lookup** → PLAN_MODE_REFERENCE.md
- **Project guidelines** → /root/workspace/CLAUDE.md

