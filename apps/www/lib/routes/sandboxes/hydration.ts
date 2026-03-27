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

const buildHydrateConfigPayload = (
  repo?: HydrateRepoConfig,
): {
  workspacePath: string;
  depth: number;
  owner?: string;
  repo?: string;
  repoFull?: string;
  cloneUrl?: string;
  maskedCloneUrl?: string;
  baseBranch?: string;
  newBranch?: string;
} => ({
  workspacePath: MORPH_WORKSPACE_PATH,
  depth: repo?.depth || 1,
  ...(repo
    ? {
        owner: repo.owner,
        repo: repo.name,
        repoFull: repo.repoFull,
        cloneUrl: repo.cloneUrl,
        maskedCloneUrl: repo.maskedCloneUrl,
        baseBranch: repo.baseBranch,
        newBranch: repo.newBranch,
      }
    : {}),
});

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
  const configPath = `/tmp/cmux-hydrate-${Date.now()}.json`;
  const scriptBase64 = Buffer.from(hydrateScript, "utf-8").toString("base64");
  const configBase64 = Buffer.from(
    JSON.stringify(buildHydrateConfigPayload(repo)),
    "utf-8",
  ).toString("base64");

  const command = `
set -e
cleanup() {
  rm -f ${scriptPath} ${configPath}
}
trap cleanup EXIT
printf '%s' ${singleQuote(scriptBase64)} | base64 -d > ${scriptPath}
printf '%s' ${singleQuote(configBase64)} | base64 -d > ${configPath}
bun run ${scriptPath} ${configPath}
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

  if (!repo) {
    return;
  }

  const verifyCommand = `
git -C ${singleQuote(MORPH_WORKSPACE_PATH)} rev-parse --is-inside-work-tree &&
git -C ${singleQuote(MORPH_WORKSPACE_PATH)} remote get-url origin &&
git -C ${singleQuote(MORPH_WORKSPACE_PATH)} rev-parse HEAD
`;
  const verifyRes = await instance.exec(`bash -c ${singleQuote(verifyCommand)}`, {
    timeoutMs: 15000,
  });
  const maskedVerifyStdout = maskSensitive(verifyRes.stdout || "");
  const maskedVerifyStderr = maskSensitive(verifyRes.stderr || "");

  if (verifyRes.exit_code !== 0) {
    const errorDetail = maskedVerifyStderr
      ? `: ${maskedVerifyStderr.slice(0, 200)}`
      : "";
    throw new Error(
      `Hydration verification failed with exit code ${verifyRes.exit_code}${errorDetail}`,
    );
  }

  if (!maskedVerifyStdout.includes("true")) {
    throw new Error("Hydration verification failed: workspace is not a git repository");
  }
};
