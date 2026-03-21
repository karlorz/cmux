#!/usr/bin/env bun

import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { RemoteTagRef } from "./lib/release-version";
import { parseRemoteTagRefs } from "./lib/release-version";
import { planUpstreamTagSync } from "./lib/upstream-tag-sync";

const scriptPath = fileURLToPath(import.meta.url);
const scriptName = basename(scriptPath);
const scriptDir = resolve(scriptPath, "..");
const repoRoot = resolve(scriptDir, "..");

process.chdir(repoRoot);

type RunOptions = {
  allowNonZeroExit?: boolean;
};

type RunResult = {
  stdout: string;
  stderr: string;
  status: number;
};

type CliOptions = {
  dryRun: boolean;
  json: boolean;
  repo: string;
  originTagsJson: string | null;
  upstreamTagsJson: string | null;
};

function usage(): never {
  console.error(`Usage: ./scripts/${scriptName} [--dry-run] [--json] [--repo <owner/repo>] [--origin-tags-json <path>] [--upstream-tags-json <path>]

Options:
  --dry-run            Print the sync plan without mutating tags or releases
  --json               Print the sync plan as JSON
  --repo               GitHub repo used for release cleanup (default: karlorz/cmux)
  --origin-tags-json   Load origin tag refs from a fixture JSON file
  --upstream-tags-json Load upstream tag refs from a fixture JSON file
`);
  process.exit(1);
}

function run(command: string, args: string[], options: RunOptions = {}): RunResult {
  const spawnOptions: SpawnSyncOptions = {
    cwd: process.cwd(),
    stdio: "pipe",
    encoding: "utf8",
  };

  const result = spawnSync(command, args, spawnOptions);
  if (result.error) {
    throw new Error(`Failed to run ${command}: ${result.error.message}`);
  }

  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  const status = typeof result.status === "number" ? result.status : 0;

  if (status !== 0 && !options.allowNonZeroExit) {
    const errorMessage = stderr.trim() || stdout.trim() || `${command} ${args.join(" ")}`;
    throw new Error(`Command failed (${command} ${args.join(" ")}): ${errorMessage}`);
  }

  return { stdout, stderr, status };
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
    json: false,
    repo: process.env.GITHUB_REPO ?? "karlorz/cmux",
    originTagsJson: null,
    upstreamTagsJson: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "-h" || arg === "--help") {
      usage();
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--repo") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("--repo requires a value.");
      }
      options.repo = value;
      index += 1;
      continue;
    }
    if (arg === "--origin-tags-json") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("--origin-tags-json requires a value.");
      }
      options.originTagsJson = value;
      index += 1;
      continue;
    }
    if (arg === "--upstream-tags-json") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("--upstream-tags-json requires a value.");
      }
      options.upstreamTagsJson = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if ((options.originTagsJson === null) !== (options.upstreamTagsJson === null)) {
    throw new Error(
      "--origin-tags-json and --upstream-tags-json must be provided together."
    );
  }

  return options;
}

function assertCleanWorkingTree(): void {
  const trackedChanges = run("git", ["status", "--porcelain", "--untracked-files=no"]).stdout.trim();
  if (trackedChanges) {
    throw new Error("Working tree has tracked changes. Commit or stash them before syncing tags.");
  }
}

function readFixtureRefs(path: string): RemoteTagRef[] {
  return JSON.parse(readFileSync(path, "utf8")) as RemoteTagRef[];
}

function loadGitRemoteRefs(remote: "origin" | "upstream"): RemoteTagRef[] {
  return parseRemoteTagRefs(run("git", ["ls-remote", "--tags", remote]).stdout);
}

function ensureUpstreamStageRef(tag: string): string {
  const stageRef = `refs/cmux/upstream-tags/${tag}`;
  run("git", ["fetch", "--force", "upstream", `refs/tags/${tag}:${stageRef}`]);
  return stageRef;
}

function deleteReleaseIfPresent(tag: string, repo: string): void {
  const releaseCheck = run("gh", ["release", "view", tag, "--repo", repo], {
    allowNonZeroExit: true,
  });
  if (releaseCheck.status === 0) {
    run("gh", ["release", "delete", tag, "--repo", repo, "--yes"]);
  }
}

function printHumanPlan(plan: ReturnType<typeof planUpstreamTagSync>): void {
  if (plan.actions.length === 0) {
    console.log("Upstream plain release tags are already mirrored on origin.");
    return;
  }

  console.log(`Planned actions: ${plan.actions.length}`);
  for (const action of plan.actions) {
    if (action.type === "create") {
      console.log(`- create ${action.tag} -> ${action.upstreamObjectId}`);
      continue;
    }
    console.log(
      `- repair ${action.tag}: ${action.originObjectId} -> ${action.upstreamObjectId} (delete matching GitHub release first)`
    );
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const usingFixtures =
    options.originTagsJson !== null && options.upstreamTagsJson !== null;
  if (!usingFixtures) {
    assertCleanWorkingTree();
  }

  const originRefs =
    options.originTagsJson !== null
      ? readFixtureRefs(options.originTagsJson)
      : loadGitRemoteRefs("origin");
  const upstreamRefs =
    options.upstreamTagsJson !== null
      ? readFixtureRefs(options.upstreamTagsJson)
      : loadGitRemoteRefs("upstream");

  const plan = planUpstreamTagSync(originRefs, upstreamRefs);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  } else {
    printHumanPlan(plan);
  }

  if (options.dryRun) {
    return;
  }

  for (const action of plan.actions) {
    const stageRef = ensureUpstreamStageRef(action.tag);
    try {
      if (action.type === "repair") {
        deleteReleaseIfPresent(action.tag, options.repo);
        run("git", ["push", "origin", `:refs/tags/${action.tag}`], {
          allowNonZeroExit: true,
        });
      }

      run("git", ["push", "origin", `${stageRef}:refs/tags/${action.tag}`]);
    } finally {
      run("git", ["update-ref", "-d", stageRef], { allowNonZeroExit: true });
    }
  }
}

try {
  main();
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }
  process.exit(1);
}
