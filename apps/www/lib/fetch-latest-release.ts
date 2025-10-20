import {
  GITHUB_RELEASE_URL,
  MAC_ARCHITECTURES,
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

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

const architectureKeywords: Record<MacArchitecture, readonly string[]> = {
  arm64: ["arm64", "aarch64"],
  x64: ["x64", "x86_64", "amd64"],
};

const resolveArchitectureFromAssetName = (
  assetName: string,
): MacArchitecture | null => {
  const normalized = assetName.toLowerCase();

  if (!normalized.endsWith(".dmg")) {
    return null;
  }

  for (const keyword of architectureKeywords.arm64) {
    if (normalized.includes(keyword)) {
      return "arm64";
    }
  }

  for (const keyword of architectureKeywords.x64) {
    if (normalized.includes(keyword)) {
      return "x64";
    }
  }

  return "x64";
};

export const deriveReleaseInfo = (data: GithubRelease | null): ReleaseInfo => {
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

  if (Array.isArray(data.assets)) {
    for (const asset of data.assets) {
      if (!isNonEmptyString(asset.name)) {
        continue;
      }

      const architecture = resolveArchitectureFromAssetName(asset.name);

      if (!architecture) {
        continue;
      }

      if (macDownloadUrls[architecture]) {
        continue;
      }

      const downloadUrl = asset.browser_download_url;

      if (isNonEmptyString(downloadUrl)) {
        macDownloadUrls[architecture] = downloadUrl;
      }
    }
  }

  for (const architecture of MAC_ARCHITECTURES) {
    if (!macDownloadUrls[architecture]) {
      macDownloadUrls[architecture] = null;
    }
  }

  return {
    latestVersion,
    macDownloadUrls,
    fallbackUrl: RELEASE_PAGE_URL,
  };
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
