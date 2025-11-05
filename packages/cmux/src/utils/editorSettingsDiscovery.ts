import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type EditorId = "vscode" | "cursor" | "windsurf";

export interface EditorSettingsCandidate {
  id: EditorId;
  label: string;
  settingsPath: string;
}

interface EditorDefinition {
  id: EditorId;
  label: string;
  configDirNames: string[];
}

const EDITORS: EditorDefinition[] = [
  {
    id: "vscode",
    label: "Visual Studio Code",
    configDirNames: ["Code", "Code - Insiders"],
  },
  {
    id: "cursor",
    label: "Cursor",
    configDirNames: ["Cursor"],
  },
  {
    id: "windsurf",
    label: "Windsurf",
    configDirNames: ["Windsurf"],
  },
];

function getBaseConfigDirs(): string[] {
  const home = os.homedir();
  if (process.platform === "darwin") {
    return [path.join(home, "Library", "Application Support")];
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return [appData];
  }
  return [path.join(home, ".config")];
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function discoverEditorSettings(): Promise<
  EditorSettingsCandidate[]
> {
  const baseDirs = getBaseConfigDirs();
  const candidates: EditorSettingsCandidate[] = [];
  const seen = new Set<string>();

  for (const editor of EDITORS) {
    for (const baseDir of baseDirs) {
      for (const configDir of editor.configDirNames) {
        const settingsPath = path.join(
          baseDir,
          configDir,
          "User",
          "settings.json"
        );
        if (seen.has(settingsPath)) {
          continue;
        }
        if (await fileExists(settingsPath)) {
          const label =
            configDir === editor.configDirNames[0]
              ? editor.label
              : `${editor.label} (${configDir})`;
          candidates.push({
            id: editor.id,
            label,
            settingsPath,
          });
          seen.add(settingsPath);
        }
      }
    }
  }

  return candidates;
}
