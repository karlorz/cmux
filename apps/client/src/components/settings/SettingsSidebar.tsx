import { Link } from "@tanstack/react-router";
import { ArrowLeft, KeyRound, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export type SettingsTab = "general" | "aiProviders";

interface SettingsSidebarProps {
  teamSlugOrId: string;
  activeSection: SettingsTab;
  onSectionChange: (section: SettingsTab) => void;
}

const navItems: Array<{
  id: SettingsTab;
  label: string;
  description: string;
  icon: typeof Settings;
}> = [
  {
    id: "general",
    label: "General",
    description: "Workspace, appearance, and app settings",
    icon: Settings,
  },
  {
    id: "aiProviders",
    label: "AI Providers",
    description: "API keys, base URLs, and provider status",
    icon: KeyRound,
  },
];

export function SettingsSidebar({
  teamSlugOrId,
  activeSection,
  onSectionChange,
}: SettingsSidebarProps) {
  return (
    <aside className="w-60 border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 p-3 flex flex-col gap-2">
      <Link
        to="/$teamSlugOrId/dashboard"
        params={{ teamSlugOrId }}
        className="inline-flex items-center gap-2 px-2.5 py-2 text-sm text-neutral-700 dark:text-neutral-300 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to app
      </Link>

      <nav className="mt-2 space-y-1" aria-label="Settings sections">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === activeSection;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSectionChange(item.id)}
              className={cn(
                "w-full text-left rounded-md px-2.5 py-2 transition-colors",
                isActive
                  ? "bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-sm"
                  : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              )}
            >
              <div className="flex items-start gap-2">
                <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                    {item.description}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
