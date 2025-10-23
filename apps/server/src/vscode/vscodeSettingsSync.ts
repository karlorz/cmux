import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export interface VSCodeSettings {
  settings?: string; // JSON content
  keybindings?: string; // JSON content
}

/**
 * Get the platform-specific VS Code User directory path
 */
function getVSCodeUserDirectory(): string {
  const homeDir = os.homedir();
  const platform = os.platform();

  switch (platform) {
    case "darwin":
      return path.join(homeDir, "Library/Application Support/Code/User");
    case "win32":
      return path.join(process.env.APPDATA || homeDir, "Code/User");
    case "linux":
    default:
      return path.join(homeDir, ".config/Code/User");
  }
}

/**
 * Reads the user's local VS Code settings and keybindings
 * Returns null for files that don't exist
 */
export async function readUserVSCodeSettings(): Promise<VSCodeSettings> {
  const userDir = getVSCodeUserDirectory();
  const settingsPath = path.join(userDir, "settings.json");
  const keybindingsPath = path.join(userDir, "keybindings.json");

  const result: VSCodeSettings = {};

  // Read settings.json
  try {
    result.settings = await fs.readFile(settingsPath, "utf8");
  } catch (error) {
    // File doesn't exist or can't be read, skip
    console.log(`No VS Code settings found at ${settingsPath}`);
  }

  // Read keybindings.json
  try {
    result.keybindings = await fs.readFile(keybindingsPath, "utf8");
  } catch (error) {
    // File doesn't exist or can't be read, skip
    console.log(`No VS Code keybindings found at ${keybindingsPath}`);
  }

  return result;
}

/**
 * Writes user VS Code settings to a temporary directory for mounting
 * Returns the paths to the temp files
 */
export async function prepareUserSettingsForMount(
  instanceId: string
): Promise<{
  settingsPath?: string;
  keybindingsPath?: string;
}> {
  const userSettings = await readUserVSCodeSettings();
  const tempDir = path.join(os.tmpdir(), "cmux-vscode-settings");
  await fs.mkdir(tempDir, { recursive: true });

  const result: { settingsPath?: string; keybindingsPath?: string } = {};

  if (userSettings.settings) {
    const settingsPath = path.join(
      tempDir,
      `user-settings-${instanceId}.json`
    );
    await fs.writeFile(settingsPath, userSettings.settings);
    result.settingsPath = settingsPath;
  }

  if (userSettings.keybindings) {
    const keybindingsPath = path.join(
      tempDir,
      `user-keybindings-${instanceId}.json`
    );
    await fs.writeFile(keybindingsPath, userSettings.keybindings);
    result.keybindingsPath = keybindingsPath;
  }

  return result;
}
