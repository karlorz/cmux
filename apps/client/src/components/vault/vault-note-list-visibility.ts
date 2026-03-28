const VAULT_NOTE_LIST_VISIBILITY_STORAGE_KEY_PREFIX = "vault-note-list-visible:";

function getVaultNoteListVisibilityStorageKey(teamSlugOrId: string) {
  return `${VAULT_NOTE_LIST_VISIBILITY_STORAGE_KEY_PREFIX}${teamSlugOrId}`;
}

export function readStoredVaultNoteListVisibility(
  teamSlugOrId: string
): boolean | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const storedValue = window.localStorage.getItem(
    getVaultNoteListVisibilityStorageKey(teamSlugOrId)
  );

  if (storedValue === "true") {
    return true;
  }

  if (storedValue === "false") {
    return false;
  }

  return undefined;
}

export function getInitialVaultNoteListVisibility(args: {
  teamSlugOrId: string;
  notePath?: string;
}): boolean {
  if (!args.notePath) {
    return true;
  }

  return readStoredVaultNoteListVisibility(args.teamSlugOrId) ?? false;
}

export function persistVaultNoteListVisibility(
  teamSlugOrId: string,
  isVisible: boolean
) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    getVaultNoteListVisibilityStorageKey(teamSlugOrId),
    String(isVisible)
  );
}
