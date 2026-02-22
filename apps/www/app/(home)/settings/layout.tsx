"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Settings, Cpu } from "lucide-react";

const tabs = [
  {
    name: "Providers",
    href: "/settings/providers",
    icon: Settings,
    description: "Configure API keys and provider connections",
  },
  {
    name: "Models",
    href: "/settings/models",
    icon: Cpu,
    description: "Manage available models and preferences",
  },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-white">Settings</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Configure providers and models for your workspace
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6 border-b border-neutral-800">
          <nav className="-mb-px flex gap-6" aria-label="Settings tabs">
            {tabs.map((tab) => {
              const isActive = pathname === tab.href;
              return (
                <Link
                  key={tab.name}
                  href={tab.href}
                  className={cn(
                    "group flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-colors",
                    isActive
                      ? "border-white text-white"
                      : "border-transparent text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
                  )}
                >
                  <tab.icon
                    className={cn(
                      "h-4 w-4",
                      isActive ? "text-white" : "text-neutral-500 group-hover:text-neutral-300"
                    )}
                  />
                  {tab.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <main>{children}</main>
      </div>
    </div>
  );
}
