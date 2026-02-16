import type { ReactNode } from "react";
import type { SettingsSection } from "@/components/settings/SettingsSidebar";
import { SettingsContext } from "./SettingsContext";

interface SettingsContextProviderProps {
  children: ReactNode;
  activeSection: SettingsSection;
  setActiveSection: (section: SettingsSection) => void;
}

export function SettingsContextProvider({
  children,
  activeSection,
  setActiveSection,
}: SettingsContextProviderProps) {
  return (
    <SettingsContext.Provider value={{ activeSection, setActiveSection }}>
      {children}
    </SettingsContext.Provider>
  );
}
