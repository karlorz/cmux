---
description: Codex-backed review with upstream gap analysis against manaflow-ai/manaflow:main
argument-hint: [optional focus]
allowed-tools: Bash, Read, Grep
---

Run a mandatory Codex-backed review for the current branch.
Do not replace Codex output with manual-only review.

Read review policy first: @REVIEW.md
User focus (optional): $ARGUMENTS

## Auto-collected context

### Official Codex review (mandatory)

You MUST run the official `/codex:review` flow. Do NOT call `.claude/scripts/codex-review-extract.sh` directly.

**Step 1 - Committed changes:**
1. Run `/codex:review --wait --scope branch --base main`
2. Preserve the review output exactly.
3. If the review command fails or returns no usable output, treat that as a blocker and stop.

**Step 2 - Uncommitted changes:**
1. First check `git status --porcelain`. If empty, skip this step.
2. If non-empty, run `/codex:review --wait --scope working-tree`
3. Preserve the review output exactly.
4. If the review command fails or returns no usable output, treat that as a blocker and stop.

### Current branch changed files
!`cd "$CLAUDE_PROJECT_DIR" && git diff --name-only main...HEAD`

### Upstream gap analysis (if upstream remote exists)
!`cd "$CLAUDE_PROJECT_DIR" && if git remote get-url upstream >/dev/null 2>&1; then git fetch origin --prune >/dev/null 2>&1 && git fetch upstream --prune >/dev/null 2>&1 && echo "Divergence vs upstream/main:" && git rev-list --left-right --count main...upstream/main | awk '{print "ahead=" $1 " behind=" $2}' && echo "" && echo "Upstream commits behind (latest 120):" && git log --no-merges --date=short --pretty=format:'%h %ad %s' main..upstream/main | head -120; else echo "(upstream remote not configured - skipping gap analysis)"; fi`

### Upstream commits touching changed files (if upstream exists)
!`cd "$CLAUDE_PROJECT_DIR" && if git remote get-url upstream >/dev/null 2>&1; then CHANGED_FILES=$(git diff --name-only main...HEAD); if [ -n "$CHANGED_FILES" ]; then git log --no-merges --date=short --pretty=format:'%h %ad %s' main..upstream/main -- $CHANGED_FILES | head -120; else echo "(none)"; fi; else echo "(upstream remote not configured - skipping)"; fi`

## Output requirements

1. First line must be exactly one of:
- `Codex review executed: yes`
- `Codex review executed: no`

2. If official Codex review is missing/empty or clearly failed (for example timeout, command-not-found, permission denied, auth/setup failure):
- set first line to `Codex review executed: no`
- output only a short `Blocker` section with the exact failed command and reason
- stop; do not produce findings from manual review
- partial/incomplete Codex coverage MUST be treated as a blocker, not a successful review

3. If official Codex review exists and completed successfully:
- set first line to `Codex review executed: yes`
- produce this report:

### Findings
- Prioritize Codex findings by severity with file/line and fix recommendation.

### Already Fixed Upstream? (skip if no upstream)
- For each finding, map to matching commit(s) from `main..upstream/main` when applicable.
- Include commit hash and rationale for each mapping.

### Best Recommendation
- Choose one for each finding:
  - `cherry-pick upstream commit` (if upstream exists)
  - `manual backport` (if upstream exists)
  - `fix locally first`

### Gap Reduction Plan (skip if no upstream)
- Provide concrete steps to reduce drift vs `manaflow-ai/manaflow:main`:
  - quick wins (safe cherry-picks now)
