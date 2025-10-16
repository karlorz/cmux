#!/usr/bin/env bun

import { rm } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

interface CommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

const execFileAsync = promisify(execFile);

async function runCommand(
  command: string,
  args: readonly string[],
  options: CommandOptions = {}
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      cwd: options.cwd,
      env: options.env,
      shell: false,
    });

    child.once("error", (error) => reject(error));
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `Command "${command} ${args.join(" ")}" exited with ${
            code === null ? `signal ${String(signal)}` : `code ${code}`
          }`
        )
      );
    });
  });
}

async function runCommandCapture(
  command: string,
  args: readonly string[],
  options: CommandOptions = {}
): Promise<string> {
  const result = await execFileAsync(command, args, {
    cwd: options.cwd,
    env: options.env,
    maxBuffer: 10 * 1024 * 1024,
  });
  return result.stdout;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseFileList(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort((a, b) => a.localeCompare(b));
}

function logFileSection(label: string, files: string[]): void {
  console.log("[inject] ------------------------------");
  console.log(`[inject] ${label} (${files.length})`);
  if (files.length === 0) {
    console.log("[inject]   (none)");
    return;
  }
  files.forEach((file) => {
    console.log(`[inject]   ${file}`);
  });
}

interface RepoIdentifier {
  owner: string;
  name: string;
}

function parseRepoUrl(repoUrl: string): RepoIdentifier {
  let url: URL;
  try {
    url = new URL(repoUrl);
  } catch (error) {
    throw new Error(
      `Unable to parse repository URL (${repoUrl}): ${String(
        error instanceof Error ? error.message : error
      )}`
    );
  }

  const path = url.pathname.replace(/^\//, "").replace(/\.git$/, "");
  const [owner, name] = path.split("/");
  if (!owner || !name) {
    throw new Error(`Repository URL must be in the form https://github.com/<owner>/<repo>[.git], received: ${repoUrl}`);
  }
  return { owner, name };
}

function extractPathFromDiff(rawPath: string): string {
  const trimmed = rawPath.trim();
  const arrowIndex = trimmed.indexOf(" => ");
  if (arrowIndex === -1) {
    return trimmed;
  }

  const braceStart = trimmed.indexOf("{");
  const braceEnd = trimmed.indexOf("}");
  if (
    braceStart !== -1 &&
    braceEnd !== -1 &&
    braceEnd > braceStart &&
    braceStart < arrowIndex &&
    braceEnd > arrowIndex
  ) {
    const prefix = trimmed.slice(0, braceStart);
    const braceContent = trimmed.slice(braceStart + 1, braceEnd);
    const suffix = trimmed.slice(braceEnd + 1);
    const braceParts = braceContent.split(" => ");
    const replacement = braceParts[braceParts.length - 1] ?? "";
    return `${prefix}${replacement}${suffix}`;
  }

  const parts = trimmed.split(" => ");
  return parts[parts.length - 1] ?? trimmed;
}

async function filterTextFiles(
  workspaceDir: string,
  baseRevision: string,
  files: readonly string[]
): Promise<string[]> {
  if (files.length === 0) {
    return [];
  }

  const fileSet = new Set(files);
  const args = [
    "diff",
    "--numstat",
    `${baseRevision}..HEAD`,
    "--",
    ...files,
  ];

  const output = await runCommandCapture("git", args, { cwd: workspaceDir });
  const textFiles = new Set<string>();

  output.split("\n").forEach((line) => {
    if (!line.trim()) {
      return;
    }
    const parts = line.split("\t");
    if (parts.length < 3) {
      return;
    }
    const [addedRaw, deletedRaw, ...pathParts] = parts;
    if (!addedRaw || !deletedRaw || pathParts.length === 0) {
      return;
    }
    const added = addedRaw.trim();
    const deleted = deletedRaw.trim();
    if (added === "-" || deleted === "-") {
      // Binary diff shows "-" for text stats.
      return;
    }
    const rawPath = pathParts.join("\t").trim();
    if (!rawPath) {
      return;
    }
    const normalizedPath = extractPathFromDiff(rawPath);
    if (fileSet.has(normalizedPath)) {
      textFiles.add(normalizedPath);
      return;
    }
    if (fileSet.has(rawPath)) {
      textFiles.add(rawPath);
      return;
    }
    textFiles.add(normalizedPath);
  });

  return files.filter((file) => textFiles.has(file));
}

async function main(): Promise<void> {
  const workspaceDir = requireEnv("WORKSPACE_DIR");
  const prUrl = requireEnv("PR_URL");
  const headRepoUrl = requireEnv("GIT_REPO_URL");
  const headRefName = requireEnv("GIT_BRANCH");
  const baseRepoUrl = requireEnv("BASE_REPO_URL");
  const baseRefName = requireEnv("BASE_REF_NAME");

  const headRepo = parseRepoUrl(headRepoUrl);
  const baseRepo = parseRepoUrl(baseRepoUrl);

  console.log(`[inject] Preparing review workspace for ${prUrl}`);
  console.log(
    `[inject] Head ${headRepo.owner}/${headRepo.name}@${headRefName}`
  );
  console.log(
    `[inject] Base ${baseRepo.owner}/${baseRepo.name}@${baseRefName}`
  );

  console.log(`[inject] Clearing workspace ${workspaceDir}...`);
  await rm(workspaceDir, { recursive: true, force: true });

  const cloneAndCheckout = (async () => {
    console.log(`[inject] Cloning ${headRepoUrl} into ${workspaceDir}...`);
    await runCommand("git", ["clone", headRepoUrl, workspaceDir]);
    console.log(`[inject] Checking out branch ${headRefName}...`);
    await runCommand("git", ["checkout", headRefName], {
      cwd: workspaceDir,
    });
  })();

  const installCodex = (async () => {
    console.log("[inject] Installing @openai/codex globally...");
    await runCommand("bun", ["add", "-g", "@openai/codex@latest"]);
  })();

  await Promise.all([cloneAndCheckout, installCodex]);

  const baseRemote =
    headRepo.owner === baseRepo.owner && headRepo.name === baseRepo.name
      ? "origin"
      : "base";

  if (baseRemote !== "origin") {
    console.log(`[inject] Adding remote ${baseRemote} -> ${baseRepoUrl}`);
    await runCommand("git", ["remote", "add", baseRemote, baseRepoUrl], {
      cwd: workspaceDir,
    });
  }

  console.log(`[inject] Fetching ${baseRemote}/${baseRefName}...`);
  await runCommand("git", ["fetch", baseRemote, baseRefName], {
    cwd: workspaceDir,
  });

  const baseRevision = `${baseRemote}/${baseRefName}`;
  const changedFilesOutput = await runCommandCapture(
    "git",
    ["diff", "--name-only", `${baseRevision}..HEAD`],
    { cwd: workspaceDir }
  );
  const modifiedFilesOutput = await runCommandCapture(
    "git",
    ["diff", "--diff-filter=M", "--name-only", `${baseRevision}..HEAD`],
    { cwd: workspaceDir }
  );

  const changedFiles = parseFileList(changedFilesOutput);
  const modifiedFiles = parseFileList(modifiedFilesOutput);

  logFileSection("All changed files", changedFiles);
  logFileSection("All modified files", modifiedFiles);

  const textChangedFiles = await filterTextFiles(
    workspaceDir,
    baseRevision,
    changedFiles
  );
  const textModifiedFiles = await filterTextFiles(
    workspaceDir,
    baseRevision,
    modifiedFiles
  );

  logFileSection("Changed text files", textChangedFiles);
  logFileSection("Modified text files", textModifiedFiles);

  console.log("[inject] Repository prepared.");
}

await main();
