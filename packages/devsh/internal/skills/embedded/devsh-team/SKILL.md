---
name: devsh-team
description: Coordinate multiple agents working in parallel. Fan-out tasks, track progress, collect results.
context: fork
allowed-tools:
  - Bash
  - Read
  - Write
when_to_use: >
  When you need multiple agents working in parallel on different parts
  of a task. Use for divide-and-conquer workflows, parallel testing,
  or multi-component implementations.
argument-hint: <pattern> or manual spawns
---

# /devsh-team - Multi-Agent Coordination

Coordinate multiple agents working in parallel on related tasks.

## Quick Patterns

### Fan-Out Pattern (Parallel Spawns)
```bash
# Spawn multiple agents in parallel
devsh orchestrate spawn --agent claude/haiku-4.5 "Fix auth.ts" &
devsh orchestrate spawn --agent claude/haiku-4.5 "Fix api.ts" &
devsh orchestrate spawn --agent claude/haiku-4.5 "Fix db.ts" &
wait

# Or using a loop
for file in auth.ts api.ts db.ts; do
  devsh orchestrate spawn --agent claude/haiku-4.5 "Fix $file" &
done
wait
```

### Pipeline Pattern (Sequential Dependencies)
```bash
# Step 1: Design
T1=$(devsh orchestrate spawn --json --agent claude/opus-4.6 "Design the API schema" | jq -r '.orchestrationTaskId')

# Step 2: Implement (waits for design)
T2=$(devsh orchestrate spawn --json --depends-on $T1 --agent codex/gpt-5.4-xhigh "Implement the API" | jq -r '.orchestrationTaskId')

# Step 3: Test (waits for implementation)
devsh orchestrate spawn --depends-on $T2 --agent codex/gpt-5.1-codex-mini "Write API tests"
```

### Review Pattern (Parallel then Merge)
```bash
# Spawn implementation agents in parallel
IMPL1=$(devsh orchestrate spawn --json --agent claude/sonnet-4.5 "Implement auth module" | jq -r '.orchestrationTaskId')
IMPL2=$(devsh orchestrate spawn --json --agent claude/sonnet-4.5 "Implement user module" | jq -r '.orchestrationTaskId')

# Wait for both
devsh orchestrate wait $IMPL1
devsh orchestrate wait $IMPL2

# Spawn reviewer
devsh orchestrate spawn --agent claude/opus-4.6 "Review the auth and user modules for consistency"
```

## Tracking Team Progress

### List All Agents
```bash
devsh orchestrate list
devsh orchestrate list --status running
devsh orchestrate list --json | jq '.[] | {id: .ID, status: .Status, agent: .AgentName}'
```

### Watch Multiple Tasks
```bash
# In separate terminals or use watch
devsh orchestrate status $TASK1 --watch &
devsh orchestrate status $TASK2 --watch &
devsh orchestrate status $TASK3 --watch &
```

### Aggregate Results
```bash
# Collect all completed task results
for id in $TASK1 $TASK2 $TASK3; do
  echo "=== Task $id ==="
  devsh orchestrate status $id --json | jq '{status: .Task.Status, result: .Task.Result}'
done
```

## Team Roles

| Role | Agent | Purpose |
|------|-------|---------|
| Coordinator | `claude/opus-4.6` | Planning, decomposition, review |
| Implementer | `codex/gpt-5.4-xhigh` | Code generation, heavy implementation |
| Fast Worker | `claude/haiku-4.5` | Quick fixes, simple tasks |
| Tester | `codex/gpt-5.1-codex-mini` | Test writing, validation |

## Example: Feature Team

```bash
#!/bin/bash
# Implement a feature with a coordinated team

REPO="owner/repo"
FEATURE="user-roles"

# 1. Coordinator designs the approach
DESIGN=$(devsh orchestrate spawn --json \
  --agent claude/opus-4.6 \
  --repo $REPO \
  "Design the $FEATURE feature. Output a clear task breakdown." \
  | jq -r '.orchestrationTaskId')

devsh orchestrate wait $DESIGN

# 2. Parallel implementation
TASKS=()
for component in model middleware endpoints; do
  TID=$(devsh orchestrate spawn --json \
    --depends-on $DESIGN \
    --agent codex/gpt-5.4-xhigh \
    --repo $REPO \
    "Implement the $component for $FEATURE based on the design" \
    | jq -r '.orchestrationTaskId')
  TASKS+=($TID)
done

# 3. Wait for all implementations
for tid in "${TASKS[@]}"; do
  devsh orchestrate wait $tid
done

# 4. Integration test
devsh orchestrate spawn \
  --agent codex/gpt-5.1-codex-mini \
  --repo $REPO \
  "Write integration tests for the $FEATURE feature"
```

## Cloud Workspace Head Agent

For complex coordination, spawn a head agent that manages sub-agents:

```bash
devsh orchestrate spawn --cloud-workspace --agent claude/opus-4.6 \
  "Coordinate implementing the user-roles feature:
   1. Spawn sub-agents for model, middleware, and endpoints
   2. Track their progress
   3. Review and integrate results
   4. Create final PR"
```

The head agent receives `CMUX_IS_ORCHESTRATION_HEAD=1` and can use `--use-env-jwt` for sub-spawns.

## Best Practices

1. **Keep tasks focused** - Each agent should have a clear, specific task
2. **Use appropriate agents** - Match agent capability to task complexity
3. **Set up dependencies** - Use `--depends-on` for sequential work
4. **Monitor progress** - Use `status --watch` or `list` to track
5. **Handle failures** - Check results and re-spawn failed tasks with adjusted prompts

## See Also

- `/devsh-spawn` - Single agent spawning
- `/devsh-inject` - Mid-run steering
- `/devsh-orchestrator` - Full orchestration documentation
