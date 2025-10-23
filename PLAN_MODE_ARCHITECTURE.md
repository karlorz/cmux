# CMUX Architecture Analysis - GPT-5 Pro Plan Mode Integration Guide

## Overview
cmux is a web application that spawns multiple AI coding agents (Claude Code, OpenAI Codex, Gemini, Amp, etc.) in parallel across isolated environments to work on coding tasks. It uses:
- **Frontend**: React + TanStack Router + TanStack Query + Shadcn UI + Tailwind
- **Backend**: Hono (Node.js API) + Convex (serverless database)
- **Orchestration**: Socket.IO for real-time task communication
- **Execution**: Docker containers or cloud providers (Morph, Daytona) for isolated environments

---

## 1. CHAT/TASK INTERFACE UI

### Main Dashboard Component
**File**: `/root/workspace/apps/client/src/routes/_layout.$teamSlugOrId.dashboard.tsx`

Key features:
- Task description input (rich text editor with Lexical)
- Project/repository selection
- Branch selection
- Agent selection (multiple agents can be selected)
- Cloud/Local mode toggle
- Task list display

### Editor Component (Lexical)
**File**: `/root/workspace/apps/client/src/components/dashboard/DashboardInput.tsx`
- Rich text editor with support for images
- Exports content as text + image references
- Clear/focus/insertText API

### Input Controls
**File**: `/root/workspace/apps/client/src/components/dashboard/DashboardInputControls.tsx`
- Project dropdown (populated from `api.github.getReposByOrg`)
- Branch dropdown (populated from `api.github.getBranches`)
- Agent multi-select
- Theme toggle
- Image/audio buttons (UI placeholders)

### Task Submission Button
**File**: `/root/workspace/apps/client/src/components/dashboard/DashboardStartTaskButton.tsx`
- "Start task" button with Cmd/Ctrl+Enter shortcut
- Tooltip showing keyboard shortcut

### Task List Display
**File**: `/root/workspace/apps/client/src/components/dashboard/TaskList.tsx`
- Queries `api.tasks.get` from Convex
- Displays active and archived tasks
- Filters by project and archive status

---

## 2. TASK SUBMISSION FLOW

### A. Frontend: Create Task and Emit Socket Event
**Location**: Dashboard component `handleStartTask` function (lines 366-531)

```typescript
// Step 1: Extract content from editor
const content = editorApiRef.current?.getContent();

// Step 2: Upload images to Convex storage
const uploadedImages = await Promise.all(
  images.map(async (image) => {
    const uploadUrl = await generateUploadUrl({ teamSlugOrId });
    const result = await fetch(uploadUrl, { method: "POST", body: blob });
    return { storageId, fileName, altText };
  })
);

// Step 3: Create task in Convex (mutation)
const taskId = await createTask({
  teamSlugOrId,
  text: content?.text,
  projectFullName,
  baseBranch: branch,
  images: uploadedImages,
  environmentId,
});

// Step 4: Emit socket event to start task
socket.emit("start-task", {
  repoUrl,
  branch,
  taskDescription: content?.text,
  projectFullName,
  taskId,
  selectedAgents,
  isCloudMode,
  environmentId,
  images,
  theme,
}, handleStartTaskAck);
```

### B. Backend: Socket Event Handler
**Location**: `/root/workspace/apps/server/src/socket-handlers.ts` (lines 382+)

```typescript
socket.on("start-task", async (data, callback) => {
  // 1. Validate task data against StartTaskSchema
  const taskData = StartTaskSchema.safeParse(data);
  
  // 2. Check Docker status (for local mode)
  if (!taskData.isCloudMode) {
    const docker = await checkDockerStatus();
    if (!docker.isRunning) return error;
  }
  
  // 3. Generate PR title from task description
  const generatedTitle = await getPRTitleFromTaskDescription(
    taskData.taskDescription,
    safeTeam
  );
  
  // 4. Spawn all selected agents in parallel
  const agentResults = await spawnAllAgents(
    taskId,
    {
      repoUrl: taskData.repoUrl,
      branch: taskData.branch,
      taskDescription: taskData.taskDescription,
      selectedAgents: taskData.selectedAgents,
      isCloudMode: taskData.isCloudMode,
      images: taskData.images,
      environmentId: taskData.environmentId,
    },
    safeTeam
  );
  
  // 5. Emit task-started event
  rt.emit("task-started", {
    taskId,
    worktreePath,
    terminalId,
  });
});
```

---

## 3. BACKEND STRUCTURE

### Hono Routes
**Location**: `/root/workspace/apps/www/lib/routes/`

Key routes:
- `/integrations/github/repos` - List repositories
- `/morph/setup-instance` - Setup cloud environments
- `/api/branches` - Get branch info
- `/api/environments` - Manage environments

**Main Hono App**: `/root/workspace/apps/www/lib/hono-app.ts`
- Validates requests with Zod schemas
- CORS configured for localhost:5173, localhost:9779, cmux.sh

### Convex Schemas & Mutations
**Location**: `/root/workspace/packages/convex/convex/schema.ts`

Key tables:

