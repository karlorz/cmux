#!/bin/bash
# Runs codex review and extracts only the final findings.
# Usage: codex-review-extract.sh [--base main | --uncommitted]
# Exit: outputs extracted review text to stdout, empty if codex fails.
set -euo pipefail

T=$(mktemp)
trap 'rm -f "$T"' EXIT

codex \
  --dangerously-bypass-approvals-and-sandbox \
  --model gpt-5.3-codex \
  -c model_reasoning_effort="high" \
  review "$@" >"$T" 2>&1 || true

sed 's/\x1b\[[0-9;]*m//g' "$T" \
  | awk '/^codex$/{found=1;c="";next}found{c=c $0 "\n"}END{print c}' \
  | sed '/^$/d' \
  | { grep -v '^tokens used' || true; } \
  | head -80
