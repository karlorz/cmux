#!/usr/bin/env bun

import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertForkReleaseVersion,
  assertReleaseVersion,
  listReleaseTagsFromRemoteRefs,
  parseRemoteTagRefs,
  resolveReleaseState,
  toReleaseTag,
} from "./lib/release-version";

const scriptPath = fileURLToPath(import.meta.url);
const scriptName = basename(scriptPath);
const scriptDir = resolve(scriptPath, "..");
const repoRoot = resolve(scriptDir, "..");

process.chdir(repoRoot);

type Command =
  | "baseline-tag"
  | "next-fork-tag"
  | "next-fork-version"
  | "current-tag"
  | "current-fork-tag"
  | "state";

type RunOptions = {
  allowNonZeroExit?: boolean;
};

type RunResult = {
  stdout: string;
  stderr: string;
  status: number;
};

function usage(): never {
  console.error(`Usage: ./scripts/${scriptName} <command> [--remote <name>]

Commands:
  baseline-tag        Print the current release baseline tag from remote tags
  next-fork-tag       Print the next suffixed fork release tag from remote tags
  next-fork-version   Print the next suffixed fork release version from remote tags
  current-tag         Print a validated tag for apps/client/package.json
  current-fork-tag    Print a validated suffixed fork tag for apps/client/package.json
  state               Print the resolved release state as JSON
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

function parseArgs(args: string[]): { command: Command; remote: string } {
  const [commandCandidate, ...rest] = args;
  if (!commandCandidate || commandCandidate === "-h" || commandCandidate === "--help") {
    usage();
  }

  const validCommands: Command[] = [
    "baseline-tag",
    "next-fork-tag",
    "next-fork-version",
    "current-tag",
    "current-fork-tag",
    "state",
  ];

  if (!validCommands.includes(commandCandidate as Command)) {
    usage();
  }

  let remote = "origin";
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--remote") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--remote requires a value.");
      }
      remote = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    command: commandCandidate as Command,
    remote,
  };
}

function loadCurrentPackageVersion(): string {
  const packagePath = resolve("apps", "client", "package.json");
  const raw = readFileSync(packagePath, "utf8");
  const parsed = JSON.parse(raw) as { version?: string };

  if (typeof parsed.version !== "string" || !parsed.version) {
    throw new Error("Unable to read current version from apps/client/package.json.");
  }

  return parsed.version;
}

function loadReleaseStateFromRemote(remote: string) {
  const remoteOutput = run("git", ["ls-remote", "--tags", remote]).stdout;
  const refs = parseRemoteTagRefs(remoteOutput);
  return resolveReleaseState(listReleaseTagsFromRemoteRefs(refs));
}

function main(): void {
  const { command, remote } = parseArgs(process.argv.slice(2));

  if (command === "current-tag") {
    const version = assertReleaseVersion(loadCurrentPackageVersion());
    process.stdout.write(`${toReleaseTag(version)}\n`);
    return;
  }

  if (command === "current-fork-tag") {
    const version = assertForkReleaseVersion(loadCurrentPackageVersion());
    process.stdout.write(`${toReleaseTag(version)}\n`);
    return;
  }

  const state = loadReleaseStateFromRemote(remote);

  if (command === "state") {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
    return;
  }

  if (command === "baseline-tag") {
    if (!state.baselineTag) {
      throw new Error(`No mirrored upstream release tags were found on remote ${remote}.`);
    }
    process.stdout.write(`${state.baselineTag}\n`);
    return;
  }

  if (command === "next-fork-tag") {
    if (!state.nextForkTag) {
      throw new Error(`No mirrored upstream release tags were found on remote ${remote}.`);
    }
    process.stdout.write(`${state.nextForkTag}\n`);
    return;
  }

  if (!state.nextForkVersion) {
    throw new Error(`No mirrored upstream release tags were found on remote ${remote}.`);
  }
  process.stdout.write(`${state.nextForkVersion}\n`);
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
