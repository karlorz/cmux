import type { MorphInstance } from "./git";
import { singleQuote } from "./shell";

const CMUX_RUNTIME_DIR = "/var/tmp/cmux-scripts";
const MAINTENANCE_WINDOW_NAME = "maintenance";
const MAINTENANCE_SCRIPT_FILENAME = "maintenance.sh";
const DEV_WINDOW_NAME = "dev";
const DEV_SCRIPT_FILENAME = "dev.sh";

export type ScriptIdentifiers = {
  maintenance: {
    windowName: string;
    scriptPath: string;
  };
  dev: {
    windowName: string;
    scriptPath: string;
  };
};

export const allocateScriptIdentifiers = (): ScriptIdentifiers => {
  return {
    maintenance: {
      windowName: MAINTENANCE_WINDOW_NAME,
      scriptPath: `${CMUX_RUNTIME_DIR}/${MAINTENANCE_SCRIPT_FILENAME}`,
    },
    dev: {
      windowName: DEV_WINDOW_NAME,
      scriptPath: `${CMUX_RUNTIME_DIR}/${DEV_SCRIPT_FILENAME}`,
    },
  };
};

type ScriptResult = {
  maintenanceError: string | null;
  devError: string | null;
};

export async function runMaintenanceAndDevScripts({
  instance,
  maintenanceScript,
  devScript,
  identifiers: _identifiers,
}: {
  instance: MorphInstance;
  maintenanceScript?: string;
  devScript?: string;
  identifiers?: ScriptIdentifiers;
}): Promise<ScriptResult> {
  // identifiers parameter is kept for API compatibility but not used in the new implementation

  if (
    (!maintenanceScript || maintenanceScript.trim().length === 0) &&
    (!devScript || devScript.trim().length === 0)
  ) {
    return {
      maintenanceError: "Both maintenance and dev scripts are empty",
      devError: null,
    };
  }

  try {
    // Build the command to execute the bun script with proper escaping
    const escapedMaintenanceScript = maintenanceScript ? singleQuote(maintenanceScript) : "''";
    const escapedDevScript = devScript ? singleQuote(devScript) : "''";
    
    const command = `bun /root/workspace/cmux/scripts/start-maintenance-and-dev.ts ${escapedMaintenanceScript} ${escapedDevScript}`;
    
    console.log(`[COMBINED SCRIPT] Executing: ${command}`);
    
    // Execute the combined script with a single instance.exec call
    const result = await instance.exec(command);

    if (result.exit_code !== 0) {
      const stderr = result.stderr?.trim() || "";
      const stdout = result.stdout?.trim() || "";
      const errorMessage = [
        `Combined script execution failed with exit code ${result.exit_code}`,
        stderr ? `stderr: ${stderr}` : null,
        stdout ? `stdout: ${stdout}` : null,
      ].filter((part): part is string => part !== null).join(" | ");
      
      // Return error for both scripts since we can't determine which one failed
      return {
        maintenanceError: errorMessage,
        devError: errorMessage,
      };
    } else {
      console.log(`[COMBINED SCRIPT VERIFICATION]\n${result.stdout || ""}`);
      return {
        maintenanceError: null,
        devError: null,
      };
    }
  } catch (error) {
    const errorMessage = `Combined script execution failed: ${error instanceof Error ? error.message : String(error)}`;
    return {
      maintenanceError: errorMessage,
      devError: errorMessage,
    };
  }
}
