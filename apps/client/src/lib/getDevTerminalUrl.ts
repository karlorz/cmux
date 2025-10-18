const MORPH_HOST_REGEX = /^port-(\d+)-morphvm-([^.]+)\.http\.cloud\.morph\.so$/;
const CMUX_HOST_REGEX = /^cmux-([^-]+)-([^-]+)-(\d+)\.cmux\.app$/;

function rewriteMorphHost(hostname: string, targetPort: number): string | null {
  const match = hostname.match(MORPH_HOST_REGEX);
  if (!match) return null;
  const [, , morphId] = match;
  return `port-${targetPort}-morphvm-${morphId}.http.cloud.morph.so`;
}

function rewriteCmuxHost(hostname: string, targetPort: number): string | null {
  const match = hostname.match(CMUX_HOST_REGEX);
  if (!match) return null;
  const [, morphId, scope] = match;
  return `cmux-${morphId}-${scope}-${targetPort}.cmux.app`;
}

function withPortFallback(url: URL, targetPort: number): URL {
  url.port = String(targetPort);
  return url;
}

export function getDevTerminalUrl(baseUrl: string | null | undefined): string | null {
  if (!baseUrl) return null;

  try {
    const url = new URL(baseUrl);
    const targetPort = 39383;

    const rewrittenMorph = rewriteMorphHost(url.hostname, targetPort);
    if (rewrittenMorph) {
      url.hostname = rewrittenMorph;
      url.port = "";
    } else {
      const rewrittenCmux = rewriteCmuxHost(url.hostname, targetPort);
      if (rewrittenCmux) {
        url.hostname = rewrittenCmux;
        url.port = "";
      } else {
        withPortFallback(url, targetPort);
      }
    }

    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

