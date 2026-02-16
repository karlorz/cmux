import { ContainerSettings } from "@/components/ContainerSettings";
import { SettingSection } from "@/components/settings/SettingSection";

interface ContainersSectionProps {
  teamSlugOrId: string;
  onDataChange: (data: {
    maxRunningContainers: number;
    reviewPeriodMinutes: number;
    autoCleanupEnabled: boolean;
    stopImmediatelyOnCompletion: boolean;
    minContainersToKeep: number;
  }) => void;
}

export function ContainersSection({
  teamSlugOrId,
  onDataChange,
}: ContainersSectionProps) {
  return (
    <SettingSection title="Container Management">
      <div className="p-4">
        <ContainerSettings teamSlugOrId={teamSlugOrId} onDataChange={onDataChange} />
      </div>
    </SettingSection>
  );
}
