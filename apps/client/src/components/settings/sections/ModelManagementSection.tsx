import { AgentLogo } from "@/components/icons/agent-logos";
import { SettingSection } from "@/components/settings/SettingSection";
import { api } from "@cmux/convex/api";
import type { AgentVendor } from "@cmux/shared/agent-catalog";
import { Switch } from "@heroui/react";
import { convexQuery } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useConvex } from "convex/react";
import { Search } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

// Model entry from Convex database
interface ModelEntry {
  _id: string;
  name: string;
  displayName: string;
  vendor: string;
  tier: "free" | "paid";
  enabled: boolean;
  tags?: string[];
  requiredApiKeys: string[];
  disabled?: boolean;
  sortOrder: number;
}

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

  // Query all models from Convex database (includes disabled and discovered models)
  const { data: convexModels, refetch: refetchModels } = useQuery(
    convexQuery(api.models.listAll, { teamSlugOrId })
  );

  // Query API keys to determine model availability
  const { data: apiKeys } = useQuery(
    convexQuery(api.apiKeys.getAll, { teamSlugOrId })
  );

  // Build a Set of configured API key env vars for efficient lookup
  const configuredApiKeys = useMemo(() => {
    if (!apiKeys) return new Set<string>();
    return new Set(apiKeys.map((k) => k.envVar));
  }, [apiKeys]);

  // Check if a model is available (required API key is configured)
  const isModelAvailable = useCallback(
    (entry: ModelEntry) => {
      // Free models are always available
      if (entry.tier === "free") return true;
      // If no API keys required, it's available
      if (!entry.requiredApiKeys || entry.requiredApiKeys.length === 0) return true;
      // Check if at least ONE of the required API keys is configured
      return entry.requiredApiKeys.some((requiredKey) =>
        configuredApiKeys.has(requiredKey)
      );
    },
    [configuredApiKeys]
  );

  // Mutation to toggle model enabled state via Convex
  const toggleModelMutation = useMutation({
    mutationFn: async ({
      modelName,
      enabled,
    }: {
      modelName: string;
      enabled: boolean;
    }) => {
      return await convex.mutation(api.models.setEnabled, {
        teamSlugOrId,
        modelName,
        enabled,
      });
    },
    onSuccess: () => {
      void refetchModels();
    },
    onError: (error) => {
      toast.error("Failed to update model");
      console.error("Toggle model error:", error);
    },
  });

  const handleToggleModel = useCallback(
    (modelName: string, enabled: boolean) => {
      toggleModelMutation.mutate({ modelName, enabled });
    },
    [toggleModelMutation]
  );

  // Filter and group models by vendor
  const filteredAndGroupedModels = useMemo(() => {
    if (!convexModels) return new Map<AgentVendor, ModelEntry[]>();

    const searchLower = searchQuery.toLowerCase();

    const filtered = convexModels.filter((entry) => {
      // Apply search filter
      if (searchQuery) {
        const matchesSearch =
          entry.name.toLowerCase().includes(searchLower) ||
          entry.displayName.toLowerCase().includes(searchLower) ||
          entry.vendor.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Apply disabled-only filter (enabled in DB means model is active)
      if (showDisabledOnly && entry.enabled) {
        return false;
      }

      return true;
    });

    // Group by vendor preserving sortOrder
    const grouped = new Map<AgentVendor, ModelEntry[]>();
    for (const entry of filtered) {
      const vendor = entry.vendor as AgentVendor;
      const existing = grouped.get(vendor);
      if (existing) {
        existing.push(entry);
      } else {
        grouped.set(vendor, [entry]);
      }
    }

    return grouped;
  }, [convexModels, searchQuery, showDisabledOnly]);

  const enabledCount = convexModels?.filter(m => m.enabled).length ?? 0;
  const totalCount = convexModels?.length ?? 0;

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
            {Array.from(filteredAndGroupedModels.entries()).map(
              ([vendor, entries]) => (
                <div key={vendor} className="space-y-2">
                  {/* Vendor header */}
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    {VENDOR_DISPLAY_NAMES[vendor]}
                  </h3>

                  {/* Model rows */}
                  <div className="rounded-lg border border-neutral-200 divide-y divide-neutral-200 dark:border-neutral-800 dark:divide-neutral-800">
                    {entries.map((entry) => {
                      const isEnabled = entry.enabled;
                      const isAvailable = isModelAvailable(entry);
                      const isToggling =
                        toggleModelMutation.isPending &&
                        toggleModelMutation.variables?.modelName === entry.name;

                      return (
                        <div
                          key={entry._id}
                          className={`flex items-center justify-between gap-4 px-3 py-2.5 ${
                            !isAvailable ? "opacity-50" : ""
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <AgentLogo
                              agentName={entry.name}
                              vendor={entry.vendor as AgentVendor}
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
                              {entry.tags?.includes("latest") && (
                                <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                  Latest
                                </span>
                              )}
                              {entry.tags?.includes("recommended") && (
                                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                  Recommended
                                </span>
                              )}
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
                              {!isAvailable && (
                                <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                  No API Key
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

            {filteredAndGroupedModels.size === 0 && (
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
