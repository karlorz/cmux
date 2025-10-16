#!/usr/bin/env bun

import type { Instance } from "morphcloud";
import { MorphCloudClient } from "morphcloud";
import { Octokit } from "octokit";
import { readFile } from "node:fs/promises";

const DEFAULT_PR_URL = "https://github.com/manaflow-ai/cmux/pull/653";
const DEFAULT_MORPH_SNAPSHOT_ID = "snapshot_vb7uqz8o";
const OPEN_VSCODE_PORT = 39378;
const injectScriptSourcePromise = readFile(
  new URL("./pr-review-inject.ts", import.meta.url),
  "utf8"
);

interface ParsedPrUrl {
  owner: string;
  repo: string;
  number: number;
}

interface PrMetadata extends ParsedPrUrl {
  prUrl: string;
  headRefName: string;
  headRepoOwner: string;
  headRepoName: string;
  baseRefName: string;
}

type OctokitClient = InstanceType<typeof Octokit>;
type PullRequestGetResponse = Awaited<
  ReturnType<OctokitClient["rest"]["pulls"]["get"]>
>;
type GithubApiPullResponse = PullRequestGetResponse["data"];

function getGithubToken(): string | null {
  const token =
    process.env.GITHUB_TOKEN ??
    process.env.GH_TOKEN ??
    process.env.GITHUB_PERSONAL_ACCESS_TOKEN ??
    null;
  return token && token.length > 0 ? token : null;
}

function parsePrUrl(prUrl: string): ParsedPrUrl {
  let url: URL;
  try {
    url = new URL(prUrl);
  } catch (_error) {
    throw new Error(`Invalid PR URL: ${prUrl}`);
  }

  const pathParts = url.pathname.split("/").filter(Boolean);
  if (pathParts.length < 3 || pathParts[2] !== "pull") {
    throw new Error(
      `PR URL must be in the form https://github.com/<owner>/<repo>/pull/<number>, received: ${prUrl}`
    );
  }

  const [owner, repo, _pullSegment, prNumberPart] = pathParts;
  const prNumber = Number(prNumberPart);
  if (!Number.isInteger(prNumber)) {
    throw new Error(`Invalid PR number in URL: ${prUrl}`);
  }

  return { owner, repo, number: prNumber };
}

async function fetchPrMetadata(prUrl: string): Promise<PrMetadata> {
  const parsed = parsePrUrl(prUrl);
  const token = getGithubToken();
  const octokit = new Octokit(token ? { auth: token } : {});

  let data: GithubApiPullResponse;
  try {
    const response = await octokit.rest.pulls.get({
      owner: parsed.owner,
      repo: parsed.repo,
      pull_number: parsed.number,
    });
    data = response.data;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "unknown error");
    throw new Error(
      `Failed to fetch PR metadata via GitHub API: ${message}`.trim()
    );
  }

  const headRefName = data.head?.ref;
  if (typeof headRefName !== "string" || headRefName.length === 0) {
    throw new Error("PR metadata is missing head.ref.");
  }

  const headRepoName = data.head?.repo?.name;
  const headRepoOwner = data.head?.repo?.owner?.login;
  if (
    typeof headRepoName !== "string" ||
    headRepoName.length === 0 ||
    typeof headRepoOwner !== "string" ||
    headRepoOwner.length === 0
  ) {
    throw new Error("PR metadata is missing head repository information.");
  }

  const baseRefName = data.base?.ref;
  if (typeof baseRefName !== "string" || baseRefName.length === 0) {
    throw new Error("PR metadata is missing base.ref.");
  }

  const baseRepoName = data.base?.repo?.name;
  const baseRepoOwner = data.base?.repo?.owner?.login;

  return {
    owner:
      typeof baseRepoOwner === "string" && baseRepoOwner.length > 0
        ? baseRepoOwner
        : parsed.owner,
    repo:
      typeof baseRepoName === "string" && baseRepoName.length > 0
        ? baseRepoName
        : parsed.repo,
    number: parsed.number,
    prUrl,
    headRefName,
    headRepoName,
    headRepoOwner,
    baseRefName,
  };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function startTiming(label: string): () => void {
  const startTime = performance.now();
  let finished = false;
  return () => {
    if (finished) {
      return;
    }
    finished = true;
    const durationMs = performance.now() - startTime;
    const seconds = durationMs / 1000;
    console.log(`[timing] ${label} ${seconds.toFixed(2)}s`);
  };
}

