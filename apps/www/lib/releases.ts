export { GITHUB_RELEASE_URL, RELEASE_PAGE_URL } from "@/lib/github/constants";

export const DMG_SUFFIXES = {
  universal: "-universal.dmg",
  arm64: "-arm64.dmg",
  x64: "-x64.dmg",
} as const;

export type MacArchitecture = keyof typeof DMG_SUFFIXES;

export type MacDownloadUrls = Record<MacArchitecture, string | null>;
