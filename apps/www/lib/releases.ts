import { CMUX_GITHUB_API_URL, CMUX_GITHUB_REPO_URL } from "@/lib/constants";

export const RELEASE_PAGE_URL = `${CMUX_GITHUB_REPO_URL}/releases/latest`;

export const GITHUB_RELEASE_URL = `${CMUX_GITHUB_API_URL}/releases/latest`;

export const DMG_SUFFIXES = {
  universal: "-universal.dmg",
  arm64: "-arm64.dmg",
  x64: "-x64.dmg",
} as const;

export type MacArchitecture = keyof typeof DMG_SUFFIXES;

export type MacDownloadUrls = Record<MacArchitecture, string | null>;
