import type { RunScreenshotSet, RunScreenshotsResponse } from "@cmux/shared";
import { z } from "zod";
import { log } from "../logger";
import { convexRequest } from "./convex";
import { execAsync, WORKSPACE_ROOT } from "./utils";
import type {
  CandidateData,
  CrownWorkerCheckResponse,
  PullRequestMetadata,
  WorkerRunContext,
} from "./types";

const MAX_PR_SCREENSHOTS = 4;
const COMPLETED_STATUS_FILTER = ["completed"] as const;

type PrScreenshot = {
  url: string;
  fileName?: string | null;
  commitSha?: string | null;
  capturedAt?: number;
};

function selectScreenshotsForPr(
  screenshotSets: RunScreenshotSet[]
): PrScreenshot[] {
  const sortedSets = [...screenshotSets].sort(
    (a, b) => b.capturedAt - a.capturedAt
  );

  const selected: PrScreenshot[] = [];
  for (const set of sortedSets) {
    if (set.status !== "completed") {
      continue;
    }
    for (const image of set.images) {
      if (!image.url) continue;
      selected.push({
        url: image.url,
        fileName: image.fileName ?? null,
        commitSha: image.commitSha ?? set.commitSha ?? null,
        capturedAt: set.capturedAt,
      });
      if (selected.length >= MAX_PR_SCREENSHOTS) {
        return selected;
      }
    }
  }

  return selected;
}

function buildScreenshotSection(
  agentName: string,
  screenshots: PrScreenshot[]
): string {
  const plural = screenshots.length === 1 ? "screenshot" : "screenshots";
  const entries = screenshots
    .map((shot, index) => {
      const captionParts: string[] = [];
      if (shot.fileName) {
        captionParts.push(shot.fileName);
      }
      if (shot.commitSha) {
        captionParts.push(`commit ${shot.commitSha.slice(0, 7)}`);
      }
      if (shot.capturedAt) {
        captionParts.push(new Date(shot.capturedAt).toISOString());
      }
      const caption =
        captionParts.length > 0
          ? `\n<sub>${captionParts.join(" • ")}</sub>`
          : "";
      return `**Screenshot ${index + 1}**\n\n![Screenshot ${index + 1}](${shot.url})${caption}`;
    })
    .join("\n\n");

  return `### Screenshots
Captured by **${agentName}** using cmux.

<details>
<summary>View ${screenshots.length} ${plural}</summary>

${entries}

</details>`;
}

async function fetchScreenshotsForRun(options: {
  token: string;
  taskId: string;
  runId: string;
  convexUrl?: string;
}): Promise<PrScreenshot[]> {
  const { token, taskId, runId, convexUrl } = options;
  const response = await convexRequest<RunScreenshotsResponse>(
    "/api/screenshots/run-summary",
    token,
    {
      taskId,
      runId,
      limit: MAX_PR_SCREENSHOTS,
      statusFilter: COMPLETED_STATUS_FILTER,
    },
    convexUrl
  );

  if (!response?.ok) {
    return [];
  }

  return selectScreenshotsForPr(response.screenshotSets ?? []);
}

export function buildPullRequestTitle(prompt: string): string {
  const base = prompt.trim() || "cmux changes";
  const title = `[Crown] ${base}`;
  return title.length > 72 ? `${title.slice(0, 69)}...` : title;
}

export function buildPullRequestBody({
  summary,
  prompt,
  agentName,
  branch,
  taskId,
  runId,
  screenshots,
}: {
  summary?: string;
  prompt: string;
  agentName: string;
  branch: string;
  taskId: string;
  runId: string;
  screenshots?: PrScreenshot[];
}): string {
  const bodySummary = summary?.trim() || "Summary not available.";
  const baseBody = `## 🏆 Crown Winner: ${agentName}

### Task Description
${prompt}

### Summary
${bodySummary}

### Implementation Details
- **Agent**: ${agentName}
- **Task ID**: ${taskId}
- **Run ID**: ${runId}
- **Branch**: ${branch}
- **Created**: ${new Date().toISOString()}`;

  const screenshotSection =
    screenshots && screenshots.length > 0
      ? buildScreenshotSection(agentName, screenshots)
      : null;

  return screenshotSection ? `${baseBody}\n\n${screenshotSection}` : baseBody;
}

