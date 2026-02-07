- Read the project review guidelines from `REVIEW.md` at the project root.
- Run a local review and an upstream-gap scan against `manaflow-ai/cmux:main`.
- Inspect all commits in `main..upstream/main` (currently about 112 behind if unchanged) and check whether upstream already fixed any issue found by review.

```bash
cd "$CLAUDE_PROJECT_DIR"

TMPFILE=$(mktemp)
UPSTREAM_ALL=$(mktemp)
UPSTREAM_RELEVANT=$(mktemp)
trap 'rm -f "$TMPFILE" "$UPSTREAM_ALL" "$UPSTREAM_RELEVANT"' EXIT

# Keep refs fresh for accurate ahead/behind and commit lookup.
git fetch origin --prune
git fetch upstream --prune

COUNTS=$(git rev-list --left-right --count main...upstream/main)
AHEAD=$(echo "$COUNTS" | awk '{print $1}')
BEHIND=$(echo "$COUNTS" | awk '{print $2}')

git log --no-merges --date=short --pretty=format:'%h %ad %s' \
  main..upstream/main > "$UPSTREAM_ALL"

CHANGED_FILES=$(git diff --name-only main...HEAD)
if [ -n "$CHANGED_FILES" ]; then
  # shellcheck disable=SC2086
  git log --no-merges --date=short --pretty=format:'%h %ad %s' \
    main..upstream/main -- $CHANGED_FILES > "$UPSTREAM_RELEVANT" || true
else
  : > "$UPSTREAM_RELEVANT"
fi

codex \
  --dangerously-bypass-approvals-and-sandbox \
  --model gpt-5.2 \
  -c model_reasoning_effort="high" \
  review --base main 2>&1 | tee "$TMPFILE" || true

# Extract findings from captured output (TTY-independent).
FINDINGS=$(sed 's/\x1b\[[0-9;]*m//g' "$TMPFILE" | sed '/^$/d')

echo "## Codex Review Findings"
echo "$FINDINGS"
echo
echo "## Upstream Divergence (main vs upstream/main)"
echo "ahead=$AHEAD behind=$BEHIND"
echo
echo "## Upstream Commits Behind (latest 120)"
head -120 "$UPSTREAM_ALL"
echo
echo "## Upstream Commits Touching Current Diff Files"
if [ -s "$UPSTREAM_RELEVANT" ]; then
  head -120 "$UPSTREAM_RELEVANT"
else
  echo "(none)"
fi
```

Then produce a final review report with these sections:
1. `Findings`: issues from codex review (severity + file/line + fix recommendation).
2. `Already Fixed Upstream?`: for each finding, identify matching commits from `main..upstream/main` if any; include commit hash and rationale.
3. `Best Recommendation`: choose one per finding:
   - `cherry-pick upstream commit`
   - `manual backport`
   - `fix locally first`
4. `Gap Reduction Plan`: concrete steps to reduce drift vs `manaflow-ai/cmux:main`:
   - quick wins (safe cherry-picks now)
   - medium-risk updates
   - full sync branch plan (`sync/upstream-main-YYYYMMDD`) targeting `karlorz/cmux:main`
