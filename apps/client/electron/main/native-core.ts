import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export interface PreviewProxyStartOptionsPayload {
  start_port?: number;
  max_attempts?: number;
}

export interface PreviewProxyRoutePayload {
  morph_id: string;
  scope: string;
  domain_suffix: string;
}

export interface PreviewProxyContextPayload {
  username: string;
  password: string;
  route?: PreviewProxyRoutePayload | null;
}

export interface NativeCoreModule {
  previewProxyEnsureServer?: (
    options?: PreviewProxyStartOptionsPayload,
  ) => Promise<number>;
  previewProxyRegisterContext?: (
    options: PreviewProxyContextPayload,
  ) => void;
  previewProxyRemoveContext?: (username: string) => void;
  previewProxySetLogging?: (enabled: boolean) => void;
}

let cachedNative: NativeCoreModule | null = null;

export function getNativeCore(): NativeCoreModule {
  if (!cachedNative) {
    cachedNative = tryLoadNative();
  }
  if (!cachedNative) {
    throw new Error("@cmux/native-core failed to load: build the native addon");
  }
  return cachedNative;
}

function tryLoadNative(): NativeCoreModule | null {
  try {
    const nodeRequire = createRequire(import.meta.url);
    const here = path.dirname(fileURLToPath(import.meta.url));
    const plat = process.platform;
    const arch = process.arch;

    const resourceCandidate =
      typeof (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath ===
      "string"
        ? path.join(
            (process as NodeJS.Process & { resourcesPath: string }).resourcesPath,
            "native",
            "core",
          )
        : undefined;

    const candidates = [
      process.env.CMUX_NATIVE_CORE_DIR,
      resourceCandidate,
      fileURLToPath(new URL("../../native/core/", import.meta.url)),
      path.resolve(here, "../../../server/native/core"),
      path.resolve(here, "../../../../apps/server/native/core"),
      path.resolve(process.cwd(), "../server/native/core"),
      path.resolve(process.cwd(), "../../apps/server/native/core"),
      path.resolve(process.cwd(), "apps/server/native/core"),
      path.resolve(process.cwd(), "server/native/core"),
    ].filter(Boolean) as string[];

    for (const candidate of candidates) {
      try {
        const stats = fs.statSync(candidate);
        if (!stats.isDirectory()) continue;
        const files = fs.readdirSync(candidate);
        const nodes = files.filter((file) => file.endsWith(".node"));
        if (nodes.length === 0) continue;
        const preferred =
          nodes.find((file) => file.includes(plat) && file.includes(arch)) ??
          nodes[0];
        const mod = nodeRequire(path.join(candidate, preferred)) as NativeCoreModule;
        return mod;
      } catch {
        // Try next candidate
      }
    }
    return null;
  } catch {
    return null;
  }
}