function mapGhState(
  state: string | undefined
): "none" | "draft" | "open" | "merged" | "closed" | "unknown" {
  if (!state) return "unknown";
  const normalized = state.toLowerCase();
  if (
    normalized === "open" ||
    normalized === "closed" ||
    normalized === "merged"
  ) {
    return normalized;
  }
  return "unknown";
}

const ghPrCreateResponseSchema = z.object({
  url: z.url(),
  number: z
    .union([
      z.number().int(),
      z
        .string()
        .trim()
        .regex(/^[0-9]+$/)
        .transform(Number),
    ])
    .optional(),
  state: z.string().optional(),
  isDraft: z.boolean().optional(),
});

type GhPrCreateResponse = z.infer<typeof ghPrCreateResponseSchema>;

function parseGhPrCreateResponse(input: unknown): GhPrCreateResponse | null {
  const result = ghPrCreateResponseSchema.safeParse(input);
  if (!result.success) {
    return null;
  }
  return result.data;
}

export async function createPullRequest(options: {
  check: CrownWorkerCheckResponse;
  winner: CandidateData;
  summary?: string;
  context: WorkerRunContext;
}): Promise<PullRequestMetadata | null> {
  const { check, winner, summary, context } = options;
  if (!check.task.autoPrEnabled) {
    return null;
  }

  const branch = winner.newBranch;
  if (!branch) {
    log("WARNING", "Skipping PR creation - winner branch missing", {
      taskId: check.taskId,
      runId: winner.runId,
    });
    return null;
  }

  const baseBranch = check.task.baseBranch || "main";
  const prTitle = buildPullRequestTitle(check.task.text);
  const effectiveTaskId = context.taskId ?? check.taskId;
  const prScreenshots = await fetchScreenshotsForRun({
    token: context.token,
    taskId: effectiveTaskId,
    runId: winner.runId,
    convexUrl: context.convexUrl,
  });

  if (prScreenshots.length > 0) {
    log("INFO", "Including screenshots in pull request body", {
      taskId: check.taskId,
      runId: winner.runId,
      screenshotCount: prScreenshots.length,
    });
  }

  const prBody = buildPullRequestBody({
    summary,
    prompt: check.task.text,
    agentName: winner.agentName,
    branch,
    taskId: effectiveTaskId,
    runId: winner.runId,
    screenshots: prScreenshots,
  });

  const script = `set -e
BODY_FILE=$(mktemp /tmp/cmux-pr-XXXXXX.md)
cat <<'CMUX_EOF' > "$BODY_FILE"
${prBody}
CMUX_EOF
gh pr create --base "$PR_BASE" --head "$PR_HEAD" --title "$PR_TITLE" --body-file "$BODY_FILE" --json url,number,state,isDraft
rm -f "$BODY_FILE"
`;

  try {
    const { stdout } = await execAsync(script, {
      cwd: WORKSPACE_ROOT,
      env: {
        ...process.env,
        PR_TITLE: prTitle,
        PR_BASE: baseBranch,
        PR_HEAD: branch,
      },
      maxBuffer: 5 * 1024 * 1024,
    });

    const trimmed = stdout.trim();
    if (!trimmed) {
      log("ERROR", "gh pr create returned empty output", {
        taskId: check.taskId,
        runId: winner.runId,
      });
      return null;
    }

    const parsed = parseGhPrCreateResponse(JSON.parse(trimmed));
    if (!parsed) {
      log("ERROR", "Failed to parse gh pr create output", {
        stdout: trimmed,
      });
      return null;
    }

    const metadata: PullRequestMetadata = {
      pullRequest: {
        url: parsed.url,
        number: parsed.number,
        state: mapGhState(parsed.state),
        isDraft: parsed.isDraft,
      },
      title: prTitle,
      description: prBody,
    };

    log("INFO", "Created pull request", {
      taskId: check.taskId,
      runId: winner.runId,
      url: parsed.url,
    });

    return metadata;
  } catch (error) {
    log("ERROR", "Failed to create pull request", {
      taskId: check.taskId,
      runId: winner.runId,
      error,
    });
    return null;
  }
}
