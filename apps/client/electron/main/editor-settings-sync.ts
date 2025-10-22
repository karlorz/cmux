import { promises as fs } from "node:fs";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

export type EditorId = "vscode" | "cursor" | "windsurf";

interface EditorDef {
  id: EditorId;
  labels: string[];
  cliCandidates: string[];
  extDirs: string[];
}

interface ExportedArtifacts {
  settings?: string;
  keybindings?: string;
  snippets?: string[];
  extensions?: string;
}

export interface ExportEntry {
  userDir?: string;
  found: boolean;
  settingsPath?: string;
  keybindingsPath?: string;
  settingsMtimeISO?: string;
  settingsMtimeMs?: number;
  snippetSources?: string[];
  exports: ExportedArtifacts;
  notes?: string[];
}

export interface SyncSummary {
  exportedAtISO: string;
  exportedAtEpochMs: number;
  editors: Record<EditorId, ExportEntry>;
  guessedDefaultEditor: EditorId | null;
  copiedToOpenVSCode: boolean;
  openVSCodeTarget?: {
    userDir: string;
    profileDir: string;
    snippetsDir: string;
  };
}

export interface SyncLogger {
  log(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

const home = os.homedir();

function isMac(): boolean {
  return process.platform === "darwin";
}

function isWin(): boolean {
  return process.platform === "win32";
}

function candidateUserDir(appFolderName: string): string {
  if (isMac()) {
    return path.join(home, "Library", "Application Support", appFolderName, "User");
  }
  if (isWin()) {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(appData, appFolderName, "User");
  }
  return path.join(home, ".config", appFolderName, "User");
}

function macAppBin(appName: string, bin: string): string {
  return path.join(
    "/Applications",
    `${appName}.app`,
    "Contents",
    "Resources",
    "app",
    "bin",
    bin,
  );
}

const editors: EditorDef[] = [
  {
    id: "vscode",
    labels: ["Code", "Code - Insiders", "VSCodium"],
    cliCandidates: [
      "code",
      "code-insiders",
      "codium",
      macAppBin("Visual Studio Code", "code"),
      macAppBin("Visual Studio Code - Insiders", "code-insiders"),
      macAppBin("VSCodium", "codium"),
    ],
    extDirs: [
      path.join(home, ".vscode", "extensions"),
      path.join(home, ".vscode-insiders", "extensions"),
      path.join(home, ".vscodium", "extensions"),
    ],
  },
  {
    id: "cursor",
    labels: ["Cursor"],
    cliCandidates: [
      "cursor",
      macAppBin("Cursor", "cursor"),
    ],
    extDirs: [path.join(home, ".cursor", "extensions")],
  },
  {
    id: "windsurf",
    labels: ["Windsurf"],
    cliCandidates: [
      "windsurf",
      macAppBin("Windsurf", "windsurf"),
    ],
    extDirs: [path.join(home, ".windsurf", "extensions")],
  },
];

function listJsonFilesSync(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((file) => file.toLowerCase().endsWith(".json"))
      .map((file) => path.join(dir, file));
  } catch {
    return [];
  }
}

function runCliListExtensions(cliCandidates: string[], logger?: SyncLogger): string[] | undefined {
  for (const cli of cliCandidates) {
    try {
      if (!cli) continue;
      if (path.isAbsolute(cli) && !existsSync(cli)) continue;
      const out = execFileSync(cli, ["--list-extensions", "--show-versions"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const lines = out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (lines.length > 0) return lines;
    } catch (error) {
      logger?.warn(`Extension CLI failed for ${cli}`, error instanceof Error ? error : { error });
    }
  }
  return undefined;
}

function listExtensionsFromDirs(dirs: string[]): string[] | undefined {
  const names = new Set<string>();
  for (const dir of dirs) {
    try {
      if (!existsSync(dir)) continue;
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const trimmed = entry.name.trim();
          if (trimmed.length > 0 && !trimmed.startsWith(".")) {
            names.add(trimmed);
          }
        }
      }
    } catch {
      // ignore per-directory errors
    }
  }
  if (names.size === 0) return undefined;
  return Array.from(names).sort();
}

async function exportEditor(
  def: EditorDef,
  exportDir: string,
  logger?: SyncLogger,
): Promise<ExportEntry> {
  const result: ExportEntry = {
    found: false,
    exports: {},
    notes: [],
  };

  let userDir: string | undefined;
  for (const label of def.labels) {
    const candidate = candidateUserDir(label);
    if (existsSync(candidate)) {
      userDir = candidate;
      break;
    }
  }

  if (!userDir) {
    result.notes?.push(`User dir not found for labels: ${def.labels.join(", ")}`);
    return result;
  }

  result.found = true;
  result.userDir = userDir;

  const settingsSrc = path.join(userDir, "settings.json");
  const keybindingsSrc = path.join(userDir, "keybindings.json");
  const snippetsDir = path.join(userDir, "snippets");
  const prefix = def.id;

  await fs.mkdir(exportDir, { recursive: true });

  if (existsSync(settingsSrc)) {
    const settingsDest = path.join(exportDir, `${prefix}.settings.json`);
    await fs.copyFile(settingsSrc, settingsDest);
    result.exports.settings = path.basename(settingsDest);
    result.settingsPath = settingsSrc;
    try {
      const stat = await fs.stat(settingsSrc);
      result.settingsMtimeMs = stat.mtimeMs;
      result.settingsMtimeISO = new Date(stat.mtimeMs).toISOString();
    } catch (error) {
      logger?.warn(`Failed to stat settings for ${def.id}`, error);
    }
  } else {
    result.notes?.push("settings.json not found");
  }

  if (existsSync(keybindingsSrc)) {
    const keybindingsDest = path.join(exportDir, `${prefix}.keybindings.json`);
    await fs.copyFile(keybindingsSrc, keybindingsDest);
    result.exports.keybindings = path.basename(keybindingsDest);
    result.keybindingsPath = keybindingsSrc;
  }

  if (existsSync(snippetsDir)) {
    const snippetFiles = listJsonFilesSync(snippetsDir);
    if (snippetFiles.length > 0) {
      const snippetTargets: string[] = [];
      for (const source of snippetFiles) {
        const dest = path.join(exportDir, `${prefix}.snippet.${path.basename(source)}`);
        await fs.copyFile(source, dest);
        snippetTargets.push(path.basename(dest));
      }
      result.exports.snippets = snippetTargets;
      result.snippetSources = snippetFiles;
    }
  }

  let extensions = runCliListExtensions(def.cliCandidates, logger);
  if (!extensions) {
    extensions = listExtensionsFromDirs(def.extDirs);
    if (extensions) {
      result.notes?.push("extensions from directory fallback");
    }
  }
  if (extensions) {
    const extFile = path.join(exportDir, `${prefix}.extensions.json`);
    await fs.writeFile(extFile, JSON.stringify(extensions, null, 2));
    result.exports.extensions = path.basename(extFile);
  }

  return result;
}

async function copyEditorSettingsToOpenVSCode(
  entry: ExportEntry,
  logger?: SyncLogger,
): Promise<{
  userDir: string;
  profileDir: string;
  snippetsDir: string;
}> {
  const baseDir = path.join(home, ".openvscode-server", "data");
  const userDir = path.join(baseDir, "User");
  const profileDir = path.join(userDir, "profiles", "default-profile");
  const snippetsDir = path.join(userDir, "snippets");

  await fs.mkdir(userDir, { recursive: true });
  await fs.mkdir(profileDir, { recursive: true });
  await fs.mkdir(snippetsDir, { recursive: true });

  if (entry.settingsPath) {
    const dest = path.join(userDir, "settings.json");
    const profileDest = path.join(profileDir, "settings.json");
    await fs.copyFile(entry.settingsPath, dest);
    await fs.copyFile(entry.settingsPath, profileDest);
  } else {
    logger?.warn("No settings path to copy", { entry });
  }

  if (entry.keybindingsPath) {
    const dest = path.join(userDir, "keybindings.json");
    await fs.copyFile(entry.keybindingsPath, dest);
  }

  if (entry.snippetSources && entry.snippetSources.length > 0) {
    for (const source of entry.snippetSources) {
      const filename = path.basename(source);
      const dest = path.join(snippetsDir, filename);
      try {
        await fs.copyFile(source, dest);
      } catch (error) {
        logger?.warn(`Failed to copy snippet ${filename}`, error);
      }
    }
  }

  return { userDir, profileDir, snippetsDir };
}

export async function syncEditorSettings(options: {
  exportDir: string;
  logger?: SyncLogger;
}): Promise<SyncSummary> {
  const { exportDir, logger } = options;
  await fs.mkdir(exportDir, { recursive: true });

  const startedAt = new Date();
  const makeEntry = (): ExportEntry => ({ found: false, exports: {}, notes: [] });
  const results: Record<EditorId, ExportEntry> = {
    vscode: makeEntry(),
    cursor: makeEntry(),
    windsurf: makeEntry(),
  };

  for (const def of editors) {
    const entry = await exportEditor(def, exportDir, logger);
    results[def.id] = entry;
    logger?.log(`[settings-sync] ${def.id}`, { found: entry.found });
  }

  let guess: EditorId | null = null;
  let best = -Infinity;
  for (const id of Object.keys(results) as EditorId[]) {
    const entry = results[id];
    if (entry.settingsMtimeMs && entry.settingsMtimeMs > best) {
      best = entry.settingsMtimeMs;
      guess = id;
    }
  }

  const files = await fs.readdir(exportDir);
  const jsonFiles = files.filter((file) => file.endsWith(".json"));
  const indexMap = new Map<string, string[]>();
  for (const file of jsonFiles) {
    const key = file.split(".")[0];
    const arr = indexMap.get(key) ?? [];
    arr.push(file);
    indexMap.set(key, arr);
  }
  const index: Record<string, string[]> = Object.fromEntries(
    Array.from(indexMap.entries()).map(([key, value]) => [key, value.sort()]),
  );

  const summary: SyncSummary = {
    exportedAtISO: startedAt.toISOString(),
    exportedAtEpochMs: startedAt.getTime(),
    editors: results,
    guessedDefaultEditor: guess,
    copiedToOpenVSCode: false,
  };

  await fs.writeFile(path.join(exportDir, "summary.json"), JSON.stringify(summary, null, 2));
  await fs.writeFile(path.join(exportDir, "index.json"), JSON.stringify(index, null, 2));

  if (guess) {
    const entry = results[guess];
    if (entry.found) {
      const target = await copyEditorSettingsToOpenVSCode(entry, logger);
      summary.copiedToOpenVSCode = true;
      summary.openVSCodeTarget = target;
    } else {
      logger?.warn("Guessed editor not found, skipping copy", { guess });
    }
  } else {
    logger?.warn("No editor settings found; cannot copy to openvscode");
  }

  await fs.writeFile(path.join(exportDir, "summary.json"), JSON.stringify(summary, null, 2));

  return summary;
}

export function defaultSyncLogger(): SyncLogger {
  return {
    log(message: string, meta?: unknown) {
      if (typeof meta === "undefined") {
        console.log(message);
      } else {
        console.log(message, meta);
      }
    },
    warn(message: string, meta?: unknown) {
      if (typeof meta === "undefined") {
        console.warn(message);
      } else {
        console.warn(message, meta);
      }
    },
    error(message: string, meta?: unknown) {
      if (typeof meta === "undefined") {
        console.error(message);
      } else {
        console.error(message, meta);
      }
    },
  };
}
