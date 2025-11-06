import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

export interface AppSettings {
  autoUpdate: {
    enabled: boolean;
    includeDraftReleases: boolean;
  };
}

const DEFAULT_SETTINGS: AppSettings = {
  autoUpdate: {
    enabled: true,
    includeDraftReleases: false,
  },
};

let settingsFilePath: string | null = null;
let cachedSettings: AppSettings | null = null;

function getSettingsFilePath(): string {
  if (settingsFilePath) return settingsFilePath;
  const userDataPath = app.getPath("userData");
  settingsFilePath = join(userDataPath, "cmux-settings.json");
  return settingsFilePath;
}

export async function loadSettings(): Promise<AppSettings> {
  if (cachedSettings) return cachedSettings;

  const filePath = getSettingsFilePath();

  try {
    if (!existsSync(filePath)) {
      // First time - create settings file with defaults
      await saveSettings(DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    }

    const content = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(content) as Partial<AppSettings>;

    // Merge with defaults to ensure all fields exist
    cachedSettings = {
      autoUpdate: {
        ...DEFAULT_SETTINGS.autoUpdate,
        ...parsed.autoUpdate,
      },
    };

    return cachedSettings;
  } catch (error) {
    console.error("Failed to load settings, using defaults:", error);
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const filePath = getSettingsFilePath();
  const dirPath = app.getPath("userData");

  try {
    // Ensure directory exists
    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true });
    }

    await writeFile(filePath, JSON.stringify(settings, null, 2), "utf-8");
    cachedSettings = settings;
  } catch (error) {
    console.error("Failed to save settings:", error);
    throw error;
  }
}

export async function updateSettings(
  updater: (current: AppSettings) => AppSettings
): Promise<AppSettings> {
  const current = await loadSettings();
  const updated = updater(current);
  await saveSettings(updated);
  return updated;
}

export function resetSettingsCache(): void {
  cachedSettings = null;
}
