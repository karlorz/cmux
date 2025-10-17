const STORAGE_KEY = "cmux:pending-environments";

type PendingEnvironmentStep = "select" | "configure";

export interface PendingEnvironmentEntry {
  readonly teamSlugOrId: string;
  readonly step: PendingEnvironmentStep;
  readonly selectedRepos: readonly string[];
  readonly instanceId?: string;
  readonly snapshotId?: string;
  readonly connectionLogin?: string;
  readonly repoSearch?: string;
  readonly updatedAt: number;
}

type PendingEnvironmentMap = Record<string, PendingEnvironmentEntry>;

let memoryStorage: PendingEnvironmentMap | null = null;

const isBrowser = (): boolean =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const sanitizeStep = (value: unknown): PendingEnvironmentStep | null => {
  if (value === "select" || value === "configure") {
    return value;
  }
  return null;
};

const shouldPersist = (entry: PendingEnvironmentEntry): boolean => {
  if (entry.selectedRepos.length > 0) return true;
  if (entry.instanceId && entry.instanceId.trim().length > 0) return true;
  if (entry.connectionLogin && entry.connectionLogin.trim().length > 0)
    return true;
  if (entry.repoSearch && entry.repoSearch.trim().length > 0) return true;
  if (entry.step === "configure") return true;
  return false;
};

const readStorage = (): PendingEnvironmentMap => {
  if (!isBrowser()) {
    return memoryStorage ?? {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }

    const result: PendingEnvironmentMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof key !== "string") continue;
      if (typeof value !== "object" || value === null) continue;
      const record = value as Record<string, unknown>;
      const step = sanitizeStep(record.step);
      const selectedReposRaw = record.selectedRepos;
      const selectedRepos = isStringArray(selectedReposRaw)
        ? Array.from(new Set(selectedReposRaw))
        : [];
      const instanceIdRaw = record.instanceId;
      const instanceId =
        typeof instanceIdRaw === "string" && instanceIdRaw.trim().length > 0
          ? instanceIdRaw
          : undefined;
      const snapshotIdRaw = record.snapshotId;
      const snapshotId =
        typeof snapshotIdRaw === "string" && snapshotIdRaw.trim().length > 0
          ? snapshotIdRaw
          : undefined;
      const connectionLoginRaw = record.connectionLogin;
      const connectionLogin =
        typeof connectionLoginRaw === "string" &&
        connectionLoginRaw.trim().length > 0
          ? connectionLoginRaw
          : undefined;
      const repoSearchRaw = record.repoSearch;
      const repoSearch =
        typeof repoSearchRaw === "string" && repoSearchRaw.trim().length > 0
          ? repoSearchRaw
          : undefined;
      const updatedAtRaw = record.updatedAt;
      const updatedAt =
        typeof updatedAtRaw === "number" && Number.isFinite(updatedAtRaw)
          ? updatedAtRaw
          : Date.now();

      if (!step) continue;

      const entry: PendingEnvironmentEntry = {
        teamSlugOrId: key,
        step,
        selectedRepos,
        instanceId,
        snapshotId,
        connectionLogin,
        repoSearch,
        updatedAt,
      };

      if (shouldPersist(entry)) {
        result[key] = entry;
      }
    }

    return result;
  } catch (error) {
    console.error("Failed to read pending environments", error);
    return {};
  }
};

const writeStorage = (map: PendingEnvironmentMap): void => {
  if (!isBrowser()) {
    memoryStorage = { ...map };
    return;
  }

  try {
    const entries = Object.entries(map).filter(([, entry]) =>
      shouldPersist(entry),
    );
    if (entries.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      memoryStorage = {};
      return;
    }
    const payload: PendingEnvironmentMap = Object.fromEntries(entries);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    memoryStorage = { ...payload };
  } catch (error) {
    console.error("Failed to write pending environments", error);
  }
};

const shallowEqual = (
  a: PendingEnvironmentEntry | undefined,
  b: PendingEnvironmentEntry | undefined,
): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.updatedAt !== b.updatedAt) return false;
  if (a.step !== b.step) return false;
  if (a.instanceId !== b.instanceId) return false;
  if (a.snapshotId !== b.snapshotId) return false;
  if (a.connectionLogin !== b.connectionLogin) return false;
  if (a.repoSearch !== b.repoSearch) return false;
  if (a.selectedRepos.length !== b.selectedRepos.length) return false;
  for (let i = 0; i < a.selectedRepos.length; i += 1) {
    if (a.selectedRepos[i] !== b.selectedRepos[i]) return false;
  }
  return true;
};

export interface PendingEnvironmentUpdate {
  readonly step?: PendingEnvironmentStep;
  readonly selectedRepos?: readonly string[];
  readonly instanceId?: string | null;
  readonly snapshotId?: string | null;
  readonly connectionLogin?: string | null;
  readonly repoSearch?: string | null;
}

const normalizeString = (value: string | null | undefined): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeRepos = (repos: readonly string[] | undefined): string[] => {
  if (!repos) return [];
  const normalized = Array.from(new Set(repos.filter((repo) => repo.trim())));
  return normalized;
};

export const setPendingEnvironment = (
  teamSlugOrId: string,
  update: PendingEnvironmentUpdate,
): void => {
  const store = readStorage();
  const existing = store[teamSlugOrId];

  const nextStep: PendingEnvironmentStep =
    update.step ?? existing?.step ?? "select";
  const nextRepos = normalizeRepos(update.selectedRepos ?? existing?.selectedRepos);
  const nextInstanceId = normalizeString(
    update.instanceId === null ? undefined : update.instanceId ?? existing?.instanceId,
  );
  const nextSnapshotId = normalizeString(
    update.snapshotId === null ? undefined : update.snapshotId ?? existing?.snapshotId,
  );
  const nextConnectionLogin = normalizeString(
    update.connectionLogin === null
      ? undefined
      : update.connectionLogin ?? existing?.connectionLogin,
  );
  const nextRepoSearch = normalizeString(
    update.repoSearch === null
      ? undefined
      : update.repoSearch ?? existing?.repoSearch,
  );

  const nextEntry: PendingEnvironmentEntry = {
    teamSlugOrId,
    step: nextStep,
    selectedRepos: nextRepos,
    instanceId: nextInstanceId,
    snapshotId: nextSnapshotId,
    connectionLogin: nextConnectionLogin,
    repoSearch: nextRepoSearch,
    updatedAt: Date.now(),
  };

  if (!shouldPersist(nextEntry)) {
    if (existing) {
      delete store[teamSlugOrId];
      writeStorage(store);
    }
    return;
  }

  if (shallowEqual(existing, nextEntry)) {
    return;
  }

  store[teamSlugOrId] = nextEntry;
  writeStorage(store);
};

export const clearPendingEnvironment = (teamSlugOrId: string): void => {
  const store = readStorage();
  if (!(teamSlugOrId in store)) return;
  delete store[teamSlugOrId];
  writeStorage(store);
};

export const getPendingEnvironment = (
  teamSlugOrId: string,
): PendingEnvironmentEntry | null => {
  const store = readStorage();
  return store[teamSlugOrId] ?? null;
};