async function execOrThrow(instance: Instance, command: string): Promise<void> {
  const result = await instance.exec(command);
  const exitCode = result.exit_code ?? 0;
  if (exitCode !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw new Error(
      [
        `Command failed: ${command}`,
        stdout ? `stdout:\n${stdout}` : "",
        stderr ? `stderr:\n${stderr}` : "",
      ]
        .filter(Boolean)
        .join("\n\n")
    );
  }
  if (result.stdout && result.stdout.length > 0) {
    process.stdout.write(result.stdout);
    if (!result.stdout.endsWith("\n")) {
      process.stdout.write("\n");
    }
  }
  if (result.stderr && result.stderr.length > 0) {
    process.stderr.write(result.stderr);
    if (!result.stderr.endsWith("\n")) {
      process.stderr.write("\n");
    }
  }
}

function describeServices(instance: Instance): void {
  if (!instance.networking?.httpServices?.length) {
    console.log("No HTTP services exposed on the Morph instance yet.");
    return;
  }

  instance.networking.httpServices.forEach((service) => {
    console.log(
      `HTTP service ${service.name ?? `port-${service.port}`} -> ${service.url}`
    );
  });
}

function buildMetadata(pr: PrMetadata): Record<string, string> {
  return {
    purpose: "pr-review",
    prUrl: pr.prUrl,
    repo: `${pr.owner}/${pr.repo}`,
    head: `${pr.headRepoOwner}/${pr.headRepoName}#${pr.headRefName}`,
  };
}

async function fetchPrMetadataTask(prUrl: string): Promise<PrMetadata> {
  console.log("Fetching PR metadata...");
  const finishFetchMetadata = startTiming("fetch PR metadata");
  try {
    return await fetchPrMetadata(prUrl);
  } finally {
    finishFetchMetadata();
  }
}

async function startMorphInstanceTask(
  client: MorphCloudClient,
  prUrl: string
): Promise<Instance> {
  console.log(
    `Starting Morph instance from snapshot ${DEFAULT_MORPH_SNAPSHOT_ID}...`
  );
  const finishStartInstance = startTiming("start Morph instance");
  try {
    return await client.instances.start({
      snapshotId: DEFAULT_MORPH_SNAPSHOT_ID,
      ttlSeconds: 60 * 60 * 2,
      ttlAction: "pause",
      metadata: {
        purpose: "pr-review",
        prUrl,
      },
    });
  } finally {
    finishStartInstance();
  }
}

function logOpenVscodeUrl(instance: Instance, workspacePath: string): void {
  const services = instance.networking?.httpServices ?? [];
  const vscodeService = services.find(
    (service) =>
      service.port === OPEN_VSCODE_PORT ||
      service.name === `port-${OPEN_VSCODE_PORT}`
  );

  if (!vscodeService) {
    console.warn(
      `Warning: could not find exposed OpenVSCode service on port ${OPEN_VSCODE_PORT}.`
    );
    return;
  }

  try {
    const vscodeUrl = new URL(vscodeService.url);
    vscodeUrl.searchParams.set("folder", workspacePath);
    console.log(`OpenVSCode (${OPEN_VSCODE_PORT}): ${vscodeUrl.toString()}`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "unknown error");
    console.warn(
      `Warning: unable to format OpenVSCode URL for port ${OPEN_VSCODE_PORT}: ${message}`
    );
  }
}

async function waitForUserToConfirmStop(): Promise<void> {
  if (!process.stdin.readable) {
    return;
  }

  console.log("Press any key to stop the Morph instance...");

  await new Promise<void>((resolve) => {
    const onData = (): void => {
      process.stdin.pause();
      process.stdin.off("data", onData);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      resolve();
    };

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    process.stdin.resume();
    process.stdin.once("data", onData);
  });
}

