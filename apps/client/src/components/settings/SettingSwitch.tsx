import { Switch } from "@heroui/react";
import { SettingRow } from "./SettingRow";

interface SettingSwitchProps {
  label: string;
  description?: string;
  ariaLabel: string;
  isSelected: boolean;
  onValueChange: (value: boolean) => void;
  isDisabled?: boolean;
  noBorder?: boolean;
}

export function SettingSwitch({
  label,
  description,
  ariaLabel,
  isSelected,
  onValueChange,
  isDisabled,
  noBorder,
}: SettingSwitchProps) {
  return (
    <SettingRow label={label} description={description} noBorder={noBorder}>
      <div className="flex items-center justify-start sm:justify-end">
        <Switch
          size="sm"
          color="primary"
          aria-label={ariaLabel}
          isSelected={isSelected}
          isDisabled={isDisabled}
          onValueChange={onValueChange}
        />
      </div>
    </SettingRow>
  );
}
