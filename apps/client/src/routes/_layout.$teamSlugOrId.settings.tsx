import { api } from "@cmux/convex/api";
import type { Doc } from "@cmux/convex/dataModel";
import { AGENT_CONFIGS, type AgentConfig } from "@cmux/shared/agentConfig";
import {
  ALL_BASE_URL_KEYS,
  ANTHROPIC_BASE_URL_KEY,
  type ProviderBaseUrlKey,
} from "@cmux/shared";
import { convexQuery } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useConvex } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { SettingsLayout, type SettingsSection } from "@/components/settings";
import { GeneralSection, AIProvidersSection } from "@/components/settings/sections";

export const Route = createFileRoute("/_layout/$teamSlugOrId/settings")({
  component: SettingsComponent,
});

type HeatmapColors = {
  line: { start: string; end: string };
  token: { start: string; end: string };
};

const createDefaultHeatmapColors = (): HeatmapColors => ({
  line: { start: "#fefce8", end: "#f8e1c9" },
  token: { start: "#fde047", end: "#ffa270" },
});

const areHeatmapColorsEqual = (a: HeatmapColors, b: HeatmapColors): boolean =>
  a.line.start === b.line.start &&
  a.line.end === b.line.end &&
  a.token.start === b.token.start &&
  a.token.end === b.token.end;

