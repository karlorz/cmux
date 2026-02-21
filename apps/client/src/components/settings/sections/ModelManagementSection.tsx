import { AgentLogo } from "@/components/icons/agent-logos";
import { SettingSection } from "@/components/settings/SettingSection";
import { api } from "@cmux/convex/api";
import {
  AGENT_CATALOG,
  type AgentCatalogEntry,
  type AgentVendor,
} from "@cmux/shared/agent-catalog";
import { Switch } from "@heroui/react";
import { convexQuery } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useConvex } from "convex/react";
import { Search } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

interface ModelManagementSectionProps {
  teamSlugOrId: string;
}

const VENDOR_DISPLAY_NAMES: Record<AgentVendor, string> = {
  anthropic: "Claude",
  openai: "OpenAI / Codex",
  google: "Gemini",
  opencode: "OpenCode",
  qwen: "Qwen",
  cursor: "Cursor",
  amp: "Amp",
  xai: "xAI",
  openrouter: "OpenRouter",
};

export function ModelManagementSection({
  teamSlugOrId,
}: ModelManagementSectionProps) {
  const convex = useConvex();
  const [searchQuery, setSearchQuery] = useState("");
  const [showDisabledOnly, setShowDisabledOnly] = useState(false);

  // Query current model preferences
  const { data: modelPreferences, refetch: refetchPreferences } = useQuery(
    convexQuery(api.modelPreferences.get, { teamSlugOrId })
  );

  const disabledModels = useMemo(
    () => new Set(modelPreferences?.disabledModels ?? []),
    [modelPreferences?.disabledModels]
  );

  // Mutation to toggle model
  const toggleModelMutation = useMutation({
    mutationFn: async ({
      agentName,
      enabled,
    }: {
      agentName: string;
      enabled: boolean;
    }) => {
      return await convex.mutation(api.modelPreferences.toggleModel, {
        teamSlugOrId,
        agentName,
        enabled,
      });
    },
    onSuccess: () => {
      void refetchPreferences();
    },
    onError: (error) => {
      toast.error("Failed to update model preference");
      console.error("Toggle model error:", error);
    },
  });

  const handleToggleModel = useCallback(
    (agentName: string, enabled: boolean) => {
      toggleModelMutation.mutate({ agentName, enabled });
    },
    [toggleModelMutation]
  );

  // Filter and group agents by vendor
  const filteredAndGroupedAgents = useMemo(() => {
    const searchLower = searchQuery.toLowerCase();

    const filtered = AGENT_CATALOG.filter((entry) => {
      // Apply search filter
      if (searchQuery) {
        const matchesSearch =
          entry.name.toLowerCase().includes(searchLower) ||
          entry.displayName.toLowerCase().includes(searchLower) ||
          entry.vendor.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Apply disabled-only filter
      if (showDisabledOnly && !disabledModels.has(entry.name)) {
        return false;
      }

      return true;
    });

    // Group by vendor preserving catalog order
    const grouped = new Map<AgentVendor, AgentCatalogEntry[]>();
    for (const entry of filtered) {
      const existing = grouped.get(entry.vendor);
      if (existing) {
        existing.push(entry);
      } else {
        grouped.set(entry.vendor, [entry]);
      }
    }

    return grouped;
  }, [searchQuery, showDisabledOnly, disabledModels]);

  const enabledCount = AGENT_CATALOG.length - disabledModels.size;
  const totalCount = AGENT_CATALOG.length;

  return (
    <div className="space-y-4">
      <SettingSection
        title="Model Management"
        description={`${enabledCount} of ${totalCount} models enabled`}
      >
        <div className="p-4 space-y-4">
          {/* Search and filter controls */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search models..."
                className="w-full rounded-lg border border-neutral-300 bg-white py-2 pl-10 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
              <input
                type="checkbox"
                checked={showDisabledOnly}
                onChange={(e) => setShowDisabledOnly(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-800"
              />
              Show disabled only
            </label>
          </div>

          {/* Model list grouped by vendor */}
          <div className="space-y-4">
            {Array.from(filteredAndGroupedAgents.entries()).map(
              ([vendor, entries]) => (
                <div key={vendor} className="space-y-2">
                  {/* Vendor header */}
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    {VENDOR_DISPLAY_NAMES[vendor]}
                  </h3>

                  {/* Model rows */}
                  <div className="rounded-lg border border-neutral-200 divide-y divide-neutral-200 dark:border-neutral-800 dark:divide-neutral-800">
                    {entries.map((entry) => {
                      const isEnabled = !disabledModels.has(entry.name);
                      const isToggling =
                        toggleModelMutation.isPending &&
                        toggleModelMutation.variables?.agentName === entry.name;

                      return (
                        <div
                          key={entry.name}
                          className="flex items-center justify-between gap-4 px-3 py-2.5"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <AgentLogo
                              agentName={entry.name}
                              vendor={entry.vendor}
                              className="h-5 w-5 flex-shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                                {entry.displayName}
                              </p>
                              <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                                {entry.name}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 flex-shrink-0">
                            {/* Tags */}
                            <div className="hidden sm:flex items-center gap-1">
                              {entry.tier === "free" && (
                                <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                  Free
                                </span>
                              )}
                              {entry.tags?.includes("reasoning") && (
                                <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                                  Reasoning
                                </span>
                              )}
                              {entry.disabled && (
                                <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                                  N/A
                                </span>
                              )}
                            </div>

                            {/* Enable/Disable toggle */}
                            <Switch
                              aria-label={`Enable ${entry.displayName}`}
                              size="sm"
                              color="primary"
                              isSelected={isEnabled}
                              isDisabled={isToggling}
                              onValueChange={(enabled) =>
                                handleToggleModel(entry.name, enabled)
                              }
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
            )}

            {filteredAndGroupedAgents.size === 0 && (
              <div className="rounded-lg border border-dashed border-neutral-300 px-4 py-8 text-center dark:border-neutral-700">
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {searchQuery || showDisabledOnly
                    ? "No models match your filters"
                    : "No models available"}
                </p>
              </div>
            )}
          </div>
        </div>
      </SettingSection>
    </div>
  );
}
