# PLAN MODE - QUICK REFERENCE

## File Locations Reference

### Frontend (React)
```
apps/client/src/
├── routes/
│   ├── _layout.$teamSlugOrId.dashboard.tsx        ← Main task interface (366-531: handleStartTask)
│   └── [NEW: _layout.$teamSlugOrId.plan-mode.tsx] ← Plan mode route
├── components/
│   ├── dashboard/
│   │   ├── DashboardInput.tsx                      ← Rich text editor (Lexical)
│   │   ├── DashboardInputControls.tsx             ← Repo/branch/agent selection
│   │   ├── DashboardStartTaskButton.tsx           ← "Start task" button
│   │   ├── TaskList.tsx                           ← Task list display
│   │   └── TaskItem.tsx                           ← Individual task card
│   └── [NEW: plan-mode/]
│       ├── PlanModeChat.tsx                       ← Main chat component
│       ├── ChatMessage.tsx                        ← Message display
│       └── TaskSuggestions.tsx                    ← Generated tasks list
└── hooks/
    └── [NEW: usePlanMode.ts]                      ← Plan mode hook
```

### Backend (Hono)
```
apps/www/lib/
├── hono-app.ts                                     ← Main Hono app (line 118+: app.route())
└── routes/
    ├── github.repos.route.ts                      ← Get repositories
    ├── github.repos.route.ts                      ← Get branches
    ├── [NEW: gpt-5-plan.route.ts]                ← Plan mode API route
    └── dev-server.route.ts                        ← Task submission schema reference
```

### Convex Database
```
packages/convex/convex/
├── schema.ts                                       ← Database schema (lines 94-142: tasks, taskRuns)
├── tasks.ts                                        ← Task queries/mutations
├── github.ts                                       ← Repo/branch queries
└── [UPDATE: schema.ts]                            ← Add planSessions table
```

### Shared Libraries
```
packages/shared/src/
├── agentConfig.ts                                  ← Agent configurations (AGENT_CONFIGS array)
└── providers/                                      ← Agent-specific configs
    ├── anthropic/
    ├── openai/
    └── [etc.]
```

### Server/Worker
```
apps/server/src/
├── socket-handlers.ts                              ← Socket event handlers (line 382: start-task)
├── agentSpawner.ts                                ← Agent spawning logic
├── workspace.ts                                    ← Git setup and worktree management
└── utils/
    ├── branchNameGenerator.ts                     ← Branch/PR title generation
    └── convexClient.ts                            ← Convex client setup
```

---

## Key Data Structures

### Task Submission Payload
```typescript
{
  repoUrl?: string,           // "https://github.com/owner/repo.git"
  branch?: string,            // "main"
  taskDescription: string,    // User's task prompt (can include images)
  projectFullName: string,    // "owner/repo"
  taskId: string,             // Created in step 1
  selectedAgents?: string[],  // ["claude/sonnet-4.5", "codex/gpt-5"]
  isCloudMode: boolean,       // true for Morph/cloud, false for Docker
  environmentId?: string,     // Optional environment ID
  images?: Array<{            // Inline images
    src: string,
    fileName?: string,
    altText: string,
  }>,
  theme?: "dark" | "light" | "system",
}
```

### Task in Convex
```typescript
{
  _id: Id<"tasks">,
  _creationTime: number,
  text: string,                    // Main task description
  description?: string,            // Optional detailed description
  projectFullName?: string,        // "owner/repo"
  baseBranch?: string,             // "main"
  worktreePath?: string,           // Set during execution
  isCompleted: boolean,
  isArchived?: boolean,
  userId: string,
  teamId: string,
  environmentId?: Id<"environments">,
  planSessionId?: string,          // [NEW] Link to plan session
  mergeStatus?: string,            // PR status
  images?: Array<{
    storageId: Id<"_storage">,
    fileName?: string,
    altText: string,
  }>,
  createdAt: number,
  updatedAt: number,
}
```

### Agent Config
```typescript
{
  name: string,                       // "claude/sonnet-4.5"
  command: string,                    // "bunx"
  args: string[],                     // ["@anthropic-ai/claude-code@latest", "--model", "claude-sonnet-4.5-20250514"]
  apiKeys?: Array<{
    envVar: string,                   // "ANTHROPIC_API_KEY"
    displayName: string,
  }>,
  environment?: (ctx) => Promise<EnvironmentResult>,
  checkRequirements?: () => Promise<string[]>,
  completionDetector?: (taskRunId) => Promise<void>,
}
```

---

## API Endpoints Created/Used

### New for Plan Mode

```bash
# POST /api/gpt-5/plan
# Input:
{
  messages: Array<{ role: "user" | "assistant", content: string }>,
  userMessage: string,
  codebaseContext: {
    repoName: string,
    branch: string,
    fileStructure: string,
    readmeContent?: string,
  },
  teamSlugOrId: string,
}

# Output:
{
  response: string,
  suggestedTasks: Array<{
    title: string,
    description: string,
  }>,
}
```

### Existing Endpoints Used

```bash
# GET /api/integrations/github/repos
# Query: team, installationId, search, page
# Returns: { repos: [...] }

# GET /api/branches
# Query: repo
# Returns: [...branch names]

# POST /api/start-task (Socket.IO)
# Input: StartTaskSchema payload
# Output: { taskId, error? }
```

---

## Task Lifecycle

