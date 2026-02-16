import { ChevronDown } from "lucide-react";
import { SettingRow } from "./SettingRow";

interface SelectOption {
  value: string;
  label: string;
}

interface SettingSelectProps {
  id: string;
  label: string;
  description?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  noBorder?: boolean;
}

export function SettingSelect({
  id,
  label,
  description,
  value,
  options,
  onChange,
  noBorder,
}: SettingSelectProps) {
  return (
    <SettingRow label={label} description={description} noBorder={noBorder}>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none px-3 py-2 pr-10 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-900 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500 dark:text-neutral-400"
        />
      </div>
    </SettingRow>
  );
}
