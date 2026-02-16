import { env } from "@/client-env";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { type SettingsTab } from "@/components/settings/SettingsSidebar";
import {
  AIProvidersSection,
  type ConnectionTestResult,
  type ProviderInfo,
} from "@/components/settings/sections/AIProvidersSection";
import { AppearanceSection } from "@/components/settings/sections/AppearanceSection";
import { ContainersSection } from "@/components/settings/sections/ContainersSection";
import { EditorSection } from "@/components/settings/sections/EditorSection";
import {
  GeneralSection,
} from "@/components/settings/sections/GeneralSection";
import {
  GettingStartedSection,
} from "@/components/settings/sections/GettingStartedSection";
import {
  HeatmapSection,
  type HeatmapColors,
} from "@/components/settings/sections/HeatmapSection";
import { WorkspaceSection } from "@/components/settings/sections/WorkspaceSection";
import { cachedGetUser } from "@/lib/cachedGetUser";
import { stackClientApp } from "@/lib/stack";
import { WWW_ORIGIN } from "@/lib/wwwOrigin";
import { api } from "@cmux/convex/api";
import type { Doc } from "@cmux/convex/dataModel";
import {
  AGENT_CONFIGS,
  type AgentConfig,
} from "@cmux/shared/agentConfig";
import {
  ALL_BASE_URL_KEYS,
  ANTHROPIC_BASE_URL_KEY,
  type ProviderBaseUrlKey,
} from "@cmux/shared";
import { API_KEY_MODELS_BY_ENV } from "@cmux/shared/model-usage";
import { convexQuery } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useConvex } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/theme/use-theme";
import { toast } from "sonner";

export const Route = createFileRoute("/_layout/$teamSlugOrId/settings")({
  component: SettingsComponent,
});

const createDefaultHeatmapColors = (): HeatmapColors => ({
  line: { start: "#fefce8", end: "#f8e1c9" },
  token: { start: "#fde047", end: "#ffa270" },
});

const areHeatmapColorsEqual = (a: HeatmapColors, b: HeatmapColors): boolean =>
  a.line.start === b.line.start &&
  a.line.end === b.line.end &&
  a.token.start === b.token.start &&
  a.token.end === b.token.end;

const PROVIDER_INFO: Record<string, ProviderInfo> = {
  CLAUDE_CODE_OAUTH_TOKEN: {
    helpText:
      "Run `claude setup-token` in your terminal and paste the output here. Preferred over API key.",
  },
  ANTHROPIC_API_KEY: {
    url: "https://console.anthropic.com/settings/keys",
  },
  OPENAI_API_KEY: {
    url: "https://platform.openai.com/api-keys",
  },
  CODEX_AUTH_JSON: {
    helpText:
      "Paste the contents of ~/.codex/auth.json here. This allows Codex to use your OpenAI authentication.",
  },
  OPENROUTER_API_KEY: {
    url: "https://openrouter.ai/keys",
  },
  GEMINI_API_KEY: {
    url: "https://console.cloud.google.com/apis/credentials",
  },
  MODEL_STUDIO_API_KEY: {
    url: "https://modelstudio.console.alibabacloud.com/?tab=playground#/api-key",
  },
  AMP_API_KEY: {
    url: "https://ampcode.com/settings",
  },
  CURSOR_API_KEY: {
    url: "https://cursor.com/dashboard?tab=integrations",
  },
  XAI_API_KEY: {
    url: "https://console.x.ai/",
  },
};

