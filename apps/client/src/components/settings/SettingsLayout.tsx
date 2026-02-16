import type { ReactNode } from "react";
import { FloatingPane } from "@/components/floating-pane";
import { TitleBar } from "@/components/TitleBar";
import { SettingsSidebar, type SettingsSection } from "./SettingsSidebar";

interface SettingsLayoutProps {
  teamSlugOrId: string;
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function SettingsLayout({
  teamSlugOrId,
  activeSection,
  onSectionChange,
  children,
  footer,
}: SettingsLayoutProps) {
  return (
    <FloatingPane header={<TitleBar title="Settings" />}>
      <div className="flex flex-1 min-h-0">
        <SettingsSidebar
          teamSlugOrId={teamSlugOrId}
          activeSection={activeSection}
          onSectionChange={onSectionChange}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-auto">
            <div className="p-6 max-w-3xl">{children}</div>
          </div>
          {footer}
        </div>
      </div>
    </FloatingPane>
  );
}
