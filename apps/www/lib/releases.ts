export const RELEASE_PAGE_URL =
  "https://github.com/manaflow-ai/cmux/releases/latest";

export const GITHUB_RELEASE_URL =
  "https://api.github.com/repos/manaflow-ai/cmux/releases/latest";

export const MAC_ARCHITECTURES = ["arm64", "x64"] as const;

export type MacArchitecture = (typeof MAC_ARCHITECTURES)[number];

export type MacDownloadUrls = Record<MacArchitecture, string | null>;
