import type { MorphInstance } from "./git";
import { singleQuote } from "./shell";

const WORKSPACE_ROOT = "/root/workspace";
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
  identifiers,
}: {
  instance: MorphInstance;
  maintenanceScript?: string;
  devScript?: string;
  identifiers?: ScriptIdentifiers;
}): Promise<ScriptResult> {
  const ids = identifiers ?? allocateScriptIdentifiers();

  if (
    (!maintenanceScript || maintenanceScript.trim().length === 0) &&
    (!devScript || devScript.trim().length === 0)
  ) {
    return {
      maintenanceError: "Both maintenance and dev scripts are empty",
      devError: null,
    };
  }

  // Build the command to run the bun script
  const scriptPath = "/root/workspace/cmux/scripts/start-dev-and-maintenance.ts";
  let command = `bun ${scriptPath}`;

  if (maintenanceScript && maintenanceScript.trim().length > 0) {
    command += ` --maintenance ${singleQuote(maintenanceScript)}`;
  }

  if (devScript && devScript.trim().length > 0) {
    command += ` --dev ${singleQuote(devScript)}`;
  }

  try {
    console.log(`[SCRIPT EXECUTION] Running unified script: ${command}`);
    const result = await instance.exec(command);

    if (result.exit_code !== 0) {
      const stderr = result.stderr?.trim() || "";
      const stdout = result.stdout?.trim() || "";
      
      // Try to parse JSON result from stdout
      let scriptResult: ScriptResult | null = null;
      try {
        const jsonMatch = stdout.match(/\{[^}]*\}/);
        if (jsonMatch) {
          scriptResult = JSON.parse(jsonMatch[0]);
        }
      } catch {
        // If JSON parsing fails, use the raw output
      }

      if (scriptResult) {
        return scriptResult;
      }

      // Fallback to error parsing
      const messageParts = [
        `Script execution failed with exit code ${result.exit_code}`,
        stderr ? `stderr: ${stderr}` : null,
        stdout ? `stdout: ${stdout}` : null,
      ].filter((part): part is string => part !== null);

      return {
        maintenanceError: messageParts.join(" | "),
        devError: messageParts.join(" | "),
      };
    } else {
      // Parse successful JSON result
      try {
        const jsonMatch = result.stdout?.match(/\{[^}]*\}/);
        if (jsonMatch) {
          const scriptResult = JSON.parse(jsonMatch[0]);
          console.log(`[SCRIPT EXECUTION] Maintenance: ${scriptResult.maintenanceError || 'success'}`);
          console.log(`[SCRIPT EXECUTION] Dev: ${scriptResult.devError || 'success'}`);
          return scriptResult;
        }
      } catch (error) {
        console.log(`[SCRIPT EXECUTION] Failed to parse JSON result: ${error}`);
      }

      console.log(`[SCRIPT EXECUTION VERIFICATION]\n${result.stdout || ""}`);
      return {
        maintenanceError: null,
        devError: null,
      };
    }
  } catch (error) {
    const errorMessage = `Script execution failed: ${error instanceof Error ? error.message : String(error)}`;
    console.error(`[SCRIPT EXECUTION ERROR] ${errorMessage}`);
    
    return {
      maintenanceError: errorMessage,
      devError: errorMessage,
    };
  }
}
