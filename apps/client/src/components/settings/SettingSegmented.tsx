import { cn } from "@/lib/utils";
import { SettingRow } from "./SettingRow";

interface SegmentedOption {
  value: string;
  label: string;
}

interface SettingSegmentedProps {
  label: string;
  description?: string;
  value: string;
  options: SegmentedOption[];
  onChange: (value: string) => void;
  noBorder?: boolean;
}

export function SettingSegmented({
  label,
  description,
  value,
  options,
  onChange,
  noBorder,
}: SettingSegmentedProps) {
  return (
    <SettingRow label={label} description={description} noBorder={noBorder}>
      <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-100 p-1 dark:border-neutral-800 dark:bg-neutral-900">
        {options.map((option) => {
          const isActive = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                isActive
                  ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200"
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </SettingRow>
  );
}
