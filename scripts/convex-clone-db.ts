#!/usr/bin/env bun
/**
 * Convex DB Clone/Backup/Restore Script
 *
 * Operations:
 *   export - Export from source deployment to a local ZIP backup
 *   import - Import a local ZIP backup into target deployment (replace-all)
 *   clone  - Export from source and import into target
 *
 * Examples:
 *   # Clone production to dev (target deploy key loaded from .env.production)
 *   bun run scripts/convex-clone-db.ts clone \\
 *     --source famous-camel-162 \\
 *     --source-key-env CONVEX_DEPLOY_KEY_FAMOUS_CAMEL \\
 *     --target polite-canary-804 \\
 *     --env-file .env.production
 *
 *   # Export only (backup production DB)
 *   bun run scripts/convex-clone-db.ts export \\
 *     --source famous-camel-162 \\
 *     --backup-dir ~/Downloads/convex-backups \\
 *     --include-storage
 *
 *   # Restore from backup to any deployment
 *   bun run scripts/convex-clone-db.ts import \\
 *     --target outstanding-stoat-794 \\
 *     --backup-path ~/Downloads/convex-backups/famous-camel-162-20250130-143022.zip \\
 *     --env-file .env.production
 */

import { spawn } from "node:child_process";
import { existsSync, promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

type CommandName = "export" | "import" | "clone";

type Options = {
  command: CommandName;
  source?: string;
  target?: string;
  sourceKeyEnv: string;
  targetKeyEnv: string;
  envFile: string;
  backupDir: string;
  backupPath?: string;
  includeStorage: boolean;
  yes: boolean;
};

const DEFAULT_KEY_ENV = "CONVEX_DEPLOY_KEY";
const DEFAULT_ENV_FILE = ".env.production";
const DEFAULT_BACKUP_DIR = path.join(
  os.homedir(),
  "Downloads",
  "convex-backups",
);

function printUsage(): void {
  console.log(`
Usage:
  bun run scripts/convex-clone-db.ts export --source <deployment> [options]
  bun run scripts/convex-clone-db.ts import --target <deployment> --backup-path <zip> [options]
  bun run scripts/convex-clone-db.ts clone  --source <deployment> --target <deployment> [options]

Options:
  --source <deployment>        Source deployment name or URL
  --target <deployment>        Target deployment name or URL
  --source-key-env <var>       Env var name for source deploy key (default: ${DEFAULT_KEY_ENV})
  --target-key-env <var>       Env var name for target deploy key (default: ${DEFAULT_KEY_ENV})
  --env-file <path>            Env file to read target key from (default: ${DEFAULT_ENV_FILE})
  --backup-dir <path>          Backup directory (default: ${DEFAULT_BACKUP_DIR})
  --backup-path <path>         Backup ZIP path (import only)
  --include-storage            Include file storage in export
  --yes, -y                    Skip confirmation prompts (import/clone)
  --help, -h                   Show this help message

Notes:
  - This script runs 'bunx convex' from packages/convex.
  - With deploy keys, Convex selects the deployment from the key (not flags).
  - The script attempts to sanity-check --source/--target against the key.
  - Deploy keys are never printed.
`);
}

function parseArgs(argv: string[]): Options {
  const first = argv[0];
  if (!first || first === "--help" || first === "-h") {
    printUsage();
    process.exit(0);
  }

  if (first !== "export" && first !== "import" && first !== "clone") {
    console.error(`Unknown command: ${first}`);
    printUsage();
    process.exit(1);
  }

  const options: Options = {
    command: first,
    sourceKeyEnv: DEFAULT_KEY_ENV,
    targetKeyEnv: DEFAULT_KEY_ENV,
    envFile: DEFAULT_ENV_FILE,
    backupDir: DEFAULT_BACKUP_DIR,
    includeStorage: false,
    yes: false,
  };

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i] ?? "";

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    if (arg === "--yes" || arg === "-y") {
      options.yes = true;
      continue;
    }

    if (arg === "--include-storage") {
      options.includeStorage = true;
      continue;
    }

    const [flag, inlineValue] = arg.startsWith("--") ? arg.split("=", 2) : [];
    const readValue = (): string => {
      if (inlineValue != null) return inlineValue;
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) {
        console.error(`Missing value for ${flag}`);
        process.exit(1);
      }
      i++;
      return next;
    };

    if (flag === "--source") {
      options.source = readValue();
      continue;
    }
    if (flag === "--target") {
      options.target = readValue();
      continue;
    }
    if (flag === "--source-key-env") {
      options.sourceKeyEnv = readValue();
      continue;
    }
    if (flag === "--target-key-env") {
      options.targetKeyEnv = readValue();
      continue;
    }
    if (flag === "--env-file") {
      options.envFile = readValue();
      continue;
    }
    if (flag === "--backup-dir") {
      options.backupDir = readValue();
      continue;
    }
    if (flag === "--backup-path") {
      options.backupPath = readValue();
      continue;
    }

    console.error(`Unknown argument: ${arg}`);
    printUsage();
    process.exit(1);
  }

  return options;
}

