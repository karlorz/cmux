#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/clean.sh [-n|--dry-run] [-f|--force] [-h|--help] [path]
DRY_RUN=0
FORCE=0
TARGET="."

show_help() {
  echo "Usage: $0 [-n|--dry-run] [-f|--force] [-h|--help] [path]"
  echo ""
  echo "Options:"
  echo "  -n, --dry-run  Show paths and sizes to delete, but do not actually delete."
  echo "  -f, --force    Skip interactive confirmation."
  echo "  -h, --help     Show this help message."
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--dry-run) DRY_RUN=1; shift ;;
    -f|--force)   FORCE=1; shift ;;
    -h|--help)    show_help; exit 0 ;;
    -*)           echo "Unknown option: $1"; show_help; exit 1 ;;
    *)            TARGET="$1"; shift ;;
  esac
done

echo "=== CMUX Dev Disk Rescue ==="
echo "Target path: $TARGET"
echo ""

# Determine parallelism
CORES=1
if command -v nproc >/dev/null 2>&1; then
  CORES="$(nproc)"
elif command -v sysctl >/dev/null 2>&1; then
  CORES="$(sysctl -n hw.ncpu)"
fi

# 1. Gather files to clean
declare -a CLEAN_DIRS=()
declare -a CLEAN_FILES=()

# Find nested node_modules
if command -v fd >/dev/null 2>&1; then
  while IFS= read -r -d '' dir; do
    CLEAN_DIRS+=("$dir")
  done < <(fd -HI -t d -0 --exclude 'dev-docs' '^node_modules$' "$TARGET")
else
  while IFS= read -r -d '' dir; do
    CLEAN_DIRS+=("$dir")
  done < <(find "$TARGET" -path './dev-docs' -prune -o -type d -name node_modules -prune -print0)
fi

# Find test/build caches (e.g., .pytest_cache)
if [[ -d "$TARGET/.pytest_cache" ]]; then
  CLEAN_DIRS+=("$TARGET/.pytest_cache")
fi

# Find log files under logs/
if [[ -d "$TARGET/logs" ]]; then
  while IFS= read -r -d '' file; do
    CLEAN_FILES+=("$file")
  done < <(find "$TARGET/logs" -type f -name "*.log" -print0)
fi

# Calculate space reclaimable
TOTAL_KB=0

echo "Discovered items to clean:"
if [[ ${#CLEAN_DIRS[@]} -eq 0 && ${#CLEAN_FILES[@]} -eq 0 ]]; then
  echo "  No files or directories need cleaning."
else
  # Calculate sizes and list directories
  for dir in "${CLEAN_DIRS[@]}"; do
    if [[ -d "$dir" ]]; then
      # On macOS, du -sk calculates kilobytes
      SIZE_KB=$(du -sk "$dir" | awk '{print $1}')
      TOTAL_KB=$((TOTAL_KB + SIZE_KB))
      SIZE_HUMAN=$(du -sh "$dir" | awk '{print $1}')
      echo "  [DIR]  $dir ($SIZE_HUMAN)"
    fi
  done

  # Calculate sizes and list files
  for file in "${CLEAN_FILES[@]}"; do
    if [[ -f "$file" ]]; then
      SIZE_KB=$(du -k "$file" | awk '{print $1}')
      TOTAL_KB=$((TOTAL_KB + SIZE_KB))
      SIZE_HUMAN=$(du -sh "$file" | awk '{print $1}')
      echo "  [FILE] $file ($SIZE_HUMAN)"
    fi
  done

  # Format total size
  TOTAL_MB=$((TOTAL_KB / 1024))
  echo ""
  echo "Estimated total space to reclaim: ${TOTAL_MB} MB"
fi

if [[ ${#CLEAN_DIRS[@]} -eq 0 && ${#CLEAN_FILES[@]} -eq 0 ]]; then
  echo "Nothing to do. Exiting."
  exit 0
fi

# 2. Interactive Confirmation
SHOULD_PROCEED=0
if [[ "$FORCE" -eq 1 ]]; then
  SHOULD_PROCEED=1
elif [[ ! -t 0 ]]; then
  # Non-interactive shell, default to proceed but warn
  echo "Non-interactive shell detected. Proceeding without confirmation."
  SHOULD_PROCEED=1
else
  read -r -p "Are you sure you want to delete these files and directories? [y/N]: " response
  if [[ "$response" =~ ^[yY](es)?$ ]]; then
    SHOULD_PROCEED=1
  fi
fi

if [[ "$SHOULD_PROCEED" -ne 1 ]]; then
  echo "Cleanup cancelled by user."
  exit 0
fi

# 3. Execution
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Dry-run mode active. No files were deleted."
  exit 0
fi

echo "Cleaning up items..."

# Delete directories in parallel
if [[ ${#CLEAN_DIRS[@]} -gt 0 ]]; then
  printf "%s\0" "${CLEAN_DIRS[@]}" | xargs -0 -n 1 -P "$CORES" rm -rf --
fi

# Truncate or remove files
for file in "${CLEAN_FILES[@]}"; do
  if [[ -f "$file" ]]; then
    rm -f "$file"
  fi
done

echo "Cleanup complete! Dev disk space reclaimed."
