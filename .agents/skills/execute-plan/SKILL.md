---
name: execute-plan
description: Execute a saved implementation plan by spawning a Codex teammate
---

# Execute Plan

> **Purpose**: Spawn a coding agent (default: Codex) to execute a saved implementation plan from `.claude/plans/`.

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

echo "Executing plan: $PLAN_FILE"
echo "Agent: $AGENT"
echo "Repo: $REPO"
echo "Branch: $BRANCH"

# Spawn agent
devsh orchestrate spawn \
  --agent "$AGENT" \
  --repo "$REPO" \
  --branch "$BRANCH" \
  "Execute the implementation plan. Read the plan file at $PLAN_FILE and implement all changes described. After completion:
1. Run any relevant tests
2. Create a PR with a summary of changes
3. Include a mermaid flowchart showing what was modified"
```

## Output

The spawn command returns:
- `orchestrationTaskId` - Use with `/track-agent` to monitor
- `taskRunId` - Internal task run identifier
- `status` - Initial status (usually "pending" or "assigned")

## After Spawning

1. **Track Progress**:
   ```bash
   devsh orchestrate status <orchestrationTaskId> --watch
   ```

2. **Get Results**:
   ```bash
   devsh orchestrate results
   ```

## Configuration

Set preferred coding agent:
```bash
export CMUX_CODING_AGENT=codex/gpt-5.4-xhigh      # High-powered Codex
export CMUX_CODING_AGENT=codex/gpt-5.1-codex-mini # Default
export CMUX_CODING_AGENT=claude/sonnet-4.5        # Claude alternative
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

## Related Skills

- `/head-agent-init` - Initialize head agent mode
- `/track-agent` - Track spawned agent progress
