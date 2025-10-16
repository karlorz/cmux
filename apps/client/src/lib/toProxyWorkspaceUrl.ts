const MORPH_HOST_REGEX = /^port-(\d+)-morphvm-([^.]+)\.http\.cloud\.morph\.so$/;
const CMUX_SH_HOST_REGEX = /^port-(\d+)-([^.]+)\.cmux\.sh$/;
const CMUX_APP_HOST_REGEX = /^cmux-([^-]+)-([^-]+)-(\d+)\.cmux\.app$/;

interface MorphUrlComponents {
  url: URL;
  morphId: string;
  port: number;
}

function parseMorphUrl(input: string): MorphUrlComponents | null {
  if (!input.includes("morph.so")) {
    return null;
  }

  try {
    const url = new URL(input);
    const match = url.hostname.match(MORPH_HOST_REGEX);

    if (!match) {
      return null;
    }

    const [, portString, morphId] = match;
    const port = Number.parseInt(portString, 10);

    if (Number.isNaN(port)) {
      return null;
    }

    return {
      url,
      morphId,
      port,
    };
  } catch {
    return null;
  }
}

export function toProxyWorkspaceUrl(workspaceUrl: string): string {
  const components = parseMorphUrl(workspaceUrl);

  if (!components) {
    return workspaceUrl;
  }

  const scope = "base"; // Default scope
  const proxiedUrl = new URL(components.url.toString());
  proxiedUrl.hostname = `cmux-${components.morphId}-${scope}-${components.port}.cmux.app`;
  return proxiedUrl.toString();
}

export function toMorphVncUrl(sourceUrl: string): string | null {
  const components = parseMorphUrl(sourceUrl);

  if (!components) {
    return null;
  }

  const vncUrl = new URL(components.url.toString());
  vncUrl.hostname = `port-39380-morphvm-${components.morphId}.http.cloud.morph.so`;
  vncUrl.pathname = "/vnc.html";

  const searchParams = new URLSearchParams();
  searchParams.set("autoconnect", "1");
  searchParams.set("resize", "scale");
  vncUrl.search = `?${searchParams.toString()}`;
  vncUrl.hash = "";

  return vncUrl.toString();
}

function rewriteHostWithPort(url: URL, targetPort: number): string | null {
  const clone = new URL(url.toString());
  const { hostname } = clone;

  const morphMatch = hostname.match(MORPH_HOST_REGEX);
  if (morphMatch) {
    const [, , morphId] = morphMatch;
    clone.hostname = `port-${targetPort}-morphvm-${morphId}.http.cloud.morph.so`;
    clone.port = "";
    clone.pathname = "/";
    clone.search = "";
    clone.hash = "";
    return clone.toString();
  }

  const cmuxShMatch = hostname.match(CMUX_SH_HOST_REGEX);
  if (cmuxShMatch) {
    const [, , morphId] = cmuxShMatch;
    clone.hostname = `port-${targetPort}-${morphId}.cmux.sh`;
    clone.port = "";
    clone.pathname = "/";
    clone.search = "";
    clone.hash = "";
    return clone.toString();
  }

  const cmuxAppMatch = hostname.match(CMUX_APP_HOST_REGEX);
  if (cmuxAppMatch) {
    const [, morphId, scope] = cmuxAppMatch;
    clone.hostname = `cmux-${morphId}-${scope}-${targetPort}.cmux.app`;
    clone.port = "";
    clone.pathname = "/";
    clone.search = "";
    clone.hash = "";
    return clone.toString();
  }

  if (clone.port) {
    clone.port = `${targetPort}`;
    clone.pathname = "/";
    clone.search = "";
    clone.hash = "";
    return clone.toString();
  }

  return null;
}

export function toDevTerminalUrl(sourceUrl: string): string | null {
  try {
    const parsed = new URL(sourceUrl);
    return rewriteHostWithPort(parsed, 39383);
  } catch {
    return null;
  }
}
