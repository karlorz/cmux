import type { MacArchitecture, MacDownloadUrls } from "@/lib/releases";

const hasDownloadUrl = (value: string | null): value is string =>
  typeof value === "string" && value.trim() !== "";

export const normalizeMacArchitecture = (
  value: string | null | undefined,
): MacArchitecture | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "universal" || normalized === "universal2") {
    return "universal";
  }

  if (normalized === "arm" || normalized === "arm64" || normalized === "aarch64") {
    return "arm64";
  }

  if (
    normalized === "x86" ||
    normalized === "x86_64" ||
    normalized === "amd64" ||
    normalized === "x64"
  ) {
    return "x64";
  }

  return null;
};

export const inferMacArchitectureFromUserAgent = (
  userAgent: string | null | undefined,
): MacArchitecture | null => {
  if (typeof userAgent !== "string") {
    return null;
  }

  const normalized = userAgent.toLowerCase();

  if (!normalized.includes("mac")) {
    return null;
  }

  if (normalized.includes("arm") || normalized.includes("aarch64")) {
    return "arm64";
  }

  if (
    normalized.includes("x86_64") ||
    normalized.includes("intel") ||
    normalized.includes("x64") ||
    normalized.includes("amd64")
  ) {
    return "x64";
  }

  return null;
};

export const pickMacDownloadUrl = (
  macDownloadUrls: MacDownloadUrls,
  fallbackUrl: string,
  architecture: MacArchitecture | null,
): string => {
  if (architecture) {
    const candidate = macDownloadUrls[architecture];

    if (hasDownloadUrl(candidate)) {
      return candidate;
    }
  }

  if (hasDownloadUrl(macDownloadUrls.universal)) {
    return macDownloadUrls.universal;
  }

  if (hasDownloadUrl(macDownloadUrls.arm64)) {
    return macDownloadUrls.arm64;
  }

  if (hasDownloadUrl(macDownloadUrls.x64)) {
    return macDownloadUrls.x64;
  }

  return fallbackUrl;
};

export const getNavigatorArchitectureHint = (): MacArchitecture | null => {
  if (typeof navigator === "undefined") {
    return null;
  }

  const platform = navigator.platform?.toLowerCase() ?? "";
  const userAgent = navigator.userAgent;
  const normalizedUserAgent = userAgent.toLowerCase();
  const isMac = platform.includes("mac") || normalizedUserAgent.includes("macintosh");

  if (!isMac) {
    return null;
  }

  const navigatorWithUAData = navigator as Navigator & {
    userAgentData?: {
      architecture?: string;
    };
  };

  const uaData = navigatorWithUAData.userAgentData;

  if (uaData) {
    const architectureHint = normalizeMacArchitecture(uaData.architecture);

    if (architectureHint) {
      return architectureHint;
    }
  }

  return inferMacArchitectureFromUserAgent(userAgent);
};

export const detectClientMacArchitecture = async (): Promise<MacArchitecture | null> => {
  const immediateHint = getNavigatorArchitectureHint();

  if (immediateHint) {
    return immediateHint;
  }

  if (typeof navigator === "undefined") {
    return null;
  }

  const navigatorWithUAData = navigator as Navigator & {
    userAgentData?: {
      architecture?: string;
      getHighEntropyValues?: (
        hints: readonly string[],
      ) => Promise<Record<string, unknown>>;
    };
  };

  const uaData = navigatorWithUAData.userAgentData;

  if (!uaData || typeof uaData.getHighEntropyValues !== "function") {
    return inferMacArchitectureFromUserAgent(navigator.userAgent);
  }

  const details = await uaData
    .getHighEntropyValues(["architecture"])
    .catch(() => null);

  if (details && typeof details === "object") {
    const maybeValue = (details as Record<string, unknown>).architecture;
    const normalizedArchitecture = normalizeMacArchitecture(
      typeof maybeValue === "string" ? maybeValue : null,
    );

    if (normalizedArchitecture) {
      return normalizedArchitecture;
    }
  }

  return inferMacArchitectureFromUserAgent(navigator.userAgent);
};
