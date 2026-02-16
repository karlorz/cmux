import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Plus } from "lucide-react";

interface MainContentHeaderProps {
  onToggleSidebar: () => void;
  teamSlugOrId: string;
}

export function MainContentHeader({
  onToggleSidebar,
  teamSlugOrId,
}: MainContentHeaderProps) {
  return (
    <div className="absolute right-3 top-3 z-[var(--z-overlay)] flex flex-col gap-1">
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onToggleSidebar}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-800 dark:bg-black dark:text-neutral-300 dark:hover:bg-neutral-900"
            aria-label="Toggle sidebar"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">Toggle sidebar Ctrl+Shift+S</TooltipContent>
      </Tooltip>

      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <Link
            to="/$teamSlugOrId/dashboard"
            params={{ teamSlugOrId }}
            activeOptions={{ exact: true }}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-800 dark:bg-black dark:text-neutral-300 dark:hover:bg-neutral-900"
            aria-label="New task"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="left">New task</TooltipContent>
      </Tooltip>
    </div>
  );
}
