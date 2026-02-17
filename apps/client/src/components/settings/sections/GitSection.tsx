import { SettingRow } from "@/components/settings/SettingRow";
import { SettingSection } from "@/components/settings/SettingSection";
import { SettingSwitch } from "@/components/settings/SettingSwitch";

interface GitSectionProps {
  branchPrefix: string;
  onBranchPrefixChange: (value: string) => void;
  alwaysForcePush: boolean;
  onAlwaysForcePushChange: (value: boolean) => void;
}

export function GitSection({
  branchPrefix,
  onBranchPrefixChange,
  alwaysForcePush,
  onAlwaysForcePushChange,
}: GitSectionProps) {
  return (
    <SettingSection title="Git">
      <SettingRow
        label="Branch prefix"
        description="Prefix used when creating new branches in Codex"
      >
        <div className="w-full sm:w-[16rem]">
          <input
            type="text"
            id="branchPrefix"
            value={branchPrefix}
            onChange={(event) => onBranchPrefixChange(event.target.value)}
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            placeholder="cmux/"
            autoComplete="off"
          />
        </div>
      </SettingRow>

      <SettingSwitch
        label="Always force push"
        description="Force push when pushing branches. Use with caution."
        ariaLabel="Always force push"
        isSelected={alwaysForcePush}
        onValueChange={onAlwaysForcePushChange}
        noBorder
      />
    </SettingSection>
  );
}