function SettingsComponent() {
  const { teamSlugOrId } = Route.useParams();
  const convex = useConvex();
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");

  // API keys state
  const [apiKeyValues, setApiKeyValues] = useState<Record<string, string>>({});
  const [originalApiKeyValues, setOriginalApiKeyValues] = useState<
    Record<string, string>
  >({});
  const [baseUrlValues, setBaseUrlValues] = useState<Record<string, string>>({});
  const [originalBaseUrlValues, setOriginalBaseUrlValues] = useState<
    Record<string, string>
  >({});
  const [bypassAnthropicProxy, setBypassAnthropicProxy] = useState<boolean>(false);
  const [originalBypassAnthropicProxy, setOriginalBypassAnthropicProxy] =
    useState<boolean>(false);

  // Saving state
  const [isSaving, setIsSaving] = useState(false);

  // Team state
  const [teamSlug, setTeamSlug] = useState<string>("");
  const [originalTeamSlug, setOriginalTeamSlug] = useState<string>("");
  const [teamName, setTeamName] = useState<string>("");
  const [originalTeamName, setOriginalTeamName] = useState<string>("");
  const [teamNameError, setTeamNameError] = useState<string>("");
  const [teamSlugError, setTeamSlugError] = useState<string>("");

  // Workspace state
  const [worktreePath, setWorktreePath] = useState<string>("");
  const [originalWorktreePath, setOriginalWorktreePath] = useState<string>("");
  const [autoPrEnabled, setAutoPrEnabled] = useState<boolean>(false);
  const [originalAutoPrEnabled, setOriginalAutoPrEnabled] = useState<boolean>(false);

  // Container settings state
  const [containerSettingsData, setContainerSettingsData] = useState<{
    maxRunningContainers: number;
    reviewPeriodMinutes: number;
    autoCleanupEnabled: boolean;
    stopImmediatelyOnCompletion: boolean;
    minContainersToKeep: number;
  } | null>(null);
  const [originalContainerSettingsData, setOriginalContainerSettingsData] =
    useState<typeof containerSettingsData>(null);

  // Heatmap settings state
  const [heatmapModel, setHeatmapModel] = useState<string>("anthropic-opus-4-5");
  const [originalHeatmapModel, setOriginalHeatmapModel] =
    useState<string>("anthropic-opus-4-5");
  const [heatmapThreshold, setHeatmapThreshold] = useState<number>(0);
  const [originalHeatmapThreshold, setOriginalHeatmapThreshold] = useState<number>(0);
  const [heatmapTooltipLanguage, setHeatmapTooltipLanguage] = useState<string>("en");
  const [originalHeatmapTooltipLanguage, setOriginalHeatmapTooltipLanguage] =
    useState<string>("en");
  const [heatmapColors, setHeatmapColors] = useState<HeatmapColors>(
    createDefaultHeatmapColors
  );
  const [originalHeatmapColors, setOriginalHeatmapColors] =
    useState<HeatmapColors>(createDefaultHeatmapColors);

  // Get all required API keys from agent configs
  const apiKeys = Array.from(
    new Map(
      AGENT_CONFIGS.flatMap((config: AgentConfig) => config.apiKeys || []).map(
        (key) => [key.envVar, key]
      )
    ).values()
  );

  // Query existing API keys
  const { data: existingKeys } = useQuery(
    convexQuery(api.apiKeys.getAll, { teamSlugOrId })
  );

  // Query team info (slug)
  const { data: teamInfo } = useQuery(
    convexQuery(api.teams.get, { teamSlugOrId })
  );

  // Query workspace settings
  const { data: workspaceSettings } = useQuery(
    convexQuery(api.workspaceSettings.get, { teamSlugOrId })
  );

  // Initialize form values when data loads
  useEffect(() => {
    if (existingKeys) {
      const values: Record<string, string> = {};
      existingKeys.forEach((key: Doc<"apiKeys">) => {
        values[key.envVar] = key.value;
      });
      setApiKeyValues(values);
      setOriginalApiKeyValues(values);

      const nextBaseUrlValues: Record<string, string> = {};
      for (const baseUrlKey of ALL_BASE_URL_KEYS) {
        nextBaseUrlValues[baseUrlKey.envVar] = values[baseUrlKey.envVar] || "";
      }
      setBaseUrlValues(nextBaseUrlValues);
      setOriginalBaseUrlValues(nextBaseUrlValues);
    }
  }, [existingKeys]);

  // Initialize team slug when data loads
  useEffect(() => {
    if (teamInfo) {
      const s = teamInfo.slug || "";
      setTeamSlug(s);
      setOriginalTeamSlug(s);
      setTeamSlugError("");
      const n =
        (teamInfo as unknown as { name?: string; displayName?: string }).name ||
        (teamInfo as unknown as { name?: string; displayName?: string })
          .displayName ||
        "";
      setTeamName(n);
      setOriginalTeamName(n);
      setTeamNameError("");
    }
  }, [teamInfo]);

  // Client-side validators
  const validateName = (val: string): string => {
    const t = val.trim();
    if (t.length === 0) return "Name is required";
    if (t.length > 32) return "Name must be at most 32 characters";
    return "";
  };

  const validateSlug = (val: string): string => {
    const t = val.trim();
    if (t.length === 0) return "Slug is required";
    if (t.length < 3 || t.length > 48) return "Slug must be 3-48 characters";
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(t))
      return "Use lowercase letters, numbers, and hyphens; start/end with letter or number";
    return "";
  };

  // Initialize worktree path and heatmap settings when data loads
  useEffect(() => {
    if (workspaceSettings === undefined) {
      return;
    }

    const nextWorktreePath = workspaceSettings?.worktreePath ?? "";
    setWorktreePath((prev) =>
      prev === nextWorktreePath ? prev : nextWorktreePath
    );
    setOriginalWorktreePath((prev) =>
      prev === nextWorktreePath ? prev : nextWorktreePath
    );

    const nextAutoPrEnabled = workspaceSettings?.autoPrEnabled ?? false;
    setAutoPrEnabled((prev) =>
      prev === nextAutoPrEnabled ? prev : nextAutoPrEnabled
    );
    setOriginalAutoPrEnabled((prev) =>
      prev === nextAutoPrEnabled ? prev : nextAutoPrEnabled
    );

    const nextBypassAnthropicProxy =
      workspaceSettings?.bypassAnthropicProxy ?? false;
    setBypassAnthropicProxy((prev) =>
      prev === nextBypassAnthropicProxy ? prev : nextBypassAnthropicProxy
    );
    setOriginalBypassAnthropicProxy((prev) =>
      prev === nextBypassAnthropicProxy ? prev : nextBypassAnthropicProxy
    );

    if (workspaceSettings?.heatmapModel) {
      const nextModel = workspaceSettings.heatmapModel;
      setHeatmapModel((prev) => (prev === nextModel ? prev : nextModel));
      setOriginalHeatmapModel((prev) => (prev === nextModel ? prev : nextModel));
    }
    if (workspaceSettings?.heatmapThreshold !== undefined) {
      const nextThreshold = workspaceSettings.heatmapThreshold;
      setHeatmapThreshold((prev) =>
        prev === nextThreshold ? prev : nextThreshold
      );
      setOriginalHeatmapThreshold((prev) =>
        prev === nextThreshold ? prev : nextThreshold
      );
    }
    if (workspaceSettings?.heatmapTooltipLanguage) {
      const nextLanguage = workspaceSettings.heatmapTooltipLanguage;
      setHeatmapTooltipLanguage((prev) =>
        prev === nextLanguage ? prev : nextLanguage
      );
      setOriginalHeatmapTooltipLanguage((prev) =>
        prev === nextLanguage ? prev : nextLanguage
      );
    }
    if (workspaceSettings?.heatmapColors) {
      const nextColors = workspaceSettings.heatmapColors;
      setHeatmapColors((prev) =>
        areHeatmapColorsEqual(prev, nextColors) ? prev : nextColors
      );
      setOriginalHeatmapColors((prev) =>
        areHeatmapColorsEqual(prev, nextColors) ? prev : nextColors
      );
    }
  }, [workspaceSettings]);

  // Mutation to save API keys
  const saveApiKeyMutation = useMutation({
    mutationFn: async (data: {
      envVar: string;
      value: string;
      displayName: string;
      description?: string;
    }) => {
      return await convex.mutation(api.apiKeys.upsert, {
        teamSlugOrId,
        ...data,
      });
    },
  });

  const handleApiKeyChange = (envVar: string, value: string) => {
    setApiKeyValues((prev) => ({ ...prev, [envVar]: value }));
  };

  const handleBaseUrlChange = (baseUrlKey: ProviderBaseUrlKey, value: string) => {
    setBaseUrlValues((prev) => ({ ...prev, [baseUrlKey.envVar]: value }));
    if (
      baseUrlKey.envVar === ANTHROPIC_BASE_URL_KEY.envVar &&
      value.trim().length === 0
    ) {
      setBypassAnthropicProxy(false);
    }
  };

  const handleContainerSettingsChange = useCallback(
    (data: {
      maxRunningContainers: number;
      reviewPeriodMinutes: number;
      autoCleanupEnabled: boolean;
      stopImmediatelyOnCompletion: boolean;
      minContainersToKeep: number;
    }) => {
      setContainerSettingsData(data);
      if (!originalContainerSettingsData) {
        setOriginalContainerSettingsData(data);
      }
    },
    [originalContainerSettingsData]
  );

  // Check if there are any changes
  const hasChanges = () => {
    // Check worktree path changes
    const worktreePathChanged = worktreePath !== originalWorktreePath;

    // Check all required API keys for changes
    const apiKeysChanged = apiKeys.some((keyConfig) => {
      const currentValue = apiKeyValues[keyConfig.envVar] || "";
      const originalValue = originalApiKeyValues[keyConfig.envVar] || "";
      return currentValue !== originalValue;
    });

    const baseUrlsChanged = ALL_BASE_URL_KEYS.some((baseUrlKey) => {
      const currentValue = baseUrlValues[baseUrlKey.envVar] || "";
      const originalValue = originalBaseUrlValues[baseUrlKey.envVar] || "";
      return currentValue !== originalValue;
    });

    // Check container settings changes
    const containerSettingsChanged =
      containerSettingsData &&
      originalContainerSettingsData &&
      JSON.stringify(containerSettingsData) !==
        JSON.stringify(originalContainerSettingsData);

    // Auto PR toggle changes
    const autoPrChanged = autoPrEnabled !== originalAutoPrEnabled;
    const bypassAnthropicProxyChanged =
      bypassAnthropicProxy !== originalBypassAnthropicProxy;

    // Heatmap settings changes
    const heatmapModelChanged = heatmapModel !== originalHeatmapModel;
    const heatmapThresholdChanged = heatmapThreshold !== originalHeatmapThreshold;
    const heatmapTooltipLanguageChanged =
      heatmapTooltipLanguage !== originalHeatmapTooltipLanguage;
    const heatmapColorsChanged =
      JSON.stringify(heatmapColors) !== JSON.stringify(originalHeatmapColors);

    return (
      worktreePathChanged ||
      autoPrChanged ||
      bypassAnthropicProxyChanged ||
      apiKeysChanged ||
      baseUrlsChanged ||
      containerSettingsChanged ||
      heatmapModelChanged ||
      heatmapThresholdChanged ||
      heatmapTooltipLanguageChanged ||
      heatmapColorsChanged
    );
  };

  const saveSettings = async () => {
    setIsSaving(true);

    try {
      let savedCount = 0;
      let deletedCount = 0;
      let savedWorkspaceSettings = false;
      let savedContainerSettings = false;

      // Save worktree path / auto PR / heatmap settings if changed
      const workspaceSettingsChanged =
        worktreePath !== originalWorktreePath ||
        autoPrEnabled !== originalAutoPrEnabled ||
        bypassAnthropicProxy !== originalBypassAnthropicProxy ||
        heatmapModel !== originalHeatmapModel ||
        heatmapThreshold !== originalHeatmapThreshold ||
        heatmapTooltipLanguage !== originalHeatmapTooltipLanguage ||
        JSON.stringify(heatmapColors) !== JSON.stringify(originalHeatmapColors);

      if (workspaceSettingsChanged) {
        await convex.mutation(api.workspaceSettings.update, {
          teamSlugOrId,
          worktreePath: worktreePath || undefined,
          autoPrEnabled,
          bypassAnthropicProxy,
          heatmapModel,
          heatmapThreshold,
          heatmapTooltipLanguage,
          heatmapColors,
        });
        setOriginalWorktreePath(worktreePath);
        setOriginalAutoPrEnabled(autoPrEnabled);
        setOriginalBypassAnthropicProxy(bypassAnthropicProxy);
        setOriginalHeatmapModel(heatmapModel);
        setOriginalHeatmapThreshold(heatmapThreshold);
        setOriginalHeatmapTooltipLanguage(heatmapTooltipLanguage);
        setOriginalHeatmapColors(heatmapColors);
        savedWorkspaceSettings = true;
      }

      // Save container settings if changed
      if (
        containerSettingsData &&
        originalContainerSettingsData &&
        JSON.stringify(containerSettingsData) !==
          JSON.stringify(originalContainerSettingsData)
      ) {
        await convex.mutation(api.containerSettings.update, {
          teamSlugOrId,
          ...containerSettingsData,
        });
        setOriginalContainerSettingsData(containerSettingsData);
        savedContainerSettings = true;
      }

      for (const key of apiKeys) {
        const value = apiKeyValues[key.envVar] || "";
        const originalValue = originalApiKeyValues[key.envVar] || "";

        // Only save if the value has changed
        if (value !== originalValue) {
          if (value.trim()) {
            // Save or update the key
            await saveApiKeyMutation.mutateAsync({
              envVar: key.envVar,
              value: value.trim(),
              displayName: key.displayName,
              description: key.description,
            });
            savedCount++;
          } else if (originalValue) {
            // Delete the key if it was cleared
            await convex.mutation(api.apiKeys.remove, {
              teamSlugOrId,
              envVar: key.envVar,
            });
            deletedCount++;
          }
        }
      }

      const normalizedBaseUrlValues: Record<string, string> = {
        ...baseUrlValues,
      };
      for (const baseUrlKey of ALL_BASE_URL_KEYS) {
        const value = (baseUrlValues[baseUrlKey.envVar] || "").trim();
        const originalValue = (originalBaseUrlValues[baseUrlKey.envVar] || "").trim();
        normalizedBaseUrlValues[baseUrlKey.envVar] = value;

        if (value !== originalValue) {
          if (value) {
            await saveApiKeyMutation.mutateAsync({
              envVar: baseUrlKey.envVar,
              value,
              displayName: baseUrlKey.displayName,
              description: baseUrlKey.description,
            });
            savedCount++;
          } else if (originalValue) {
            await convex.mutation(api.apiKeys.remove, {
              teamSlugOrId,
              envVar: baseUrlKey.envVar,
            });
            deletedCount++;
          }
        }
      }

      // Update original values to reflect saved state
      setOriginalApiKeyValues(apiKeyValues);
      setBaseUrlValues(normalizedBaseUrlValues);
      setOriginalBaseUrlValues(normalizedBaseUrlValues);

      if (
        savedCount > 0 ||
        deletedCount > 0 ||
        savedWorkspaceSettings ||
        savedContainerSettings
      ) {
        const actions = [];
        if (savedCount > 0) {
          actions.push(`saved ${savedCount} key${savedCount > 1 ? "s" : ""}`);
        }
        if (deletedCount > 0) {
          actions.push(
            `removed ${deletedCount} key${deletedCount > 1 ? "s" : ""}`
          );
        }
        toast.success(
          actions.length > 0
            ? `Successfully ${actions.join(" and ")}`
            : "Settings saved"
        );
      } else {
        toast.info("No changes to save");
      }
    } catch (error) {
      toast.error("Failed to save settings. Please try again.");
      console.error("Error saving settings:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const saveTeamSlug = async () => {
    const newSlug = teamSlug.trim();
    if (!newSlug) {
      toast.error("Slug cannot be empty");
      return;
    }
    setIsSaving(true);
    try {
      await convex.mutation(api.teams.setSlug, {
        teamSlugOrId,
        slug: newSlug,
      });
      setOriginalTeamSlug(newSlug);
      toast.success("Team slug updated");
      // Navigate to the new URL with the updated slug
      window.location.href = `/${newSlug}/settings`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg || "Failed to update slug");
    } finally {
      setIsSaving(false);
    }
  };

  const saveTeamName = async () => {
    const newName = teamName.trim();
    if (!newName) {
      toast.error("Name cannot be empty");
      return;
    }
    setIsSaving(true);
    try {
      await convex.mutation(api.teams.setName, {
        teamSlugOrId,
        name: newName,
      });
      setOriginalTeamName(newName);
      toast.success("Team name updated");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg || "Failed to update name");
    } finally {
      setIsSaving(false);
    }
  };

  const footer = (
    <div className="sticky bottom-0 border-t border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 supports-[backdrop-filter]:dark:bg-neutral-900/60">
      <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-end gap-3">
        <button
          onClick={saveSettings}
          disabled={!hasChanges() || isSaving}
          className={`px-4 py-2 text-sm font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900 transition-all ${
            !hasChanges() || isSaving
              ? "bg-neutral-200 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500 cursor-not-allowed opacity-50"
              : "bg-blue-600 dark:bg-blue-500 text-white hover:bg-blue-700 dark:hover:bg-blue-600"
          }`}
        >
          {isSaving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );

  return (
    <SettingsLayout
      teamSlugOrId={teamSlugOrId}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      footer={footer}
    >
      {activeSection === "general" && (
        <GeneralSection
          teamSlugOrId={teamSlugOrId}
          teamName={teamName}
          onTeamNameChange={(v) => {
            setTeamName(v);
            setTeamNameError(validateName(v));
          }}
          teamNameError={teamNameError}
          onSaveTeamName={() => void saveTeamName()}
          teamSlug={teamSlug}
          onTeamSlugChange={(v) => {
            setTeamSlug(v);
            setTeamSlugError(validateSlug(v));
          }}
          teamSlugError={teamSlugError}
          onSaveTeamSlug={() => void saveTeamSlug()}
          originalTeamName={originalTeamName}
          originalTeamSlug={originalTeamSlug}
          worktreePath={worktreePath}
          onWorktreePathChange={setWorktreePath}
          autoPrEnabled={autoPrEnabled}
          onAutoPrEnabledChange={setAutoPrEnabled}
          heatmapModel={heatmapModel}
          onHeatmapModelChange={setHeatmapModel}
          heatmapTooltipLanguage={heatmapTooltipLanguage}
          onHeatmapTooltipLanguageChange={setHeatmapTooltipLanguage}
          heatmapThreshold={heatmapThreshold}
          onHeatmapThresholdChange={setHeatmapThreshold}
          heatmapColors={heatmapColors}
          onHeatmapColorsChange={setHeatmapColors}
          onContainerSettingsChange={handleContainerSettingsChange}
          isSaving={isSaving}
          validateName={validateName}
          validateSlug={validateSlug}
        />
      )}
      {activeSection === "ai-providers" && (
        <AIProvidersSection
          apiKeyValues={apiKeyValues}
          onApiKeyChange={handleApiKeyChange}
          originalApiKeyValues={originalApiKeyValues}
          baseUrlValues={baseUrlValues}
          onBaseUrlChange={handleBaseUrlChange}
          bypassAnthropicProxy={bypassAnthropicProxy}
          onBypassAnthropicProxyChange={setBypassAnthropicProxy}
        />
      )}
    </SettingsLayout>
  );
}
