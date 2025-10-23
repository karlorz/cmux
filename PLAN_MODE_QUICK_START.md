# PLAN MODE - QUICK START GUIDE

## Summary: How to Integrate GPT-5 Pro Plan Mode with cmux

### What Plan Mode Should Do:
1. Chat with GPT-5 Pro about the codebase
2. Get contextual analysis and task recommendations
3. Generate optimized task prompts for cmux
4. Submit those tasks to cmux's parallel agent execution

---

## Key Implementation Steps

### 1. Create a New Chat Component
**Location**: `/root/workspace/apps/client/src/components/plan-mode/`

```tsx
// PlanModeChat.tsx
import { useCallback, useState } from "react";
import { DashboardInput } from "@/components/dashboard/DashboardInput";

export function PlanModeChat() {
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>();
  const [selectedBranch, setSelectedBranch] = useState<string>();
  
  const handleChatSubmit = async (userMessage: string) => {
    // Get codebase context
    const codebaseContext = await gatherCodebaseContext(selectedRepo, selectedBranch);
    
    // Call GPT-5 Pro with codebase context
    const response = await fetch("/api/gpt-5-plan", {
      method: "POST",
      body: JSON.stringify({
        messages: chatHistory,
        userMessage,
        codebaseContext,
      }),
    });
    
    setChatHistory([...chatHistory, { role: "user", content: userMessage }]);
    setChatHistory(prev => [...prev, { role: "assistant", content: response.text }]);
  };
  
  const handleGenerateTask = async () => {
    // Extract task prompt from chat
    const taskPrompt = generateTaskFromChat(chatHistory);
    
    // Submit to cmux (use existing task submission)
    // This would trigger the socket event from dashboard
  };
  
  return (
    <div>
      {/* Chat UI */}
      {/* Repository selector */}
      {/* Generate task button */}
    </div>
  );
}
```

---

### 2. Backend: Create GPT-5 Pro Integration Route
**Location**: `/root/workspace/apps/www/lib/routes/gpt-5-plan.route.ts`

```typescript
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import Anthropic from "@anthropic-ai/sdk";

export const gpt5PlanRouter = new OpenAPIHono();

const PlanRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })),
  userMessage: z.string(),
  codebaseContext: z.object({
    repoName: z.string(),
    branch: z.string(),
    fileStructure: z.string(),
    readmeContent: z.string().optional(),
  }),
  teamSlugOrId: z.string(),
});

gpt5PlanRouter.openapi(
  createRoute({
    method: "post",
    path: "/gpt-5/plan",
    tags: ["GPT-5 Plan Mode"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: PlanRequestSchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              response: z.string(),
              suggestedTasks: z.array(z.object({
                title: z.string(),
                description: z.string(),
              })),
            }),
          },
        },
        description: "GPT-5 response with task suggestions",
      },
      401: { description: "Unauthorized" },
    },
  }),
  async (c) => {
    const user = await stackServerApp.getUser({ tokenStore: c.req.raw });
    if (!user) return c.text("Unauthorized", 401);
    
    const data = c.req.valid("json");
    
    // Initialize Anthropic client with GPT-5 Pro model
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    
    // Build system prompt with codebase context
    const systemPrompt = `You are an expert code planning assistant. 
Analyze the codebase and help users break down their goals into actionable tasks.

Codebase Context:
- Repository: ${data.codebaseContext.repoName}
- Branch: ${data.codebaseContext.branch}
- File Structure:\n${data.codebaseContext.fileStructure}
${data.codebaseContext.readmeContent ? `- README:\n${data.codebaseContext.readmeContent}` : ""}

When suggesting tasks, be specific about:
1. Files to modify
2. Expected behavior changes
3. Testing considerations
4. Dependencies between tasks

Format task suggestions as clear, actionable prompts for coding agents.`;

    // Call Claude GPT-5 Pro (using claude-5-pro model)
    const response = await client.messages.create({
      model: "claude-opus-4-20250205", // Replace with gpt-5-pro when available
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        ...data.messages.map(msg => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        })),
        { role: "user", content: data.userMessage },
      ],
    });

    const responseText = response.content[0]?.type === "text" 
      ? response.content[0].text 
      : "";

    // Parse suggested tasks from response
    const suggestedTasks = parseSuggestedTasks(responseText);

    return c.json({
      response: responseText,
      suggestedTasks,
    });
  }
);

function parseSuggestedTasks(response: string): Array<{ title: string; description: string }> {
  // Parse GPT response to extract structured tasks
  // This is a simple implementation - enhance as needed
  const tasks: Array<{ title: string; description: string }> = [];
  
  // Look for task patterns in response
  const taskPattern = /(?:Task|Step|Action):?\s*\d+\.\s*(.+?)(?:\n|$)/g;
  let match;
  
  while ((match = taskPattern.exec(response)) !== null) {
    tasks.push({
      title: match[1].trim(),
      description: "", // Extract from full response context if needed
    });
  }
  
  return tasks;
}
```

---

### 3. Add Route to Hono App
**Location**: `/root/workspace/apps/www/lib/hono-app.ts`

```typescript
import { gpt5PlanRouter } from "@/lib/routes/gpt-5-plan.route";

// ... existing routes ...

app.route("/api", gpt5PlanRouter);

// ... rest of app ...
```

---

### 4. Extend Convex Schema for Plan Sessions
**Location**: `/root/workspace/packages/convex/convex/schema.ts`

