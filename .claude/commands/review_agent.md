- Read the project review guidelines from REVIEW.md at the project root.
- Run the codex code review against main branch and report findings:

```bash
cd "$CLAUDE_PROJECT_DIR"
TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT

codex \
  --dangerously-bypass-approvals-and-sandbox \
  --model gpt-5.2 \
  -c model_reasoning_effort="high" \
  review --base main 2>&1 | tee "$TMPFILE" || true

# Extract findings from captured output (TTY-independent)
FINDINGS=$(sed 's/\x1b\[[0-9;]*m//g' "$TMPFILE" | sed '/^$/d')

echo "## Codex Review Findings"
echo "$FINDINGS"
```

Analyze these findings and address any issues found.
