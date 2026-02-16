import { Switch } from "@heroui/react";
import { SettingRow } from "./SettingRow";

interface SettingSwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function SettingSwitch({
  label,
  description,
  checked,
  onChange,
  disabled,
  className,
}: SettingSwitchProps) {
  return (
    <SettingRow label={label} description={description} className={className}>
      <Switch
        aria-label={label}
        size="sm"
        color="primary"
        isSelected={checked}
        onValueChange={onChange}
        isDisabled={disabled}
      />
    </SettingRow>
  );
}
