import { SettingInput } from "@/components/settings/SettingInput";
import { SettingSection } from "@/components/settings/SettingSection";
import { SettingSwitch } from "@/components/settings/SettingSwitch";

interface WorkspaceSectionProps {
  worktreePath: string;
  onWorktreePathChange: (value: string) => void;
  autoPrEnabled: boolean;
  onAutoPrEnabledChange: (value: boolean) => void;
  showWorktreePath: boolean;
}

export function WorkspaceSection({
  worktreePath,
  onWorktreePathChange,
  autoPrEnabled,
  onAutoPrEnabledChange,
  showWorktreePath,
}: WorkspaceSectionProps) {
  return (
    <SettingSection title="Workspace">
      {showWorktreePath ? (
        <SettingInput
          id="worktreePath"
          label="Worktree Location"
          description="Specify where to store git worktrees. Leave empty to use the default location (~\/cmux)."
          value={worktreePath}
          onChange={onWorktreePathChange}
          placeholder="~/my-custom-worktrees"
          autoComplete="off"
        />
      ) : null}

      <SettingSwitch
        label="Auto-create pull request with the best diff"
        description="After all agents finish, automatically create a pull request with the winning solution."
        ariaLabel="Auto-create pull request with the best diff"
        isSelected={autoPrEnabled}
        onValueChange={onAutoPrEnabledChange}
        noBorder
      />
    </SettingSection>
  );
}
