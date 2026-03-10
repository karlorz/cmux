---
name: execute-plan
description: Execute a saved implementation plan by spawning a coding teammate
---

# Execute Plan

> **Purpose**: Spawn a coding agent (default: Codex) to execute a saved implementation plan from `.claude/plans/`, while sending the plan content in the prompt so the workflow remains portable.

## Quick Start

```bash
# Execute most recent plan
$execute-plan

# Execute specific plan
$execute-plan .claude/plans/my-feature.md
```

## Usage

### Find Available Plans
```bash
ls -la .claude/plans/*.md 2>/dev/null || echo "No plans found"
```

### Execute Plan
Keep the local plan file as the operator-facing source of truth, but pass its content to the spawned worker in the prompt.
For large plans, inline only the relevant excerpt or a tight summary instead of copying the entire file into one command argument.

```bash
# Configuration
PLAN_FILE="${1:-.claude/plans/$(ls -t .claude/plans/*.md 2>/dev/null | head -1 | xargs basename)}"
REPO=$(git remote get-url origin 2>/dev/null | sed -E 's|.*github.com[:/]([^/]+/[^/]+?)(\.git)?$|\1|')
BRANCH=$(git branch --show-current)
AGENT="${CMUX_CODING_AGENT:-codex/gpt-5.1-codex-mini}"

# Verify plan exists
if [ ! -f "$PLAN_FILE" ]; then
  echo "Error: Plan file not found: $PLAN_FILE"
  echo "Available plans:"
  ls .claude/plans/*.md 2>/dev/null || echo "  (none)"
  exit 1
fi

PLAN_CONTENT=$(cat "$PLAN_FILE")

echo "Executing plan: $PLAN_FILE"
echo "Agent: $AGENT"
echo "Repo: $REPO"
echo "Branch: $BRANCH"

# Spawn agent with inline plan content
devsh orchestrate spawn \
  --agent "$AGENT" \
  --repo "$REPO" \
  --branch "$BRANCH" \
  "Execute the implementation plan below.

$PLAN_CONTENT

After completion:
1. Run the relevant tests.
2. Summarize the changes made.
3. Report any follow-up items or blockers."
```

## Output

The spawn command returns human-readable identifiers for the new task, including:
- `Orchestration Task ID` - Use with `devsh orchestrate status`, `wait`, or `cancel`
- `Task ID` - Internal task identifier
- `Task Run ID` - Linked task-run identifier
- `Status` - Initial status

If you use `--json`, the payload includes fields such as `orchestrationTaskId`, `taskId`, `taskRunId`, and `status`.

## After Spawning

1. **Track Progress**:
   ```bash
   devsh orchestrate status <orch-task-id> --watch
   ```

2. **Wait for Completion**:
   ```bash
   devsh orchestrate wait <orch-task-id>
   ```

3. **Get Aggregated Results**:
   ```bash
   devsh orchestrate results <orchestration-id>
   ```

   `results` requires an **orchestration session ID**, so use it only in flows that expose one, such as cloud head-agent or migrate-backed workflows.

## Configuration

Set preferred coding agent:
```bash
export CMUX_CODING_AGENT=codex/gpt-5.4-xhigh       # High-powered Codex
export CMUX_CODING_AGENT=codex/gpt-5.1-codex-mini  # Default
export CMUX_CODING_AGENT=claude/sonnet-4.5         # Claude alternative
```

## Plan File Format

Plans should follow this structure:
```markdown
# Task: [Title]

## TL;DR
Brief summary

## Files to Modify
- `path/to/file.ts` - What to change

## Implementation Steps
1. First step
2. Second step

## Tests Required
- [ ] Test case

## Acceptance Criteria
- What defines "done"
```

## Notes

- The worker should not be told to read a local `.claude/plans/*.md` path directly.
- The portable default is: verify local file, read local file, embed plan content in the spawned prompt.

## Related Skills

- `/head-agent-init` - Initialize workflow head-agent mode
- `/track-agent` - Track the spawned orchestration task