```typescript
defineTable({
  planSessions: defineTable({
    // Store chat history and generated tasks
    teamId: v.string(),
    userId: v.string(),
    repoFullName: v.string(),
    branch: v.string(),
    chatHistory: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
        timestamp: v.number(),
      })
    ),
    generatedTasks: v.array(
      v.object({
        id: v.string(),
        title: v.string(),
        description: v.string(),
        taskId: v.optional(v.id("tasks")), // Link to submitted task
        createdAt: v.number(),
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_team_user", ["teamId", "userId"])
    .index("by_repo", ["repoFullName"]),
})
```

---

### 5. Connect Chat Output to Task Submission
**Location**: Dashboard component or new plan mode route

```typescript
// When user clicks "Submit as Task"
const handleSubmitTask = async (task: SuggestedTask) => {
  // Format task for cmux
  const taskDescription = `
## Task: ${task.title}

${task.description}

## Generated by Plan Mode
[Link to plan session for reference]
`;

  // Use existing task submission flow
  socket.emit("start-task", {
    repoUrl: `https://github.com/${selectedRepo}.git`,
    branch: selectedBranch,
    taskDescription,
    projectFullName: selectedRepo,
    taskId: await createTask({
      teamSlugOrId,
      text: taskDescription,
      projectFullName: selectedRepo,
      baseBranch: selectedBranch,
      planSessionId: currentPlanSessionId,
    }),
    selectedAgents: selectedAgents || ["claude/sonnet-4.5"],
    isCloudMode: true,
  });

  // Store task reference in plan session
  await updatePlanSession(currentPlanSessionId, {
    generatedTasks: tasks.map(t => ({
      ...t,
      taskId: task.id, // Link generated task to submitted task
    })),
  });
};
```

---

## 6. Gathering Codebase Context

```typescript
// Helper to gather codebase context for GPT
async function gatherCodebaseContext(
  repoFullName: string,
  branch: string,
  teamSlugOrId: string
): Promise<CodebaseContext> {
  // 1. Get repo info
  const repo = await convex.query(api.github.getRepoByFullName, {
    teamSlugOrId,
    fullName: repoFullName,
  });

  // 2. Get file structure (via API call to server)
  const fileStructure = await fetch(`/api/repos/${repoFullName}/tree?branch=${branch}`)
    .then(r => r.json());

  // 3. Get README content
  const readme = await fetch(
    `https://raw.githubusercontent.com/${repoFullName}/${branch}/README.md`
  ).then(r => r.text()).catch(() => "");

  // 4. Get package.json for dependencies
  const packageJson = await fetch(
    `https://raw.githubusercontent.com/${repoFullName}/${branch}/package.json`
  ).then(r => r.json()).catch(() => ({}));

  return {
    repoName: repoFullName,
    branch,
    fileStructure: formatFileTree(fileStructure),
    readmeContent: readme,
    dependencies: packageJson.dependencies || {},
  };
}

function formatFileTree(files: FileInfo[]): string {
  // Convert file list to tree format for readability
  return files
    .map(f => `${"  ".repeat(f.depth)}${f.type === "dir" ? "[" + f.name + "]" : f.name}`)
    .join("\n");
}
```

---

## 7. Add Task Tracking for Plan Mode

Extend the tasks table with plan mode reference:

```typescript
// In schema.ts, add to tasks table:
planSessionId: v.optional(v.string()), // Link to plan session
generatedByAgent: v.optional(v.literal("plan-mode")), // Mark as plan-generated
```

This allows you to:
- Track which tasks came from plan mode
- Link back to the chat session
- Show conversation context in task details

---

## Suggested Architecture: Two Options

### Option 1: New Route (Recommended)
```
/plan-mode              ← New route for chat + task generation
  ├─ Conversation with GPT-5 Pro
  ├─ Codebase analysis
  └─ Submit tasks to /dashboard

/dashboard              ← Existing task submission
  ├─ Task list
  └─ Direct task submission
```

### Option 2: Embedded Panel
```
/dashboard
  ├─ Left: Chat panel (Plan Mode)
  ├─ Right: Task submission
  └─ Shared repo/branch selection
```

Option 1 is cleaner but Option 2 offers better integrated UX.

---

## Testing the Integration

1. Create chat session with GPT-5 Pro
2. Ask it to analyze a repository
3. Get task suggestions
4. Click "Submit as Task"
5. Watch task appear in existing task list
6. Task executes with selected agents

---

## Key Files to Modify

1. `/root/workspace/apps/www/lib/hono-app.ts` - Add plan route
2. `/root/workspace/apps/www/lib/routes/` - Create gpt-5-plan.route.ts
3. `/root/workspace/apps/client/src/components/` - Create PlanModeChat.tsx
4. `/root/workspace/packages/convex/convex/schema.ts` - Add planSessions table
5. `/root/workspace/apps/client/src/routes/` - Create plan mode route or extend dashboard

---

## Environment Variables Needed

```bash
ANTHROPIC_API_KEY=your-key-here  # For GPT-5 Pro calls
```

---

## Socket Events Used

```typescript
// Existing events you'll leverage:
socket.emit("start-task", {...})  // Submit generated task
socket.on("task-started", ...)    // Listen for task execution

// New events to consider:
socket.emit("analyze-repo", {...}) // Optional: real-time codebase analysis
socket.on("analysis-complete", ...) // Optional: receive analysis results
```

---

## Next Steps

1. Create GPT-5 Pro route with Hono
2. Build chat component with message history
3. Implement codebase context gathering
4. Connect generated tasks to existing submission flow
5. Add plan session tracking
6. Test end-to-end flow
7. Refine task generation logic based on agent feedback

