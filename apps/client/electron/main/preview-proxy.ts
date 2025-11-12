import { randomBytes, createHash } from "node:crypto";
import { URL } from "node:url";
import type { Session, WebContents } from "electron";
import type { Logger } from "./chrome-camouflage";
import {
  getNativeCore,
  type NativeCoreModule,
  type PreviewProxyContextPayload,
} from "./native-core";

const TASK_RUN_PREVIEW_PREFIX = "task-run-preview:";
const DEFAULT_PROXY_LOGGING_ENABLED = false;
const CMUX_DOMAINS = [
  "cmux.app",
  "cmux.sh",
  "cmux.dev",
  "cmux.local",
  "cmux.localhost",
  "autobuild.app",
] as const;

interface ProxyRoute {
  morphId: string;
  scope: string;
  domainSuffix: (typeof CMUX_DOMAINS)[number];
}

interface ProxyContext {
  username: string;
  password: string;
  route: ProxyRoute | null;
  session: Session;
  webContentsId: number;
  persistKey?: string;
}

interface ConfigureOptions {
  webContents: WebContents;
  initialUrl: string;
  persistKey?: string;
  logger: Logger;
}

let proxyPort: number | null = null;
let startingProxy: Promise<number> | null = null;
let proxyLoggingEnabled = DEFAULT_PROXY_LOGGING_ENABLED;
let proxyLogger: Logger | null = null;

const contextsByUsername = new Map<string, ProxyContext>();
const contextsByWebContentsId = new Map<number, ProxyContext>();

function nativePreviewProxy(): Required<
  Pick<
    NativeCoreModule,
    | "previewProxyEnsureServer"
    | "previewProxyRegisterContext"
    | "previewProxyRemoveContext"
    | "previewProxySetLogging"
  >
> {
  const native = getNativeCore();
  if (
    !native.previewProxyEnsureServer ||
    !native.previewProxyRegisterContext ||
    !native.previewProxyRemoveContext ||
    !native.previewProxySetLogging
  ) {
    throw new Error("preview proxy native bindings are missing required exports");
  }
  return {
    previewProxyEnsureServer: native.previewProxyEnsureServer,
    previewProxyRegisterContext: native.previewProxyRegisterContext,
    previewProxyRemoveContext: native.previewProxyRemoveContext,
    previewProxySetLogging: native.previewProxySetLogging,
  };
}

const previewProxyNative = nativePreviewProxy();
previewProxyNative.previewProxySetLogging(proxyLoggingEnabled);

export function setPreviewProxyLoggingEnabled(enabled: boolean): void {
  proxyLoggingEnabled = Boolean(enabled);
  previewProxyNative.previewProxySetLogging(proxyLoggingEnabled);
}

function proxyLog(event: string, data?: Record<string, unknown>): void {
  if (!proxyLoggingEnabled) {
    return;
  }
  try {
    proxyLogger?.log("Preview proxy", { event, ...(data ?? {}) });
  } catch (error) {
    console.error("Failed to log preview proxy", error);
  }
}

function proxyWarn(event: string, data?: Record<string, unknown>): void {
  if (!proxyLoggingEnabled) {
    return;
  }
  try {
    proxyLogger?.warn("Preview proxy", { event, ...(data ?? {}) });
  } catch (error) {
    console.error("Failed to warn preview proxy", error);
  }
}

export function isTaskRunPreviewPersistKey(
  key: string | undefined,
): key is string {
  return typeof key === "string" && key.startsWith(TASK_RUN_PREVIEW_PREFIX);
}

export function getPreviewPartitionForPersistKey(
  key: string | undefined,
): string | null {
  if (!isTaskRunPreviewPersistKey(key)) {
    return null;
  }
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 24);
  return `persist:cmux-preview-${hash}`;
}

export function getProxyCredentialsForWebContents(
  id: number,
): { username: string; password: string } | null {
  const context = contextsByWebContentsId.get(id);
  if (!context) return null;
  return { username: context.username, password: context.password };
}

export function releasePreviewProxy(webContentsId: number): void {
  const context = contextsByWebContentsId.get(webContentsId);
  if (!context) return;
  contextsByWebContentsId.delete(webContentsId);
  contextsByUsername.delete(context.username);
  try {
    previewProxyNative.previewProxyRemoveContext(context.username);
  } catch (error) {
    console.error("Failed to remove native preview proxy context", error);
  }
  proxyLog("reset-session-proxy", {
    webContentsId,
    persistKey: context.persistKey,
  });
  void context.session.setProxy({ mode: "direct" }).catch((err) => {
    console.error("Failed to reset preview proxy", err);
  });
}

