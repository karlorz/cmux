import { Link } from "@tanstack/react-router";
import { PanelLeft, Plus } from "lucide-react";
import type { CSSProperties } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { isElectron } from "@/lib/electron";

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
      className="w-12 flex flex-col items-center py-2 gap-2 bg-neutral-50 dark:bg-black shrink-0 h-dvh border-r border-neutral-200 dark:border-neutral-800"
      style={
        {
          WebkitAppRegion: "drag",
        } as CSSProperties
      }
    >
      {/* Traffic light spacing for Electron */}
      {isElectron && <div className="h-6" />}

      {/* Toggle button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onToggle}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors"
            style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
          >
            <PanelLeft
              className="w-4 h-4 text-neutral-700 dark:text-neutral-300"
              aria-hidden="true"
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          Show sidebar
        </TooltipContent>
      </Tooltip>

      {/* New task button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to="/$teamSlugOrId/dashboard"
            params={{ teamSlugOrId }}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors cursor-default"
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
  );
}
