import { z } from "zod";

export const LOCAL_REPO_ENTRY_PREFIX = "local-repo:";
export const LOCAL_SUGGESTION_PREFIX = "local-suggestion:";
const PATH_INPUT_REGEX = /^(\.{1,2}[\\/]|~|\/|[a-zA-Z]:[\\/]|\\\\)/;

const LocalRepoEntrySchema = z.object({
  id: z.string(),
  path: z.string(),
  displayPath: z.string(),
  repoFullName: z.string(),
  repoUrl: z.string().optional(),
  provider: z.enum(["github", "gitlab", "bitbucket", "unknown"]).default("unknown"),
  currentBranch: z.string().optional(),
  defaultBranch: z.string().optional(),
});

export type LocalRepoEntry = z.infer<typeof LocalRepoEntrySchema>;

export const getLocalRepoStorageKey = (teamSlugOrId: string): string =>
  `localRepos-${teamSlugOrId}`;

export function loadLocalRepoEntries(teamSlugOrId: string): LocalRepoEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(
      getLocalRepoStorageKey(teamSlugOrId)
    );
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const entries: LocalRepoEntry[] = [];
    for (const item of parsed) {
      const result = LocalRepoEntrySchema.safeParse(item);
      if (result.success) {
        entries.push(result.data);
      }
    }
    return entries;
  } catch (error) {
    console.warn("Failed to load local repo entries", error);
    return [];
  }
}

export function persistLocalRepoEntries(
  teamSlugOrId: string,
  entries: LocalRepoEntry[]
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      getLocalRepoStorageKey(teamSlugOrId),
      JSON.stringify(entries)
    );
  } catch (error) {
    console.warn("Failed to persist local repo entries", error);
  }
}

export const looksLikePath = (value: string): boolean =>
  PATH_INPUT_REGEX.test(value.trim());

export const encodeSuggestionPath = (path: string): string =>
  encodeURIComponent(path);

export const decodeSuggestionPathValue = (value: string): string =>
  decodeURIComponent(value);

export const getLocalRepoEntryId = (path: string): string =>
  `${LOCAL_REPO_ENTRY_PREFIX}${encodeURIComponent(path)}`;

export const getLocalRepoPathFromId = (id: string): string | null => {
  if (!id.startsWith(LOCAL_REPO_ENTRY_PREFIX)) {
    return null;
  }
  try {
    return decodeURIComponent(id.slice(LOCAL_REPO_ENTRY_PREFIX.length));
  } catch {
    return null;
  }
};

export const formatDisplayPath = (
  path: string,
  displayPath?: string
): string => displayPath || path;

export const deriveFallbackRepoFullName = (path: string): string => {
  const normalized = path.trim().replace(/\\+/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  const basename = segments[segments.length - 1] || normalized || "local";
  return `local/${basename}`;
};
