import type {
  EnvironmentContext,
  EnvironmentResult,
} from "../common/environment-result";
import {
  DEFAULT_AMP_PROXY_PORT,
  DEFAULT_AMP_PROXY_URL,
} from "./constants";
import {
  getMemoryStartupCommand,
  getMemorySeedFiles,
  getMemoryProtocolInstructions,
  getProjectContextFile,
} from "../../agent-memory-protocol";

export async function getAmpEnvironment(
  ctx: EnvironmentContext
): Promise<EnvironmentResult> {
  // These must be lazy since configs are imported into the browser
  const { Buffer } = await import("node:buffer");

  // useHostConfig is safe for desktop/Electron apps where the host IS the user's machine.
  // For server deployments, this should be false to prevent credential leakage.
  const useHostConfig = ctx.useHostConfig ?? false;

  let homeDir: string | undefined;
  let readFile:
    | ((path: string, encoding: "utf-8") => Promise<string>)
    | undefined;
  if (useHostConfig) {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    readFile = fs.readFile;
    homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
  }

  const files: EnvironmentResult["files"] = [];
  const env: Record<string, string> = {};
  const startupCommands: string[] = [];

  // Ensure .config/amp and .local/share/amp directories exist
  startupCommands.push("mkdir -p ~/.config/amp");
  startupCommands.push("mkdir -p ~/.local/share/amp");

  // Transfer settings.json from host (desktop mode only)
  let settingsAdded = false;
  if (useHostConfig && readFile && homeDir) {
    try {
      const settingsPath = `${homeDir}/.config/amp/settings.json`;
      const settingsContent = await readFile(settingsPath, "utf-8");

      // Validate that it's valid JSON
      JSON.parse(settingsContent);

      files.push({
        destinationPath: "$HOME/.config/amp/settings.json",
        contentBase64: Buffer.from(settingsContent).toString("base64"),
        mode: "644",
      });
      settingsAdded = true;
    } catch (error) {
      console.warn("Failed to read amp settings.json:", error);
    }
  }
  if (!settingsAdded) {
    // Create default settings when host config is unavailable
    const defaultSettings = {
      model: "anthropic/claude-3-5-sonnet-20241022",
      theme: "dark",
    };
    files.push({
      destinationPath: "$HOME/.config/amp/settings.json",
      contentBase64: Buffer.from(
        JSON.stringify(defaultSettings, null, 2)
      ).toString("base64"),
      mode: "644",
    });
  }

  // Transfer secrets.json from host (desktop mode only)
  if (useHostConfig && readFile && homeDir) {
    try {
      const secretsPath = `${homeDir}/.local/share/amp/secrets.json`;
      const secretsContent = await readFile(secretsPath, "utf-8");

      // Validate that it's valid JSON
      JSON.parse(secretsContent);

      files.push({
        destinationPath: "$HOME/.local/share/amp/secrets.json",
        contentBase64: Buffer.from(secretsContent).toString("base64"),
        mode: "600", // More restrictive permissions for secrets
      });
    } catch (error) {
      console.warn("Failed to read amp secrets.json:", error);
    }
  }

  // The local proxy that Amp CLI should talk to
  env.AMP_PROXY_PORT = String(DEFAULT_AMP_PROXY_PORT);
  env.AMP_URL = DEFAULT_AMP_PROXY_URL;
  // Upstream URL that the proxy should target (avoid loop with AMP_URL)
  env.AMP_UPSTREAM_URL = "https://ampcode.com";

  // Use the taskRunId directly so the AMP proxy can extract it.
  // Prefix with taskRunId: to be explicit, though the proxy accepts bare IDs too.
  env.AMP_API_KEY = `taskRunId:${ctx.taskRunId}`;

  // Add agent memory protocol support
  startupCommands.push(getMemoryStartupCommand());
  files.push(...getMemorySeedFiles(ctx.taskRunId, ctx.previousKnowledge, ctx.previousMailbox, ctx.orchestrationOptions));

  // Inject GitHub Projects context if task is linked to a project item (Phase 5)
  if (ctx.githubProjectContext) {
    files.push(
      getProjectContextFile({
        ...ctx.githubProjectContext,
        taskRunJwt: ctx.taskRunJwt,
        callbackUrl: ctx.callbackUrl,
      }),
    );
  }

  // Add AMP.md with memory protocol instructions for the project
  const ampMdContent = `# cmux Project Instructions

${getMemoryProtocolInstructions()}
`;
  files.push({
    destinationPath: "/root/workspace/AMP.md",
    contentBase64: Buffer.from(ampMdContent).toString("base64"),
    mode: "644",
  });

  return { files, env, startupCommands };
}
