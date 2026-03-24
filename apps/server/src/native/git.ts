import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type { ReplaceDiffEntry } from "@cmux/shared/diff-types";

export interface GitDiffOptions {
  headRef: string;
  baseRef?: string;
  repoFullName?: string;
  repoUrl?: string;
  teamSlugOrId?: string;
  originPathOverride?: string;
  includeContents?: boolean;
  maxBytes?: number;
  lastKnownBaseSha?: string;
  lastKnownMergeCommitSha?: string;
  /**
   * GitHub OAuth token for authenticating private repo access.
   * Used transiently for clone/fetch - never persisted to disk or logged.
   */
  authToken?: string;
  /**
   * When true, bypasses SWR fetch window and forces fresh git fetch.
   */
  forceRefresh?: boolean;
}

type NativeGitModule = {
  // napi-rs exports as camelCase
  gitDiff?: (opts: GitDiffOptions) => Promise<ReplaceDiffEntry[]>;
  gitListRemoteBranches?: (opts: {
    repoFullName?: string;
    repoUrl?: string;
    originPathOverride?: string;
  }) => Promise<
    Array<{
      name: string;
      lastCommitSha?: string;
      lastActivityAt?: number;
      isDefault?: boolean;
      lastKnownBaseSha?: string;
      lastKnownMergeCommitSha?: string;
    }>
  >;
};

// Debug logging - enabled via CMUX_NATIVE_DEBUG=1 or always in production
const DEBUG = process.env.CMUX_NATIVE_DEBUG === "1" || process.env.NODE_ENV === "production";

function debugLog(...args: unknown[]): void {
  if (DEBUG) {
    console.log("[native-git]", ...args);
  }
}

function debugWarn(...args: unknown[]): void {
  if (DEBUG) {
    console.warn("[native-git]", ...args);
  }
}

function debugError(...args: unknown[]): void {
  // Always log errors
  console.error("[native-git]", ...args);
}

function tryLoadNative(): NativeGitModule | null {
  debugLog(`Starting native module load - platform: ${process.platform}, arch: ${process.arch}`);

  try {
    const nodeRequire = createRequire(import.meta.url);
    const here = path.dirname(fileURLToPath(import.meta.url));
    const plat = process.platform;
    const arch = process.arch;

    const dirCandidates = [
      process.env.CMUX_NATIVE_CORE_DIR,
      typeof (process as unknown as { resourcesPath?: string })
        .resourcesPath === "string"
        ? path.join(
            (process as unknown as { resourcesPath: string }).resourcesPath,
            "native",
            "core"
          )
        : undefined,
      fileURLToPath(new URL("../../native/core/", import.meta.url)),
      path.resolve(here, "../../../server/native/core"),
      path.resolve(here, "../../../../apps/server/native/core"),
      path.resolve(process.cwd(), "../server/native/core"),
      path.resolve(process.cwd(), "../../apps/server/native/core"),
      path.resolve(process.cwd(), "apps/server/native/core"),
      path.resolve(process.cwd(), "server/native/core"),
    ];

    debugLog(`Searching ${dirCandidates.length} candidate directories`);

    for (const maybeDir of dirCandidates) {
      const nativeDir = maybeDir ?? "";
      if (!nativeDir) continue;
      try {
        const files = fs.readdirSync(nativeDir);
        const nodes = files.filter((f) => f.endsWith(".node"));
        debugLog(`Dir ${nativeDir}: found ${nodes.length} .node file(s):`, nodes);

        const preferred =
          nodes.find((f) => f.includes(plat) && f.includes(arch)) || nodes[0];
        if (!preferred) {
          debugLog(`Dir ${nativeDir}: no matching .node file for ${plat}-${arch}`);
          continue;
        }

        const fullPath = path.join(nativeDir, preferred);
        debugLog(`Attempting to load: ${fullPath}`);

        // Check file exists and is readable before loading
        try {
          const stat = fs.statSync(fullPath);
          debugLog(`File stats: size=${stat.size}, mode=${stat.mode.toString(8)}`);
        } catch (statErr) {
          debugError(`Cannot stat ${fullPath}:`, statErr);
          continue;
        }

        const mod = nodeRequire(fullPath) as unknown as NativeGitModule;

        if (mod) {
          const functions = Object.keys(mod).filter((k) => typeof (mod as Record<string, unknown>)[k] === "function");
          debugLog(`Successfully loaded native module with functions:`, functions);
          return mod;
        }
        debugWarn(`Module loaded but is null/undefined`);
      } catch (err) {
        debugError(`Failed to load from ${nativeDir}:`, err);
      }
    }
    debugWarn("No valid .node file found in any candidate directory");
    return null;
  } catch (err) {
    debugError("Unexpected error in tryLoadNative:", err);
    return null;
  }
}

let cachedNative: NativeGitModule | null | undefined;
export function loadNativeGit(): NativeGitModule | null {
  if (cachedNative === undefined) {
    cachedNative = tryLoadNative();
  }
  return cachedNative ?? null;
}

/**
 * Returns diagnostic info about native module status.
 * Used for health checks and debugging.
 */
export function getNativeGitStatus(): {
  available: boolean;
  gitDiff: boolean;
  gitListRemoteBranches: boolean;
  platform: string;
  arch: string;
} {
  const mod = loadNativeGit();
  return {
    available: mod !== null,
    gitDiff: typeof mod?.gitDiff === "function",
    gitListRemoteBranches: typeof mod?.gitListRemoteBranches === "function",
    platform: process.platform,
    arch: process.arch,
  };
}

export async function gitDiff(opts: GitDiffOptions): Promise<ReplaceDiffEntry[]> {
  const mod = loadNativeGit();
  if (!mod?.gitDiff) {
    throw new Error("Native gitDiff not available; rebuild @cmux/native-core");
  }
  return mod.gitDiff(opts);
}

export async function listRemoteBranches(opts: {
  repoFullName?: string;
  repoUrl?: string;
  originPathOverride?: string;
}): Promise<
  Array<{
    name: string;
    lastCommitSha?: string;
    lastActivityAt?: number;
    isDefault?: boolean;
    lastKnownBaseSha?: string;
    lastKnownMergeCommitSha?: string;
  }>
> {
  const mod = loadNativeGit();
  if (!mod?.gitListRemoteBranches) {
    throw new Error(
      "Native gitListRemoteBranches not available; rebuild @cmux/native-core"
    );
  }
  return mod.gitListRemoteBranches(opts);
}
