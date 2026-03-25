import { Octokit } from "octokit";
import { generateGitHubInstallationToken, getInstallationForRepo } from "./github-app-token";

export interface CreateCheckRunOptions {
  repoFullName: string;
  headSha: string;
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion?: "success" | "failure" | "neutral" | "skipped";
  title: string;
  summary: string;
  detailsUrl?: string;
}

/**
 * Create or update a GitHub check run using the cmux GitHub App.
 * Returns the check run ID if successful, null otherwise.
 */
export async function createCheckRun(options: CreateCheckRunOptions): Promise<number | null> {
  const { repoFullName, headSha, name, status, conclusion, title, summary, detailsUrl } = options;

  const [owner, repo] = repoFullName.split("/");
  if (!owner || !repo) {
    console.error("[GitHub Check] Invalid repo format:", repoFullName);
    return null;
  }

  // Get installation for this repo
  const installationId = await getInstallationForRepo(repoFullName);
  if (!installationId) {
    console.log("[GitHub Check] No GitHub App installation for", repoFullName);
    return null;
  }

  // Generate token with checks:write permission
  const token = await generateGitHubInstallationToken({
    installationId,
    repositories: [repoFullName],
    permissions: {
      checks: "write",
      metadata: "read",
    },
  });

  const octokit = new Octokit({ auth: token });

  try {
    const response = await octokit.rest.checks.create({
      owner,
      repo,
      name,
      head_sha: headSha,
      status,
      conclusion: status === "completed" ? conclusion : undefined,
      output: {
        title,
        summary,
      },
      details_url: detailsUrl,
    });

    console.log(`[GitHub Check] Created check run ${response.data.id} for ${repoFullName}@${headSha.slice(0, 7)}`);
    return response.data.id;
  } catch (error) {
    console.error("[GitHub Check] Failed to create check run:", error);
    return null;
  }
}

/**
 * Update an existing GitHub check run.
 */
export async function updateCheckRun(options: {
  repoFullName: string;
  checkRunId: number;
  status?: "queued" | "in_progress" | "completed";
  conclusion?: "success" | "failure" | "neutral" | "skipped";
  title?: string;
  summary?: string;
}): Promise<boolean> {
  const { repoFullName, checkRunId, status, conclusion, title, summary } = options;

  const [owner, repo] = repoFullName.split("/");
  if (!owner || !repo) {
    console.error("[GitHub Check] Invalid repo format:", repoFullName);
    return false;
  }

  const installationId = await getInstallationForRepo(repoFullName);
  if (!installationId) {
    console.log("[GitHub Check] No GitHub App installation for", repoFullName);
    return false;
  }

  const token = await generateGitHubInstallationToken({
    installationId,
    repositories: [repoFullName],
    permissions: {
      checks: "write",
      metadata: "read",
    },
  });

  const octokit = new Octokit({ auth: token });

  try {
    await octokit.rest.checks.update({
      owner,
      repo,
      check_run_id: checkRunId,
      status,
      conclusion: status === "completed" ? conclusion : undefined,
      output: title && summary ? { title, summary } : undefined,
    });

    console.log(`[GitHub Check] Updated check run ${checkRunId} for ${repoFullName}`);
    return true;
  } catch (error) {
    console.error("[GitHub Check] Failed to update check run:", error);
    return false;
  }
}

/**
 * Publish a cmux/simplify check run for a PR.
 */
export async function publishSimplifyCheckRun(options: {
  repoFullName: string;
  headSha: string;
  passed: boolean;
  skipped?: boolean;
  skipReason?: string;
  mode?: "quick" | "full" | "staged-only";
  taskRunUrl?: string;
}): Promise<number | null> {
  const { repoFullName, headSha, passed, skipped, skipReason, mode, taskRunUrl } = options;

  let conclusion: "success" | "neutral" | "skipped";
  let title: string;
  let summary: string;

  if (skipped) {
    conclusion = "skipped";
    title = "/simplify skipped";
    summary = skipReason || "Simplify review was skipped by admin.";
  } else if (passed) {
    conclusion = "success";
    title = `/simplify passed${mode ? ` (${mode})` : ""}`;
    summary = "Code review completed successfully. The code has been reviewed for reuse opportunities, quality issues, and efficiency improvements.";
  } else {
    conclusion = "neutral";
    title = "/simplify pending";
    summary = "Simplify review has not been run yet. Run `/simplify` to complete the review.";
  }

  return createCheckRun({
    repoFullName,
    headSha,
    name: "cmux/simplify",
    status: "completed",
    conclusion,
    title,
    summary,
    detailsUrl: taskRunUrl,
  });
}