async function main(): Promise<void> {
  const prUrlFromCli = process.argv[2];
  const prUrl =
    prUrlFromCli && prUrlFromCli.length > 0 ? prUrlFromCli : DEFAULT_PR_URL;

  console.log(`Preparing Morph review environment for ${prUrl}`);

  const client = new MorphCloudClient();
  let instance: Instance | null = null;

  const startInstancePromise = startMorphInstanceTask(client, prUrl).then(
    (startedInstance) => {
      instance = startedInstance;
      return startedInstance;
    }
  );
  const prMetadataPromise = fetchPrMetadataTask(prUrl);

  try {
    const [prMetadata, startedInstance] = await Promise.all([
      prMetadataPromise,
      startInstancePromise,
    ]);

    instance = startedInstance;

    console.log(
      `Targeting ${prMetadata.headRepoOwner}/${prMetadata.headRepoName}@${prMetadata.headRefName}`
    );

    try {
      await startedInstance.setMetadata(buildMetadata(prMetadata));
    } catch (metadataError) {
      const message =
        metadataError instanceof Error
          ? metadataError.message
          : String(metadataError ?? "unknown error");
      console.warn(
        `Warning: failed to set metadata for instance ${startedInstance.id}: ${message}`
      );
    }

    console.log("Waiting for Morph instance to be ready...");
    const finishWaitReady = startTiming("wait for Morph instance ready");
    try {
      await startedInstance.waitUntilReady();
    } finally {
      finishWaitReady();
    }
    console.log(`Instance ${startedInstance.id} is ready.`);

    const baseDir = "/root/workspace";
    describeServices(startedInstance);
    logOpenVscodeUrl(startedInstance, baseDir);

    const repoDir = baseDir;
    const cloneUrl = `https://github.com/${prMetadata.headRepoOwner}/${prMetadata.headRepoName}.git`;

    console.log("Preparing repository inside Morph instance...");
    const finishPrepareRepo = startTiming("prepare repository");
    const remoteScriptPath = "/root/pr-review-inject.ts";
    const injectScriptSource = await injectScriptSourcePromise;
    const baseRepoUrl = `https://github.com/${prMetadata.owner}/${prMetadata.repo}.git`;
    const envAssignments = [
      ["WORKSPACE_DIR", baseDir],
      ["PR_URL", prMetadata.prUrl],
      ["GIT_REPO_URL", cloneUrl],
      ["GIT_BRANCH", prMetadata.headRefName],
      ["BASE_REPO_URL", baseRepoUrl],
      ["BASE_REF_NAME", prMetadata.baseRefName],
    ]
      .map(([key, value]) => `${key}=${shellQuote(value)}`)
      .join(" ");
    const injectCommand =
      [
        `cat <<'EOF_PR_REVIEW_INJECT' > ${shellQuote(remoteScriptPath)}`,
        injectScriptSource,
        "EOF_PR_REVIEW_INJECT",
        `${envAssignments} bun ${shellQuote(remoteScriptPath)}`,
      ].join("\n") + "\n";
    try {
      await execOrThrow(startedInstance, injectCommand);
    } finally {
      finishPrepareRepo();
    }

    console.log(`Repository ready at ${repoDir}`);
    console.log(
      `Morph instance ${startedInstance.id} provisioned for PR ${prMetadata.prUrl}`
    );
    logOpenVscodeUrl(startedInstance, baseDir);
  } finally {
    await startInstancePromise.catch(() => null);
    if (instance) {
      try {
        await waitForUserToConfirmStop();
        console.log(`Stopping Morph instance ${instance.id}...`);
        const finishStopInstance = startTiming("stop Morph instance");
        try {
          await instance.stop();
          console.log(`Instance ${instance.id} stopped.`);
        } finally {
          finishStopInstance();
        }
      } catch (stopError) {
        const message =
          stopError instanceof Error
            ? stopError.message
            : typeof stopError === "string"
              ? stopError
              : JSON.stringify(stopError);
        console.warn(
          `Warning: failed to stop instance ${instance.id}: ${message}`
        );
      }
    }
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