#### `tasks` table
```typescript
{
  text: string,
  description?: string,
  projectFullName?: string,
  baseBranch?: string,
  isCompleted: boolean,
  isArchived?: boolean,
  pullRequestTitle?: string,
  userId: string,
  teamId: string,
  environmentId?: Id<"environments">,
  mergeStatus?: "none" | "pr_draft" | "pr_open" | "pr_merged" | "pr_closed",
  images?: Array<{ storageId, fileName?, altText }>,
  createdAt: number,
  updatedAt: number,
}
```

#### `taskRuns` table
```typescript
{
  taskId: Id<"tasks">,
  prompt: string,
  agentName?: string,
  summary?: string,
  status: "pending" | "running" | "completed" | "failed",
  worktreePath?: string,
  newBranch?: string,
  pullRequestUrl?: string,
  vscode?: { provider, containerName, status, ports, url, workspaceUrl },
  userId: string,
  teamId: string,
  isCrowned?: boolean,
}
```

### Key Convex Functions
**Location**: `/root/workspace/packages/convex/convex/tasks.ts`

- `create(args)` - Create new task
- `get(teamSlugOrId)` - Query tasks by team/user
- `getTasksWithTaskRuns()` - Get tasks with their runs
- `archive()` - Archive a task
- `setPullRequestTitle()` - Set PR title

---

## 4. EXISTING AI/LLM INTEGRATIONS

### Agent Configurations
**Location**: `/root/workspace/packages/shared/src/agentConfig.ts`

Available agents:
```typescript
// Anthropic
- claude/sonnet-4.5
- claude/opus-4.1
- claude/sonnet-4
- claude/opus-4

// OpenAI
- codex/gpt-5-codex-high-reasoning
- codex/gpt-5-codex-medium-reasoning
- codex/gpt-5-high-reasoning
- codex/gpt-5-medium-reasoning
- codex/o3

// OpenCode (3rd party)
- opencode/gpt-5
- opencode/o3-pro

// Gemini
- gemini/pro
- gemini/flash

// QWen, Cursor, Amp, etc.
```

### Agent Spawning
**Location**: `/root/workspace/apps/server/src/agentSpawner.ts`

Each agent is spawned with:
```typescript
{
  name: string,
  command: string,    // "bunx @anthropic-ai/claude-code@latest"
  args: string[],     // Model name, --ide flag, $PROMPT placeholder
  apiKeys: AgentConfigApiKey[],
  environment?: (ctx) => Promise<EnvironmentResult>,
  checkRequirements?: () => Promise<string[]>,
  completionDetector?: (taskRunId) => Promise<void>,
}
```

### Agent Execution Flow
1. Validate requirements (API keys configured)
2. Setup environment (git repo, branch)
3. Apply API keys to environment
4. Spawn process with agent command
5. Inject task prompt via environment variable
6. Monitor completion via completion detector

---

## 5. REPOSITORY INTEGRATION

### GitHub Integration
**Location**: `/root/workspace/apps/www/lib/routes/github.repos.route.ts`

Queries repos via:
- GitHub App Installation OAuth
- Octokit client authenticated with app credentials
- Returns `{ name, full_name, private, updated_at, pushed_at }`

### Repository Cloning
**Location**: `/root/workspace/apps/server/src/workspace.ts`

Uses Git worktree for task isolation:
- Creates unique branch per task
- Clones from repo URL
- Creates isolated worktree for each agent run
- Cleans up after task completion

### Branch Management
**Location**: `/root/workspace/packages/convex/convex/github.ts`

Queries:
- `getReposByOrg()` - List user's repos grouped by org
- `getBranches(repo)` - Get branches for a repo with smart sorting
- `getRepoByFullName()` - Get specific repo

### Codebase Access in Agents
Each agent runs in a Docker container with:
- Full git repository cloned
- Worktree checked out to specific branch
- Repository path mounted to `/root/workspace`
- Git hooks configured for diff capture
- Node/Bun/Python environments available

---

## 6. TASK EXECUTION FLOW (Detailed)

### Step-by-step process:

```
1. User creates task via dashboard
   └─> Rich text editor content + images uploaded to Convex storage
   └─> Task created in Convex with metadata

2. Task submission via socket
   └─> Frontend emits "start-task" with task data
   └─> Backend validates against StartTaskSchema

3. PR title generation (async)
   └─> Uses LLM to generate PR title from task description
   └─> Persists to task metadata

4. Agent spawning (parallel)
   For each selected agent:
   └─> Get agent config from AGENT_CONFIGS
   └─> Verify requirements (API keys, CLI tools)
   └─> Create task run in Convex (status: pending)
   └─> Setup workspace with git repository
   └─> Create git branch for changes
   └─> Prepare environment variables (API keys, model names)
   └─> Spawn Docker container with agent CLI
   └─> Inject task prompt via $PROMPT env var
   └─> Monitor task progress and git diff
   └─> Capture output and final diff
   └─> Create/update pull request if changes made

5. Task lifecycle events
   └─> "task-started" - Agent CLI running
   └─> "task-completed" / "task-failed" - Agent finished
   └─> "vscode-spawned" - IDE opened for inspection

6. Post-task (optional)
   └─> Crown evaluation - Pick best run among agents
   └─> Auto-commit changes
   └─> Open pull request for review
```