```
START
  │
  ├─ User enters task description in dashboard or plan mode
  │
  ├─ Client creates task in Convex (optimistic update)
  │   └─ Returns taskId
  │
  ├─ Client emits "start-task" socket event
  │
  ├─ [Server] Validates with StartTaskSchema
  │
  ├─ [Server] Checks Docker status (local mode only)
  │
  ├─ [Server] Generates PR title using LLM
  │   └─ Saves to task metadata
  │
  ├─ [Server] Spawns agents in parallel
  │   For each selected agent:
  │   ├─ Creates taskRun in Convex (status: pending)
  │   ├─ Clones repo to worktree
  │   ├─ Creates git branch
  │   ├─ Injects task prompt via $PROMPT env var
  │   ├─ Spawns Docker container with agent CLI
  │   └─ Monitors execution
  │
  ├─ [Server] Emits "task-started" event
  │
  ├─ [Agents] Execute in parallel, make changes
  │
  ├─ [Server] Captures git diff for each run
  │
  ├─ [Server] Creates/updates pull requests
  │
  ├─ [Optional] Crown evaluation to pick best run
  │
  └─ END

```

---

## Socket.IO Events Reference

### Client → Server

```typescript
// Start a task
socket.emit("start-task", StartTaskPayload, (response) => {
  // response: { taskId, error? }
});

// Archive a task
socket.emit("archive-task", { taskId }, (response) => {});

// Other events...
```

### Server → Client

```typescript
// Task started
rt.emit("task-started", { taskId, worktreePath, terminalId });

// VSCode opened
rt.emit("vscode-spawned", { instanceId, url, workspaceUrl });

// Task failed
rt.emit("task-failed", { taskId, error });

// Task completed
rt.emit("task-completed", { taskId, summary });
```

---

## Component Hierarchy

```
PlanModeRoute
├── PlanModeChat
│   ├── ChatHistory (list of messages)
│   ├── ChatInput (text input)
│   └── ChatMessage (individual message display)
├── RepositorySelector
│   ├── Project dropdown (populated from api.github.getReposByOrg)
│   └── Branch dropdown (populated from api.github.getBranches)
└── TaskSuggestions
    ├── TaskSuggestion (individual task card)
    │   ├── Task title
    │   ├── Task description
    │   └── "Submit as Task" button
    └── Preview (shows formatted task prompt)

Dashboard (existing)
├── DashboardInput (Lexical editor)
├── DashboardInputControls
│   ├── ProjectSelect
│   ├── BranchSelect
│   ├── AgentSelect
│   └── Settings buttons
├── DashboardStartTaskButton
└── TaskList
    ├── TaskItem (for each task)
    │   ├── Task title
    │   ├── Status
    │   └── Quick actions
    └── Tabs (All / Archived)
```

---

## Convex Queries Called

### From Dashboard
```typescript
api.tasks.get({ teamSlugOrId })              // TaskList component
api.github.getReposByOrg({ teamSlugOrId })   // DashboardInputControls
api.github.getBranches({ repo })             // DashboardInputControls
```

### From Plan Mode
```typescript
api.github.getReposByOrg({ teamSlugOrId })   // RepositorySelector
api.github.getBranches({ repo })             // BranchSelector
api.github.getRepoByFullName({ fullName })   // Codebase context gathering
```

### New for Plan Sessions
```typescript
api.planSessions.create(...)                 // Create new session
api.planSessions.addMessage(...)             // Add chat message
api.planSessions.updateGeneratedTasks(...)   // Store suggested tasks
api.planSessions.getHistory(...)             // Retrieve session history
```

---

## Important: Schema Validation (Zod)

All Hono routes MUST:
1. Set `request.body.required: true`
2. Define request body with Zod schema
3. Use `.openapi()` for documentation

Example:
```typescript
app.openapi(
  createRoute({
    method: "post",
    path: "/gpt-5/plan",
    request: {
      body: {
        content: {
          "application/json": {
            schema: PlanRequestSchema,
          },
        },
        required: true,  // CRITICAL: Must include
      },
    },
    // ...
  }),
  async (c) => {
    const data = c.req.valid("json");  // Pre-validated
    // ...
  }
);
```

---

## Environment Setup

### Required Environment Variables
```bash
ANTHROPIC_API_KEY=sk-...  # For GPT-5 Pro calls
CONVEX_URL=...            # Convex backend
NEXT_PUBLIC_CONVEX_URL=... # Frontend Convex URL
```

### Optional for Development
```bash
DEBUG=cmux:*              # Enable debug logging
LOG_LEVEL=debug           # Set log level
```

---

## Testing Checklist

- [ ] Chat component renders
- [ ] Can send messages and get GPT-5 responses
- [ ] Codebase context is gathered correctly
- [ ] Task suggestions are generated
- [ ] "Submit as Task" creates task in Convex
- [ ] Task appears in dashboard task list
- [ ] Task executes with selected agents
- [ ] Plan session is saved for reference
- [ ] Can link multiple tasks to same plan session
- [ ] Plan mode link appears in task details

---

## Troubleshooting

### Chat not connecting to GPT-5
- Check ANTHROPIC_API_KEY is set
- Verify rate limits not exceeded
- Check network request in DevTools

### Tasks not appearing after submit
- Verify task created in Convex (check DevTools Convex tab)
- Check socket connection is active
- Review server logs for "start-task" errors

### Agents not spawning
- Check agent is in AGENT_CONFIGS
- Verify API keys configured in settings
- Check Docker/cloud mode setting matches setup
- Review server logs for agent spawner errors

---

## Performance Considerations

1. **Codebase Context**: Large repos (many files) might be slow to fetch
   - Consider pagination or filtering
   - Cache file structure for selected repos

2. **Chat History**: Long conversations consume memory
   - Implement message pagination or summary
   - Archive old sessions

3. **Task Generation**: Parallel agent spawning can be resource-intensive
   - Monitor Docker resource usage
   - Consider rate limiting if many concurrent tasks

---

## Security Notes

1. All API endpoints require authentication (Stack.js)
2. Team membership verified before data access
3. User context maintained via AsyncLocalStorage
4. Socket.IO tokens validated on connection
5. API keys never logged or exposed to client
