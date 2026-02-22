"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useUser } from "@stackframe/stack";
import {
  Search,
  Loader2,
  RefreshCw,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Model = {
  _id: string;
  name: string;
  displayName: string;
  vendor: string;
  source: "curated" | "discovered";
  discoveredFrom?: string;
  requiredApiKeys: string[];
  tier: "free" | "paid";
  tags: string[];
  enabled: boolean;
  sortOrder: number;
  disabled?: boolean;
  disabledReason?: string;
};

type ProviderStatus = {
  id: string;
  name: string;
  isAvailable: boolean;
  source: "apiKeys" | "oauth" | "free" | null;
  configuredKeys: string[];
  requiredKeys: string[];
};

const VENDOR_DISPLAY_NAMES: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  openrouter: "OpenRouter",
  xai: "xAI",
  modelstudio: "Alibaba",
  opencode: "OpenCode",
};

const FILTER_OPTIONS = {
  source: [
    { value: "all", label: "All Sources" },
    { value: "curated", label: "Curated" },
    { value: "discovered", label: "Discovered" },
  ],
  tier: [
    { value: "all", label: "All Tiers" },
    { value: "free", label: "Free" },
    { value: "paid", label: "Paid" },
  ],
};

export function ModelsClient() {
  const user = useUser();
  const [models, setModels] = useState<Model[]>([]);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "curated" | "discovered">("all");
  const [tierFilter, setTierFilter] = useState<"all" | "free" | "paid">("all");
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [teamSlugOrId, setTeamSlugOrId] = useState<string | null>(null);
  const [togglingModel, setTogglingModel] = useState<string | null>(null);

  // Get team from user
  useEffect(() => {
    const fetchTeam = async () => {
      if (!user) return;
      try {
        const teams = await user.listTeams();
        if (teams.length > 0) {
          const team = teams[0];
          setTeamSlugOrId(team.id);
        }
      } catch (err) {
        console.error("Failed to fetch teams:", err);
      }
    };
    void fetchTeam();
  }, [user]);

  // Fetch models and provider status
  const fetchData = useCallback(async () => {
    if (!teamSlugOrId) return;

    setIsLoading(true);
    setError(null);

    try {
      const [modelsRes, providersRes] = await Promise.all([
        fetch(`/api/models?teamSlugOrId=${encodeURIComponent(teamSlugOrId)}`),
        fetch(`/api/providers/status?teamSlugOrId=${encodeURIComponent(teamSlugOrId)}`),
      ]);

      if (!modelsRes.ok) {
        throw new Error(`Failed to fetch models: ${modelsRes.statusText}`);
      }
      if (!providersRes.ok) {
        throw new Error(`Failed to fetch providers: ${providersRes.statusText}`);
      }

      const modelsData = await modelsRes.json() as { models: Model[] };
      const providersData = await providersRes.json() as { providers: ProviderStatus[] };

      setModels(modelsData.models);
      setProviders(providersData.providers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
      console.error("Failed to fetch models:", err);
    } finally {
      setIsLoading(false);
    }
  }, [teamSlugOrId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Trigger model refresh (discovery)
  const handleRefreshModels = async () => {
    if (!teamSlugOrId || isRefreshing) return;

    setIsRefreshing(true);
    try {
      const res = await fetch(
        `/api/models/refresh?teamSlugOrId=${encodeURIComponent(teamSlugOrId)}`,
        { method: "POST" }
      );

      if (!res.ok) {
        throw new Error("Failed to refresh models");
      }

      await fetchData();
    } catch (err) {
      console.error("Failed to refresh models:", err);
      setError(err instanceof Error ? err.message : "Failed to refresh");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Toggle model enabled state
  const handleToggleModel = async (modelName: string, enabled: boolean) => {
    if (!teamSlugOrId) return;

    setTogglingModel(modelName);
    try {
      const res = await fetch(
        `/api/models/${encodeURIComponent(modelName)}/enabled?teamSlugOrId=${encodeURIComponent(teamSlugOrId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled }),
        }
      );

      if (!res.ok) {
        throw new Error("Failed to toggle model");
      }

      // Update local state optimistically
      setModels((prev) =>
        prev.map((m) => (m.name === modelName ? { ...m, enabled } : m))
      );
    } catch (err) {
      console.error("Failed to toggle model:", err);
      // Revert on error
      await fetchData();
    } finally {
      setTogglingModel(null);
    }
  };

  // Get unique vendors from models
  const vendors = useMemo(() => {
    const vendorSet = new Set(models.map((m) => m.vendor));
    return ["all", ...Array.from(vendorSet).sort()];
  }, [models]);

  // Check if a model is available (provider is connected)
  const isModelAvailable = useCallback(
    (model: Model) => {
      if (model.tier === "free") return true;
      return model.requiredApiKeys.some((key) =>
        providers.some((p) => p.configuredKeys.includes(key))
      );
    },
    [providers]
  );

  // Filter models
  const filteredModels = useMemo(() => {
    return models.filter((model) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (
          !model.name.toLowerCase().includes(query) &&
          !model.displayName.toLowerCase().includes(query) &&
          !model.vendor.toLowerCase().includes(query)
        ) {
          return false;
        }
      }

      // Source filter
      if (sourceFilter !== "all" && model.source !== sourceFilter) {
        return false;
      }

      // Tier filter
      if (tierFilter !== "all" && model.tier !== tierFilter) {
        return false;
      }

      // Vendor filter
      if (vendorFilter !== "all" && model.vendor !== vendorFilter) {
        return false;
      }

      return true;
    });
  }, [models, searchQuery, sourceFilter, tierFilter, vendorFilter]);

  // Group models by vendor for display
  const groupedModels = useMemo(() => {
    const groups: Record<string, Model[]> = {};
    for (const model of filteredModels) {
      if (!groups[model.vendor]) {
        groups[model.vendor] = [];
      }
      groups[model.vendor].push(model);
    }
    return groups;
  }, [filteredModels]);

  if (!user) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-neutral-400">Please sign in to manage models.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Error Message */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Search and Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            placeholder="Search models..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900 pl-10 pr-4 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
              showFilters
                ? "border-white bg-white text-neutral-900"
                : "border-neutral-700 bg-neutral-800/50 text-neutral-300 hover:bg-neutral-800"
            )}
          >
            <Filter className="h-4 w-4" />
            Filters
          </button>

          <button
            type="button"
            onClick={() => void handleRefreshModels()}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800/50 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 transition disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            Discover
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-4 rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
          {/* Source Filter */}
          <div className="space-y-1.5">
            <label className="text-xs text-neutral-500">Source</label>
            <div className="flex gap-1">
              {FILTER_OPTIONS.source.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSourceFilter(opt.value as typeof sourceFilter)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                    sourceFilter === opt.value
                      ? "bg-white text-neutral-900"
                      : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tier Filter */}
          <div className="space-y-1.5">
            <label className="text-xs text-neutral-500">Tier</label>
            <div className="flex gap-1">
              {FILTER_OPTIONS.tier.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTierFilter(opt.value as typeof tierFilter)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                    tierFilter === opt.value
                      ? "bg-white text-neutral-900"
                      : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Vendor Filter */}
          <div className="space-y-1.5">
            <label className="text-xs text-neutral-500">Vendor</label>
            <select
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-white focus:border-neutral-600 focus:outline-none"
            >
              <option value="all">All Vendors</option>
              {vendors.filter((v) => v !== "all").map((vendor) => (
                <option key={vendor} value={vendor}>
                  {VENDOR_DISPLAY_NAMES[vendor] || vendor}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Models Count */}
      <div className="text-sm text-neutral-400">
        Showing {filteredModels.length} of {models.length} models
      </div>

      {/* Models List */}
      <div className="space-y-6">
        {Object.entries(groupedModels).map(([vendor, vendorModels]) => (
          <div key={vendor}>
            <h3 className="mb-3 text-sm font-medium text-neutral-400">
              {VENDOR_DISPLAY_NAMES[vendor] || vendor}
            </h3>
            <div className="divide-y divide-neutral-800 rounded-lg border border-neutral-800 bg-neutral-900/50">
              {vendorModels.map((model) => {
                const available = isModelAvailable(model);
                const isToggling = togglingModel === model.name;

                return (
                  <div
                    key={model._id}
                    className={cn(
                      "flex items-center justify-between gap-4 px-4 py-3",
                      !available && "opacity-60"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white truncate">
                          {model.displayName}
                        </span>
                        {model.tier === "free" && (
                          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                            FREE
                          </span>
                        )}
                        {model.source === "discovered" && (
                          <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-medium text-blue-400">
                            DISCOVERED
                          </span>
                        )}
                        {model.disabled && (
                          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                            DISABLED
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-neutral-500 truncate">
                        {model.name}
                        {!available && " (provider not connected)"}
                        {model.disabledReason && ` - ${model.disabledReason}`}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleToggleModel(model.name, !model.enabled)}
                      disabled={isToggling || model.disabled}
                      className={cn(
                        "relative h-6 w-11 rounded-full transition-colors",
                        model.enabled
                          ? "bg-emerald-500"
                          : "bg-neutral-700",
                        (isToggling || model.disabled) && "cursor-not-allowed opacity-50"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                          model.enabled ? "left-[22px]" : "left-0.5"
                        )}
                      >
                        {isToggling && (
                          <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
                        )}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {filteredModels.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-neutral-400">
          <p>No models match your filters.</p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setSourceFilter("all");
              setTierFilter("all");
              setVendorFilter("all");
            }}
            className="mt-2 text-sm text-white underline hover:no-underline"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
