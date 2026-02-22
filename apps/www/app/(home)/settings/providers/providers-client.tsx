"use client";

import { useState, useEffect, useCallback } from "react";
import { useUser } from "@stackframe/stack";
import { Check, Trash2, Eye, EyeOff, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { BASE_PROVIDERS, type ProviderSpec } from "@cmux/shared/provider-registry";
import type { AgentConfigApiKey } from "@cmux/shared";

type ProviderStatus = {
  id: string;
  name: string;
  isAvailable: boolean;
  source: "apiKeys" | "oauth" | "free" | null;
  configuredKeys: string[];
  requiredKeys: string[];
};

type ApiKeyInfo = {
  envVar: string;
  displayName: string;
  description?: string;
  hasValue: boolean;
  maskedValue?: string;
  updatedAt?: number;
};

export function ProvidersClient() {
  const user = useUser();
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ProviderSpec | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKeyInfo | null>(null);
  const [keyValue, setKeyValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showKeyValue, setShowKeyValue] = useState(false);
  const [teamSlugOrId, setTeamSlugOrId] = useState<string | null>(null);

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

  // Fetch provider status and API keys
  const fetchData = useCallback(async () => {
    if (!teamSlugOrId) return;

    setIsLoading(true);
    setError(null);

    try {
      const [statusRes, keysRes] = await Promise.all([
        fetch(`/api/providers/status?teamSlugOrId=${encodeURIComponent(teamSlugOrId)}`),
        fetch(`/api/api-keys?teamSlugOrId=${encodeURIComponent(teamSlugOrId)}`),
      ]);

      if (!statusRes.ok) {
        throw new Error(`Failed to fetch provider status: ${statusRes.statusText}`);
      }
      if (!keysRes.ok) {
        throw new Error(`Failed to fetch API keys: ${keysRes.statusText}`);
      }

      const statusData = await statusRes.json() as { providers: ProviderStatus[] };
      const keysData = await keysRes.json() as { apiKeys: ApiKeyInfo[] };

      setProviders(statusData.providers);
      setApiKeys(keysData.apiKeys);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
      console.error("Failed to fetch provider data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [teamSlugOrId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleConfigureProvider = (provider: ProviderSpec) => {
    setSelectedProvider(provider);
    setIsModalOpen(true);
    setEditingKey(null);
    setKeyValue("");
    setShowKeyValue(false);
  };

  const handleEditKey = (keyInfo: ApiKeyInfo) => {
    setEditingKey(keyInfo);
    setKeyValue("");
    setShowKeyValue(false);
  };

  const handleSaveKey = async () => {
    if (!editingKey || !teamSlugOrId) return;

    setIsSaving(true);
    try {
      const res = await fetch(`/api/api-keys?teamSlugOrId=${encodeURIComponent(teamSlugOrId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          envVar: editingKey.envVar,
          value: keyValue,
          displayName: editingKey.displayName,
          description: editingKey.description,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save API key");
      }

      await fetchData();
      setEditingKey(null);
      setKeyValue("");
    } catch (err) {
      console.error("Failed to save API key:", err);
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteKey = async (envVar: string) => {
    if (!teamSlugOrId) return;

    try {
      const res = await fetch(
        `/api/api-keys/${encodeURIComponent(envVar)}?teamSlugOrId=${encodeURIComponent(teamSlugOrId)}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        throw new Error("Failed to delete API key");
      }

      await fetchData();
    } catch (err) {
      console.error("Failed to delete API key:", err);
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedProvider(null);
    setEditingKey(null);
    setKeyValue("");
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-neutral-400">Please sign in to manage providers.</p>
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

      {/* Header with refresh button */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-neutral-400">
            Connect providers to use their models in your tasks.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchData()}
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800/50 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800 transition"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Provider Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {BASE_PROVIDERS.map((providerSpec: ProviderSpec) => {
          const status = providers.find((p) => p.id === providerSpec.id);
          const isConnected = status?.isAvailable ?? false;

          return (
            <div
              key={providerSpec.id}
              className={cn(
                "group relative rounded-xl border p-4 transition",
                isConnected
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-neutral-800 bg-neutral-900/50 hover:border-neutral-700"
              )}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-white">{providerSpec.name}</h3>
                  <p className="mt-1 text-xs text-neutral-400">
                    {providerSpec.apiFormat === "anthropic"
                      ? "Anthropic API"
                      : providerSpec.apiFormat === "openai"
                        ? "OpenAI-compatible"
                        : providerSpec.apiFormat}
                  </p>
                </div>
                {isConnected ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-400">
                    <Check className="h-3 w-3" />
                    Connected
                  </span>
                ) : (
                  <span className="text-xs text-neutral-500">Not configured</span>
                )}
              </div>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => handleConfigureProvider(providerSpec)}
                  className={cn(
                    "w-full rounded-lg px-3 py-2 text-sm font-medium transition",
                    isConnected
                      ? "border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                      : "bg-white text-neutral-900 hover:bg-neutral-200"
                  )}
                >
                  {isConnected ? "Manage Keys" : "Configure"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal for configuring provider */}
      {isModalOpen && selectedProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-lg rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Configure {selectedProvider.name}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="mt-2 text-sm text-neutral-400">
              Add API keys to connect to {selectedProvider.name}. At least one key is required.
            </p>

            <div className="mt-6 space-y-4">
              {selectedProvider.apiKeys.map((keyDef: AgentConfigApiKey) => {
                const keyInfo = apiKeys.find((k) => k.envVar === keyDef.envVar);
                const isEditing = editingKey?.envVar === keyDef.envVar;

                return (
                  <div
                    key={keyDef.envVar}
                    className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium text-white">{keyDef.displayName}</h4>
                        <p className="mt-0.5 text-xs text-neutral-500">{keyDef.envVar}</p>
                        {keyDef.description && (
                          <p className="mt-2 text-xs text-neutral-400">{keyDef.description}</p>
                        )}
                      </div>
                      {keyInfo?.hasValue && !isEditing && (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                          <Check className="h-3 w-3" />
                          Set
                        </span>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="mt-4 space-y-3">
                        <div className="relative">
                          <input
                            type={showKeyValue ? "text" : "password"}
                            value={keyValue}
                            onChange={(e) => setKeyValue(e.target.value)}
                            placeholder={keyInfo?.hasValue ? "Enter new value to update" : "Enter API key"}
                            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 pr-10 text-sm text-white placeholder:text-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
                          />
                          <button
                            type="button"
                            onClick={() => setShowKeyValue(!showKeyValue)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-400 hover:text-white"
                          >
                            {showKeyValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleSaveKey}
                            disabled={!keyValue || isSaving}
                            className="flex-1 rounded-lg bg-white px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isSaving ? (
                              <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                            ) : (
                              "Save"
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingKey(null);
                              setKeyValue("");
                            }}
                            className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditKey(keyInfo ?? {
                            envVar: keyDef.envVar,
                            displayName: keyDef.displayName,
                            description: keyDef.description,
                            hasValue: false,
                          })}
                          className="flex-1 rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
                        >
                          {keyInfo?.hasValue ? "Update" : "Add Key"}
                        </button>
                        {keyInfo?.hasValue && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteKey(keyDef.envVar)}
                            className="rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
