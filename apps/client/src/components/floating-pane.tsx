import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSidebarOptional } from "@/contexts/sidebar/SidebarContext";
import { isElectron } from "@/lib/electron";
import { useParams } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { CSSProperties } from "react";
import CmuxLogoMark from "./logo/cmux-logo-mark";

const FLOATING_SIDEBAR_TOGGLE_LEFT_OFFSET = "0px";

export function FloatingPane({
  children,
  header,
}: {
  children?: React.ReactNode;
  header?: React.ReactNode;
}) {
  const sidebar = useSidebarOptional();
  const params = useParams({ strict: false });
  const teamSlugOrId = params.teamSlugOrId as string | undefined;
  const showFloatingSidebarToggle =
    !header && Boolean(sidebar?.isHidden) && Boolean(teamSlugOrId);

  return (
    <div className="relative py-1.5 px-1.5 grow h-dvh flex flex-col bg-neutral-50 min-w-0 min-h-0 dark:bg-black">
      {showFloatingSidebarToggle ? (
        <div
          className={`pointer-events-none absolute top-3 z-[var(--z-overlay)] flex items-center ${isElectron ? "" : "pl-3"}`}
          style={{
            left: FLOATING_SIDEBAR_TOGGLE_LEFT_OFFSET,
            WebkitAppRegion: "no-drag",
          } as CSSProperties}
        >
          {isElectron && <div className="w-[80px]" />}
          <div className="flex items-center gap-1.5 invisible" aria-hidden="true">
            <CmuxLogoMark height={20} />
            <span className="text-xs font-semibold tracking-wide whitespace-nowrap">
              cmux-next
            </span>
          </div>

          <div
            className="ml-2 pointer-events-auto"
            style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
          >
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    sidebar?.setIsHidden(false);
                  }}
                  className="w-[25px] h-[25px] border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-900 rounded-lg flex items-center justify-center transition-colors cursor-default bg-white/80 dark:bg-neutral-900/80 backdrop-blur"
                  aria-label="Show sidebar"
                  style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
                >
                  <ChevronRight
                    className="w-4 h-4 text-neutral-700 dark:text-neutral-300"
                    aria-hidden="true"
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Show sidebar Ctrl+Shift+S</TooltipContent>
            </Tooltip>
          </div>
        </div>
      ) : null}

      <div className="rounded-md border border-neutral-200/70 dark:border-neutral-800/50 flex flex-col grow min-h-0 h-full overflow-hidden bg-white dark:bg-neutral-900">
        {header ? <div className="flex-shrink-0">{header}</div> : null}
        <div className="flex-1 overflow-y-auto min-h-0">{children}</div>
      </div>
    </div>
  );
}
