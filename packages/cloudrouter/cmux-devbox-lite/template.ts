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

import * as path from "node:path";
import { Template, defaultBuildLogger } from "e2b";

interface BuildOptions {
  mode: "dev" | "prod";
  cpuCount?: number;
  memoryMB?: number;
}

interface BuildResult {
  templateId: string;
  buildId: string;
  name: string;
}

// Template configuration
const TEMPLATE_NAME = "cmux-devbox-lite";
const DOCKERFILE_PATH = "../template/e2b.lite.Dockerfile";
const START_CMD = "/usr/local/bin/start-services-lite.sh";
const READY_CMD = "curl -sf http://localhost:39377/health || exit 1";

/**
 * Build the cmux-devbox-lite template using E2B SDK v2 programmatic API.
 * Builds remotely on E2B infrastructure -- no local Docker required.
 */
export async function buildTemplate(options: BuildOptions): Promise<BuildResult> {
  const { mode, cpuCount = 4, memoryMB = 8192 } = options;

  console.log(`[template] Building ${TEMPLATE_NAME} (${mode} mode)`);
  console.log(`[template] Resources: ${cpuCount} vCPU, ${memoryMB} MB RAM`);

  const dockerfilePath = path.resolve(__dirname, DOCKERFILE_PATH);
  console.log(`[template] Dockerfile: ${dockerfilePath}`);

  // Build template using SDK v2 programmatic API (remote build, no local Docker)
  const template = Template({ fileContextPath: path.resolve(__dirname, "..") })
    .fromDockerfile(dockerfilePath)
    .setStartCmd(START_CMD, READY_CMD);

  const result = await Template.build(template, TEMPLATE_NAME, {
    cpuCount,
    memoryMB,
    onBuildLogs: defaultBuildLogger,
  });

  console.log(`[template] Build complete: ${result.templateId} (${result.name})`);

  return {
    templateId: result.templateId,
    buildId: result.buildId,
    name: result.name,
  };
}
