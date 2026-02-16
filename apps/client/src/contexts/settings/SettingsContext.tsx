import { createContext, useContext } from "react";
import type { SettingsSection } from "@/components/settings/SettingsSidebar";

interface SettingsContextType {
  activeSection: SettingsSection;
  setActiveSection: (section: SettingsSection) => void;
}

export const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function useSettingsContext() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error(
      "useSettingsContext must be used within a SettingsContextProvider"
    );
  }
  return context;
}

export function useSettingsContextOptional() {
  return useContext(SettingsContext);
}
