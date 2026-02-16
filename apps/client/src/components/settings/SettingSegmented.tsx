import { SettingRow } from "./SettingRow";

interface SettingSegmentedOption {
  value: string;
  label: string;
}

interface SettingSegmentedProps {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  options: SettingSegmentedOption[];
  disabled?: boolean;
  className?: string;
}

export function SettingSegmented({
  label,
  description,
  value,
  onChange,
  options,
  disabled,
  className,
}: SettingSegmentedProps) {
  return (
    <SettingRow label={label} description={description} className={className}>
      <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 p-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            disabled={disabled}
            className={`px-3 py-1 text-sm font-medium rounded-md transition-all disabled:cursor-not-allowed ${
              value === option.value
                ? "bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-sm"
                : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </SettingRow>
  );
}