async function ensureProxyServer(logger: Logger): Promise<number> {
  if (proxyPort) {
    return proxyPort;
  }
  if (startingProxy) {
    return startingProxy;
  }
  proxyLogger = logger;
  startingProxy = previewProxyNative
    .previewProxyEnsureServer({
      start_port: 39_385,
      max_attempts: 50,
    })
    .then((port) => {
      proxyPort = port;
      proxyLog("listening", { port });
      startingProxy = null;
      return port;
    })
    .catch((error) => {
      startingProxy = null;
      throw error;
    });
  return startingProxy;
}

export async function configurePreviewProxyForView(
  options: ConfigureOptions,
): Promise<() => void> {
  const { webContents, initialUrl, persistKey, logger } = options;
  const route = deriveRoute(initialUrl);
  if (!route) {
    logger.warn("Preview proxy skipped; unable to parse cmux host", {
      url: initialUrl,
      persistKey,
    });
    return () => {};
  }

  const port = await ensureProxyServer(logger);
  const username = `wc-${webContents.id}-${randomBytes(4).toString("hex")}`;
  const password = randomBytes(12).toString("hex");

  const context: ProxyContext = {
    username,
    password,
    route,
    session: webContents.session,
    webContentsId: webContents.id,
    persistKey,
  };

  const payload: PreviewProxyContextPayload = {
    username,
    password,
    route: route
      ? {
          morph_id: route.morphId,
          scope: route.scope,
          domain_suffix: route.domainSuffix,
        }
      : null,
  };

  try {
    previewProxyNative.previewProxyRegisterContext(payload);
  } catch (error) {
    logger.warn("Failed to register native preview proxy context", { error });
    throw error;
  }

  contextsByUsername.set(username, context);
  contextsByWebContentsId.set(webContents.id, context);

  try {
    await webContents.session.setProxy({
      proxyRules: `http=127.0.0.1:${port};https=127.0.0.1:${port}`,
      proxyBypassRules: "<-loopback>",
    });
  } catch (error) {
    contextsByUsername.delete(username);
    contextsByWebContentsId.delete(webContents.id);
    previewProxyNative.previewProxyRemoveContext(username);
    logger.warn("Failed to configure preview proxy", { error });
    throw error;
  }

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    releasePreviewProxy(webContents.id);
    proxyLog("released-context", {
      webContentsId: webContents.id,
      persistKey,
    });
  };

  webContents.once("destroyed", cleanup);
  proxyLog("configured-context", {
    webContentsId: webContents.id,
    persistKey,
    route,
  });
  return cleanup;
}

export function startPreviewProxy(logger: Logger): Promise<number> {
  return ensureProxyServer(logger);
}

function deriveRoute(url: string): ProxyRoute | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const morphMatch = hostname.match(
      /^port-(\d+)-morphvm-([^.]+)\.http\.cloud\.morph\.so$/,
    );
    if (morphMatch) {
      const morphId = morphMatch[2];
      if (morphId) {
        return {
          morphId,
          scope: "base",
          domainSuffix: "cmux.app",
        };
      }
    }
    for (const domain of CMUX_DOMAINS) {
      const suffix = `.${domain}`;
      if (!hostname.endsWith(suffix)) {
        continue;
      }
      const subdomain = hostname.slice(0, -suffix.length);
      if (!subdomain.startsWith("cmux-")) {
        continue;
      }
      const remainder = subdomain.slice("cmux-".length);
      const segments = remainder
        .split("-")
        .filter((segment) => segment.length > 0);
      if (segments.length < 3) {
        continue;
      }
      const portSegment = segments.pop();
      const scopeSegment = segments.pop();
      if (!portSegment || !scopeSegment) {
        continue;
      }
      if (!/^\d+$/.test(portSegment)) {
        continue;
      }
      const morphId = segments.join("-");
      if (!morphId) {
        continue;
      }
      return {
        morphId,
        scope: scopeSegment,
        domainSuffix: domain,
      };
    }
  } catch (error) {
    console.error("Failed to derive route", error);
    return null;
  }
  return null;
}
