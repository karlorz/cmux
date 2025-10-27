import type { EnvVar } from "@/components/EnvironmentConfiguration";
import type { MorphSnapshotId } from "@cmux/shared";
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface EnvironmentConfigState {
  instanceId?: string;
  envName: string;
  envVars: EnvVar[];
  maintenanceScript: string;
  devScript: string;
  exposedPorts: string;
  selectedRepos: string[];
  snapshotId?: MorphSnapshotId;
}

interface EnvironmentConfigContextValue {
  getConfig: (instanceId?: string) => EnvironmentConfigState | undefined;
  saveConfig: (instanceId: string | undefined, config: EnvironmentConfigState) => void;
  clearConfig: (instanceId?: string) => void;
  clearAllConfigs: () => void;
}

const EnvironmentConfigContext = createContext<EnvironmentConfigContextValue | undefined>(
  undefined
);

export function EnvironmentConfigPersistenceProvider({ children }: { children: ReactNode }) {
  const [configs, setConfigs] = useState<Map<string, EnvironmentConfigState>>(new Map());

  const getConfig = useCallback(
    (instanceId?: string) => {
      const key = instanceId || "new";
      return configs.get(key);
    },
    [configs]
  );

  const saveConfig = useCallback(
    (instanceId: string | undefined, config: EnvironmentConfigState) => {
      const key = instanceId || "new";
      setConfigs((prev) => {
        const next = new Map(prev);
        next.set(key, config);
        return next;
      });
    },
    []
  );

  const clearConfig = useCallback((instanceId?: string) => {
    const key = instanceId || "new";
    setConfigs((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const clearAllConfigs = useCallback(() => {
    setConfigs(new Map());
  }, []);

  return (
    <EnvironmentConfigContext.Provider
      value={{ getConfig, saveConfig, clearConfig, clearAllConfigs }}
    >
      {children}
    </EnvironmentConfigContext.Provider>
  );
}

export function useEnvironmentConfigPersistence() {
  const context = useContext(EnvironmentConfigContext);
  if (!context) {
    throw new Error(
      "useEnvironmentConfigPersistence must be used within EnvironmentConfigPersistenceProvider"
    );
  }
  return context;
}
