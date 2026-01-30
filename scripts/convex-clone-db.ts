#!/usr/bin/env bun
/**
 * Convex DB Clone/Backup/Restore Script
 *
 * Usage:
 *   bun run scripts/convex-clone-db.ts export [options]
 *   bun run scripts/convex-clone-db.ts import --backup-path <zip> [options]
 *   bun run scripts/convex-clone-db.ts clone [options]
 *
 * Commands:
 *   export   Export source deployment to a local backup ZIP
 *   import   Import a local backup ZIP into the target deployment (--replace-all)
 *   clone    Export from source then import into target
 *
 * Options:
 *   --env-file <path>     Env file to load (default: .env.production if present)
 *   --backup-dir <path>   Backup directory (default: ~/Downloads/convex-backups)
 *   --backup-path <path>  Backup ZIP to import (required for import)
 *   --include-storage     Include file storage in export
 *   --yes, -y             Skip confirmation prompts
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import * as path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import prompts from "prompts";

type Command = "export" | "import" | "clone";

type Options = {
  command: Command;
  envFile?: string;
  backupDir: string;
  backupPath?: string;
  includeStorage: boolean;
  yes: boolean;
};

const scriptPath = fileURLToPath(import.meta.url);
const scriptName = path.basename(scriptPath);
const scriptDir = path.resolve(scriptPath, "..");
const repoRoot = path.resolve(scriptDir, "..");

process.chdir(repoRoot);

const DEFAULT_BACKUP_DIR = "~/Downloads/convex-backups";
const CONVEX_PROJECT_DIR = path.join(repoRoot, "packages/convex");

function usage(exitCode = 1): never {
  console.error(`
Usage:
  bun run scripts/${scriptName} export [options]
  bun run scripts/${scriptName} import --backup-path <zip> [options]
  bun run scripts/${scriptName} clone [options]

Options:
  --env-file <path>     Env file to load (default: .env.production if present)
  --backup-dir <path>   Backup directory (default: ${DEFAULT_BACKUP_DIR})
  --backup-path <path>  Backup ZIP to import (required for import)
  --include-storage     Include file storage in export
  --yes, -y             Skip confirmation prompts
  --help, -h            Show this help

Env vars (source export):
  NEXT_PUBLIC_CONVEX_URL
  CONVEX_DEPLOY_KEY

Env vars (target import):
  BACKUP_NEXT_PUBLIC_CONVEX_URL
  BACKUP_CONVEX_DEPLOY_KEY
`);
  return process.exit(exitCode);
}

function parseArgs(argv: string[]): Options {
  const [commandRaw, ...rest] = argv;
  if (!commandRaw || commandRaw === "--help" || commandRaw === "-h") usage(0);
  if (commandRaw !== "export" && commandRaw !== "import" && commandRaw !== "clone") {
    console.error(`Unknown command: ${commandRaw}`);
    usage(1);
  }

  let envFile: string | undefined;
  let backupDir = DEFAULT_BACKUP_DIR;
  let backupPath: string | undefined;
  let includeStorage = false;
  let yes = false;

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--env-file") {
      envFile = rest[++i];
    } else if (arg?.startsWith("--env-file=")) {
      envFile = arg.slice("--env-file=".length);
    } else if (arg === "--backup-dir") {
      backupDir = rest[++i] ?? DEFAULT_BACKUP_DIR;
    } else if (arg?.startsWith("--backup-dir=")) {
      backupDir = arg.slice("--backup-dir=".length);
    } else if (arg === "--backup-path") {
      backupPath = rest[++i];
    } else if (arg?.startsWith("--backup-path=")) {
      backupPath = arg.slice("--backup-path=".length);
    } else if (arg === "--include-storage") {
      includeStorage = true;
    } else if (arg === "--yes" || arg === "-y") {
      yes = true;
    } else if (arg === "--help" || arg === "-h") {
      usage(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage(1);
    }
  }

  return {
    command: commandRaw,
    envFile,
    backupDir,
    backupPath,
    includeStorage,
    yes,
  };
}

function expandTilde(filePath: string): string {
  if (filePath === "~") return os.homedir();
  if (filePath.startsWith("~/")) return path.join(os.homedir(), filePath.slice(2));
  return filePath;
}

function resolveEnvFile(envFileArg: string | undefined): string | undefined {
  if (envFileArg) return path.resolve(expandTilde(envFileArg));
  const prodEnv = path.join(repoRoot, ".env.production");
  return existsSync(prodEnv) ? prodEnv : undefined;
}

function loadEnv(envFile: string | undefined): void {
  if (!envFile) return;
  if (!existsSync(envFile)) {
    throw new Error(`Env file not found: ${envFile}`);
  }
  const result = dotenv.config({ path: envFile, override: true });
  if (result.error) {
    throw result.error;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function deploymentNameFromUrl(convexUrl: string): string {
  let hostname = "";
  try {
    hostname = new URL(convexUrl).hostname;
  } catch {
    throw new Error(`Invalid Convex URL: ${convexUrl}`);
  }

  const deployment = hostname.split(".")[0]?.trim();
  if (!deployment) {
    throw new Error(`Could not infer deployment name from URL: ${convexUrl}`);
  }
  return deployment;
}

function deploymentNameFromDeployKey(deployKey: string): string | undefined {
  const colon = deployKey.indexOf(":");
  if (colon < 0) return undefined;
  const pipe = deployKey.indexOf("|", colon + 1);
  if (pipe < 0) return undefined;
  const name = deployKey.slice(colon + 1, pipe).trim();
  return name || undefined;
}

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

function runConvex(args: string[], options: { deployKey: string }): void {
  const result = spawnSync("bunx", ["convex", ...args], {
    cwd: CONVEX_PROJECT_DIR,
    env: { ...process.env, CONVEX_DEPLOY_KEY: options.deployKey },
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Command failed: bunx convex ${args.join(" ")}`);
  }
}

async function confirmReplaceAll(targetDeployment: string, yes: boolean): Promise<boolean> {
  if (yes) return true;

  const response = await prompts(
    {
      type: "confirm",
      name: "value",
      message: `This will replace all data in the target deployment "${targetDeployment}". Continue?`,
      initial: false,
    },
    {
      onCancel: () => {
        process.exit(130);
      },
    },
  );

  return response.value === true;
}

async function doExport(options: Options): Promise<string> {
  const sourceUrl = requireEnv("NEXT_PUBLIC_CONVEX_URL");
  const sourceDeployKey = requireEnv("CONVEX_DEPLOY_KEY");
  const sourceDeployment = deploymentNameFromUrl(sourceUrl);

  const keyDeployment = deploymentNameFromDeployKey(sourceDeployKey);
  if (keyDeployment && keyDeployment !== sourceDeployment) {
    console.warn(
      `Warning: CONVEX_DEPLOY_KEY appears to be for "${keyDeployment}" but NEXT_PUBLIC_CONVEX_URL is "${sourceDeployment}".`
    );
  }

  const backupDir = path.resolve(expandTilde(options.backupDir));
  await ensureDir(backupDir);

  const backupPath = path.join(
    backupDir,
    `${sourceDeployment}-${formatTimestamp(new Date())}.zip`,
  );

  console.log(`Exporting deployment "${sourceDeployment}" to ${backupPath}`);

  const exportArgs = [
    "export",
    "--deployment-name",
    sourceDeployment,
    "--path",
    backupPath,
  ];
  if (options.includeStorage) exportArgs.push("--include-file-storage");

  runConvex(exportArgs, { deployKey: sourceDeployKey });

  console.log(`Backup created: ${backupPath}`);
  return backupPath;
}

async function doImport(options: Options, backupPathArg?: string): Promise<void> {
  const targetUrl = requireEnv("BACKUP_NEXT_PUBLIC_CONVEX_URL");
  const targetDeployKey = requireEnv("BACKUP_CONVEX_DEPLOY_KEY");
  const targetDeployment = deploymentNameFromUrl(targetUrl);

  const keyDeployment = deploymentNameFromDeployKey(targetDeployKey);
  if (keyDeployment && keyDeployment !== targetDeployment) {
    console.warn(
      `Warning: BACKUP_CONVEX_DEPLOY_KEY appears to be for "${keyDeployment}" but BACKUP_NEXT_PUBLIC_CONVEX_URL is "${targetDeployment}".`
    );
  }

  const backupPathRaw = backupPathArg ?? options.backupPath;
  if (!backupPathRaw) {
    throw new Error("Missing --backup-path for import");
  }
  const backupPath = path.resolve(expandTilde(backupPathRaw));
  if (!existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }

  const confirmed = await confirmReplaceAll(targetDeployment, options.yes);
  if (!confirmed) {
    console.log("Cancelled.");
    return;
  }

  console.log(`Importing ${backupPath} into deployment "${targetDeployment}"`);

  const importArgs = [
    "import",
    "--deployment-name",
    targetDeployment,
    "--replace-all",
    "-y",
    backupPath,
  ];

  runConvex(importArgs, { deployKey: targetDeployKey });
  console.log("Import complete.");
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const envFile = resolveEnvFile(options.envFile);
  loadEnv(envFile);
  if (envFile) console.log(`Loaded env file: ${envFile}`);

  if (!existsSync(CONVEX_PROJECT_DIR)) {
    throw new Error(`Convex project directory not found: ${CONVEX_PROJECT_DIR}`);
  }

  if (options.command === "export") {
    await doExport(options);
    return;
  }

  if (options.command === "import") {
    await doImport(options);
    return;
  }

  const backupPath = await doExport(options);
  await doImport(options, backupPath);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
});

