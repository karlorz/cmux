import { ChevronDown } from "lucide-react";
import { SettingRow } from "./SettingRow";

interface SettingSelectOption {
  value: string;
  label: string;
}

interface SettingSelectProps {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  options: SettingSelectOption[];
  disabled?: boolean;
  className?: string;
}

export function SettingSelect({
  label,
  description,
  value,
  onChange,
  options,
  disabled,
  className,
}: SettingSelectProps) {
  return (
    <SettingRow label={label} description={description} className={className}>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-neutral-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500 dark:text-neutral-400"
          aria-hidden
        />
      </div>
    </SettingRow>
  );
}