---

## 7. DATA FLOW ARCHITECTURE

```
┌─────────────────────┐
│  Frontend (React)   │
│  - Dashboard.tsx    │
│  - TaskList.tsx     │
└──────────┬──────────┘
           │ Socket.IO
           ├─ emit: "start-task"
           └─ listen: "task-started", "vscode-spawned"
           │
┌──────────▼──────────┐
│  Backend (Hono)     │
│  - socket-handlers  │
│  - github routes    │
│  - morph setup      │
└──────────┬──────────┘
           │ Mutation
           ├─ createTask()
           ├─ getPRTitle()
           └─ spawnAllAgents()
           │
┌──────────▼──────────┐
│  Convex Database    │
│  - tasks table      │
│  - taskRuns table   │
│  - repos table      │
│  - branches table   │
└─────────────────────┘

           │ Async
┌──────────▼──────────┐
│  Docker/Morph       │
│  - Agent containers │
│  - VSCode instances │
│  - Worktrees        │
└─────────────────────┘
```

---

## 8. KEY FILES FOR PLAN MODE INTEGRATION

### Files to Reference:
1. **Chat/UI Integration**:
   - `/root/workspace/apps/client/src/routes/_layout.$teamSlugOrId.dashboard.tsx`
   - `/root/workspace/apps/client/src/components/dashboard/DashboardInput.tsx`

2. **Task Submission**:
   - `/root/workspace/apps/server/src/socket-handlers.ts` (line 382+)
   - `/root/workspace/apps/client/src/routes/_layout.$teamSlugOrId.dashboard.tsx` (handleStartTask function)

3. **Convex/Database**:
   - `/root/workspace/packages/convex/convex/schema.ts`
   - `/root/workspace/packages/convex/convex/tasks.ts`

4. **Agent Management**:
   - `/root/workspace/packages/shared/src/agentConfig.ts`
   - `/root/workspace/apps/server/src/agentSpawner.ts`

5. **GitHub Integration**:
   - `/root/workspace/apps/www/lib/routes/github.repos.route.ts`
   - `/root/workspace/packages/convex/convex/github.ts`

6. **Environment Setup**:
   - `/root/workspace/apps/server/src/workspace.ts`

---

## 9. INTEGRATION POINTS FOR PLAN MODE

### Option A: Chat UI as New Route
```
/dashboard          - Existing task submission
/plan-mode          - New: Chat with GPT-5 Pro about codebase
    ├─ Conversation history
    ├─ Code analysis/planning
    └─ Generate & submit tasks to cmux
```

### Option B: Chat Panel in Dashboard
Embed chat panel in existing dashboard for:
- Real-time planning alongside task submission
- Codebase context analysis
- Task refinement before submission

### Implementation Pattern:

1. **Create new chat component** with GPT-5 Pro API integration
2. **Accept codebase context**: 
   - Repository name, branch, file structure
   - Use existing `getReposByOrg` and `getBranches` queries
3. **Generate task prompts** from chat output
4. **Submit to cmux** using existing task submission flow:
   ```typescript
   // Convert chat plan to task
   const taskDescription = generatePromptFromChatPlan(chatMessages);
   socket.emit("start-task", {
     repoUrl,
     branch,
     taskDescription,  // Generated from GPT-5 Pro chat
     projectFullName,
     selectedAgents: ["claude/sonnet-4.5"], // or user choice
     isCloudMode: true,
   });
   ```

5. **Track relationship**: Store chat session ID with task for reference
   - Add `planSessionId?: string` to tasks table
   - Link multiple tasks generated from single chat session

---

## 10. CRITICAL POINTS FOR DEVELOPERS

### Validation Requirements:
- All Hono routes MUST set `request.body.required: true` for JSON endpoints
- Zod schemas validate all inputs
- Team membership checked via `verifyTeamAccess()`

### Authentication:
- Stack.js integration for user/team management
- JWT tokens passed via Socket.IO handshake
- `runWithAuth()` context manager for async operations

### Convex Rules:
- Cannot use Node APIs in Convex functions (use `crypto.subtle` not `node:crypto`)
- Use `authQuery`/`authMutation` for user-context operations
- Indexes on `by_team_user`, `by_user`, `by_team` for efficient querying

### Socket.IO Events:
- All events validated with Zod schemas
- Callbacks must be called even on error
- Use `rt.emit()` to broadcast to connected clients

---

## Useful Imports

```typescript
// Convex API
import { api } from "@cmux/convex/api";
import type { Doc, Id } from "@cmux/convex/dataModel";
import { useMutation, useQuery } from "convex/react";

// Types
import type { SelectOption } from "@/components/ui/searchable-select";
import { AGENT_CONFIGS } from "@cmux/shared/agentConfig";
import type { ProviderStatusResponse } from "@cmux/shared";

// Socket/Events
import { useSocket } from "@/contexts/socket/use-socket";
import type { TaskStarted, TaskError } from "@cmux/shared";

// Router
import { useRouter } from "@tanstack/react-router";
```

