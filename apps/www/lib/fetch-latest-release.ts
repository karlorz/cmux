import {
  GITHUB_RELEASE_URL,
  MacArchitecture,
  MacDownloadUrls,
  RELEASE_PAGE_URL,
} from "@/lib/releases";

export type ReleaseInfo = {
  latestVersion: string | null;
  macDownloadUrls: MacDownloadUrls;
  fallbackUrl: string;
};

type GithubRelease = {
  tag_name?: string;
  assets?: Array<{
    name?: string;
    browser_download_url?: string;
  }>;
};

const emptyDownloads: MacDownloadUrls = {
  arm64: null,
  x64: null,
};

const normalizeVersion = (tag: string): string =>
  tag.startsWith("v") ? tag.slice(1) : tag;

type ArchitectureInference = {
  architectures: MacArchitecture[];
  confidence: number;
};

const ARM64_HINTS = [
  /\barm64\b/i,
  /\baarch64\b/i,
  /apple[-_]?silicon/i,
];

const X64_HINTS = [
  /\bx64\b/i,
  /\bx86_64\b/i,
  /\bamd64\b/i,
  /\bintel\b/i,
];

const UNIVERSAL_HINT = /\buniversal\b/i;

const inferArchitecturesFromAssetName = (
  assetName: string,
): ArchitectureInference | null => {
  const normalized = assetName.toLowerCase();

  if (!normalized.endsWith(".dmg")) {
    return null;
  }

  const hasArm64 = ARM64_HINTS.some((pattern) => pattern.test(assetName));
  const hasX64 = X64_HINTS.some((pattern) => pattern.test(assetName));

  const architectures: MacArchitecture[] = [];

  if (hasArm64) {
    architectures.push("arm64");
  }

  if (hasX64) {
    architectures.push("x64");
  }

  if (architectures.length > 0) {
    return {
      architectures,
      confidence: 2,
    };
  }

  if (UNIVERSAL_HINT.test(assetName)) {
    return {
      architectures: ["arm64", "x64"],
      confidence: 1,
    };
  }

  return {
    architectures: ["x64"],
    confidence: 0,
  };
};

const deriveReleaseInfo = (data: GithubRelease | null): ReleaseInfo => {
  if (!data) {
    return {
      latestVersion: null,
      macDownloadUrls: { ...emptyDownloads },
      fallbackUrl: RELEASE_PAGE_URL,
    };
  }

  const latestVersion =
    typeof data.tag_name === "string" && data.tag_name.trim() !== ""
      ? normalizeVersion(data.tag_name)
      : null;

  const macDownloadUrls: MacDownloadUrls = { ...emptyDownloads };
  const confidenceByArchitecture: Record<MacArchitecture, number> = {
    arm64: -1,
    x64: -1,
  };

  if (Array.isArray(data.assets)) {
    for (const asset of data.assets) {
      const assetName = asset.name?.toLowerCase();

      if (typeof assetName !== "string") {
        continue;
      }

      const inference = inferArchitecturesFromAssetName(assetName);

      if (!inference) {
        continue;
      }

      const downloadUrl = asset.browser_download_url;

      if (typeof downloadUrl !== "string" || downloadUrl.trim() === "") {
        continue;
      }

      for (const architecture of inference.architectures) {
        if (inference.confidence > confidenceByArchitecture[architecture]) {
          macDownloadUrls[architecture] = downloadUrl;
          confidenceByArchitecture[architecture] = inference.confidence;
        }
      }
    }
  }

  return {
    latestVersion,
    macDownloadUrls,
    fallbackUrl: RELEASE_PAGE_URL,
  };
};

export const __releaseParsingInternals = {
  inferArchitecturesFromAssetName,
  deriveReleaseInfo,
};

export async function fetchLatestRelease(): Promise<ReleaseInfo> {
  try {
    const response = await fetch(GITHUB_RELEASE_URL, {
      headers: {
        Accept: "application/vnd.github+json",
      },
      next: {
        revalidate: 3600,
      },
    });

    if (!response.ok) {
      return deriveReleaseInfo(null);
    }

    const data = (await response.json()) as GithubRelease;

    return deriveReleaseInfo(data);
  } catch (error) {
    console.error("Failed to retrieve latest GitHub release", error);

    return deriveReleaseInfo(null);
  }
}
