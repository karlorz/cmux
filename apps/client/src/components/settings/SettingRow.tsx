import type { ReactNode } from "react";

interface SettingRowProps {
  label: string;
  description?: string;
  children: ReactNode;
  noBorder?: boolean;
}

export function SettingRow({
  label,
  description,
  children,
  noBorder = false,
}: SettingRowProps) {
  return (
    <div
      className={`flex items-center justify-between py-4 px-4 ${
        noBorder
          ? ""
          : "border-b border-neutral-200 dark:border-neutral-800 last:border-b-0"
      }`}
    >
      <div className="flex flex-col gap-0.5 pr-4">
        <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {label}
        </span>
        {description && (
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {description}
          </span>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