function SettingsComponent() {
  const { teamSlugOrId } = Route.useParams();
  const { resolvedTheme, setTheme } = useTheme();
  const convex = useConvex();

  const [activeSection, setActiveSection] = useState<SettingsTab>("general");
  const [apiKeyValues, setApiKeyValues] = useState<Record<string, string>>({});
  const [originalApiKeyValues, setOriginalApiKeyValues] = useState<
    Record<string, string>
  >({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [showBaseUrls, setShowBaseUrls] = useState(false);
  const [baseUrlValues, setBaseUrlValues] = useState<Record<string, string>>({});
  const [originalBaseUrlValues, setOriginalBaseUrlValues] = useState<
    Record<string, string>
  >({});
  const [bypassAnthropicProxy, setBypassAnthropicProxy] =
    useState<boolean>(false);
  const [originalBypassAnthropicProxy, setOriginalBypassAnthropicProxy] =
    useState<boolean>(false);
  const [isTestingConnection, setIsTestingConnection] = useState<
    Record<string, boolean>
  >({});
  const [connectionTestResults, setConnectionTestResults] = useState<
    Record<string, ConnectionTestResult | null>
  >({});
  const [isSaving, setIsSaving] = useState(false);

  const [teamSlug, setTeamSlug] = useState<string>("");
  const [originalTeamSlug, setOriginalTeamSlug] = useState<string>("");
  const [teamName, setTeamName] = useState<string>("");
  const [originalTeamName, setOriginalTeamName] = useState<string>("");
  const [teamNameError, setTeamNameError] = useState<string>("");
  const [teamSlugError, setTeamSlugError] = useState<string>("");

  const [worktreePath, setWorktreePath] = useState<string>("");
  const [originalWorktreePath, setOriginalWorktreePath] = useState<string>("");
  const [autoPrEnabled, setAutoPrEnabled] = useState<boolean>(false);
  const [originalAutoPrEnabled, setOriginalAutoPrEnabled] =
    useState<boolean>(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const saveButtonRef = useRef<HTMLDivElement>(null);

  const usedListRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const [expandedUsedList, setExpandedUsedList] = useState<
    Record<string, boolean>
  >({});
  const [overflowUsedList, setOverflowUsedList] = useState<
    Record<string, boolean>
  >({});

  const [containerSettingsData, setContainerSettingsData] = useState<{
    maxRunningContainers: number;
    reviewPeriodMinutes: number;
    autoCleanupEnabled: boolean;
    stopImmediatelyOnCompletion: boolean;
    minContainersToKeep: number;
  } | null>(null);
  const [originalContainerSettingsData, setOriginalContainerSettingsData] =
    useState<typeof containerSettingsData>(null);

  const [heatmapModel, setHeatmapModel] = useState<string>("anthropic-opus-4-5");
  const [originalHeatmapModel, setOriginalHeatmapModel] =
    useState<string>("anthropic-opus-4-5");
  const [heatmapThreshold, setHeatmapThreshold] = useState<number>(0);
  const [originalHeatmapThreshold, setOriginalHeatmapThreshold] =
    useState<number>(0);
  const [heatmapTooltipLanguage, setHeatmapTooltipLanguage] =
    useState<string>("en");
  const [originalHeatmapTooltipLanguage, setOriginalHeatmapTooltipLanguage] =
    useState<string>("en");
  const [heatmapColors, setHeatmapColors] = useState<HeatmapColors>(
    createDefaultHeatmapColors
  );
  const [originalHeatmapColors, setOriginalHeatmapColors] =
    useState<HeatmapColors>(createDefaultHeatmapColors);

  const HEATMAP_MODEL_OPTIONS = [
    { value: "anthropic-opus-4-5", label: "Claude Opus 4.5" },
    { value: "anthropic", label: "Claude Opus 4.1" },
    { value: "cmux-heatmap-2", label: "cmux-heatmap-2" },
    { value: "cmux-heatmap-1", label: "cmux-heatmap-1" },
  ];

  const TOOLTIP_LANGUAGE_OPTIONS = [
    { value: "en", label: "English" },
    { value: "zh-Hant", label: "繁體中文" },
    { value: "zh-Hans", label: "简体中文" },
    { value: "ja", label: "日本語" },
    { value: "ko", label: "한국어" },
    { value: "es", label: "Español" },
    { value: "fr", label: "Français" },
    { value: "de", label: "Deutsch" },
    { value: "pt", label: "Português" },
    { value: "ru", label: "Русский" },
    { value: "vi", label: "Tiếng Việt" },
    { value: "th", label: "ไทย" },
    { value: "id", label: "Bahasa Indonesia" },
  ];

  const apiKeys = Array.from(
    new Map(
      AGENT_CONFIGS.flatMap((config: AgentConfig) => config.apiKeys || []).map(
        (key) => [key.envVar, key]
      )
    ).values()
  );

  const apiKeyModelsByEnv = API_KEY_MODELS_BY_ENV;

  const { data: existingKeys } = useQuery(
    convexQuery(api.apiKeys.getAll, { teamSlugOrId })
  );

  const { data: teamInfo } = useQuery(
    convexQuery(api.teams.get, { teamSlugOrId })
  );

  const { data: workspaceSettings } = useQuery(
    convexQuery(api.workspaceSettings.get, { teamSlugOrId })
  );

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

  useEffect(() => {
    if (teamInfo) {
      const slug = teamInfo.slug || "";
      setTeamSlug(slug);
      setOriginalTeamSlug(slug);
      setTeamSlugError("");

      const name =
        (teamInfo as unknown as { name?: string; displayName?: string }).name ||
        (teamInfo as unknown as { name?: string; displayName?: string })
          .displayName ||
        "";
      setTeamName(name);
      setOriginalTeamName(name);
      setTeamNameError("");
    }
  }, [teamInfo]);

  const validateName = (value: string): string => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return "Name is required";
    if (trimmed.length > 32) return "Name must be at most 32 characters";
    return "";
  };

  const validateSlug = (value: string): string => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return "Slug is required";
    if (trimmed.length < 3 || trimmed.length > 48)
      return "Slug must be 3-48 characters";
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(trimmed)) {
      return "Use lowercase letters, numbers, and hyphens; start/end with letter or number";
    }
    return "";
  };

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

  useEffect(() => {
    const recompute = () => {
      const updates: Record<string, boolean> = {};
      for (const key of Object.keys(usedListRefs.current)) {
        const el = usedListRefs.current[key];
        if (!el) continue;
        updates[key] = el.scrollWidth > el.clientWidth;
      }
      setOverflowUsedList((prev) => {
        let changed = false;
        const next: Record<string, boolean> = { ...prev };
        for (const key of Object.keys(updates)) {
          if (prev[key] !== updates[key]) {
            next[key] = updates[key];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    };

    recompute();
    const handler = () => recompute();
    window.addEventListener("resize", handler);
    const timerId = window.setTimeout(recompute, 0);

    return () => {
      window.removeEventListener("resize", handler);
      window.clearTimeout(timerId);
    };
  }, [apiKeys, apiKeyModelsByEnv]);

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
    setConnectionTestResults((prev) => ({ ...prev, [baseUrlKey.envVar]: null }));

    if (
      baseUrlKey.envVar === ANTHROPIC_BASE_URL_KEY.envVar &&
      value.trim().length === 0
    ) {
      setBypassAnthropicProxy(false);
    }
  };

  const toggleShowKey = (envVar: string) => {
    setShowKeys((prev) => ({ ...prev, [envVar]: !prev[envVar] }));
  };

  const testBaseUrlConnection = useCallback(
    async (baseUrlKey: ProviderBaseUrlKey, apiKeyEnvVar: string) => {
      const baseUrl = (baseUrlValues[baseUrlKey.envVar] || "").trim();
      const apiKey = (apiKeyValues[apiKeyEnvVar] || "").trim();

      if (!baseUrl) {
        setConnectionTestResults((prev) => ({
          ...prev,
          [baseUrlKey.envVar]: {
            status: "error",
            message: "Enter a base URL before testing.",
          },
        }));
        return;
      }

      if (baseUrlKey.envVar !== ANTHROPIC_BASE_URL_KEY.envVar) {
        setConnectionTestResults((prev) => ({
          ...prev,
          [baseUrlKey.envVar]: {
            status: "error",
            message:
              "Connection testing is currently available for Anthropic only.",
          },
        }));
        return;
      }

      if (!apiKey) {
        setConnectionTestResults((prev) => ({
          ...prev,
          [baseUrlKey.envVar]: {
            status: "error",
            message: "Enter an Anthropic API key before testing.",
          },
        }));
        return;
      }

      setIsTestingConnection((prev) => ({ ...prev, [baseUrlKey.envVar]: true }));
      try {
        const user = await cachedGetUser(stackClientApp);
        if (!user) {
          setConnectionTestResults((prev) => ({
            ...prev,
            [baseUrlKey.envVar]: {
              status: "error",
              message: "You must be signed in to test connections.",
            },
          }));
          return;
        }

        const authHeaders = await user.getAuthHeaders();
        const headers = new Headers(authHeaders);
        headers.set("Content-Type", "application/json");

        const endpoint = new URL(
          "/api/settings/test-anthropic-connection",
          WWW_ORIGIN
        );

        const response = await fetch(endpoint.toString(), {
          method: "POST",
          headers,
          body: JSON.stringify({
            baseUrl,
            apiKey,
          }),
        });

        const payload = (await response.json()) as {
          success: boolean;
          message: string;
          details?: ConnectionTestResult["details"];
        };

        setConnectionTestResults((prev) => ({
          ...prev,
          [baseUrlKey.envVar]: {
            status: payload.success ? "success" : "error",
            message: payload.message,
            details: payload.details,
          },
        }));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Connection test failed";
        setConnectionTestResults((prev) => ({
          ...prev,
          [baseUrlKey.envVar]: {
            status: "error",
            message,
          },
        }));
      } finally {
        setIsTestingConnection((prev) => ({
          ...prev,
          [baseUrlKey.envVar]: false,
        }));
      }
    },
    [apiKeyValues, baseUrlValues]
  );

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

  const hasChanges = () => {
    const worktreePathChanged = worktreePath !== originalWorktreePath;

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

    const containerSettingsChanged =
      containerSettingsData &&
      originalContainerSettingsData &&
      JSON.stringify(containerSettingsData) !==
        JSON.stringify(originalContainerSettingsData);

    const autoPrChanged = autoPrEnabled !== originalAutoPrEnabled;
    const bypassAnthropicProxyChanged =
      bypassAnthropicProxy !== originalBypassAnthropicProxy;

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

  const saveApiKeys = async () => {
    setIsSaving(true);

    try {
      let savedCount = 0;
      let deletedCount = 0;
      let savedWorkspaceSettings = false;
      let savedContainerSettings = false;

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

        if (value !== originalValue) {
          if (value.trim()) {
            await saveApiKeyMutation.mutateAsync({
              envVar: key.envVar,
              value: value.trim(),
              displayName: key.displayName,
              description: key.description,
            });
            savedCount++;
          } else if (originalValue) {
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
        const originalValue = (
          originalBaseUrlValues[baseUrlKey.envVar] || ""
        ).trim();

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

      setOriginalApiKeyValues(apiKeyValues);
      setBaseUrlValues(normalizedBaseUrlValues);
      setOriginalBaseUrlValues(normalizedBaseUrlValues);
      setShowKeys({});

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
      toast.error("Failed to save API keys. Please try again.");
      console.error("Error saving API keys:", error);
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
      window.location.href = `/${newSlug}/settings`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message || "Failed to update slug");
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message || "Failed to update name");
    } finally {
      setIsSaving(false);
    }
  };

  const canSaveTeamName =
    teamName.trim() !== originalTeamName.trim() &&
    !teamNameError &&
    validateName(teamName) === "";

  const canSaveTeamSlug =
    teamSlug.trim() !== originalTeamSlug.trim() &&
    !teamSlugError &&
    validateSlug(teamSlug) === "";

  return (
    <SettingsLayout
      teamSlugOrId={teamSlugOrId}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
    >
      <div
        ref={scrollContainerRef}
        className="flex flex-col grow overflow-auto select-none relative"
      >
        <div className="p-6 max-w-4xl">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              Settings
            </h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Manage your workspace preferences and configuration
            </p>
          </div>

          {activeSection === "general" ? (
            <div className="space-y-4">
              <GeneralSection
                teamSlugOrId={teamSlugOrId}
                teamName={teamName}
                teamNameError={teamNameError}
                onTeamNameChange={(value) => {
                  setTeamName(value);
                  setTeamNameError(validateName(value));
                }}
                onSaveTeamName={() => {
                  void saveTeamName();
                }}
                canSaveTeamName={canSaveTeamName}
                teamSlug={teamSlug}
                teamSlugError={teamSlugError}
                onTeamSlugChange={(value) => {
                  const normalized = value.toLowerCase();
                  setTeamSlug(normalized);
                  setTeamSlugError(validateSlug(normalized));
                }}
                onSaveTeamSlug={() => {
                  void saveTeamSlug();
                }}
                canSaveTeamSlug={canSaveTeamSlug}
                isSaving={isSaving}
              />

              <AppearanceSection
                resolvedTheme={resolvedTheme}
                onThemeChange={setTheme}
              />

              <WorkspaceSection
                showWorktreePath={!env.NEXT_PUBLIC_WEB_MODE}
                worktreePath={worktreePath}
                onWorktreePathChange={setWorktreePath}
                autoPrEnabled={autoPrEnabled}
                onAutoPrEnabledChange={setAutoPrEnabled}
              />

              <HeatmapSection
                heatmapModel={heatmapModel}
                onHeatmapModelChange={setHeatmapModel}
                heatmapModelOptions={HEATMAP_MODEL_OPTIONS}
                heatmapTooltipLanguage={heatmapTooltipLanguage}
                onHeatmapTooltipLanguageChange={setHeatmapTooltipLanguage}
                tooltipLanguageOptions={TOOLTIP_LANGUAGE_OPTIONS}
                heatmapThreshold={heatmapThreshold}
                onHeatmapThresholdChange={setHeatmapThreshold}
                heatmapColors={heatmapColors}
                onHeatmapColorsChange={setHeatmapColors}
              />

              <GettingStartedSection teamSlugOrId={teamSlugOrId} />

              {!env.NEXT_PUBLIC_WEB_MODE ? (
                <ContainersSection
                  teamSlugOrId={teamSlugOrId}
                  onDataChange={handleContainerSettingsChange}
                />
              ) : (
                <EditorSection teamSlugOrId={teamSlugOrId} />
              )}
            </div>
          ) : (
            <AIProvidersSection
              apiKeys={apiKeys}
              providerInfo={PROVIDER_INFO}
              apiKeyModelsByEnv={apiKeyModelsByEnv}
              apiKeyValues={apiKeyValues}
              originalApiKeyValues={originalApiKeyValues}
              showKeys={showKeys}
              onApiKeyChange={handleApiKeyChange}
              onToggleShowKey={toggleShowKey}
              showBaseUrls={showBaseUrls}
              onToggleShowBaseUrls={() => setShowBaseUrls((prev) => !prev)}
              baseUrlValues={baseUrlValues}
              onBaseUrlChange={handleBaseUrlChange}
              onTestBaseUrlConnection={(baseUrlKey, apiKeyEnvVar) => {
                void testBaseUrlConnection(baseUrlKey, apiKeyEnvVar);
              }}
              isTestingConnection={isTestingConnection}
              connectionTestResults={connectionTestResults}
              usedListRefs={usedListRefs}
              expandedUsedList={expandedUsedList}
              overflowUsedList={overflowUsedList}
              onToggleUsedList={(envVar) => {
                setExpandedUsedList((prev) => ({
                  ...prev,
                  [envVar]: !prev[envVar],
                }));
              }}
              bypassAnthropicProxy={bypassAnthropicProxy}
              onBypassAnthropicProxyChange={setBypassAnthropicProxy}
              showProviderStatus={!env.NEXT_PUBLIC_WEB_MODE}
            />
          )}
        </div>
      </div>

      <div
        ref={saveButtonRef}
        className="sticky bottom-0 border-t border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 supports-[backdrop-filter]:dark:bg-neutral-900/60"
      >
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-end gap-3">
          <button
            onClick={() => {
              void saveApiKeys();
            }}
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
    </SettingsLayout>
  );
}
