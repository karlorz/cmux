import { ArrowLeft, Key, Settings } from "lucide-react";
import { Link } from "@tanstack/react-router";

export type SettingsSection = "general" | "ai-providers";

interface SettingsSidebarProps {
  teamSlugOrId: string;
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
}

interface NavItem {
  id: SettingsSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "ai-providers", label: "AI Providers", icon: Key },
];

export function SettingsSidebar({
  teamSlugOrId,
  activeSection,
  onSectionChange,
}: SettingsSidebarProps) {
  return (
    <div className="w-52 flex-shrink-0 border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50">
      <div className="p-4">
        {/* Back to app link */}
        <Link
          to="/$teamSlugOrId/dashboard"
          params={{ teamSlugOrId }}
          className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to app
        </Link>

        {/* Navigation */}
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSectionChange(item.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? "bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                    : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 hover:text-neutral-900 dark:hover:text-neutral-100"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
