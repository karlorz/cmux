import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import type { EditorId } from "./editorSettingsDiscovery";
import {
  discoverEditorSettings,
  type EditorSettingsCandidate,
} from "./editorSettingsDiscovery";
import { promptForEditorSelection } from "./editorSetupPrompt";
import { syncSettingsFile } from "./settingsCopier";

interface SettingsSyncState {
  status: "configured" | "skipped" | "unavailable";
  editorId?: EditorId;
  sourcePath?: string;
  lastPromptedAt?: number;
  lastSyncedAt?: number;
  hash?: string;
  lastSourceModified?: number;
}

const DEFAULT_DEST_PATH = path.join(
  os.homedir(),
  ".cmux",
  "vscode",
  "settings.json"
);
const UNAVAILABLE_RETRY_MS = 24 * 60 * 60 * 1000;

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadState(statePath: string): Promise<SettingsSyncState | null> {
  try {
    const raw = await readFile(statePath, "utf8");
    return JSON.parse(raw) as SettingsSyncState;
  } catch {
    return null;
  }
}

async function saveState(
  statePath: string,
  state: SettingsSyncState
): Promise<void> {
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
}

async function syncFromSource(
  sourcePath: string,
  destinationPath: string,
  statePath: string,
  editorId?: EditorId,
  lastPromptedAt?: number
): Promise<boolean> {
  if (!(await fileExists(sourcePath))) {
    console.warn(
      `[cmux] VS Code settings source ${sourcePath} is missing. Re-run the import to pick a new editor.`
    );
    await saveState(statePath, {
      status: "skipped",
      lastPromptedAt: Date.now(),
    });
    return false;
  }

  try {
    const result = await syncSettingsFile({
      sourcePath,
      destinationPath,
    });

    if (result.updated) {
      console.log(
        `[cmux] Synced VS Code settings from ${sourcePath} -> ${destinationPath}`
      );
    }

    await saveState(statePath, {
      status: "configured",
      editorId,
      sourcePath,
      lastPromptedAt: lastPromptedAt ?? Date.now(),
      lastSyncedAt: Date.now(),
      hash: result.hash,
      lastSourceModified: result.lastModified,
    });
    return true;
  } catch (error) {
    console.warn(
      `[cmux] Failed to sync VS Code settings from ${sourcePath}: ${error}`
    );
    return false;
  }
}

async function runInteractiveSetup(statePath: string): Promise<void> {
  const candidates = await discoverEditorSettings();
  if (candidates.length === 0) {
    await saveState(statePath, {
      status: "unavailable",
      lastPromptedAt: Date.now(),
    });
    console.log(
      "[cmux] Couldn't find VS Code, Cursor, or Windsurf settings to import."
    );
    return;
  }

  const selection = await promptForEditorSelection(candidates);
  if (!selection) {
    await saveState(statePath, {
      status: "skipped",
      lastPromptedAt: Date.now(),
    });
    return;
  }

  await syncFromSource(
    selection.settingsPath,
    DEFAULT_DEST_PATH,
    statePath,
    selection.id,
    Date.now()
  );
}

export async function ensureEditorSettingsSynced(
  convexDir: string
): Promise<void> {
  if (process.env.CMUX_SKIP_SETTINGS_SYNC === "1") {
    return;
  }

  const statePath = path.join(convexDir, "settings-sync.json");
  const state = await loadState(statePath);

  if (state?.status === "configured" && state.sourcePath) {
    const synced = await syncFromSource(
      state.sourcePath,
      DEFAULT_DEST_PATH,
      statePath,
      state.editorId,
      state.lastPromptedAt
    );
    if (synced) {
      return;
    }
  }

  if (state?.status === "skipped") {
    return;
  }

  if (state?.status === "unavailable") {
    const lastPrompted = state.lastPromptedAt ?? 0;
    if (Date.now() - lastPrompted < UNAVAILABLE_RETRY_MS) {
      return;
    }
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return;
  }

  await runInteractiveSetup(statePath);
}
