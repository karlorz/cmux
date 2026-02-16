import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSidebarOptional } from "@/contexts/sidebar/SidebarContext";
import { isElectron } from "@/lib/electron";
import { Link, useParams } from "@tanstack/react-router";
import { ChevronRight, Plus } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

export function TitleBar({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  const sidebar = useSidebarOptional();
  const params = useParams({ strict: false });
  const teamSlugOrId = params.teamSlugOrId as string | undefined;
  const showSidebarToggle = sidebar?.isHidden && teamSlugOrId;

  return (
    <div
      className="h-[38px] border-b border-neutral-200/70 dark:border-neutral-800/50 flex items-center justify-center relative select-none"
      style={{ WebkitAppRegion: "drag" } as CSSProperties}
    >
      {/* Left side: toggle icons when sidebar hidden - same X position as sidebar header icons */}
      {showSidebarToggle && (
        <div
          className={`absolute left-0 inset-y-0 flex items-center ${isElectron ? "" : "pl-3"}`}
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          {/* Match sidebar layout: [80px traffic] [logo ~16px] [gap 6px] [title ~60px] [ml-2 8px] = 170px electron, 90px web */}
          {isElectron && <div className="w-[80px]" />}
          <div className="w-[90px]" /> {/* Space for logo + gap + "cmux-next" + ml-2 */}

          <div className="flex items-center gap-1">
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => sidebar.setIsHidden(false)}
                  className="w-[25px] h-[25px] border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-900 rounded-lg flex items-center justify-center transition-colors cursor-default"
                  aria-label="Show sidebar"
                >
                  <ChevronRight
                    className="w-4 h-4 text-neutral-700 dark:text-neutral-300"
                    aria-hidden="true"
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Show sidebar Ctrl+Shift+S
              </TooltipContent>
            </Tooltip>

            <Link
              to="/$teamSlugOrId/dashboard"
              params={{ teamSlugOrId }}
              activeOptions={{ exact: true }}
              className="w-[25px] h-[25px] border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-900 rounded-lg flex items-center justify-center transition-colors cursor-default"
              title="New task"
            >
              <Plus
                className="w-4 h-4 text-neutral-700 dark:text-neutral-300"
                aria-hidden="true"
              />
            </Link>
          </div>
        </div>
      )}

      {/* Title - centered */}
      <div className="flex items-center text-xs font-medium text-neutral-900 dark:text-neutral-100">
        <span>{title}</span>
      </div>

      {/* Right side: actions */}
      {actions ? (
        <div
          className="absolute inset-y-0 right-3 flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}
