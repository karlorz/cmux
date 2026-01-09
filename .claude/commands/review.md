Run the codex code review against main branch and report findings:

```bash
cd "$CLAUDE_PROJECT_DIR"
TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT

# Run codex review and capture output
codex review \
  --base main \
  -c model="gpt-5.2" \
  -c model_reasoning_effort="high" 2>&1 | tee "$TMPFILE" || true

# Extract findings after last "codex" marker (the review output section)
FINDINGS=$(awk '/^codex$/ { found=1; content=""; next } found { content = content $0 "\n" } END { print content }' "$TMPFILE" | sed 's/\x1b\[[0-9;]*m//g' | sed '/^$/d')

echo ""
echo "## Codex Review Findings"
echo "$FINDINGS"
```

Analyze these findings and address any issues found.
