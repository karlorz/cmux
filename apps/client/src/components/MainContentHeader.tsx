import { Link } from "@tanstack/react-router";
import clsx from "clsx";
import { PanelLeft, Plus } from "lucide-react";

interface MainContentHeaderProps {
  onToggleSidebar: () => void;
  teamSlugOrId: string;
}

const buttonClassName = clsx(
  "w-[28px] h-[28px] flex items-center justify-center rounded-lg",
  "border border-neutral-200 dark:border-neutral-800",
  "bg-white dark:bg-black",
  "text-neutral-600 dark:text-neutral-400",
  "hover:bg-neutral-100 dark:hover:bg-neutral-900",
  "hover:text-neutral-800 dark:hover:text-neutral-200",
  "transition-colors cursor-default"
);

/**
 * Floating header shown in the main content area when the sidebar is hidden.
 * Contains toggle sidebar button and new task button.
 */
export function MainContentHeader({
  onToggleSidebar,
  teamSlugOrId,
}: MainContentHeaderProps) {
  return (
    <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
      <button
        onClick={onToggleSidebar}
        className={buttonClassName}
        title="Toggle sidebar (Ctrl+Shift+S)"
      >
        <PanelLeft className="w-4 h-4" aria-hidden="true" />
      </button>
      <Link
        to="/$teamSlugOrId/dashboard"
        params={{ teamSlugOrId }}
        activeOptions={{ exact: true }}
        className={buttonClassName}
        title="New task"
      >
        <Plus className="w-4 h-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
