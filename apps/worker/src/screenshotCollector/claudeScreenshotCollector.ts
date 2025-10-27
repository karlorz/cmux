import { query } from "@anthropic-ai/claude-agent-sdk";
import { promises as fs } from "node:fs";
import * as path from "node:path";

import { log } from "../logger";
import { logToScreenshotCollector } from "./logger";
import { formatClaudeMessage } from "./claudeMessageFormatter";

export interface CaptureScreenshotsOptions {
  workspaceDir: string;
  changedFiles: string[];
  prTitle: string;
  prDescription: string;
  baseBranch: string;
  headBranch: string;
  outputDir: string;
  anthropicApiKey: string;
}

export interface ScreenshotResult {
  status: "completed" | "failed" | "skipped";
  screenshotPaths?: string[];
  error?: string;
  reason?: string;
}

/**
 * Use Claude Agent SDK with Playwright MCP to capture screenshots
 * Assumes the workspace is already set up with the correct branch checked out
 */
export async function captureScreenshotsForBranch(options: {
  workspaceDir: string;
  changedFiles: string[];
  prTitle: string;
  prDescription: string;
  branch: string;
  outputDir: string;
  anthropicApiKey: string;
}): Promise<string[]> {
  const {
    workspaceDir,
    changedFiles,
    prTitle,
    prDescription,
    branch,
    outputDir,
    anthropicApiKey,
  } = options;

  const prompt = `I need you to take screenshots of the UI changes in this pull request.

PR Title: ${prTitle}
PR Description: ${prDescription || "No description provided"}

Current branch: ${branch}
Files changed in this PR:
${changedFiles.map((f) => `- ${f}`).join("\n")}

Working directory: ${workspaceDir}
Screenshot output directory: ${outputDir}

Please:
0. Read CLAUDE.md or AGENTS.md and install dependencies if needed
1. Start the development server if needed (check files like README.md, package.json or .devcontainer.json for dev script, explore the repository more if needed)
2. Wait for the server to be ready
3. Navigate to the pages/components that were modified in the PR
4. Take full-page screenshots of each relevant UI view that was changed
5. Save screenshots to ${outputDir} with descriptive names like "homepage-${branch}.png"

Focus on capturing visual changes. If no UI changes are present, just let me know.
Do not close the browser after you're done, since I will want to click around the final page you navigated to.
Do not create summary documents.

Save all screenshots and provide a summary of what you captured.`;

  await logToScreenshotCollector(
    `Starting Claude Agent with Playwright MCP for branch: ${branch}`
  );

  const screenshotPaths: string[] = [];

  try {
    // Set ANTHROPIC_API_KEY environment variable for the SDK
    const originalApiKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = anthropicApiKey;

    try {
      for await (const message of query({
        prompt,
        options: {
          // model: "claude-haiku-4-5",
          model: "claude-sonnet-4-5",
          mcpServers: {
            "@playwright/mcp": {
              command: "bunx",
              args: ["@playwright/mcp"],
            },
          },
          allowDangerouslySkipPermissions: true,
          permissionMode: "bypassPermissions",
          cwd: workspaceDir,
        },
      })) {
        // Format and log all message types
        const formatted = formatClaudeMessage(message);
        if (formatted) {
          await logToScreenshotCollector(formatted);
        }
      }
    } finally {
      // Restore original API key
      if (originalApiKey) {
        process.env.ANTHROPIC_API_KEY = originalApiKey;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
    }

    // Find all screenshot files in the output directory
    try {
      const files = await fs.readdir(outputDir);
      const screenshots = files.filter(
        (f) =>
          f.includes(branch) &&
          (f.endsWith(".png") || f.endsWith(".jpg") || f.endsWith(".jpeg"))
      );

      screenshotPaths.push(...screenshots.map((f) => path.join(outputDir, f)));
    } catch (readError) {
      log("WARN", "Could not read screenshot directory", {
        outputDir,
        error:
          readError instanceof Error ? readError.message : String(readError),
      });
    }

    return screenshotPaths;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "unknown error");
    await logToScreenshotCollector(
      `Failed to capture screenshots with Claude Agent: ${message}`
    );
    throw error;
  }
}

/**
 * Capture screenshots for a PR
 * Assumes the workspace directory is already set up with git repo cloned
 */
export async function capturePRScreenshots(
  options: CaptureScreenshotsOptions
): Promise<ScreenshotResult> {
  const {
    workspaceDir,
    changedFiles,
    prTitle,
    prDescription,
    baseBranch,
    headBranch,
    outputDir,
    anthropicApiKey,
  } = options;

  try {
    await logToScreenshotCollector(
      `Starting PR screenshot capture in ${workspaceDir}`
    );

    if (changedFiles.length === 0) {
      const reason = "No files changed in PR";
      await logToScreenshotCollector(reason);
      return { status: "skipped", reason };
    }

    await logToScreenshotCollector(
      `Found ${changedFiles.length} changed files: ${changedFiles.join(", ")}`
    );

    await fs.mkdir(outputDir, { recursive: true });

    const allScreenshots: string[] = [];

    const CAPTURE_BEFORE = false;

    if (CAPTURE_BEFORE) {
      // Capture screenshots for base branch (before changes)
      await logToScreenshotCollector(
        `Capturing 'before' screenshots for base branch: ${baseBranch}`
      );
      const beforeScreenshots = await captureScreenshotsForBranch({
        workspaceDir,
        changedFiles,
        prTitle,
        prDescription,
        branch: baseBranch,
        outputDir,
        anthropicApiKey,
      });
      allScreenshots.push(...beforeScreenshots);
      await logToScreenshotCollector(
        `Captured ${beforeScreenshots.length} 'before' screenshots`
      );
    }

    // Capture screenshots for head branch (after changes)
    await logToScreenshotCollector(
      `Capturing 'after' screenshots for head branch: ${headBranch}`
    );
    const afterScreenshots = await captureScreenshotsForBranch({
      workspaceDir,
      changedFiles,
      prTitle,
      prDescription,
      branch: headBranch,
      outputDir,
      anthropicApiKey,
    });
    allScreenshots.push(...afterScreenshots);
    await logToScreenshotCollector(
      `Captured ${afterScreenshots.length} 'after' screenshots`
    );

    await logToScreenshotCollector(
      `Screenshot capture completed. Total: ${allScreenshots.length} screenshots saved to ${outputDir}`
    );
    log("INFO", "PR screenshot capture completed", {
      screenshotCount: allScreenshots.length,
      outputDir,
    });

    return {
      status: "completed",
      screenshotPaths: allScreenshots,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "unknown error");
    await logToScreenshotCollector(`PR screenshot capture failed: ${message}`);
    log("ERROR", "PR screenshot capture failed", {
      error: message,
    });
    return {
      status: "failed",
      error: message,
    };
  }
}
