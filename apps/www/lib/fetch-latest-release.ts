import {
  DMG_SUFFIXES,
  GITHUB_RELEASE_URL,
  GITHUB_REPO_URL,
  MacArchitecture,
  MacDownloadUrls,
  RELEASE_PAGE_URL,
} from "@/lib/releases";

export type ReleaseInfo = {
  latestVersion: string | null;
  macDownloadUrls: MacDownloadUrls;
  fallbackUrl: string;
  starCount: number | null;
};

type GithubRelease = {
  tag_name?: string;
  assets?: Array<{
    name?: string;
    browser_download_url?: string;
  }>;
};

const emptyDownloads: MacDownloadUrls = {
  universal: null,
  arm64: null,
  x64: null,
};

const normalizeVersion = (tag: string): string =>
  tag.startsWith("v") ? tag.slice(1) : tag;

const deriveReleaseInfo = (
  data: GithubRelease | null,
  starCount: number | null
): ReleaseInfo => {
  if (!data) {
    return {
      latestVersion: null,
      macDownloadUrls: { ...emptyDownloads },
      fallbackUrl: RELEASE_PAGE_URL,
      starCount,
    };
  }

  const latestVersion =
    typeof data.tag_name === "string" && data.tag_name.trim() !== ""
      ? normalizeVersion(data.tag_name)
      : null;

  const macDownloadUrls: MacDownloadUrls = { ...emptyDownloads };

  if (Array.isArray(data.assets)) {
    for (const asset of data.assets) {
      const assetName = asset.name?.toLowerCase();

      if (typeof assetName !== "string") {
        continue;
      }

      for (const architecture of Object.keys(DMG_SUFFIXES) as MacArchitecture[]) {
        const suffix = DMG_SUFFIXES[architecture];

        if (assetName.endsWith(suffix)) {
          const downloadUrl = asset.browser_download_url;

          if (typeof downloadUrl === "string" && downloadUrl.trim() !== "") {
            macDownloadUrls[architecture] = downloadUrl;
          }
        }
      }
    }
  }

  return {
    latestVersion,
    macDownloadUrls,
    fallbackUrl: RELEASE_PAGE_URL,
    starCount,
  };
};

type GithubRepo = {
  stargazers_count?: number;
};

async function fetchStarCount(): Promise<number | null> {
  try {
    const response = await fetch(GITHUB_REPO_URL, {
      headers: {
        Accept: "application/vnd.github+json",
      },
      next: {
        revalidate: 3600,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as GithubRepo;

    return typeof data.stargazers_count === "number" ? data.stargazers_count : null;
  } catch (error) {
    console.error("Failed to retrieve GitHub star count", error);

    return null;
  }
}

export async function fetchLatestRelease(): Promise<ReleaseInfo> {
  try {
    const [releaseResponse, starCount] = await Promise.all([
      fetch(GITHUB_RELEASE_URL, {
        headers: {
          Accept: "application/vnd.github+json",
        },
        next: {
          revalidate: 3600,
        },
      }),
      fetchStarCount(),
    ]);

    if (!releaseResponse.ok) {
      return deriveReleaseInfo(null, starCount);
    }

    const data = (await releaseResponse.json()) as GithubRelease;

    return deriveReleaseInfo(data, starCount);
  } catch (error) {
    console.error("Failed to retrieve latest GitHub release", error);

    return deriveReleaseInfo(null, null);
  }
}
