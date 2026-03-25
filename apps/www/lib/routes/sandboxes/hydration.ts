import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MorphInstance } from "./git";
import { maskSensitive, singleQuote } from "./shell";

export interface HydrateRepoConfig {
  owner: string;
  name: string;
  repoFull: string;
  cloneUrl: string;
  maskedCloneUrl: string;
  depth: number;
  baseBranch: string;
  newBranch: string;
}

const MORPH_WORKSPACE_PATH = "/root/workspace";

const getHydrateScript = (): string => {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const scriptPath = join(__dirname, "hydrateRepoScript.ts");
  return readFileSync(scriptPath, "utf-8");
};

export const hydrateWorkspace = async ({
  instance,
  repo,
}: {
  instance: MorphInstance;
  repo?: HydrateRepoConfig;
}): Promise<void> => {
  const hydrateScript = getHydrateScript();

  // Create a temporary script file path
  const scriptPath = `/tmp/cmux-hydrate-${Date.now()}.ts`;

  // Build environment variables
  const envVars: Record<string, string> = {
    CMUX_WORKSPACE_PATH: MORPH_WORKSPACE_PATH,
    CMUX_DEPTH: String(repo?.depth || 1),
  };

  if (repo) {
    envVars.CMUX_OWNER = repo.owner;
    envVars.CMUX_REPO = repo.name;
    envVars.CMUX_REPO_FULL = repo.repoFull;
    envVars.CMUX_CLONE_URL = repo.cloneUrl;
    envVars.CMUX_MASKED_CLONE_URL = repo.maskedCloneUrl;
    envVars.CMUX_BASE_BRANCH = repo.baseBranch;
    envVars.CMUX_NEW_BRANCH = repo.newBranch;
  }

  // Build the command to write and execute the script
  const envString = Object.entries(envVars)
    .map(([key, value]) => `export ${key}=${singleQuote(value)}`)
    .join("\n");

  const command = `
set -e
${envString}
cat > ${scriptPath} << 'CMUX_HYDRATE_EOF'
${hydrateScript}
CMUX_HYDRATE_EOF
bun run ${scriptPath}
EXIT_CODE=$?
rm -f ${scriptPath}
exit $EXIT_CODE
`;

  // Pre-flight check: verify instance exec channel is ready
  console.log("[sandboxes.start] Running pre-flight exec check");
  try {
    const preflightRes = await instance.exec("echo ready", { timeoutMs: 10000 });
    if (preflightRes.exit_code !== 0 || !preflightRes.stdout?.includes("ready")) {
      console.warn("[sandboxes.start] Pre-flight check failed, proceeding anyway:", {
        exit_code: preflightRes.exit_code,
        stdout: preflightRes.stdout?.slice(0, 100),
      });
    }
  } catch (preflightErr) {
    console.warn("[sandboxes.start] Pre-flight exec failed, proceeding anyway:", preflightErr);
  }

  console.log("[sandboxes.start] Starting hydration with Bun script");
  let hydrateRes = await instance.exec(`bash -c ${singleQuote(command)}`);

  // Log the full output for debugging
  let maskedStdout = maskSensitive(hydrateRes.stdout || "");
  let maskedStderr = maskSensitive(hydrateRes.stderr || "");

  if (maskedStdout) {
    console.log(
      `[sandboxes.start] hydration stdout:\n${maskedStdout.slice(0, 2000)}`
    );
  }

  if (maskedStderr) {
    console.log(
      `[sandboxes.start] hydration stderr:\n${maskedStderr.slice(0, 1000)}`
    );
  }

  console.log(`[sandboxes.start] hydration exit code: ${hydrateRes.exit_code}`);

  // Single retry on failure - covers transient bun-not-ready or filesystem sync issues
  if (hydrateRes.exit_code !== 0) {
    console.log("[sandboxes.start] Hydration failed, retrying once after 3s delay");
    await new Promise((resolve) => setTimeout(resolve, 3000));

    hydrateRes = await instance.exec(`bash -c ${singleQuote(command)}`);
    maskedStdout = maskSensitive(hydrateRes.stdout || "");
    maskedStderr = maskSensitive(hydrateRes.stderr || "");

    if (maskedStdout) {
      console.log(
        `[sandboxes.start] hydration retry stdout:\n${maskedStdout.slice(0, 2000)}`
      );
    }
    if (maskedStderr) {
      console.log(
        `[sandboxes.start] hydration retry stderr:\n${maskedStderr.slice(0, 1000)}`
      );
    }
    console.log(`[sandboxes.start] hydration retry exit code: ${hydrateRes.exit_code}`);
  }

  if (hydrateRes.exit_code !== 0) {
    const errorDetail = maskedStderr
      ? `: ${maskedStderr.slice(0, 200)}`
      : "";
    throw new Error(`Hydration failed with exit code ${hydrateRes.exit_code}${errorDetail}`);
  }
};
