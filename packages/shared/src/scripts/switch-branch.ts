#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { $ } from "bun";

const workspaceDir = "/root/workspace";
const branchName = process.env.CMUX_BRANCH_NAME;

const logPrefix = "[cmux switch-branch]";
const log = (...parts: Array<string>) => {
  if (parts.length === 0) {
    console.error(logPrefix);
    return;
  }
  console.error(`${logPrefix} ${parts.join(" ")}`);
};

const formatError = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

if (!branchName) {
  log("missing branch name");
  process.exit(1);
}

async function detectRepositories(): Promise<Array<string>> {
  const found = new Set<string>();

  if (!existsSync(workspaceDir)) {
    log("workspace directory missing", workspaceDir);
    return Array.from(found);
  }

  const workspaceGit = join(workspaceDir, ".git");

  if (existsSync(workspaceGit)) {
    try {
      await $`git -C ${workspaceDir} rev-parse --is-inside-work-tree`.quiet();
      found.add(resolve(workspaceDir));
    } catch (error) {
      log("workspace has .git but is not a valid repo:", formatError(error));
    }
    return Array.from(found);
  }

  let dirEntries;
  try {
    dirEntries = await readdir(workspaceDir, { withFileTypes: true });
  } catch (error) {
    log("failed to read workspace entries:", formatError(error));
    return Array.from(found);
  }

  for (const entry of dirEntries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const repoDir = join(workspaceDir, entry.name);
    const gitDir = join(repoDir, ".git");
    if (!existsSync(gitDir)) {
      continue;
    }

    try {
      await $`git -C ${repoDir} rev-parse --is-inside-work-tree`.quiet();
      found.add(resolve(repoDir));
    } catch (error) {
      log("subdirectory has .git but is not a valid repo:", repoDir, formatError(error));
    }
  }

  return Array.from(found);
}

const repoPaths = await detectRepositories();

if (repoPaths.length === 0) {
  log("no git repositories detected");
  process.exit(0);
}

let failureCount = 0;

for (const repoPath of repoPaths) {
  log("repo=", repoPath, "-> switching to", branchName ?? "(missing)");

  try {
    await $`git -C ${repoPath} switch ${branchName}`.quiet();
    log("repo=", repoPath, "-> switched to existing branch", branchName ?? "(missing)");
    continue;
  } catch (switchError) {
    log(
      "repo=",
      repoPath,
      "-> existing branch missing, attempting to create:",
      formatError(switchError),
    );
  }

  try {
    await $`git -C ${repoPath} switch -c ${branchName}`.quiet();
    log("repo=", repoPath, "-> created branch", branchName ?? "(missing)");
  } catch (createError) {
    failureCount += 1;
    log(
      "repo=",
      repoPath,
      "-> failed to create branch:",
      formatError(createError),
    );
  }
}

if (failureCount > 0) {
  log("completed with failures:", String(failureCount));
  process.exit(1);
}

log("completed successfully for", String(repoPaths.length), "repo(s)");
