import {
  disableDragPointerEvents,
  restoreDragPointerEvents,
} from "@/lib/drag-pointer-events";
import { isElectron } from "@/lib/electron";
import { Link } from "@tanstack/react-router";
import clsx from "clsx";
import { ArrowLeft, Key, Settings } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
} from "react";

export type SettingsSection = "general" | "ai-providers";

interface SettingsSidebarProps {
  teamSlugOrId: string;
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
}

interface NavItem {
  id: SettingsSection;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}

const navItems: NavItem[] = [
  {
    id: "general",
    label: "General",
    icon: Settings,
  },
  {
    id: "ai-providers",
    label: "AI Providers",
    icon: Key,
  },
];

export function SettingsSidebar({
  teamSlugOrId,
  activeSection,
  onSectionChange,
}: SettingsSidebarProps) {
  const DEFAULT_WIDTH = 256;
  const MIN_WIDTH = 240;
  const MAX_WIDTH = 600;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const containerLeftRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);
  const [width, setWidth] = useState<number>(() => {
    const stored = localStorage.getItem("sidebarWidth");
    const parsed = stored ? Number.parseInt(stored, 10) : DEFAULT_WIDTH;
    if (Number.isNaN(parsed)) return DEFAULT_WIDTH;
    return Math.min(Math.max(parsed, MIN_WIDTH), MAX_WIDTH);
  });
  const [isResizing, setIsResizing] = useState(false);
  const [isHidden, setIsHidden] = useState(() => {
    const stored = localStorage.getItem("sidebarHidden");
    return stored === "true";
  });

  useEffect(() => {
    localStorage.setItem("sidebarWidth", String(width));
  }, [width]);

  useEffect(() => {
    localStorage.setItem("sidebarHidden", String(isHidden));
  }, [isHidden]);

  // Keyboard shortcut to toggle sidebar (Ctrl+Shift+S)
  useEffect(() => {
    if (isElectron && window.cmux?.on) {
      const off = window.cmux.on("shortcut:sidebar-toggle", () => {
        setIsHidden((prev) => !prev);
      });
      return () => {
        if (typeof off === "function") off();
      };
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.ctrlKey &&
        e.shiftKey &&
        !e.altKey &&
        !e.metaKey &&
        (e.code === "KeyS" || e.key.toLowerCase() === "s")
      ) {
        e.preventDefault();
        e.stopPropagation();
        setIsHidden((prev) => !prev);
      }
    };

    // Use capture phase to intercept before browser default handlers
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  // Listen for storage events from command bar (sidebar visibility sync)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "sidebarHidden" && e.newValue !== null) {
        setIsHidden(e.newValue === "true");
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const onMouseMove = useCallback((e: MouseEvent) => {
    // Batch width updates to once per animation frame to reduce layout thrash
    if (rafIdRef.current != null) return;
    rafIdRef.current = window.requestAnimationFrame(() => {
      rafIdRef.current = null;
      const containerLeft = containerLeftRef.current;
      const clientX = e.clientX;
      const newWidth = Math.min(
        Math.max(clientX - containerLeft, MIN_WIDTH),
        MAX_WIDTH
      );
      setWidth(newWidth);
    });
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
    document.body.style.cursor = "";
    document.body.classList.remove("select-none");
    document.body.classList.remove("cmux-sidebar-resizing");
    if (rafIdRef.current != null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    restoreDragPointerEvents();
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", stopResizing);
  }, [onMouseMove]);

  const startResizing = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsResizing(true);
      document.body.style.cursor = "col-resize";
      document.body.classList.add("select-none");
      document.body.classList.add("cmux-sidebar-resizing");
      // Snapshot the container's left position so we don't force layout on every move
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        containerLeftRef.current = rect.left;
      }
      disableDragPointerEvents();
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", stopResizing);
    },
    [onMouseMove, stopResizing]
  );

  useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [onMouseMove, stopResizing]);

  const resetWidth = useCallback(() => setWidth(DEFAULT_WIDTH), []);

  return (
    <div
      ref={containerRef}
      className="relative bg-neutral-50 dark:bg-black flex flex-col shrink-0 h-dvh grow pr-1 w-[75vw] snap-start snap-always md:w-auto md:snap-align-none"
      style={
        {
          display: isHidden ? "none" : "flex",
          width: undefined,
          minWidth: undefined,
          maxWidth: undefined,
          userSelect: isResizing ? ("none" as const) : undefined,
          "--sidebar-width": `${width}px`,
        } as CSSProperties
      }
    >
      <div
        className={`h-[38px] flex items-center pr-0.5 shrink-0 ${isElectron ? "" : "pl-3"}`}
        style={{ WebkitAppRegion: "drag" } as CSSProperties}
      >
        {isElectron && <div className="w-[80px]" />}
        <Link
          to="/$teamSlugOrId/dashboard"
          params={{ teamSlugOrId }}
          className="flex items-center gap-1.5 select-none cursor-pointer whitespace-nowrap text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          <ArrowLeft className="size-4" aria-hidden />
          <span className="text-xs font-medium">Back to app</span>
        </Link>
      </div>

      <nav className="grow flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto pb-8">
          <div className="px-3 py-2">
            <h2 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
              Settings
            </h2>
          </div>
          <ul className="flex flex-col gap-px">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSectionChange(item.id)}
                    className={clsx(
                      "w-full pointer-default cursor-default group flex items-center gap-2 rounded-sm pl-2 ml-2 py-1 text-[13px] text-neutral-900 select-none hover:bg-neutral-200/45 dark:text-neutral-100 dark:hover:bg-neutral-800/45 pr-2",
                      isActive &&
                        "bg-neutral-200/75 text-black dark:bg-neutral-800/65 dark:text-white hover:bg-neutral-200/75 dark:hover:bg-neutral-800/65"
                    )}
                    data-active={isActive || undefined}
                  >
                    <Icon
                      className={clsx(
                        "size-[15px] text-neutral-500 group-hover:text-neutral-800 dark:group-hover:text-neutral-100",
                        isActive &&
                          "text-neutral-900 dark:text-neutral-100"
                      )}
                      aria-hidden
                    />
                    <span>{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* Resize handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize"
        onMouseDown={startResizing}
        onDoubleClick={resetWidth}
        className="absolute top-0 right-0 h-full cursor-col-resize"
        style={
          {
            // Invisible, but with a comfortable hit area
            width: "14px",
            transform: "translateX(7px)",
            background: "transparent",
            zIndex: "var(--z-sidebar-resize-handle)",
          } as CSSProperties
        }
      />
    </div>
  );
}
