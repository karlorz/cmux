#!/bin/bash
# Runs Codex review through the official Codex Companion review command.
# Usage: codex-review-extract.sh [--base main | --uncommitted]
# Exit 0 with findings on stdout, or empty stdout when no findings were detected.
# Exit non-zero when the official review command cannot run or returns an
# unexpected/ambiguous result.
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

MODE=""
BASE_BRANCH="main"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --base)
      MODE="base"
      if [ "$#" -ge 2 ] && [ -n "$2" ] && [ "${2#--}" = "$2" ]; then
        BASE_BRANCH="$2"
        shift 2
      else
        BASE_BRANCH="main"
        shift
      fi
      ;;
    --uncommitted)
      MODE="uncommitted"
      shift
      ;;
    *)
      echo "[codex-review-extract] unsupported argument: $1"
      exit 1
      ;;
  esac
done

if [ -z "$MODE" ]; then
  echo "[codex-review-extract] missing mode; use --base <branch> or --uncommitted"
  exit 1
fi

resolve_companion_script() {
  if [ -n "${CODEX_COMPANION_SCRIPT:-}" ] && [ -f "${CODEX_COMPANION_SCRIPT}" ]; then
    printf '%s\n' "$CODEX_COMPANION_SCRIPT"
    return 0
  fi

  local candidate
  local latest=""
  for candidate in "$HOME"/.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs; do
    [ -f "$candidate" ] || continue
    latest="$candidate"
  done

  if [ -n "$latest" ]; then
    printf '%s\n' "$latest"
    return 0
  fi

  return 1
}

has_branch_changes() {
  ! git diff --quiet "${BASE_BRANCH}...HEAD" --
}

has_uncommitted_changes() {
  ! git diff --quiet --cached -- || ! git diff --quiet -- || [ -n "$(git ls-files --others --exclude-standard)" ]
}

if [ "$MODE" = "base" ]; then
  if ! has_branch_changes; then
    exit 0
  fi
  REVIEW_ARGS=(review --json --scope branch --base "$BASE_BRANCH")
  TARGET_LABEL="branch diff against ${BASE_BRANCH}"
else
  if ! has_uncommitted_changes; then
    exit 0
  fi
  REVIEW_ARGS=(review --json --scope working-tree)
  TARGET_LABEL="working tree diff"
fi

COMPANION_SCRIPT="$(resolve_companion_script || true)"
if [ -z "$COMPANION_SCRIPT" ]; then
  echo "[codex-review-extract] official Codex review support is unavailable. Install the Codex plugin and run /codex:setup."
  exit 1
fi

TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT

if ! node "$COMPANION_SCRIPT" "${REVIEW_ARGS[@]}" >"$TMPFILE" 2>&1; then
  OUTPUT=$(cat "$TMPFILE")
  if [ -n "$OUTPUT" ]; then
    printf '[codex-review-extract] official /codex:review failed for %s\n%s\n' "$TARGET_LABEL" "$OUTPUT"
  else
    printf '[codex-review-extract] official /codex:review failed for %s\n' "$TARGET_LABEL"
  fi
  exit 1
fi

RESULT=$(python3 - "$TMPFILE" "$TARGET_LABEL" <<'PY'
import json
import re
import sys
from pathlib import Path

raw = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
target_label = sys.argv[2]

try:
    payload = json.loads(raw)
except json.JSONDecodeError as exc:
    print("ERROR")
    print(f"[codex-review-extract] official /codex:review returned invalid JSON for {target_label}: {exc}")
    raise SystemExit(0)

codex = payload.get("codex")
if not isinstance(codex, dict):
    print("ERROR")
    print(f"[codex-review-extract] official /codex:review returned an unexpected payload for {target_label}.")
    raise SystemExit(0)

status = codex.get("status")
stdout = str(codex.get("stdout") or "").strip()
stderr = str(codex.get("stderr") or "").strip()

if status != 0:
    print("ERROR")
    message = f"[codex-review-extract] official /codex:review failed for {target_label}"
    if stderr:
        message = f"{message}\n{stderr}"
    print(message)
    raise SystemExit(0)

if not stdout:
    print("ERROR")
    print(f"[codex-review-extract] official /codex:review returned no review output for {target_label}.")
    raise SystemExit(0)

normalized = re.sub(r"\s+", " ", stdout.lower()).strip()
no_finding_markers = [
    "no findings",
    "no material findings",
    "no actionable issues",
    "no actionable issue",
    "no actionable bug",
    "no actionable bugs",
    "did not find any actionable",
    "did not find actionable",
    "did not find any bug",
    "did not find any bugs",
    "did not find any issue",
    "did not find any issues",
    "would not break existing code",
    "does not change runtime behavior",
    "without changing any exported shapes or behavior",
]

if any(marker in normalized for marker in no_finding_markers):
    print("OK")
    raise SystemExit(0)

print("FINDINGS")
print(stdout)
PY
)

RESULT_KIND=$(printf '%s\n' "$RESULT" | head -n 1)
RESULT_BODY=$(printf '%s\n' "$RESULT" | tail -n +2)

case "$RESULT_KIND" in
  OK)
    exit 0
    ;;
  FINDINGS)
    printf '%s\n' "$RESULT_BODY"
    exit 0
    ;;
  ERROR)
    printf '%s\n' "$RESULT_BODY"
    exit 1
    ;;
  *)
    echo "[codex-review-extract] official /codex:review returned an unrecognized result for ${TARGET_LABEL}."
    exit 1
    ;;
esac
