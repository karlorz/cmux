#!/usr/bin/env bash
# Execute a plan file by spawning a sub-agent with inline content
# Usage: execute-plan.sh [plan-file] [agent]

set -euo pipefail

# Help flag
if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  echo "Execute a plan file by spawning a sub-agent with inline content"
  echo ""
  echo "Usage: $0 [--dry-run] [plan-file] [agent]"
  echo ""
  echo "Options:"
  echo "  --dry-run  Show what would be spawned without executing"
  echo ""
  echo "Arguments:"
  echo "  plan-file  Path to plan markdown file (default: most recent in .claude/plans/)"
  echo "  agent      Agent to use (default: \$CMUX_CODING_AGENT or codex/gpt-5.1-codex-mini)"
  echo ""
  echo "Examples:"
  echo "  $0                                    # Execute most recent plan"
  echo "  $0 --dry-run .claude/plans/my-feature.md  # Dry run"
  echo "  $0 .claude/plans/my-feature.md       # Execute specific plan"
  echo "  $0 .claude/plans/fix.md claude/opus-4.5  # Specific plan and agent"
  echo ""
  echo "Available agents:"
  echo "  codex/gpt-5.4-xhigh       Production (high compute)"
  echo "  codex/gpt-5.1-codex-mini  Default"
  echo "  claude/opus-4.6           Complex reasoning"
  echo "  claude/opus-4.5           Production"
  echo "  claude/haiku-4.5          Quick validation"
  exit 0
fi

# Dry run flag
DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  shift
fi

PLAN_FILE="${1:-}"
AGENT="${2:-${CMUX_CODING_AGENT:-codex/gpt-5.1-codex-mini}}"

# Auto-detect most recent plan if not specified
if [[ -z "$PLAN_FILE" ]]; then
  PLAN_FILE=$(ls -t .claude/plans/*.md 2>/dev/null | grep -v -E '(TEMPLATE|README)\.md' | head -1 || true)
  if [[ -z "$PLAN_FILE" ]]; then
    echo "Error: No plan file specified and no plans found in .claude/plans/"
    echo "Usage: $0 [plan-file] [agent]"
    echo ""
    echo "Available plans:"
    ls .claude/plans/*.md 2>/dev/null || echo "  (none)"
    exit 1
  fi
fi

# Verify plan exists
if [[ ! -f "$PLAN_FILE" ]]; then
  echo "Error: Plan file not found: $PLAN_FILE"
  exit 1
fi

# Get repo and branch
REPO=$(git remote get-url origin 2>/dev/null | sed -E 's|.*github.com[:/]||; s|\.git$||' || echo "")
BRANCH=$(git branch --show-current 2>/dev/null || echo "main")

if [[ -z "$REPO" ]]; then
  echo "Error: Could not determine repository from git remote"
  exit 1
fi

# Read plan content
PLAN_CONTENT=$(cat "$PLAN_FILE")

echo "Executing plan: $PLAN_FILE"
echo "Agent: $AGENT"
echo "Repo: $REPO"
echo "Branch: $BRANCH"
echo ""

# Dry run mode - show what would happen without spawning
if [ "$DRY_RUN" = "true" ]; then
  echo "=== DRY RUN ==="
  echo ""
  echo "Plan content:"
  echo "---"
  echo "$PLAN_CONTENT"
  echo "---"
  echo ""
  echo "Would spawn: devsh orchestrate spawn --agent $AGENT --repo $REPO --branch $BRANCH"
  exit 0
fi

# Spawn agent with inline plan content
devsh orchestrate spawn \
  --agent "$AGENT" \
  --repo "$REPO" \
  --branch "$BRANCH" \
  "Execute the implementation plan below.

$PLAN_CONTENT

After completion:
1. Run bun check to verify no lint/type errors
2. Run relevant tests
3. Summarize what changes were made
4. Report any follow-up items or blockers"
