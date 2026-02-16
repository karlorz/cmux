import { isElectron } from "@/lib/electron";
import { Link } from "@tanstack/react-router";
import { PanelLeft, Plus } from "lucide-react";
import type { CSSProperties } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/tooltip";

interface SidebarCollapsedBarProps {
  teamSlugOrId: string;
  onToggle: () => void;
}

export function SidebarCollapsedBar({
  teamSlugOrId,
  onToggle,
}: SidebarCollapsedBarProps) {
  return (
    <div
      data-onboarding="sidebar"
      className="relative bg-neutral-50 dark:bg-black flex shrink-0 h-dvh w-12 pr-1"
    >
      <div
        className="w-full flex flex-col items-center"
        style={{ WebkitAppRegion: "drag" } as CSSProperties}
      >
        <div className={isElectron ? "h-[48px]" : "h-2"} />

        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onToggle}
              className="w-[25px] h-[25px] border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-900 rounded-lg flex items-center justify-center transition-colors cursor-default"
              title="Show sidebar"
              style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
            >
              <PanelLeft
                className="w-3.5 h-3.5 text-neutral-700 dark:text-neutral-300"
                aria-hidden="true"
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            Show sidebar
          </TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Link
              to="/$teamSlugOrId/dashboard"
              params={{ teamSlugOrId }}
              activeOptions={{ exact: true }}
              className="mt-2 w-[25px] h-[25px] border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-900 rounded-lg flex items-center justify-center transition-colors cursor-default"
              title="New task"
              style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
            >
              <Plus
                className="w-4 h-4 text-neutral-700 dark:text-neutral-300"
                aria-hidden="true"
              />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            New task
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

export default SidebarCollapsedBar;
