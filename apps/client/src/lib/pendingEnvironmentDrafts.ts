import { useCallback, useEffect, useState } from "react";
import type { MorphSnapshotId } from "@cmux/shared";

export type PendingEnvironmentVar = {
  name: string;
  value: string;
  isSecret: boolean;
};

export type PendingEnvironmentDraft = {
  teamSlugOrId: string;
  instanceId: string;
  selectedRepos: string[];
  snapshotId?: MorphSnapshotId;
  envName?: string;
  maintenanceScript?: string;
  devScript?: string;
  exposedPorts?: string;
  envVars?: PendingEnvironmentVar[];
  lastUpdated: number;
};

const STORAGE_KEY = "cmux:pending-environments";
const CHANGE_EVENT_NAME = "cmux:pending-environments";

const isBrowser = typeof window !== "undefined";

const readDrafts = (): PendingEnvironmentDraft[] => {
  if (!isBrowser) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item) => {
      return (
        item &&
        typeof item === "object" &&
        typeof item.teamSlugOrId === "string" &&
        typeof item.instanceId === "string"
      );
    });
  } catch (error) {
    console.error("Failed to read pending environments", error);
    return [];
  }
};

const writeDrafts = (drafts: PendingEnvironmentDraft[]): void => {
  if (!isBrowser) {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT_NAME));
  } catch (error) {
    console.error("Failed to persist pending environments", error);
  }
};

export const listPendingEnvironmentDrafts = (
  teamSlugOrId: string
): PendingEnvironmentDraft[] => {
  return readDrafts()
    .filter((draft) => draft.teamSlugOrId === teamSlugOrId)
    .sort((a, b) => b.lastUpdated - a.lastUpdated);
};

export const getPendingEnvironmentDraft = (
  teamSlugOrId: string,
  instanceId: string
): PendingEnvironmentDraft | undefined => {
  return readDrafts().find(
    (draft) =>
      draft.teamSlugOrId === teamSlugOrId && draft.instanceId === instanceId
  );
};

export const upsertPendingEnvironmentDraft = (
  draft: Omit<PendingEnvironmentDraft, "lastUpdated"> & { lastUpdated?: number }
): void => {
  if (!isBrowser) {
    return;
  }
  const drafts = readDrafts().filter(
    (existing) =>
      !(
        existing.teamSlugOrId === draft.teamSlugOrId &&
        existing.instanceId === draft.instanceId
      )
  );
  const normalized: PendingEnvironmentDraft = {
    ...draft,
    selectedRepos: Array.from(new Set(draft.selectedRepos)),
    envVars: draft.envVars?.map((item) => ({
      name: item.name,
      value: item.value,
      isSecret: item.isSecret,
    })),
    lastUpdated: draft.lastUpdated ?? Date.now(),
  };
  drafts.push(normalized);
  writeDrafts(drafts);
};

export const removePendingEnvironmentDraft = (
  teamSlugOrId: string,
  instanceId: string
): void => {
  if (!isBrowser) {
    return;
  }
  const drafts = readDrafts().filter(
    (draft) =>
      !(
        draft.teamSlugOrId === teamSlugOrId &&
        draft.instanceId === instanceId
      )
  );
  writeDrafts(drafts);
};

export const clearPendingEnvironmentDraftsForTeam = (
  teamSlugOrId: string
): void => {
  if (!isBrowser) {
    return;
  }
  const drafts = readDrafts().filter(
    (draft) => draft.teamSlugOrId !== teamSlugOrId
  );
  writeDrafts(drafts);
};

export const usePendingEnvironmentDrafts = (
  teamSlugOrId: string
): PendingEnvironmentDraft[] => {
  const [drafts, setDrafts] = useState<PendingEnvironmentDraft[]>(() =>
    listPendingEnvironmentDrafts(teamSlugOrId)
  );

  useEffect(() => {
    if (!isBrowser) {
      return;
    }
    const update = () => {
      setDrafts(listPendingEnvironmentDrafts(teamSlugOrId));
    };
    update();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        update();
      }
    };

    window.addEventListener(CHANGE_EVENT_NAME, update);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT_NAME, update);
      window.removeEventListener("storage", handleStorage);
    };
  }, [teamSlugOrId]);

  const refresh = useCallback(() => {
    setDrafts(listPendingEnvironmentDrafts(teamSlugOrId));
  }, [teamSlugOrId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return drafts;
};
