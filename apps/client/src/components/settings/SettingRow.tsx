import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SettingRowProps {
  label: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  noBorder?: boolean;
}

export function SettingRow({
  label,
  description,
  children,
  className,
  noBorder = false,
}: SettingRowProps) {
  return (
    <div
      className={cn(
        "px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        !noBorder && "border-b border-neutral-200 dark:border-neutral-800",
        className
      )}
    >
      <div className="min-w-0 sm:max-w-[52%]">
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {label}
        </p>
        {description ? (
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {description}
          </p>
        ) : null}
      </div>
      <div className="w-full sm:w-[min(100%,440px)] sm:flex-shrink-0">{children}</div>
    </div>
  );
}
