#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'HELP' >&2
Usage: ./scripts/bump-version.sh <new-version|major|minor|patch>
Examples:
  ./scripts/bump-version.sh 1.2.3
  ./scripts/bump-version.sh 1.2.3-0
  ./scripts/bump-version.sh patch
HELP
  exit 1
}

if [[ $# -ne 1 ]]; then
  usage
fi

BUMP_TARGET="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "node is required to run bump-version.sh" >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git is required to run bump-version.sh" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "Working tree has tracked changes. Commit or stash them before bumping." >&2
  exit 1
fi

current_version="$(node -e 'console.log(require("./apps/client/package.json").version)')"

if [[ -z "$current_version" ]]; then
  echo "Unable to read current version from apps/client/package.json." >&2
  exit 1
fi

if [[ ! "$current_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9]+)?$ ]]; then
  echo "Current version \"$current_version\" is not in the expected x.y.z or x.y.z-n format." >&2
  exit 1
fi

case "$BUMP_TARGET" in
  major|minor|patch)
    if [[ "$current_version" == *-* ]]; then
      echo "Cannot use $BUMP_TARGET while current version is suffixed ($current_version). Pass an exact version instead." >&2
      exit 1
    fi
    IFS='.' read -r major minor patch <<< "$current_version"
    case "$BUMP_TARGET" in
      major)
        major=$((major + 1))
        minor=0
        patch=0
        ;;
      minor)
        minor=$((minor + 1))
        patch=0
        ;;
      patch)
        patch=$((patch + 1))
        ;;
    esac
    new_version="${major}.${minor}.${patch}"
    ;;
  *)
    new_version="$BUMP_TARGET"
    ;;
esac

if [[ ! "$new_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9]+)?$ ]]; then
  echo "Version \"$new_version\" is not a valid release version (x.y.z or x.y.z-n)." >&2
  exit 1
fi

if [[ "$new_version" == "$current_version" ]]; then
  echo "New version matches current version ($current_version). Nothing to do." >&2
  exit 1
fi

compare_versions() {
  CURRENT_VERSION="$1" NEXT_VERSION="$2" node <<'NODE'
    const versionPattern = /^(\d+)\.(\d+)\.(\d+)(?:-(\d+))?$/;

    function parseVersion(value) {
      const match = versionPattern.exec(value);
      if (!match) {
        process.stderr.write(`Invalid release version: ${value}\n`);
        process.exit(1);
      }
      return {
        major: Number.parseInt(match[1], 10),
        minor: Number.parseInt(match[2], 10),
        patch: Number.parseInt(match[3], 10),
        suffix: typeof match[4] === "string" ? Number.parseInt(match[4], 10) : null,
      };
    }

    function compare(left, right) {
      for (const key of ["major", "minor", "patch"]) {
        if (left[key] !== right[key]) {
          return left[key] > right[key] ? 1 : -1;
        }
      }
      if (left.suffix === right.suffix) {
        return 0;
      }
      if (left.suffix === null) {
        return -1;
      }
      if (right.suffix === null) {
        return 1;
      }
      return left.suffix > right.suffix ? 1 : -1;
    }

    const current = parseVersion(process.env.CURRENT_VERSION ?? "");
    const next = parseVersion(process.env.NEXT_VERSION ?? "");
    process.stdout.write(String(compare(current, next)));
NODE
}

if [[ "$(compare_versions "$new_version" "$current_version")" == "-1" ]]; then
  echo "New version $new_version is lower than current version $current_version." >&2
  exit 1
fi

update_version_file() {
  local file="$1"
  local version="$2"

  if [[ ! -f "$file" ]]; then
    echo "Version file $file not found." >&2
    exit 1
  fi

  TARGET_FILE="$file" TARGET_VERSION="$version" node <<'NODE'
    import { readFileSync, writeFileSync } from "node:fs";

    const file = process.env.TARGET_FILE;
    const version = process.env.TARGET_VERSION;

    const json = JSON.parse(readFileSync(file, "utf8"));
    json.version = version;
    writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
NODE
}

version_files=("apps/client/package.json")

for file in "${version_files[@]}"; do
  update_version_file "$file" "$new_version"
  git add "$file"
done

echo "Bumping version from $current_version to $new_version"

git commit -m "chore: bump version to $new_version"

current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$current_branch" == "HEAD" ]]; then
  echo "You are in a detached HEAD state. Check out a branch before bumping." >&2
  exit 1
fi

if git remote | grep -x 'origin' >/dev/null 2>&1; then
  first_remote="origin"
else
  first_remote="$(git remote | head -n 1)"
fi
if [[ -z "$first_remote" ]]; then
  echo "No git remote configured. Add a remote before bumping." >&2
  exit 1
fi

if git rev-parse --abbrev-ref --symbolic-full-name @{u} >/dev/null 2>&1; then
  upstream_ref="$(git rev-parse --abbrev-ref --symbolic-full-name @{u})"
  git push
  echo "Pushed $current_branch to $upstream_ref"
else
  git push -u "$first_remote" "$current_branch"
  echo "Pushed $current_branch to $first_remote/$current_branch"
fi

echo "Done. New version: $new_version"