function normalizeDeploymentName(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  const hostnameMatch = trimmed.match(/^([a-zA-Z0-9-]+)\.convex\.(cloud|site)$/);
  if (hostnameMatch?.[1]) return hostnameMatch[1];

  if (trimmed.includes("://")) {
    try {
      const url = new URL(trimmed);
      const host = url.hostname;
      const firstLabel = host.split(".")[0];
      return firstLabel || trimmed;
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

function inferDeploymentNameFromDeployKey(deployKey: string): string | undefined {
  const trimmed = deployKey.trim();
  const parts = trimmed.split(/[:|]/).filter(Boolean);
  for (const part of parts) {
    const normalized = normalizeDeploymentName(part).toLowerCase();
    if (/^[a-z0-9]+-[a-z0-9]+-\d+$/.test(normalized)) return normalized;
  }
  return undefined;
}

function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolveFrom(baseDir: string, p: string): string {
  const expanded = expandHome(p);
  return path.isAbsolute(expanded) ? expanded : path.resolve(baseDir, expanded);
}

function timestamp(d = new Date()): string {
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function validateDeployKey(key: string, label: string): void {
  const trimmed = key.trim();
  if (!trimmed) {
    throw new Error(`Missing ${label} deploy key.`);
  }
  if (/\s/.test(trimmed)) {
    throw new Error(`${label} deploy key contains whitespace; check your env var.`);
  }
}

async function readEnvVarFromFile(
  envFilePath: string,
  varName: string,
): Promise<string | undefined> {
  if (!existsSync(envFilePath)) return undefined;
  const raw = await fsp.readFile(envFilePath, "utf8");
  const parsed = dotenv.parse(raw);
  return parsed[varName];
}

async function confirmOrThrow(message: string, yes: boolean): Promise<void> {
  if (yes) return;
  if (!process.stdin.isTTY) {
    throw new Error(
      "Refusing to run destructive import without --yes (stdin is not a TTY).",
    );
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${message} [y/N] `))
      .trim()
      .toLowerCase();
    if (answer !== "y" && answer !== "yes") {
      throw new Error("Cancelled.");
    }
  } finally {
    rl.close();
  }
}

async function runCommand(
  cmd: string,
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: "inherit",
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `Command failed (exit ${code ?? "unknown"}): ${cmd} ${args.join(" ")}`,
          ),
        );
    });
  });
}

async function convexExport(params: {
  deployKey: string;
  outZipPath: string;
  includeStorage: boolean;
  convexProjectDir: string;
}): Promise<void> {
  const args = ["convex", "export", "--path", params.outZipPath];
  if (params.includeStorage) args.push("--include-file-storage");
  await runCommand("bunx", args, {
    cwd: params.convexProjectDir,
    env: { ...process.env, CONVEX_DEPLOY_KEY: params.deployKey },
  });
}

async function convexImport(params: {
  deployKey: string;
  inZipPath: string;
  convexProjectDir: string;
}): Promise<void> {
  const args = ["convex", "import", params.inZipPath, "--replace-all", "-y"];
  await runCommand("bunx", args, {
    cwd: params.convexProjectDir,
    env: { ...process.env, CONVEX_DEPLOY_KEY: params.deployKey },
  });
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "..");
  const convexProjectDir = path.join(repoRoot, "packages", "convex");
  if (!existsSync(convexProjectDir)) {
    throw new Error(`Convex project not found at ${convexProjectDir}`);
  }

  const envFilePath = resolveFrom(repoRoot, options.envFile);

  const sourceArg = options.source
    ? normalizeDeploymentName(options.source).toLowerCase()
    : undefined;
  const targetArg = options.target
    ? normalizeDeploymentName(options.target).toLowerCase()
    : undefined;

  if (options.command === "export") {
    const sourceKey =
      process.env[options.sourceKeyEnv] ??
      (await readEnvVarFromFile(envFilePath, options.sourceKeyEnv));
    if (!sourceKey) {
      throw new Error(
        `Missing source deploy key. Set ${options.sourceKeyEnv} or add it to ${envFilePath}`,
      );
    }
    validateDeployKey(sourceKey, "source");

    const sourceInferred = inferDeploymentNameFromDeployKey(sourceKey);
    if (!sourceInferred) {
      console.warn(
        "Warning: could not infer source deployment name from deploy key. Convex will select the deployment from the key.",
      );
    }
    const sourceName = sourceArg ?? sourceInferred;
    if (!sourceName) {
      throw new Error(
        "Missing --source for export (and deployment name could not be inferred from deploy key).",
      );
    }
    if (sourceArg && sourceInferred && sourceArg !== sourceInferred) {
      throw new Error(
        `Source mismatch: --source is '${sourceArg}' but deploy key appears to be for '${sourceInferred}'.`,
      );
    }

    const backupDir = resolveFrom(process.cwd(), options.backupDir);
    await fsp.mkdir(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `${sourceName}-${timestamp()}.zip`);

    console.log(`Exporting ${sourceName} to ${backupPath}`);
    try {
      await convexExport({
        deployKey: sourceKey,
        outZipPath: backupPath,
        includeStorage: options.includeStorage,
        convexProjectDir,
      });
    } catch (err) {
      try {
        if (existsSync(backupPath)) await fsp.unlink(backupPath);
      } catch {
        // pass
      }
      throw err;
    }

    if (!existsSync(backupPath)) {
      throw new Error(`Export completed but ZIP not found at ${backupPath}`);
    }
    console.log(`Export complete: ${backupPath}`);
    return;
  }

  if (options.command === "import") {
    if (!options.backupPath) {
      throw new Error("Missing --backup-path for import.");
    }

    const backupPath = resolveFrom(process.cwd(), options.backupPath);
    if (!existsSync(backupPath)) {
      throw new Error(`Backup ZIP not found: ${backupPath}`);
    }

    const targetKey =
      (await readEnvVarFromFile(envFilePath, options.targetKeyEnv)) ??
      process.env[options.targetKeyEnv];
    if (!targetKey) {
      throw new Error(
        `Missing target deploy key. Add ${options.targetKeyEnv} to ${envFilePath} or set it in the environment.`,
      );
    }
    validateDeployKey(targetKey, "target");

    const targetInferred = inferDeploymentNameFromDeployKey(targetKey);
    if (!targetInferred) {
      console.warn(
        "Warning: could not infer target deployment name from deploy key. Convex will select the deployment from the key.",
      );
    }
    const targetName = targetArg ?? targetInferred;
    if (!targetName) {
      throw new Error(
        "Missing --target for import (and deployment name could not be inferred from deploy key).",
      );
    }
    if (targetArg && targetInferred && targetArg !== targetInferred) {
      throw new Error(
        `Target mismatch: --target is '${targetArg}' but deploy key appears to be for '${targetInferred}'.`,
      );
    }

    await confirmOrThrow(
      `This will replace ALL data in target deployment '${targetName}'. Continue?`,
      options.yes,
    );

    console.log(`Importing ${backupPath} into ${targetName} (replace-all)`);
    await convexImport({
      deployKey: targetKey,
      inZipPath: backupPath,
      convexProjectDir,
    });
    console.log(`Import complete: ${targetName}`);
    return;
  }

  // clone
  const sourceKey =
    process.env[options.sourceKeyEnv] ??
    (await readEnvVarFromFile(envFilePath, options.sourceKeyEnv));
  if (!sourceKey) {
    throw new Error(
      `Missing source deploy key. Set ${options.sourceKeyEnv} or add it to ${envFilePath}`,
    );
  }
  validateDeployKey(sourceKey, "source");

  const targetKey =
    (await readEnvVarFromFile(envFilePath, options.targetKeyEnv)) ??
    process.env[options.targetKeyEnv];
  if (!targetKey) {
    throw new Error(
      `Missing target deploy key. Add ${options.targetKeyEnv} to ${envFilePath} or set it in the environment.`,
    );
  }
  validateDeployKey(targetKey, "target");

  const sourceInferred = inferDeploymentNameFromDeployKey(sourceKey);
  const targetInferred = inferDeploymentNameFromDeployKey(targetKey);
  if (!sourceInferred) {
    console.warn(
      "Warning: could not infer source deployment name from deploy key. Convex will select the deployment from the key.",
    );
  }
  if (!targetInferred) {
    console.warn(
      "Warning: could not infer target deployment name from deploy key. Convex will select the deployment from the key.",
    );
  }
  const sourceName = sourceArg ?? sourceInferred;
  const targetName = targetArg ?? targetInferred;

  if (!sourceName) {
    throw new Error(
      "Missing --source for clone (and deployment name could not be inferred from source deploy key).",
    );
  }
  if (!targetName) {
    throw new Error(
      "Missing --target for clone (and deployment name could not be inferred from target deploy key).",
    );
  }
  if (sourceArg && sourceInferred && sourceArg !== sourceInferred) {
    throw new Error(
      `Source mismatch: --source is '${sourceArg}' but source deploy key appears to be for '${sourceInferred}'.`,
    );
  }
  if (targetArg && targetInferred && targetArg !== targetInferred) {
    throw new Error(
      `Target mismatch: --target is '${targetArg}' but target deploy key appears to be for '${targetInferred}'.`,
    );
  }
  if (sourceName === targetName) {
    throw new Error("Refusing to clone: source and target are the same.");
  }

  const backupDir = resolveFrom(process.cwd(), options.backupDir);
  await fsp.mkdir(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `${sourceName}-${timestamp()}.zip`);

  await confirmOrThrow(
    `This will export '${sourceName}' and replace ALL data in target deployment '${targetName}'. Continue?`,
    options.yes,
  );

  console.log(`Exporting ${sourceName} to ${backupPath}`);
  try {
    await convexExport({
      deployKey: sourceKey,
      outZipPath: backupPath,
      includeStorage: options.includeStorage,
      convexProjectDir,
    });
  } catch (err) {
    try {
      if (existsSync(backupPath)) await fsp.unlink(backupPath);
    } catch {
      // pass
    }
    throw err;
  }

  if (!existsSync(backupPath)) {
    throw new Error(`Export completed but ZIP not found at ${backupPath}`);
  }
  console.log(`Export complete: ${backupPath}`);

  console.log(`Importing ${backupPath} into ${targetName} (replace-all)`);
  await convexImport({
    deployKey: targetKey,
    inZipPath: backupPath,
    convexProjectDir,
  });
  console.log(`Clone complete: ${sourceName} -> ${targetName}`);
}

await main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
