/**
 * E2B SDK v2 programmatic template definition for cmux-devbox-lite.
 *
 * This template provides a lightweight development environment WITHOUT Docker-in-Docker.
 * Features:
 * - VSCode (cmux-code fork)
 * - VNC desktop
 * - JupyterLab
 * - Chrome with CDP
 * - Go worker daemon
 *
 * Does NOT include:
 * - Docker daemon
 * - Docker-in-Docker support
 */

import * as fs from "node:fs";
import * as path from "node:path";

// E2B SDK v2 types for template building
interface TemplateConfig {
  templateId?: string;
  templateName: string;
  dockerfile: string;
  startCmd: string;
  readyCmd?: string;
  cpuCount: number;
  memoryMb: number;
  teamId?: string;
}

interface BuildOptions {
  mode: "dev" | "prod";
  cpuCount?: number;
  memoryMb?: number;
}

interface BuildResult {
  templateId: string;
  buildId: string;
  logs?: string;
}

// Template configuration
const TEMPLATE_NAME = "cmux-devbox-lite";
const DOCKERFILE_PATH = "../template/e2b.lite.Dockerfile";
const START_CMD = "/usr/local/bin/start-services-lite.sh";
const READY_CMD = "curl -sf http://localhost:39377/health || exit 1";

// Team ID from E2B account (same as docker template)
const TEAM_ID = process.env.E2B_TEAM_ID || "6a135931-2076-4ef8-90e0-d58644927d02";

/**
 * Build the cmux-devbox-lite template using E2B SDK v2.
 */
export async function buildTemplate(options: BuildOptions): Promise<BuildResult> {
  const { mode, cpuCount = 4, memoryMb = 16384 } = options;

  console.log(`[template] Building ${TEMPLATE_NAME} (${mode} mode)`);
  console.log(`[template] Resources: ${cpuCount} vCPU, ${memoryMb} MB RAM`);

  // Verify Dockerfile exists
  const dockerfilePath = path.resolve(__dirname, DOCKERFILE_PATH);
  if (!fs.existsSync(dockerfilePath)) {
    throw new Error(`Dockerfile not found at: ${dockerfilePath}`);
  }
  console.log(`[template] Dockerfile found: ${dockerfilePath}`);

  // E2B SDK v2 template building
  // Note: The SDK provides programmatic template building via the API
  // For now, we use the CLI approach via subprocess
  const { execSync } = await import("node:child_process");

  // Change to cloudrouter directory where e2b.lite.toml is located
  const cloudRouterDir = path.resolve(__dirname, "..");

  try {
    console.log("[template] Running e2b template build...");

    // Build the template using E2B CLI with the lite config
    const buildOutput = execSync(
      `e2b template build --config e2b.lite.toml --cpu-count ${cpuCount} --memory-mb ${memoryMb}`,
      {
        cwd: cloudRouterDir,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          E2B_API_KEY: process.env.E2B_API_KEY,
        },
      }
    );

    // Parse template ID from build output
    const templateIdMatch = buildOutput.match(/template[_\s]id[:\s]+([a-z0-9]+)/i);
    const buildIdMatch = buildOutput.match(/build[_\s]id[:\s]+([a-z0-9-]+)/i);

    return {
      templateId: templateIdMatch?.[1] || TEMPLATE_NAME,
      buildId: buildIdMatch?.[1] || `${Date.now()}`,
      logs: buildOutput,
    };
  } catch (error) {
    // If E2B CLI is not available, provide instructions
    if (error instanceof Error && error.message.includes("command not found")) {
      console.error("[template] E2B CLI not found. Install with: npm install -g e2b");
      console.error("[template] Or use: bunx e2b template build --config e2b.lite.toml");
    }
    throw error;
  }
}

/**
 * Get the template configuration for manual builds.
 */
export function getTemplateConfig(): TemplateConfig {
  return {
    templateName: TEMPLATE_NAME,
    dockerfile: DOCKERFILE_PATH,
    startCmd: START_CMD,
    readyCmd: READY_CMD,
    cpuCount: 4,
    memoryMb: 16384,
    teamId: TEAM_ID,
  };
}
