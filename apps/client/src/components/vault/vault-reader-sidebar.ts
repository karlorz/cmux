export type VaultReaderSidebarAction = "hide" | "show" | "none";

interface VaultReaderSidebarActionArgs {
  previousNotePath?: string;
  nextNotePath?: string;
  isSidebarHidden: boolean;
  autoHiddenForReader: boolean;
}

export function getVaultReaderSidebarAction({
  previousNotePath,
  nextNotePath,
  isSidebarHidden,
  autoHiddenForReader,
}: VaultReaderSidebarActionArgs): VaultReaderSidebarAction {
  const hadSelectedNote = Boolean(previousNotePath);
  const hasSelectedNote = Boolean(nextNotePath);

  if (!hadSelectedNote && hasSelectedNote && !isSidebarHidden) {
    return "hide";
  }

  if (hadSelectedNote && !hasSelectedNote && autoHiddenForReader) {
    return "show";
  }

  return "none";
}
