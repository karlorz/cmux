import type { ReactNode } from "react";
import { FloatingPane } from "@/components/floating-pane";
import { TitleBar } from "@/components/TitleBar";
import { SettingsSidebar, type SettingsTab } from "./SettingsSidebar";

interface SettingsLayoutProps {
  teamSlugOrId: string;
  activeSection: SettingsTab;
  onSectionChange: (section: SettingsTab) => void;
  children: ReactNode;
}

export function SettingsLayout({
  teamSlugOrId,
  activeSection,
  onSectionChange,
  children,
}: SettingsLayoutProps) {
  return (
    <FloatingPane header={<TitleBar title="Settings" />}>
      <div className="flex h-full min-h-0">
        <SettingsSidebar
          teamSlugOrId={teamSlugOrId}
          activeSection={activeSection}
          onSectionChange={onSectionChange}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </FloatingPane>
  );
}
