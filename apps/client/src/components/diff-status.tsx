import { cn } from "@/lib/utils";
import type { ReplaceDiffEntry } from "@cmux/shared/diff-types";
import { FileCode, FileEdit, FileMinus, FilePlus, FileText } from "lucide-react";
import type { ReactNode } from "react";

const DEFAULT_ICON_CLASS = "w-3.5 h-3.5 flex-shrink-0";

type DiffStatus = ReplaceDiffEntry["status"];

type DiffStatusConfig = {
  colorClass: string;
  Icon: (props: { className?: string }) => ReactNode;
};

const STATUS_CONFIG: Record<DiffStatus | "default", DiffStatusConfig> = {
  added: {
    colorClass: "text-green-600 dark:text-green-400",
    Icon: ({ className }) => <FilePlus className={cn(DEFAULT_ICON_CLASS, className)} />,
  },
  deleted: {
    colorClass: "text-red-600 dark:text-red-400",
    Icon: ({ className }) => <FileMinus className={cn(DEFAULT_ICON_CLASS, className)} />,
  },
  modified: {
    colorClass: "text-yellow-600 dark:text-yellow-400",
    Icon: ({ className }) => <FileEdit className={cn(DEFAULT_ICON_CLASS, className)} />,
  },
  renamed: {
    colorClass: "text-blue-600 dark:text-blue-400",
    Icon: ({ className }) => <FileCode className={cn(DEFAULT_ICON_CLASS, className)} />,
  },
  default: {
    colorClass: "text-neutral-500 dark:text-neutral-400",
    Icon: ({ className }) => <FileText className={cn(DEFAULT_ICON_CLASS, className)} />,
  },
};

export function getDiffStatusColor(status: DiffStatus): string {
  return (STATUS_CONFIG[status] ?? STATUS_CONFIG.default).colorClass;
}

export function getDiffStatusIcon(status: DiffStatus, className?: string): ReactNode {
  return STATUS_CONFIG[status]?.Icon({ className }) ?? STATUS_CONFIG.default.Icon({ className });
}
