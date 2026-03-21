#!/usr/bin/env bun

import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  listReleaseTagsFromRemoteRefs,
  parseRemoteTagRefs,
  resolveRequestedForkReleaseVersion,
} from "./lib/release-version";

const scriptPath = fileURLToPath(import.meta.url);
const scriptName = basename(scriptPath);
const scriptDir = resolve(scriptPath, "..");
const repoRoot = resolve(scriptDir, "..");

process.chdir(repoRoot);

type RunOptions = {
  allowNonZeroExit?: boolean;
  stdio?: "pipe" | "inherit";
};

type RunResult = {
  stdout: string;
  stderr: string;
  status: number;
};

function usage(): never {
  console.error(
    `Usage: ./scripts/${scriptName} [<fork-version>]\nExamples:\n  ./scripts/${scriptName}\n  ./scripts/${scriptName} 1.0.269-0`
  );
  return process.exit(1);
}

function run(command: string, args: string[], options: RunOptions = {}): RunResult {
  const spawnOptions: SpawnSyncOptions = {
    cwd: process.cwd(),
    stdio: options.stdio ?? "pipe",
  };

  if ((options.stdio ?? "pipe") === "pipe") {
    spawnOptions.encoding = "utf8";
  }

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

function ensureGitAvailable(): void {
  try {
    run("git", ["--version"]);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`git is required to run ${scriptName}: ${error.message}`);
    }
    throw new Error(`git is required to run ${scriptName}`);
  }
}

function selectPreferredRemote(remotes: string[]): string {
  if (remotes.includes("origin")) {
    return "origin";
  }
  const firstRemote = remotes[0];
  if (!firstRemote) {
    throw new Error("No git remote configured. Add a remote before releasing.");
  }
  return firstRemote;
}

function updateVersionFile(version: string): void {
  const packagePath = resolve("apps", "client", "package.json");
  const raw = readFileSync(packagePath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  parsed.version = version;
  writeFileSync(packagePath, `${JSON.stringify(parsed, null, 2)}\n`);
  run("git", ["add", packagePath]);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length > 1) {
    usage();
  }

  if (args[0] === "-h" || args[0] === "--help") {
    usage();
  }

  ensureGitAvailable();

  const statusOutput = run("git", ["status", "--porcelain", "--untracked-files=no"]).stdout.trim();
  if (statusOutput) {
    throw new Error("Working tree has tracked changes. Commit or stash them before releasing.");
  }

  const currentBranch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim();
  if (currentBranch === "HEAD") {
    throw new Error("You are in a detached HEAD state. Check out a branch before releasing.");
  }

  const remotes = run("git", ["remote"]).stdout
    .split(/\r?\n/)
    .map((remote) => remote.trim())
    .filter(Boolean);

  if (remotes.length === 0) {
    throw new Error("No git remote configured. Add a remote before releasing.");
  }

  const pushRemote = selectPreferredRemote(remotes);
  const remoteTags = parseRemoteTagRefs(run("git", ["ls-remote", "--tags", pushRemote]).stdout);
  const releaseResolution = resolveRequestedForkReleaseVersion(
    listReleaseTagsFromRemoteRefs(remoteTags),
    args[0]
  );
  const newVersion = releaseResolution.version;

  const localTagCheck = run(
    "git",
    ["rev-parse", "-q", "--verify", `refs/tags/v${newVersion}`],
    { allowNonZeroExit: true }
  );
  if (localTagCheck.status === 0) {
    throw new Error(`Tag v${newVersion} already exists locally.`);
  }

  const remoteTagCheck = run(
    "git",
    ["ls-remote", "--tags", pushRemote, `refs/tags/v${newVersion}`],
    { allowNonZeroExit: true }
  );
  if (remoteTagCheck.stdout.trim()) {
    throw new Error(`Tag v${newVersion} already exists on ${pushRemote}.`);
  }

  updateVersionFile(newVersion);

  console.log(
    `Releasing version ${newVersion} (baseline is ${releaseResolution.state.baselineVersion})`
  );

  run("git", ["commit", "-m", `chore: release v${newVersion}`], { stdio: "inherit" });

  const upstreamResult = run(
    "git",
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    { allowNonZeroExit: true }
  );

  if (upstreamResult.status === 0) {
    run("git", ["push"], { stdio: "inherit" });
    const upstreamRef = upstreamResult.stdout.trim();
    if (upstreamRef) {
      console.log(`Pushed ${currentBranch} to ${upstreamRef}`);
    }
  } else {
    run("git", ["push", "-u", pushRemote, currentBranch], { stdio: "inherit" });
    console.log(`Pushed ${currentBranch} to ${pushRemote}/${currentBranch}`);
  }

  console.log(`Done. New version: ${newVersion}`);
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
