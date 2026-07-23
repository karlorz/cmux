export const LEGACY_ELECTRON_PARTITION = "persist:cmux";
export const DEFAULT_DEV_ELECTRON_PARTITION = "persist:cmux-dev";

export function resolveElectronPartition({
  isPackaged,
  override,
}: {
  isPackaged: boolean;
  override?: string;
}): string {
  const normalizedOverride = override?.trim();
  if (normalizedOverride) {
    if (!normalizedOverride.startsWith("persist:")) {
      throw new Error(
        "CMUX_ELECTRON_PARTITION must start with persist:",
      );
    }
    return normalizedOverride;
  }

  return isPackaged
    ? LEGACY_ELECTRON_PARTITION
    : DEFAULT_DEV_ELECTRON_PARTITION;
}
