import type { ReactNode } from "react";

interface SettingSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function SettingSection({
  title,
  description,
  children,
  className,
}: SettingSectionProps) {
  return (
    <div
      className={`bg-white dark:bg-neutral-950 rounded-lg border border-neutral-200 dark:border-neutral-800 ${className ?? ""}`}
    >
      <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
        <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {description}
          </p>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}
