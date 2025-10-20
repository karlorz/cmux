import {
  DMG_SUFFIXES,
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

export const macArchitectureFromAssetName = (
  assetName: string,
): MacArchitecture | null => {
  if (!assetName.endsWith(".dmg")) {
    return null;
  }

  for (const architecture of Object.keys(DMG_SUFFIXES) as MacArchitecture[]) {
    if (assetName.endsWith(DMG_SUFFIXES[architecture])) {
      return architecture;
    }
  }

  if (assetName.includes("arm64") || assetName.includes("aarch64")) {
    return "arm64";
  }

  if (
    assetName.includes("x64") ||
    assetName.includes("x86_64") ||
    assetName.includes("intel")
  ) {
    return "x64";
  }

  return null;
};

const normalizeVersion = (tag: string): string =>
  tag.startsWith("v") ? tag.slice(1) : tag;

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
  const unresolvedDmgUrls: string[] = [];

  if (Array.isArray(data.assets)) {
    for (const asset of data.assets) {
      const assetName = asset.name?.toLowerCase();

      if (typeof assetName !== "string") {
        continue;
      }

      const downloadUrl = asset.browser_download_url;

      if (typeof downloadUrl !== "string" || downloadUrl.trim() === "") {
        continue;
      }

      const architecture = macArchitectureFromAssetName(assetName);

      if (architecture) {
        macDownloadUrls[architecture] = downloadUrl;
        continue;
      }

      if (assetName.endsWith(".dmg")) {
        unresolvedDmgUrls.push(downloadUrl);
      }
    }
  }

  if (!macDownloadUrls.x64 && unresolvedDmgUrls.length > 0) {
    macDownloadUrls.x64 = unresolvedDmgUrls.shift() ?? null;
  }

  if (!macDownloadUrls.arm64 && unresolvedDmgUrls.length > 0) {
    macDownloadUrls.arm64 = unresolvedDmgUrls.shift() ?? null;
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
