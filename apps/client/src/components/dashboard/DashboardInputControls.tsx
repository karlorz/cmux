import { env } from "@/client-env";
import { AgentLogo } from "@/components/icons/agent-logos";
import { useSocket } from "@/contexts/socket/use-socket";
import { GitHubIcon } from "@/components/icons/github";
import {
  buildAggregatedVendorStatuses,
  getProviderStatusMeta,
} from "@/components/dashboard/provider-status-meta";
import { ModeToggleTooltip } from "@/components/ui/mode-toggle-tooltip";
import SearchableSelect, {
  type SearchableSelectHandle,
  type SelectOption,
  type SelectOptionObject,
} from "@/components/ui/searchable-select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getElectronBridge, isElectron } from "@/lib/electron";
import {
  consumeGitHubAppInstallIntent,
  setGitHubAppInstallIntent,
} from "@/lib/github-oauth-flow";
import {
  buildLocalClaudePluginDevCommand,
  type LocalClaudeLaunchStatus,
  type LocalClaudePluginDevLaunchRequest,
  type LocalTerminalTarget,
} from "@/lib/local-claude-plugin-dev";
import { getVendorDisplayName, sortModelsByVendor } from "@/lib/model-vendor-utils";
import { WWW_ORIGIN } from "@/lib/wwwOrigin";
import { api } from "@cmux/convex/api";
import type { ProviderStatusResponse } from "@cmux/shared";
import type { SelectedAgentSelection } from "@cmux/shared/agent-selection-core";
import { type AgentVendor } from "@cmux/shared/agent-catalog";
import {
  type TaskClass,
  TASK_CLASS_MAPPINGS,
  getTaskClassMapping,
} from "@cmux/shared";
import { parseGithubRepoUrl } from "@cmux/shared";
import { useUser } from "@stackframe/react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import clsx from "clsx";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  GitBranch,
  Image,
  Info,
  Link2,
  Mic,
  Repeat,
  SlidersHorizontal,
  Server,
  X,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AgentCommandItem, MAX_AGENT_COMMAND_COUNT } from "./AgentCommandItem";

interface DashboardInputControlsProps {
  projectOptions: SelectOption[];
  selectedProject: string[];
  onProjectChange: (projects: string[]) => void;
  onProjectSearchPaste?: (value: string) => boolean | Promise<boolean>;
  branchOptions: string[];
  selectedBranch: string[];
  onBranchChange: (branches: string[]) => void;
  onBranchSearchChange?: (search: string) => void;
  isBranchSearchLoading?: boolean;
  onBranchLoadMore?: () => void;
  canLoadMoreBranches?: boolean;
  isLoadingMoreBranches?: boolean;
  selectedAgentSelections: SelectedAgentSelection[];
  onAgentSelectionsChange: (selections: SelectedAgentSelection[]) => void;
  isCloudMode: boolean;
  onCloudModeToggle: () => void;
  isLoadingProjects: boolean;
  isLoadingBranches: boolean;
  teamSlugOrId: string;
  cloudToggleDisabled?: boolean;
  branchDisabled?: boolean;
  providerStatus?: ProviderStatusResponse | null;
  /** Set of agent names disabled by user in Settings > Models */
  disabledByUserModels?: Set<string>;
  /** Models from Convex (includes runtime-discovered models), filtered by availability */
  convexModels?: ConvexModelEntry[] | null;
  /** Ralph Mode: keep working until explicit completion signal */
  isRalphMode?: boolean;
  onRalphModeToggle?: () => void;
  taskDescription?: string;
  /** Task class for automatic model routing */
  selectedTaskClass?: TaskClass | null;
  onTaskClassChange?: (taskClass: TaskClass | null) => void;
}

// Type for models from Convex
interface ConvexModelEntry {
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
  contextWindow?: number;
  maxOutputTokens?: number;
  variants?: Array<{
    id: string;
    displayName: string;
    description?: string;
  }>;
  defaultVariant?: string;
}

type AgentOption = SelectOptionObject & {
  displayLabel: string;
  isDisabled?: boolean;
  statusTone?: "healthy" | "warning" | "error";
  statusLabel?: string;
  statusDetail?: string;
  contextInfo?: string; // e.g., "1M context, 32K output"
};

type AgentSelectionInstance = {
  selection: SelectedAgentSelection;
  id: string;
};

type LocalClaudeLaunchRecord = {
  id?: string;
  launchId?: string;
  command: string;
  workspacePath: string;
  terminal: LocalTerminalTarget;
  status?: LocalClaudeLaunchStatus;
  scriptPath?: string;
  orchestrationId?: string;
  taskId?: string;
  taskRunId?: string;
  agentName?: string;
  runDir?: string;
  sessionInfoPath?: string;
  sessionId?: string;
  injectionMode?: string;
  lastInjectionAt?: string;
  injectionCount?: number;
  error?: string;
  exitCode?: number;
  launchedAt: string;
  exitedAt?: string;
};

type LocalClaudeProfile = {
  id?: string;
  name: string;
  workspacePath: string;
  terminal: "terminal" | "iterm" | "ghostty" | "alacritty";
  pluginDirsInput: string;
  settingsInput: string;
  mcpConfigsInput: string;
  allowedToolsInput: string;
  disallowedToolsInput: string;
  updatedAt: string;
};

const GITHUB_INSTALL_COMPLETE_MESSAGE_TYPES = new Set([
  "manaflow/github-install-complete",
  "cmux/github-install-complete",
]);

const STATUS_ICON_CLASSNAME: Record<NonNullable<AgentOption["statusTone"]>, string> = {
  healthy: "text-green-600 dark:text-green-400",
  warning: "text-amber-600 dark:text-amber-400",
  error: "text-red-600 dark:text-red-400",
};

/** Format context window size for display (e.g., 1000000 -> "1M") */
function formatTokenCount(tokens: number | undefined): string | undefined {
  if (!tokens) return undefined;
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(tokens % 1000000 === 0 ? 0 : 1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`;
  return `${tokens}`;
}

function normalizeSelectionForModel(
  selection: SelectedAgentSelection,
  model: ConvexModelEntry | undefined,
): SelectedAgentSelection {
  const variants = model?.variants ?? [];
  if (variants.length <= 1) {
    return { agentName: selection.agentName };
  }

  const selectedVariant =
    selection.selectedVariant &&
    variants.some((variant) => variant.id === selection.selectedVariant)
      ? selection.selectedVariant
      : model?.defaultVariant ?? variants[0]?.id;

  return {
    agentName: selection.agentName,
    ...(selectedVariant ? { selectedVariant } : {}),
  };
}

function getSelectionKey(selection: SelectedAgentSelection): string {
  return `${selection.agentName}::${selection.selectedVariant ?? ""}`;
}

function getVariantDisplayLabel(
  model: ConvexModelEntry | undefined,
  selectedVariant: string | undefined,
): string | undefined {
  if (!model || !selectedVariant) {
    return undefined;
  }

  return model.variants?.find((variant) => variant.id === selectedVariant)
    ?.displayName;
}

function parseMultilineList(value: string): string[] {
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildLocalLaunchMetadataPatch(input: {
  orchestrationId?: string;
  runDir?: string;
  sessionInfoPath?: string;
  sessionId?: string;
  injectionMode?: string;
  lastInjectionAt?: string;
  injectionCount?: number;
}) {
  return {
    ...(input.orchestrationId ? { orchestrationId: input.orchestrationId } : {}),
    ...(input.runDir ? { runDir: input.runDir } : {}),
    ...(input.sessionInfoPath ? { sessionInfoPath: input.sessionInfoPath } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.injectionMode ? { injectionMode: input.injectionMode } : {}),
    ...(input.lastInjectionAt ? { lastInjectionAt: input.lastInjectionAt } : {}),
    ...(typeof input.injectionCount === "number"
      ? { injectionCount: input.injectionCount }
      : {}),
  };
}

function hasLocalLaunchMetadataChanges(
  entry: LocalClaudeLaunchRecord,
  patch: Partial<LocalClaudeLaunchRecord>,
) {
  return Object.entries(patch).some(([key, value]) => entry[key as keyof LocalClaudeLaunchRecord] !== value);
}

function applyLocalLaunchMetadataPatch(
  entry: LocalClaudeLaunchRecord,
  patch: Partial<LocalClaudeLaunchRecord>,
): LocalClaudeLaunchRecord {
  if (!hasLocalLaunchMetadataChanges(entry, patch)) {
    return entry;
  }
  return {
    ...entry,
    ...patch,
  };
}

function watchPopupClosed(win: Window | null, onClose: () => void): void {
  if (!win) return;
  const timer = window.setInterval(() => {
    try {
      if (win.closed) {
        window.clearInterval(timer);
        onClose();
      }
    } catch (err) {
      console.error("[GitHubOAuthFlow] Popup window failed to close:", err);
    }
  }, 600);
}

function openCenteredPopup(
  url: string,
  opts?: { name?: string; width?: number; height?: number },
  onClose?: () => void,
): Window | null {
  if (isElectron) {
    // In Electron, always open in the system browser and skip popup plumbing
    window.open(url, "_blank", "noopener,noreferrer");
    return null;
  }
  const name = opts?.name ?? "manaflow-popup";
  const width = Math.floor(opts?.width ?? 980);
  const height = Math.floor(opts?.height ?? 780);
  const dualScreenLeft = window.screenLeft ?? window.screenX ?? 0;
  const dualScreenTop = window.screenTop ?? window.screenY ?? 0;
  const outerWidth = window.outerWidth || window.innerWidth || width;
  const outerHeight = window.outerHeight || window.innerHeight || height;
  const left = Math.max(0, dualScreenLeft + (outerWidth - width) / 2);
  const top = Math.max(0, dualScreenTop + (outerHeight - height) / 2);
  const features = [
    `width=${width}`,
    `height=${height}`,
    `left=${Math.floor(left)}`,
    `top=${Math.floor(top)}`,
    "resizable=yes",
    "scrollbars=yes",
    "toolbar=no",
    "location=no",
    "status=no",
    "menubar=no",
  ].join(",");

  const win = window.open("about:blank", name, features);
  if (win) {
    try {
      win.location.href = url;
    } catch {
      window.open(url, "_blank");
    }
    win.focus?.();
    if (onClose) watchPopupClosed(win, onClose);
    return win;
  } else {
    window.open(url, "_blank");
    return null;
  }
}

export const DashboardInputControls = memo(function DashboardInputControls({
  projectOptions,
  selectedProject,
  onProjectChange,
  onProjectSearchPaste,
  branchOptions,
  selectedBranch,
  onBranchChange,
  onBranchSearchChange,
  isBranchSearchLoading = false,
  onBranchLoadMore,
  canLoadMoreBranches = false,
  isLoadingMoreBranches = false,
  selectedAgentSelections,
  onAgentSelectionsChange,
  isCloudMode,
  onCloudModeToggle,
  isLoadingProjects,
  isLoadingBranches,
  teamSlugOrId,
  cloudToggleDisabled = false,
  branchDisabled = false,
  providerStatus = null,
  disabledByUserModels,
  convexModels,
  isRalphMode = false,
  onRalphModeToggle,
  taskDescription = "",
  selectedTaskClass = null,
  onTaskClassChange,
}: DashboardInputControlsProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useUser({ or: "return-null" });
  const { availableEditors } = useSocket();
  const agentSelectRef = useRef<SearchableSelectHandle | null>(null);
  const mintState = useMutation(api.github_app.mintInstallState);
  const addManualRepo = useAction(api.github_http.addManualRepo);
  const openAiProviderSettings = useCallback(() => {
    navigate({
      to: "/$teamSlugOrId/settings",
      params: { teamSlugOrId },
      search: { section: "ai-providers" },
    });
  }, [navigate, teamSlugOrId]);
  const vendorStatuses = useMemo(
    () => buildAggregatedVendorStatuses(providerStatus),
    [providerStatus]
  );
  const selectedAgents = useMemo(
    () => selectedAgentSelections.map((selection) => selection.agentName),
    [selectedAgentSelections],
  );
  const hasLocalClaudeSelection = useMemo(
    () =>
      !isCloudMode &&
      selectedAgentSelections.some((selection) =>
        selection.agentName.startsWith("claude/"),
      ),
    [isCloudMode, selectedAgentSelections],
  );
  const [localPluginDirsInput, setLocalPluginDirsInput] = useState("");
  const [localWorkspaceInput, setLocalWorkspaceInput] = useState("");
  const [localClaudeBinPathInput, setLocalClaudeBinPathInput] = useState("");
  const [localTerminalTarget, setLocalTerminalTarget] =
    useState<LocalTerminalTarget>("terminal");
  const [localSettingsInput, setLocalSettingsInput] = useState(
    "./.claude/settings.local.json",
  );
  const [localMcpConfigsInput, setLocalMcpConfigsInput] = useState(
    "./.claude/mcp.local.json",
  );
  const [localAllowedToolsInput, setLocalAllowedToolsInput] = useState(
    "Read,Write",
  );
  const [localDisallowedToolsInput, setLocalDisallowedToolsInput] = useState("");
  const [localProfileNameInput, setLocalProfileNameInput] = useState("");
  const [localSavedProfiles, setLocalSavedProfiles] = useState<LocalClaudeProfile[]>(
    () => {
      if (typeof window === "undefined") {
        return [];
      }
      try {
        const raw = localStorage.getItem(
          `localClaudePluginDevProfiles-${teamSlugOrId}`,
        );
        if (!raw) {
          return [];
        }
        const parsed = JSON.parse(raw) as LocalClaudeProfile[];
        return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
      } catch {
        return [];
      }
    },
  );
  const persistedLocalClaudeProfiles = useQuery(api.localClaudeProfiles.list, {
    teamSlugOrId,
  });
  const upsertLocalClaudeProfile = useMutation(api.localClaudeProfiles.upsert);
  const removeLocalClaudeProfile = useMutation(api.localClaudeProfiles.remove);
  const [localLaunchHistory, setLocalLaunchHistory] = useState<
    LocalClaudeLaunchRecord[]
  >(() => {
    if (typeof window === "undefined") {
      return [];
    }
    try {
      const raw = localStorage.getItem(
        `localClaudePluginDevLaunches-${teamSlugOrId}`,
      );
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw) as LocalClaudeLaunchRecord[];
      return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
    } catch {
      return [];
    }
  });
  const persistedLocalClaudeLaunches = useQuery(api.localClaudeLaunches.list, {
    teamSlugOrId,
    limit: 5,
  });
  const recordLocalClaudeLaunch = useMutation(api.localClaudeLaunches.record);
  const updateLocalClaudeLaunchOutcome = useMutation(
    api.localClaudeLaunches.updateOutcome,
  );
  const updateLocalClaudeLaunchMetadata = useMutation(
    api.localClaudeLaunches.updateMetadata,
  );
  const bindLocalClaudeLaunchSession = useMutation(
    api.localClaudeLaunches.bindSessionToBridge,
  );
  const ensureLocalClaudeLaunchBridge = useMutation(
    api.localClaudeLaunches.ensureTaskRunBridge,
  );
  const localTerminalOptions = useMemo(
    () => [
      {
        value: "terminal" as const,
        label: "Terminal.app",
        available: availableEditors?.terminal ?? true,
      },
      {
        value: "iterm" as const,
        label: "iTerm",
        available: availableEditors?.iterm ?? true,
      },
      {
        value: "ghostty" as const,
        label: "Ghostty",
        available: availableEditors?.ghostty ?? true,
      },
      {
        value: "alacritty" as const,
        label: "Alacritty",
        available: availableEditors?.alacritty ?? true,
      },
    ],
    [availableEditors],
  );
  const localTerminalTargetAvailable = useMemo(
    () =>
      localTerminalOptions.find((option) => option.value === localTerminalTarget)
        ?.available ?? true,
    [localTerminalOptions, localTerminalTarget],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    localStorage.setItem(
      `localClaudePluginDevLaunches-${teamSlugOrId}`,
      JSON.stringify(localLaunchHistory.slice(0, 5)),
    );
  }, [localLaunchHistory, teamSlugOrId]);

  useEffect(() => {
    if (!persistedLocalClaudeLaunches) {
      return;
    }
    setLocalLaunchHistory(persistedLocalClaudeLaunches);
  }, [persistedLocalClaudeLaunches]);

  useEffect(() => {
    const bridge = getElectronBridge();
    if (!bridge) {
      return;
    }
    const unsubscribeMetadata = bridge.on("local-command-metadata", (payload) => {
      const event = payload as {
        launchId?: string;
        orchestrationId?: string;
        runDir?: string;
        sessionInfoPath?: string;
        sessionId?: string;
        injectionMode?: string;
        lastInjectionAt?: string;
        injectionCount?: number;
      };
      if (!event.launchId) {
        return;
      }

      const metadataPatch = buildLocalLaunchMetadataPatch({
        orchestrationId: event.orchestrationId,
        runDir: event.runDir,
        sessionInfoPath: event.sessionInfoPath,
        sessionId: event.sessionId,
        injectionMode: event.injectionMode,
        lastInjectionAt: event.lastInjectionAt,
        injectionCount: event.injectionCount,
      });
      const currentEntry = localLaunchHistory.find((entry) => entry.launchId === event.launchId);

      setLocalLaunchHistory((prev) => {
        let changed = false;
        const next = prev.map((entry) => {
          if (entry.launchId !== event.launchId) {
            return entry;
          }
          const patched = applyLocalLaunchMetadataPatch(entry, metadataPatch);
          if (patched !== entry) {
            changed = true;
          }
          return patched;
        });
        return changed ? next : prev;
      });

      if (!currentEntry || !hasLocalLaunchMetadataChanges(currentEntry, metadataPatch)) {
        return;
      }

      void updateLocalClaudeLaunchMetadata({
        teamSlugOrId,
        launchId: event.launchId,
        ...metadataPatch,
      })
        .then(async () => {
          const launchEntry = localLaunchHistory.find((entry) => entry.launchId === event.launchId);
          if (!launchEntry || !event.orchestrationId || !launchEntry.agentName) {
            return;
          }

          try {
            if (!event.launchId) {
              return;
            }
            const launchId = event.launchId;
            const bridgeResult = await ensureLocalClaudeLaunchBridge({
              teamSlugOrId,
              launchId,
              prompt: taskDescription.trim(),
              workspacePath: launchEntry.workspacePath,
              agentName: launchEntry.agentName,
              orchestrationId: event.orchestrationId,
              ...(event.sessionId ? { sessionId: event.sessionId } : {}),
            });

            const nextTaskId = String(bridgeResult.taskId);
            const nextTaskRunId = String(bridgeResult.taskRunId);
            setLocalLaunchHistory((prev) => {
              let changed = false;
              const next = prev.map((entry) => {
                if (entry.launchId !== event.launchId) {
                  return entry;
                }
                const patched = applyLocalLaunchMetadataPatch(
                  {
                    ...entry,
                    taskId: nextTaskId,
                    taskRunId: nextTaskRunId,
                  },
                  metadataPatch,
                );
                if (patched !== entry || entry.taskId !== nextTaskId || entry.taskRunId !== nextTaskRunId) {
                  changed = true;
                  return {
                    ...patched,
                    taskId: nextTaskId,
                    taskRunId: nextTaskRunId,
                  };
                }
                return entry;
              });
              return changed ? next : prev;
            });

            if (event.sessionId) {
              await bindLocalClaudeLaunchSession({
                teamSlugOrId,
                launchId,
                sessionId: event.sessionId,
              });
            }

            await updateLocalClaudeLaunchMetadata({
              teamSlugOrId,
              launchId,
              orchestrationId: event.orchestrationId,
              taskId: bridgeResult.taskId,
              taskRunId: bridgeResult.taskRunId,
              agentName: launchEntry.agentName,
              ...buildLocalLaunchMetadataPatch({
                orchestrationId: event.orchestrationId,
                runDir: event.runDir,
                sessionInfoPath: event.sessionInfoPath,
                sessionId: event.sessionId,
                injectionMode: event.injectionMode,
                lastInjectionAt: event.lastInjectionAt,
                injectionCount: event.injectionCount,
              }),
            });
          } catch (error) {
            console.error(
              "[DashboardInputControls] Failed to bridge local Claude launch from metadata event",
              error,
            );
          }
        })
        .catch((error) => {
          console.error(
            "[DashboardInputControls] Failed to persist local Claude launch metadata",
            error,
          );
        });
    });
    const unsubscribeFinished = bridge.on("local-command-finished", (payload) => {
      const event = payload as {
        launchId?: string;
        status?: "completed" | "completed_failed";
        exitCode?: number;
        error?: string;
      };
      if (!event.launchId || !event.status) {
        return;
      }

      setLocalLaunchHistory((prev) =>
        prev.map((entry) =>
          entry.launchId === event.launchId
            ? {
                ...entry,
                status: event.status,
                ...(event.exitCode !== undefined ? { exitCode: event.exitCode } : {}),
                ...(event.error ? { error: event.error } : {}),
                exitedAt: new Date().toISOString(),
              }
            : entry,
        ),
      );

      void updateLocalClaudeLaunchOutcome({
        teamSlugOrId,
        launchId: event.launchId,
        status: event.status,
        ...(event.exitCode !== undefined ? { exitCode: event.exitCode } : {}),
        ...(event.error ? { error: event.error } : {}),
      }).catch((error) => {
        console.error(
          "[DashboardInputControls] Failed to persist local Claude launch outcome",
          error,
        );
      });
    });
    return () => {
      unsubscribeMetadata?.();
      unsubscribeFinished?.();
    };
  }, [
    bindLocalClaudeLaunchSession,
    ensureLocalClaudeLaunchBridge,
    localLaunchHistory,
    taskDescription,
    teamSlugOrId,
    updateLocalClaudeLaunchMetadata,
    updateLocalClaudeLaunchOutcome,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    localStorage.setItem(
      `localClaudePluginDevProfiles-${teamSlugOrId}`,
      JSON.stringify(localSavedProfiles.slice(0, 10)),
    );
  }, [localSavedProfiles, teamSlugOrId]);

  useEffect(() => {
    if (!persistedLocalClaudeProfiles) {
      return;
    }
    setLocalSavedProfiles(persistedLocalClaudeProfiles);
  }, [persistedLocalClaudeProfiles]);

  useEffect(() => {
    if (!isElectron) {
      return;
    }
    const currentOption = localTerminalOptions.find(
      (option) => option.value === localTerminalTarget,
    );
    if (currentOption?.available ?? true) {
      return;
    }
    const fallbackOption = localTerminalOptions.find((option) => option.available);
    if (fallbackOption) {
      setLocalTerminalTarget(fallbackOption.value);
    }
  }, [localTerminalOptions, localTerminalTarget]);
  const hasProviderStatus = Boolean(providerStatus?.success);
  const providerHealthSummary = useMemo(() => {
    if (!providerStatus?.success) {
      return null;
    }

    const readyCount = Array.from(vendorStatuses.values()).filter(
      (status) => status.isAvailable
    ).length;
    const pendingCount = Array.from(vendorStatuses.values()).filter(
      (status) => !status.isAvailable
    ).length;
    const dockerStatus = providerStatus.dockerStatus;
    const dockerRunning = dockerStatus?.isRunning !== false;
    const dockerImageAvailable = dockerStatus?.workerImage?.isAvailable ?? true;

    if (pendingCount === 0 && dockerRunning && dockerImageAvailable) {
      return null;
    }

    return {
      readyCount,
      pendingCount,
      dockerRunning,
      dockerImageAvailable,
      dockerImagePulling: dockerStatus?.workerImage?.isPulling ?? false,
      dockerImageName: dockerStatus?.workerImage?.name,
    };
  }, [providerStatus, vendorStatuses]);
  const convexModelMap = useMemo(
    () =>
      new Map((convexModels ?? []).map((model) => [model.name, model])),
    [convexModels],
  );

  // Task class options for automatic model routing
  const taskClassOptions = useMemo<SelectOptionObject[]>(() => {
    return TASK_CLASS_MAPPINGS.map((mapping) => ({
      value: mapping.taskClass,
      label: mapping.displayName,
      description: mapping.description,
    }));
  }, []);

  // Handle task class change - auto-populate agent based on mapping
  const handleTaskClassChange = useCallback(
    (values: string[]) => {
      const taskClass = values[0] as TaskClass | undefined;
      onTaskClassChange?.(taskClass ?? null);

      if (taskClass && convexModels) {
        const mapping = getTaskClassMapping(taskClass);
        if (mapping) {
          // Find first available model from the mapping
          const availableModelNames = new Set(convexModels.map((m) => m.name));
          const defaultModel = mapping.defaultModels.find((m) =>
            availableModelNames.has(m)
          );
          const escalationModel = mapping.escalationModels.find((m) =>
            availableModelNames.has(m)
          );
          const selectedModel = defaultModel ?? escalationModel;

          if (selectedModel) {
            onAgentSelectionsChange([
              {
                agentName: selectedModel,
                selectedVariant: mapping.defaultVariant,
              },
            ]);
          }
        }
      }
    },
    [convexModels, onAgentSelectionsChange, onTaskClassChange]
  );

  const agentOptions = useMemo<AgentOption[]>(() => {
    const baseModels: Array<{
      name: string;
      displayName: string;
      vendor: string;
      disabled?: boolean;
    }> = convexModels ?? [];

    // Filter out agents disabled by user in Settings > Models (legacy - now unused)
    const enabledModels = disabledByUserModels
      ? baseModels.filter((entry) => !disabledByUserModels.has(entry.name))
      : baseModels;

    // Filter out agents disabled at catalog level (e.g., deprecated models)
    const activeModels = enabledModels.filter(
      (entry) => entry.disabled !== true
    );

    // Sort models by vendor group first, then by sortOrder within each vendor
    const sortedModels = sortModelsByVendor(activeModels, (m) =>
      "sortOrder" in m ? (m as ConvexModelEntry).sortOrder : 999
    );

    const options = sortedModels.map((entry) => {
      const providerMeta = getProviderStatusMeta(
        vendorStatuses,
        entry.vendor,
        openAiProviderSettings,
        hasProviderStatus
      );

      // Build context info string from model metadata
      const convexEntry = entry as ConvexModelEntry;
      const contextStr = formatTokenCount(convexEntry.contextWindow);
      const outputStr = formatTokenCount(convexEntry.maxOutputTokens);
      const contextInfo = contextStr
        ? outputStr
          ? `${contextStr} context, ${outputStr} output`
          : `${contextStr} context`
        : undefined;

      return {
        label: entry.name,
        displayLabel: entry.displayName,
        value: entry.name,
        icon: (
          <span className="relative inline-flex h-4 w-4 items-center justify-center">
            <AgentLogo
              agentName={entry.name}
              vendor={entry.vendor as AgentVendor}
              className="w-4 h-4"
            />
            {providerMeta.statusTone ? (
              <span
                className={clsx(
                  "absolute -right-1 -bottom-1 inline-flex h-2.5 w-2.5 rounded-full border border-white dark:border-neutral-950",
                  providerMeta.statusTone === "healthy"
                    ? "bg-green-500"
                    : providerMeta.statusTone === "warning"
                      ? "bg-amber-500"
                      : "bg-red-500"
                )}
              />
            ) : null}
          </span>
        ),
        iconKey: entry.vendor,
        contextInfo,
        secondaryText: contextInfo,
        ...providerMeta,
      } satisfies AgentOption;
    });

    const grouped: AgentOption[] = [];
    let lastVendor: string | null = null;
    for (const option of options) {
      const vendor = option.iconKey ?? "other";
      if (vendor !== lastVendor) {
        lastVendor = vendor;
        const headingLabel = getVendorDisplayName(vendor);
        grouped.push({
          label: headingLabel,
          displayLabel: headingLabel,
          value: `heading:${vendor}`,
          heading: true,
          iconKey: vendor,
        });
      }
      grouped.push(option);
    }

    return grouped;
  }, [convexModels, disabledByUserModels, hasProviderStatus, openAiProviderSettings, vendorStatuses]);

  const agentOptionsByValue = useMemo(() => {
    const map = new Map<string, AgentOption>();
    for (const option of agentOptions) {
      map.set(option.value, option);
    }
    return map;
  }, [agentOptions]);


  const generateInstanceId = () => crypto.randomUUID();

  const agentInstancesRef = useRef<AgentSelectionInstance[]>([]);

  const agentInstances = useMemo(() => {
    const previous = agentInstancesRef.current;
    const remaining = [...previous];
    const next: AgentSelectionInstance[] = [];

    for (const selection of selectedAgentSelections) {
      const matchIndex = remaining.findIndex(
        (instance) =>
          instance.selection.agentName === selection.agentName &&
          instance.selection.selectedVariant === selection.selectedVariant,
      );
      if (matchIndex !== -1) {
        next.push(remaining.splice(matchIndex, 1)[0]);
      } else {
        next.push({ selection, id: generateInstanceId() });
      }
    }

    agentInstancesRef.current = next;
    return next;
  }, [selectedAgentSelections]);

  const instanceIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    agentInstances.forEach((instance, index) => {
      map.set(instance.id, index);
    });
    return map;
  }, [agentInstances]);

  const aggregatedAgentSelections = useMemo(() => {
    const vendorOrder = new Map<string, number>();
    agentOptions.forEach((option, index) => {
      const vendor = option.iconKey ?? "other";
      if (!vendorOrder.has(vendor)) vendorOrder.set(vendor, index);
    });

    const grouped = new Map<
      string,
      {
        option: AgentOption;
        selection: SelectedAgentSelection;
        instances: AgentSelectionInstance[];
      }
    >();

    for (const instance of agentInstances) {
      const option = agentOptionsByValue.get(instance.selection.agentName);
      if (!option) continue;
      const key = getSelectionKey(instance.selection);
      const existing = grouped.get(key);
      if (existing) {
        existing.instances.push(instance);
      } else {
        grouped.set(key, {
          option,
          selection: instance.selection,
          instances: [instance],
        });
      }
    }

    return Array.from(grouped.values()).sort((a, b) => {
      const vendorA = a.option.iconKey ?? "other";
      const vendorB = b.option.iconKey ?? "other";
      const rankA = vendorOrder.get(vendorA) ?? Number.MAX_SAFE_INTEGER;
      const rankB = vendorOrder.get(vendorB) ?? Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) return rankA - rankB;
      const labelComparison = a.option.displayLabel.localeCompare(
        b.option.displayLabel,
      );
      if (labelComparison !== 0) return labelComparison;
      const variantComparison = (a.selection.selectedVariant ?? "").localeCompare(
        b.selection.selectedVariant ?? "",
      );
      if (variantComparison !== 0) return variantComparison;
      const idA = a.instances[0]?.id ?? "";
      const idB = b.instances[0]?.id ?? "";
      return idA.localeCompare(idB);
    });
  }, [agentInstances, agentOptions, agentOptionsByValue]);

  const pillboxScrollRef = useRef<HTMLDivElement | null>(null);
  const [showPillboxFade, setShowPillboxFade] = useState(false);

  // Custom repo URL state
  const [showCustomRepoInput, setShowCustomRepoInput] = useState(false);
  const [customRepoUrl, setCustomRepoUrl] = useState("");
  const [customRepoError, setCustomRepoError] = useState<string | null>(null);
  const [isAddingRepo, setIsAddingRepo] = useState(false);

  useEffect(() => {
    const node = pillboxScrollRef.current;
    if (!node) {
      setShowPillboxFade(false);
      return;
    }

    let rafId: number | null = null;

    const updateFade = () => {
      rafId = null;
      const { scrollTop, scrollHeight, clientHeight } = node;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
      const hasOverflow = scrollHeight > clientHeight + 1;
      const shouldShow = hasOverflow && !atBottom;
      setShowPillboxFade((previous) =>
        previous === shouldShow ? previous : shouldShow,
      );
    };

    const scheduleUpdate = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(updateFade);
    };

    scheduleUpdate();
    node.addEventListener("scroll", scheduleUpdate);

    const resizeObserver = new ResizeObserver(() => scheduleUpdate());
    resizeObserver.observe(node);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      node.removeEventListener("scroll", scheduleUpdate);
      resizeObserver?.disconnect();
    };
  }, []);

  // Listen for GitHub install completion message from popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (GITHUB_INSTALL_COMPLETE_MESSAGE_TYPES.has(event.data?.type ?? "")) {
        void queryClient.invalidateQueries();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [queryClient]);

  const handleImageClick = useCallback(() => {
    // Trigger the file select from ImagePlugin
    const lexicalWindow = window as Window & {
      __lexicalImageFileSelect?: () => void;
    };
    if (lexicalWindow.__lexicalImageFileSelect) {
      lexicalWindow.__lexicalImageFileSelect();
    }
  }, []);

  const handleAgentRemove = useCallback(
    (instanceId: string) => {
      const instanceIndex = instanceIndexMap.get(instanceId);
      if (instanceIndex === undefined) {
        return;
      }
      const next = selectedAgentSelections.filter(
        (_, index) => index !== instanceIndex,
      );
      onAgentSelectionsChange(next);
    },
    [
      instanceIndexMap,
      onAgentSelectionsChange,
      selectedAgentSelections,
    ],
  );

  const handleFocusAgentOption = useCallback((agent: string) => {
    agentSelectRef.current?.open({ focusValue: agent });
  }, []);

  const handleAgentChange = useCallback(
    (nextAgents: string[]) => {
      const remaining = [...selectedAgentSelections];
      const nextSelections: SelectedAgentSelection[] = [];

      for (const agentName of nextAgents) {
        const matchIndex = remaining.findIndex(
          (selection) => selection.agentName === agentName,
        );
        const selection =
          matchIndex !== -1
            ? remaining.splice(matchIndex, 1)[0]
            : { agentName };
        nextSelections.push(
          normalizeSelectionForModel(
            selection,
            convexModelMap.get(agentName),
          ),
        );
      }

      onAgentSelectionsChange(nextSelections);
    },
    [convexModelMap, onAgentSelectionsChange, selectedAgentSelections],
  );

  const handleVariantChange = useCallback(
    (instanceIds: string[], selectedVariant: string) => {
      const targetIds = new Set(instanceIds);
      const nextSelections = agentInstances.map((instance) =>
        targetIds.has(instance.id)
          ? normalizeSelectionForModel(
              {
                ...instance.selection,
                selectedVariant,
              },
              convexModelMap.get(instance.selection.agentName),
            )
          : instance.selection,
      );
      onAgentSelectionsChange(nextSelections);
    },
    [agentInstances, convexModelMap, onAgentSelectionsChange],
  );

  const handleCustomRepoSubmit = useCallback(async () => {
    const trimmedUrl = customRepoUrl.trim();

    // Validate URL format before sending to backend
    if (!trimmedUrl) {
      setCustomRepoError("Please enter a GitHub repository URL");
      return;
    }

    const parsed = parseGithubRepoUrl(trimmedUrl);
    if (!parsed) {
      setCustomRepoError("Invalid GitHub repository URL. Use format: owner/repo or https://github.com/owner/repo");
      return;
    }

    setIsAddingRepo(true);
    setCustomRepoError(null);

    try {
      const result = await addManualRepo({
        teamSlugOrId,
        repoUrl: trimmedUrl,
      });

      if (result.success) {
        // Set the repo as selected
        onProjectChange([result.fullName]);

        // Clear the custom input
        setCustomRepoUrl("");
        setCustomRepoError(null);
        setShowCustomRepoInput(false);

        toast.success(`Added ${result.fullName} to repositories`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to add repository";
      setCustomRepoError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsAddingRepo(false);
    }
  }, [customRepoUrl, addManualRepo, teamSlugOrId, onProjectChange]);

  const handleCustomRepoInputChange = useCallback((value: string) => {
    setCustomRepoUrl(value);
    setCustomRepoError(null);
  }, []);

  const providerSettingsTooltip = useMemo(() => {
    if (!providerHealthSummary) {
      return hasProviderStatus
        ? "All providers look ready. Open AI provider settings."
        : "Open AI provider settings.";
    }

    const healthSummary = [
      `${providerHealthSummary.readyCount} ready`,
      providerHealthSummary.pendingCount > 0
        ? `${providerHealthSummary.pendingCount} need setup`
        : null,
      !providerHealthSummary.dockerRunning
        ? "Docker not running"
        : !providerHealthSummary.dockerImageAvailable &&
            providerHealthSummary.dockerImageName
          ? providerHealthSummary.dockerImagePulling
            ? `Pulling ${providerHealthSummary.dockerImageName}`
            : `${providerHealthSummary.dockerImageName} unavailable`
          : null,
    ]
      .filter(Boolean)
      .join(" · ");

    return `${healthSummary}. Open AI provider settings.`;
  }, [hasProviderStatus, providerHealthSummary]);

  const providerSettingsButton = (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            agentSelectRef.current?.close();
            openAiProviderSettings();
          }}
          aria-label="Open AI provider settings"
          className={clsx(
            "inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent",
            "text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/60",
            "dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-200",
            providerHealthSummary
              ? "text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
              : null,
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">Open AI provider settings</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-60 text-[11px]">
        {providerSettingsTooltip}
      </TooltipContent>
    </Tooltip>
  );

  const localClaudeLaunchRequest = useMemo<LocalClaudePluginDevLaunchRequest | null>(
    () => {
      if (!hasLocalClaudeSelection) {
        return null;
      }

      const firstClaudeSelection = selectedAgentSelections.find((selection) =>
        selection.agentName.startsWith("claude/"),
      );
      if (!firstClaudeSelection) {
        return null;
      }

      const trimmedTaskDescription = taskDescription.trim();
      if (!trimmedTaskDescription) {
        return null;
      }

      const workspacePath = localWorkspaceInput.trim();
      if (!workspacePath) {
        return null;
      }

      return {
        agentName: firstClaudeSelection.agentName,
        ...(firstClaudeSelection.selectedVariant
          ? { effort: firstClaudeSelection.selectedVariant }
          : {}),
        taskDescription: trimmedTaskDescription,
        workspacePath,
        terminal: localTerminalTarget,
        ...(localClaudeBinPathInput.trim()
          ? { claudeBinPath: localClaudeBinPathInput.trim() }
          : {}),
        pluginDirs: parseMultilineList(localPluginDirsInput),
        ...(localSettingsInput.trim()
          ? { settingsPath: localSettingsInput.trim() }
          : {}),
        settingSources: ["project", "local"],
        mcpConfigs: parseMultilineList(localMcpConfigsInput),
        ...(localAllowedToolsInput.trim()
          ? { allowedTools: localAllowedToolsInput.trim() }
          : {}),
        ...(localDisallowedToolsInput.trim()
          ? { disallowedTools: localDisallowedToolsInput.trim() }
          : {}),
      };
    },
    [
      hasLocalClaudeSelection,
      localAllowedToolsInput,
      localClaudeBinPathInput,
      localDisallowedToolsInput,
      localMcpConfigsInput,
      localPluginDirsInput,
      localSettingsInput,
      localTerminalTarget,
      localWorkspaceInput,
      selectedAgentSelections,
      taskDescription,
    ],
  );

  const localClaudeCommandPreview = useMemo(() => {
    if (!localClaudeLaunchRequest) {
      return null;
    }

    return buildLocalClaudePluginDevCommand(localClaudeLaunchRequest);
  }, [localClaudeLaunchRequest]);

  const localClaudeLaunchStatusLabel = useCallback(
    (status: LocalClaudeLaunchStatus | undefined) => {
      switch (status) {
        case "launch_failed":
        case "completed_failed":
          return "failed";
        case "completed":
          return "completed";
        case "launched":
        default:
          return "launched";
      }
    },
    [],
  );

  const localClaudeLaunchStatusTone = useCallback(
    (status: LocalClaudeLaunchStatus | undefined) => {
      switch (status) {
        case "launch_failed":
        case "completed_failed":
          return "text-red-700/80 dark:text-red-300/80";
        case "completed":
          return "text-green-700/80 dark:text-green-300/80";
        case "launched":
        default:
          return "text-blue-800/80 dark:text-blue-200/80";
      }
    },
    [],
  );

  const handleCopyLocalClaudeCommand = useCallback(async () => {
    if (!localClaudeCommandPreview) return;
    try {
      await navigator.clipboard.writeText(localClaudeCommandPreview);
      toast.success("Copied local Claude plugin-dev command");
    } catch (error) {
      console.error(
        "[DashboardInputControls] Failed to copy local Claude command",
        error,
      );
      toast.error("Failed to copy local Claude plugin-dev command");
    }
  }, [localClaudeCommandPreview]);

  const handleRunLocalClaudeCommand = useCallback(async () => {
    const bridge = getElectronBridge();
    if (!bridge?.local?.launchClaudePluginDev) {
      toast.error("Local terminal execution is only available in the Electron app");
      return;
    }
    if (!localClaudeLaunchRequest) {
      toast.error("Enter a task description and workspace path before running");
      return;
    }
    if (!localTerminalTargetAvailable) {
      toast.error(`Selected terminal target is not available: ${localTerminalTarget}`);
      return;
    }

    const result = await bridge.local.launchClaudePluginDev(localClaudeLaunchRequest);

    const launchRecord: LocalClaudeLaunchRecord = {
      ...(result.ok ? { launchId: result.launchId } : {}),
      command:
        (result.ok ? result.command : localClaudeCommandPreview) ??
        buildLocalClaudePluginDevCommand(localClaudeLaunchRequest),
      workspacePath: localClaudeLaunchRequest.workspacePath,
      terminal: localTerminalTarget,
      launchedAt: new Date().toISOString(),
      status: result.ok ? "launched" : "launch_failed",
      agentName: localClaudeLaunchRequest.agentName,
      ...(result.ok
        ? {
            scriptPath: result.scriptPath,
            orchestrationId: result.orchestrationId,
            runDir: result.runDir,
            sessionInfoPath: result.sessionInfoPath,
            sessionId: result.sessionId,
          }
        : { error: result.error }),
    };
    setLocalLaunchHistory((prev) => [launchRecord, ...prev].slice(0, 5));
    void recordLocalClaudeLaunch({
      teamSlugOrId,
      launchId: result.ok ? result.launchId : `failed-${Date.now()}`,
      command: launchRecord.command,
      workspacePath: launchRecord.workspacePath,
      terminal: launchRecord.terminal,
      status: launchRecord.status ?? "launched",
      ...(launchRecord.scriptPath ? { scriptPath: launchRecord.scriptPath } : {}),
      ...buildLocalLaunchMetadataPatch({
        orchestrationId: launchRecord.orchestrationId,
        runDir: launchRecord.runDir,
        sessionInfoPath: launchRecord.sessionInfoPath,
        sessionId: launchRecord.sessionId,
      }),
      ...(launchRecord.agentName ? { agentName: launchRecord.agentName } : {}),
      ...(launchRecord.error ? { error: launchRecord.error } : {}),
    })
      .then(async () => {
        if (!result.ok || !launchRecord.orchestrationId || !launchRecord.agentName) {
          return;
        }

        try {
          const bridgeResult = await ensureLocalClaudeLaunchBridge({
            teamSlugOrId,
            launchId: result.launchId,
            prompt: localClaudeLaunchRequest.taskDescription,
            workspacePath: launchRecord.workspacePath,
            agentName: launchRecord.agentName,
            orchestrationId: launchRecord.orchestrationId,
            ...(launchRecord.sessionId ? { sessionId: launchRecord.sessionId } : {}),
          });

          const nextTaskId = String(bridgeResult.taskId);
          const nextTaskRunId = String(bridgeResult.taskRunId);
          setLocalLaunchHistory((prev) =>
            prev.map((entry) =>
              entry.launchId === result.launchId
                ? {
                    ...entry,
                    taskId: nextTaskId,
                    taskRunId: nextTaskRunId,
                  }
                : entry,
            ),
          );

          await updateLocalClaudeLaunchMetadata({
            teamSlugOrId,
            launchId: result.launchId,
            ...buildLocalLaunchMetadataPatch({
              orchestrationId: launchRecord.orchestrationId,
              runDir: launchRecord.runDir,
              sessionInfoPath: launchRecord.sessionInfoPath,
              sessionId: launchRecord.sessionId,
            }),
          });
        } catch (error) {
          console.error(
            "[DashboardInputControls] Failed to bridge local Claude launch into shared runtime",
            error,
          );
        }
      })
      .catch((error) => {
        console.error(
          "[DashboardInputControls] Failed to persist local Claude launch",
          error,
        );
      });

    if (result.ok) {
      toast.success(`Opened local Claude plugin-dev run in ${localTerminalTarget}`);
    } else {
      toast.error(result.error);
    }
  }, [
    ensureLocalClaudeLaunchBridge,
    localClaudeCommandPreview,
    localClaudeLaunchRequest,
    localTerminalTarget,
    localTerminalTargetAvailable,
    recordLocalClaudeLaunch,
    teamSlugOrId,
    updateLocalClaudeLaunchMetadata,
  ]);

  const handleSaveLocalClaudeProfile = useCallback(async () => {
    const name = localProfileNameInput.trim();
    if (!name) {
      toast.error("Enter a profile name before saving");
      return;
    }

    const profile: LocalClaudeProfile = {
      name,
      workspacePath: localWorkspaceInput.trim(),
      terminal: localTerminalTarget,
      pluginDirsInput: localPluginDirsInput,
      settingsInput: localSettingsInput,
      mcpConfigsInput: localMcpConfigsInput,
      allowedToolsInput: localAllowedToolsInput,
      disallowedToolsInput: localDisallowedToolsInput,
      updatedAt: new Date().toISOString(),
    };

    try {
      const profileId = await upsertLocalClaudeProfile({
        teamSlugOrId,
        name,
        workspacePath: profile.workspacePath,
        terminal: profile.terminal,
        pluginDirsInput: profile.pluginDirsInput,
        settingsInput: profile.settingsInput,
        mcpConfigsInput: profile.mcpConfigsInput,
        allowedToolsInput: profile.allowedToolsInput,
        disallowedToolsInput: profile.disallowedToolsInput,
      });
      setLocalSavedProfiles((prev) => {
        const withoutExisting = prev.filter((entry) => entry.name !== name);
        return [{ ...profile, id: String(profileId) }, ...withoutExisting].slice(0, 10);
      });
      toast.success(`Saved local Claude profile: ${name}`);
    } catch (error) {
      console.error(
        "[DashboardInputControls] Failed to persist local Claude profile",
        error,
      );
      setLocalSavedProfiles((prev) => {
        const withoutExisting = prev.filter((entry) => entry.name !== name);
        return [profile, ...withoutExisting].slice(0, 10);
      });
      toast.error("Failed to persist profile to team storage. Saved locally only.");
    }
  }, [
    localAllowedToolsInput,
    localDisallowedToolsInput,
    localMcpConfigsInput,
    localPluginDirsInput,
    localProfileNameInput,
    localSettingsInput,
    localTerminalTarget,
    localWorkspaceInput,
    teamSlugOrId,
    upsertLocalClaudeProfile,
  ]);

  const applyLocalClaudeProfile = useCallback((profile: LocalClaudeProfile) => {
    setLocalProfileNameInput(profile.name);
    setLocalWorkspaceInput(profile.workspacePath);
    setLocalTerminalTarget(profile.terminal);
    setLocalPluginDirsInput(profile.pluginDirsInput);
    setLocalSettingsInput(profile.settingsInput);
    setLocalMcpConfigsInput(profile.mcpConfigsInput);
    setLocalAllowedToolsInput(profile.allowedToolsInput);
    setLocalDisallowedToolsInput(profile.disallowedToolsInput);
    toast.success(`Loaded local Claude profile: ${profile.name}`);
  }, []);

  const handleDeleteLocalClaudeProfile = useCallback(
    async (profile: LocalClaudeProfile) => {
      setLocalSavedProfiles((prev) =>
        prev.filter((entry) => entry.name !== profile.name),
      );

      if (profile.id) {
        try {
          await removeLocalClaudeProfile({
            teamSlugOrId,
            profileId: profile.id as never,
          });
        } catch (error) {
          console.error(
            "[DashboardInputControls] Failed to delete local Claude profile",
            error,
          );
          toast.error("Failed to delete profile from team storage");
          return;
        }
      }

      toast.success(`Deleted local Claude profile: ${profile.name}`);
    },
    [removeLocalClaudeProfile, teamSlugOrId],
  );

  const agentSelectionFooter = selectedAgents.length ? (
    <div className="bg-neutral-50 dark:bg-neutral-900/70">
      {hasProviderStatus ? (
        <div className="border-b border-neutral-200 px-2 py-2 text-[11px] text-neutral-600 dark:border-neutral-800 dark:text-neutral-300">
          <div className="flex flex-wrap gap-2">
            {Array.from(vendorStatuses.values()).map((status) => {
              const Icon = status.isAvailable ? CheckCircle2 : AlertCircle;
              return (
                <button
                  key={status.vendor}
                  type="button"
                  onClick={openAiProviderSettings}
                  className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[10px] font-medium text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-100 dark:bg-neutral-950 dark:text-neutral-200 dark:ring-neutral-800 dark:hover:bg-neutral-900"
                  title={status.detail}
                >
                  <Icon
                    className={clsx(
                      "size-3",
                      status.isAvailable
                        ? STATUS_ICON_CLASSNAME.healthy
                        : STATUS_ICON_CLASSNAME.warning
                    )}
                  />
                  <span>{status.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="relative">
        <div
          ref={pillboxScrollRef}
          className="max-h-32 overflow-y-auto py-2 px-2"
        >
          <div className="flex flex-wrap gap-1">
            {aggregatedAgentSelections.map(({ option, selection, instances }) => {
              const label = getVariantDisplayLabel(
                convexModelMap.get(selection.agentName),
                selection.selectedVariant,
              )
                ? `${option.displayLabel} · ${getVariantDisplayLabel(
                    convexModelMap.get(selection.agentName),
                    selection.selectedVariant,
                  )}`
                : option.displayLabel;
              const representativeInstance = instances[0];
              if (!representativeInstance) {
                return null;
              }
              const count = instances.length;
              return (
                <div
                  key={getSelectionKey(selection)}
                  className="inline-flex cursor-default items-center rounded-full bg-neutral-200/70 dark:bg-neutral-800/80 pl-1.5 pr-2 py-1 text-[11px] text-neutral-700 dark:text-neutral-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/60 hover:bg-neutral-200 dark:hover:bg-neutral-700/80"
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    handleFocusAgentOption(
                      representativeInstance.selection.agentName,
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleFocusAgentOption(
                        representativeInstance.selection.agentName,
                      );
                    }
                  }}
                  aria-label={`Focus selection for ${label}`}
                >
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      handleAgentRemove(representativeInstance.id);
                    }}
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:bg-neutral-400/30 dark:hover:bg-neutral-500/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/60"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                    <span className="sr-only">Remove all {label}</span>
                  </button>
                  {option.icon ? (
                    <span className="inline-flex h-3.5 w-3.5 items-center justify-center ml-0.5">
                      {option.icon}
                    </span>
                  ) : null}
                  <span className="max-w-[118px] truncate text-left select-none ml-1.5">
                    {label}
                  </span>
                  <span className="inline-flex min-w-[1.125rem] items-center justify-center rounded-full bg-neutral-300/80 px-1 text-[10px] font-semibold leading-4 text-neutral-700 dark:bg-neutral-700/70 dark:text-neutral-100 ml-1.5 tabular-nums select-none">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        {showPillboxFade ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-neutral-50/60 via-neutral-50/15 to-transparent dark:from-neutral-900/70 dark:via-neutral-900/20" />
        ) : null}
      </div>
    </div>
  ) : (
    <div className="px-3 flex items-center text-[12px] text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-900/70 h-[40.5px] select-none">
      No agents selected yet.
    </div>
  );

  const visibleVariantControls = aggregatedAgentSelections
    .filter(({ selection }) => {
      const variants = convexModelMap.get(selection.agentName)?.variants ?? [];
      return variants.length > 1;
    })
    .map(({ option, selection, instances }) => {
      const model = convexModelMap.get(selection.agentName);
      const normalizedSelection = normalizeSelectionForModel(selection, model);
      const currentVariant = normalizedSelection.selectedVariant ?? "";
      const instanceIds = instances.map((instance) => instance.id);
      const variantOptions =
        model?.variants?.map((variant) => ({
          label:
            variant.id === model.defaultVariant
              ? `${variant.displayName} (Default)`
              : variant.displayName,
          value: variant.id,
        })) ?? [];

      return (
        <div
          key={getSelectionKey(selection)}
          className="inline-flex items-center gap-1 rounded-xl border border-neutral-200 bg-white/90 px-1 py-1 dark:border-neutral-800 dark:bg-neutral-950/80"
        >
          <div className="flex min-w-0 items-center gap-1 pl-2">
            <p className="truncate text-[12px] font-medium text-neutral-700 dark:text-neutral-200">
              {option.displayLabel}
              {instances.length > 1 ? ` x${instances.length}` : ""}
            </p>
            <Tooltip delayDuration={150}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-neutral-400 transition-colors hover:text-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/60 dark:text-neutral-500 dark:hover:text-neutral-300"
                  aria-label={`What effort means for ${option.displayLabel}`}
                >
                  <Info className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-56 text-[11px]">
                Effort controls reasoning depth for {option.displayLabel}.
              </TooltipContent>
            </Tooltip>
          </div>
          <SearchableSelect
            options={variantOptions}
            value={currentVariant ? [currentVariant] : []}
            onChange={(nextValue) => {
              const nextVariant = nextValue[0];
              if (!nextVariant) {
                return;
              }
              handleVariantChange(instanceIds, nextVariant);
            }}
            triggerAriaLabel={`Select effort for ${option.displayLabel}`}
            placeholder="Select effort"
            singleSelect={true}
            showSearch={false}
            className="min-w-[170px] rounded-lg"
            classNames={{
              trigger:
                "h-8 border-neutral-200 bg-neutral-50/80 dark:border-neutral-800 dark:bg-neutral-900/70",
              popover: "w-[190px]",
            }}
          />
        </div>
      );
    });

  // Function to open GitHub App installation popup (without OAuth check)
  const openGitHubAppInstallPopup = useCallback(async () => {
    const slug = env.NEXT_PUBLIC_GITHUB_APP_SLUG;
    if (!slug) {
      alert("GitHub App not configured. Please contact support.");
      return;
    }
    const baseUrl = `https://github.com/apps/${slug}/installations/new`;
    const returnUrl = !isElectron
      ? new URL(`/${teamSlugOrId}/connect-complete?popup=true`, window.location.origin).toString()
      : undefined;
    const { state } = await mintState({ teamSlugOrId, returnUrl });
    const sep = baseUrl.includes("?") ? "&" : "?";
    const url = `${baseUrl}${sep}state=${encodeURIComponent(state)}`;
    const win = openCenteredPopup(
      url,
      { name: "github-install" },
      () => {
        void queryClient.invalidateQueries();
      },
    );
    win?.focus?.();
  }, [mintState, queryClient, teamSlugOrId]);

  // Check for pending GitHub App install intent on mount and when github-connect-complete is received
  useEffect(() => {
    if (!env.NEXT_PUBLIC_GITHUB_APP_SLUG) {
      return;
    }

    const checkAndConsumeInstallIntent = () => {
      // Atomically get and clear - second call in Strict Mode returns null
      const installIntent = consumeGitHubAppInstallIntent();

      // Only proceed if there's an install intent for THIS team
      if (!installIntent || installIntent.teamSlugOrId !== teamSlugOrId) {
        return;
      }

      void openGitHubAppInstallPopup().catch((err) => {
        console.error("Failed to continue GitHub install after OAuth:", err);
      });
    };

    // Check on mount
    checkAndConsumeInstallIntent();

    // Also check when github-connect-complete event is received (Electron deep link)
    const off = getElectronBridge()?.on("github-connect-complete", checkAndConsumeInstallIntent);

    return () => {
      off?.();
    };
  }, [openGitHubAppInstallPopup, teamSlugOrId]);

  return (
    <div className="flex flex-col gap-1 grow">
      <div className="flex items-end gap-1 grow">
        <div className="flex items-end gap-1">
        <div data-onboarding="repo-picker">
          <SearchableSelect
            options={projectOptions}
            value={selectedProject}
            onChange={onProjectChange}
            onSearchPaste={onProjectSearchPaste}
            placeholder="Select project"
            singleSelect={true}
            className="rounded-2xl"
            loading={isLoadingProjects}
            maxTagCount={1}
            showSearch
          footer={
            <div className="p-1">
              <Link
                to="/$teamSlugOrId/environments/new"
                params={{ teamSlugOrId }}
                search={{
                  step: undefined,
                  selectedRepos: undefined,
                  connectionLogin: undefined,
                  repoSearch: undefined,
                  instanceId: undefined,
                  snapshotId: undefined,
                }}
                className="w-full px-2 h-8 flex items-center gap-2 text-[13.5px] text-neutral-800 dark:text-neutral-200 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-900 cursor-default"
              >
                <Server className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
                <span className="select-none">Create environment</span>
              </Link>
              <button
                type="button"
                onClick={async (e) => {
                  e.preventDefault();
                  try {
                    // First, ensure GitHub OAuth is connected via Stack Auth
                    // This is needed for cloning private repos
                    if (user) {
                      try {
                        const githubAccount = await user.getConnectedAccount("github");
                        if (!githubAccount) {
                          // Store intent to continue with app installation after OAuth
                          setGitHubAppInstallIntent(teamSlugOrId);

                          if (isElectron) {
                            // In Electron, open OAuth flow in system browser
                            // The www endpoint will handle OAuth and return via deep link
                            const oauthUrl = `${WWW_ORIGIN}/handler/connect-github?team=${encodeURIComponent(teamSlugOrId)}`;
                            window.open(oauthUrl, "_blank", "noopener,noreferrer");
                            return;
                          }

                          // In web, use Stack Auth's redirect
                          await user.getConnectedAccount("github", { or: "redirect" });
                          return; // Will redirect, so don't continue
                        }
                      } catch (oauthErr) {
                        console.error("Failed to check GitHub connected account:", oauthErr);
                        // Continue with app installation even if check fails
                      }
                    }

                    // OAuth connected, proceed with app installation
                    await openGitHubAppInstallPopup();
                  } catch (err) {
                    console.error("Failed to start GitHub install:", err);
                    alert("Failed to start installation. Please try again.");
                  }
                }}
                className="w-full px-2 h-8 flex items-center gap-2 text-[13.5px] text-neutral-800 dark:text-neutral-200 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <GitHubIcon className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
                <span className="select-none">Add repos from GitHub</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setShowCustomRepoInput((prev) => !prev);
                  setCustomRepoError(null);
                }}
                className="w-full px-2 h-8 flex items-center gap-2 text-[13.5px] text-neutral-800 dark:text-neutral-200 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <Link2 className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
                <span className="select-none">
                  {showCustomRepoInput ? "Hide repo link menu" : "Import repos from link"}
                </span>
              </button>
              {showCustomRepoInput ? (
                <div className="px-2 pb-2 pt-1">
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={customRepoUrl}
                      onChange={(e) => handleCustomRepoInputChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleCustomRepoSubmit();
                        } else if (e.key === "Escape") {
                          setShowCustomRepoInput(false);
                          setCustomRepoUrl("");
                          setCustomRepoError(null);
                        }
                      }}
                      placeholder="github.com/owner/repo"
                      className={clsx(
                        "flex-1 px-2 h-7 text-[13px] rounded border",
                        "bg-white dark:bg-neutral-800",
                        "border-neutral-300 dark:border-neutral-600",
                        "text-neutral-900 dark:text-neutral-100",
                        "placeholder:text-neutral-400 dark:placeholder:text-neutral-500",
                        "focus:outline-none focus:ring-1 focus:ring-blue-500",
                        customRepoError ? "border-red-500 dark:border-red-500" : ""
                      )}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleCustomRepoSubmit}
                      disabled={isAddingRepo}
                      className={clsx(
                        "px-2 h-7 flex items-center justify-center rounded",
                        "bg-blue-500 hover:bg-blue-600",
                        "text-white text-[12px] font-medium",
                        "transition-colors",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                      title="Add repository"
                    >
                      {isAddingRepo ? (
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  {customRepoError ? (
                    <p className="text-[11px] text-red-500 dark:text-red-400 mt-1 px-1">
                      {customRepoError}
                    </p>
                  ) : (
                    <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1 px-1">
                      Enter any GitHub repository link
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          }
        />
        </div>

        {branchDisabled ? null : (
          <div data-onboarding="branch-picker">
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <SearchableSelect
                    options={branchOptions}
                    value={selectedBranch}
                    onChange={onBranchChange}
                    onSearchChange={onBranchSearchChange}
                    searchLoading={isBranchSearchLoading}
                    disableClientFilter
                    onLoadMore={onBranchLoadMore}
                    canLoadMore={canLoadMoreBranches}
                    isLoadingMore={isLoadingMoreBranches}
                    placeholder="Branch"
                    singleSelect={true}
                    className="rounded-2xl"
                    loading={isLoadingBranches}
                    showSearch
                    disabled={branchDisabled}
                    leftIcon={
                      <GitBranch className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                    }
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>Branch this task starts from</TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Task Class Selector - auto-routes to recommended models */}
        {onTaskClassChange && (
          <div data-onboarding="task-class-picker">
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <SearchableSelect
                    options={taskClassOptions}
                    value={selectedTaskClass ? [selectedTaskClass] : []}
                    onChange={handleTaskClassChange}
                    placeholder="Work type"
                    singleSelect={true}
                    className="rounded-2xl min-w-[130px]"
                    classNames={{
                      popover: "w-[240px]",
                    }}
                    showSearch={false}
                    leftIcon={
                      <SlidersHorizontal className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                    }
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-64">
                <p className="font-medium">Task-Class Routing</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Select work type to auto-pick the best model for cost/capability
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        <div className="flex items-center gap-1" data-onboarding="agent-picker">
          <SearchableSelect
            ref={agentSelectRef}
            options={agentOptions}
            value={selectedAgents}
            onChange={handleAgentChange}
            placeholder="Select agents"
            singleSelect={false}
            maxTagCount={1}
            className="rounded-2xl"
            classNames={{
              popover: "w-[315px]",
            }}
            showSearch
            countLabel="agents"
            footer={agentSelectionFooter}
            itemVariant="agent"
            optionItemComponent={AgentCommandItem}
            maxCountPerValue={MAX_AGENT_COMMAND_COUNT}
            searchRightElement={providerSettingsButton}
          />
        </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 ml-auto mr-0 pr-1">
        {/* Cloud/Local Mode Toggle - hidden in web mode (always cloud) */}
        {!env.NEXT_PUBLIC_WEB_MODE && (
          <div data-onboarding="cloud-toggle">
            <ModeToggleTooltip
              isCloudMode={isCloudMode}
              onToggle={onCloudModeToggle}
              disabled={cloudToggleDisabled}
            />
          </div>
        )}

        {/* Ralph Mode Toggle - loop until completion */}
        {onRalphModeToggle && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={clsx(
                  "p-1.5 rounded-full",
                  "border transition-colors",
                  isRalphMode
                    ? "bg-blue-100 dark:bg-blue-900/50 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400"
                    : "bg-neutral-100 dark:bg-neutral-700 border-neutral-200 dark:border-neutral-500/15 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-600",
                )}
                onClick={onRalphModeToggle}
                title={isRalphMode ? "Ralph Mode: ON" : "Ralph Mode: OFF"}
              >
                <Repeat className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="font-medium">Ralph Mode {isRalphMode ? "ON" : "OFF"}</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {isRalphMode
                  ? "Agent will keep working until it signals completion"
                  : "Enable to let agent loop until task is done"}
              </p>
            </TooltipContent>
          </Tooltip>
        )}

        <button
          className={clsx(
            "p-1.5 rounded-full",
            "bg-neutral-100 dark:bg-neutral-700",
            "border border-neutral-200 dark:border-neutral-500/15",
            "text-neutral-600 dark:text-neutral-400",
            "hover:bg-neutral-200 dark:hover:bg-neutral-600",
            "transition-colors",
          )}
          onClick={handleImageClick}
          title="Upload image"
        >
          <Image className="w-4 h-4" />
        </button>

        <button
          className={clsx(
            "p-1.5 rounded-full",
            "bg-neutral-100 dark:bg-neutral-700",
            "border border-neutral-200 dark:border-neutral-500/15",
            "text-neutral-600 dark:text-neutral-400",
            "hover:bg-neutral-200 dark:hover:bg-neutral-600",
            "transition-colors",
          )}
        >
          <Mic className="w-4 h-4" />
        </button>
      </div>
      </div>

      {visibleVariantControls.length > 0 ? (
        <div
          className="flex flex-wrap gap-2"
          data-onboarding="effort-picker"
        >
          {visibleVariantControls}
        </div>
      ) : null}

      {hasLocalClaudeSelection ? (
        <div
          className={clsx(
            "space-y-3 rounded-2xl border px-3 py-2.5",
            "border-blue-200/80 bg-blue-50/80 text-blue-900",
            "dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100",
          )}
        >
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
            <div className="min-w-0 space-y-1">
              <p className="text-[12px] font-medium">
                Local Claude plugin-dev profile
              </p>
              <p className="text-[11px] leading-relaxed text-blue-800/90 dark:text-blue-200/85">
                The CLI and SDK/MCP integration already support Claude local plugin-development, and this panel now uses the same structured launch inputs to run directly from Electron or generate the equivalent{" "}
                <code className="rounded bg-blue-100 px-1 py-0.5 font-mono text-[10px] dark:bg-blue-900/60">
                  devsh orchestrate run-local
                </code>{" "}
                preview for manual use.
              </p>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <label className="space-y-1 md:col-span-2">
              <span className="text-[11px] font-medium text-blue-900 dark:text-blue-100">
                Profile name
              </span>
              <div className="flex gap-2">
                <input
                  value={localProfileNameInput}
                  onChange={(e) => setLocalProfileNameInput(e.target.value)}
                  placeholder="my-plugin-dev-profile"
                  className="flex-1 rounded-xl border border-blue-200/80 bg-white/90 px-3 py-2 text-[11px] text-neutral-900 shadow-sm outline-none focus:border-blue-400 dark:border-blue-800/80 dark:bg-blue-950/40 dark:text-neutral-100"
                />
                <button
                  type="button"
                  onClick={handleSaveLocalClaudeProfile}
                  className="rounded-full border border-blue-300/90 bg-blue-600 px-3 py-2 text-[10px] font-medium text-white transition-colors hover:bg-blue-700 dark:border-blue-700/90 dark:bg-blue-500 dark:hover:bg-blue-400"
                >
                  Save profile
                </button>
              </div>
            </label>

            <label className="space-y-1">
              <span className="text-[11px] font-medium text-blue-900 dark:text-blue-100">
                Plugin dirs
              </span>
              <textarea
                rows={2}
                value={localPluginDirsInput}
                onChange={(e) => setLocalPluginDirsInput(e.target.value)}
                placeholder="./my-plugin"
                className="w-full rounded-xl border border-blue-200/80 bg-white/90 px-3 py-2 text-[11px] text-neutral-900 shadow-sm outline-none focus:border-blue-400 dark:border-blue-800/80 dark:bg-blue-950/40 dark:text-neutral-100"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[11px] font-medium text-blue-900 dark:text-blue-100">
                Workspace path
              </span>
              <input
                value={localWorkspaceInput}
                onChange={(e) => setLocalWorkspaceInput(e.target.value)}
                placeholder="/path/to/local/repo"
                className="w-full rounded-xl border border-blue-200/80 bg-white/90 px-3 py-2 text-[11px] text-neutral-900 shadow-sm outline-none focus:border-blue-400 dark:border-blue-800/80 dark:bg-blue-950/40 dark:text-neutral-100"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[11px] font-medium text-blue-900 dark:text-blue-100">
                Claude binary path <span className="text-blue-700/70 dark:text-blue-200/70">(optional)</span>
              </span>
              <input
                value={localClaudeBinPathInput}
                onChange={(e) => setLocalClaudeBinPathInput(e.target.value)}
                placeholder="/path/to/custom/claude"
                className="w-full rounded-xl border border-blue-200/80 bg-white/90 px-3 py-2 text-[11px] text-neutral-900 shadow-sm outline-none focus:border-blue-400 dark:border-blue-800/80 dark:bg-blue-950/40 dark:text-neutral-100"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[11px] font-medium text-blue-900 dark:text-blue-100">
                Terminal target
              </span>
              <select
                value={localTerminalTarget}
                onChange={(e) =>
                  setLocalTerminalTarget(
                    e.target.value as
                      | "terminal"
                      | "iterm"
                      | "ghostty"
                      | "alacritty",
                  )
                }
                className="w-full rounded-xl border border-blue-200/80 bg-white/90 px-3 py-2 text-[11px] text-neutral-900 shadow-sm outline-none focus:border-blue-400 dark:border-blue-800/80 dark:bg-blue-950/40 dark:text-neutral-100"
              >
                {localTerminalOptions.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    disabled={isElectron && !option.available}
                  >
                    {option.label}
                    {isElectron && !option.available ? " (Unavailable)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-[11px] font-medium text-blue-900 dark:text-blue-100">
                Settings path
              </span>
              <input
                value={localSettingsInput}
                onChange={(e) => setLocalSettingsInput(e.target.value)}
                placeholder="./.claude/settings.local.json"
                className="w-full rounded-xl border border-blue-200/80 bg-white/90 px-3 py-2 text-[11px] text-neutral-900 shadow-sm outline-none focus:border-blue-400 dark:border-blue-800/80 dark:bg-blue-950/40 dark:text-neutral-100"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[11px] font-medium text-blue-900 dark:text-blue-100">
                MCP configs
              </span>
              <textarea
                rows={2}
                value={localMcpConfigsInput}
                onChange={(e) => setLocalMcpConfigsInput(e.target.value)}
                placeholder="./.claude/mcp.local.json"
                className="w-full rounded-xl border border-blue-200/80 bg-white/90 px-3 py-2 text-[11px] text-neutral-900 shadow-sm outline-none focus:border-blue-400 dark:border-blue-800/80 dark:bg-blue-950/40 dark:text-neutral-100"
              />
            </label>

            <div className="grid gap-2">
              <label className="space-y-1">
                <span className="text-[11px] font-medium text-blue-900 dark:text-blue-100">
                  Allowed tools
                </span>
                <input
                  value={localAllowedToolsInput}
                  onChange={(e) => setLocalAllowedToolsInput(e.target.value)}
                  placeholder="Read,Write"
                  className="w-full rounded-xl border border-blue-200/80 bg-white/90 px-3 py-2 text-[11px] text-neutral-900 shadow-sm outline-none focus:border-blue-400 dark:border-blue-800/80 dark:bg-blue-950/40 dark:text-neutral-100"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-medium text-blue-900 dark:text-blue-100">
                  Disallowed tools
                </span>
                <input
                  value={localDisallowedToolsInput}
                  onChange={(e) => setLocalDisallowedToolsInput(e.target.value)}
                  placeholder="Bash"
                  className="w-full rounded-xl border border-blue-200/80 bg-white/90 px-3 py-2 text-[11px] text-neutral-900 shadow-sm outline-none focus:border-blue-400 dark:border-blue-800/80 dark:bg-blue-950/40 dark:text-neutral-100"
                />
              </label>
            </div>
          </div>

          {localSavedProfiles.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-blue-900 dark:text-blue-100">
                Saved profiles
              </p>
              <div className="space-y-2">
                {localSavedProfiles.map((profile) => (
                  <div
                    key={profile.name}
                    className="rounded-xl border border-blue-200/80 bg-white/90 px-3 py-2 text-[10px] text-neutral-800 dark:border-blue-800/80 dark:bg-blue-950/40 dark:text-blue-100"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{profile.name}</p>
                        <p className="truncate text-blue-800/80 dark:text-blue-200/80">
                          {profile.workspacePath || "No workspace"} · {profile.terminal} · {new Date(profile.updatedAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => applyLocalClaudeProfile(profile)}
                          className="rounded-full border border-blue-200/80 bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-800/80 dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-900/70"
                        >
                          Apply
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteLocalClaudeProfile(profile)}
                          className="rounded-full border border-red-200/80 bg-red-50 px-2 py-1 text-[10px] font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/80 dark:bg-red-900/30 dark:text-red-200 dark:hover:bg-red-900/60"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {localClaudeCommandPreview ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium text-blue-900 dark:text-blue-100">
                  Generated command preview
                </p>
                <div className="flex items-center gap-2">
                  {isElectron ? (
                    <button
                      type="button"
                      onClick={handleRunLocalClaudeCommand}
                      disabled={!localClaudeLaunchRequest || !localTerminalTargetAvailable}
                      className="rounded-full border border-blue-300/90 bg-blue-600 px-2.5 py-1 text-[10px] font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-700/90 dark:bg-blue-500 dark:hover:bg-blue-400"
                    >
                      Run in Terminal
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleCopyLocalClaudeCommand}
                    className="rounded-full border border-blue-200/80 bg-white/90 px-2.5 py-1 text-[10px] font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-800/80 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-900/60"
                  >
                    Copy command
                  </button>
                </div>
              </div>
              <pre className="overflow-x-auto rounded-xl border border-blue-200/80 bg-white/90 px-3 py-2 text-[10px] leading-relaxed text-neutral-800 dark:border-blue-800/80 dark:bg-blue-950/40 dark:text-blue-100">
                <code>{localClaudeCommandPreview}</code>
              </pre>
            </div>
          ) : hasLocalClaudeSelection ? (
            <div className="rounded-xl border border-dashed border-blue-200/80 bg-white/70 px-3 py-2 text-[10px] leading-relaxed text-blue-900/80 dark:border-blue-800/70 dark:bg-blue-950/30 dark:text-blue-100/80">
              Add a workspace path and enter the real task description in the main dashboard input to enable the structured local Claude plugin-dev launch preview.
            </div>
          ) : null}

          {localLaunchHistory.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-blue-900 dark:text-blue-100">
                Recent launches
              </p>
              <div className="space-y-2">
                {localLaunchHistory.map((entry, index) => (
                  <div
                    key={`${entry.launchedAt}-${index}`}
                    className="rounded-xl border border-blue-200/80 bg-white/90 px-3 py-2 text-[10px] text-neutral-800 dark:border-blue-800/80 dark:bg-blue-950/40 dark:text-blue-100"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {entry.workspacePath}
                        </p>
                        <p className={localClaudeLaunchStatusTone(entry.status)}>
                          {entry.terminal} · {localClaudeLaunchStatusLabel(entry.status)} · {new Date(entry.launchedAt).toLocaleString()}
                        </p>
                        {entry.error ? (
                          <p className="truncate text-red-700/80 dark:text-red-300/80">
                            {entry.error}
                          </p>
                        ) : null}
                        {entry.orchestrationId ? (
                          <p className="truncate text-blue-800/70 dark:text-blue-200/70">
                            Run: {entry.orchestrationId}
                          </p>
                        ) : null}
                        {entry.taskRunId ? (
                          <p className="truncate text-blue-800/70 dark:text-blue-200/70">
                            Shared runtime: {entry.taskRunId}
                          </p>
                        ) : null}
                        {entry.taskId && entry.taskRunId ? (
                          <div className="flex flex-wrap gap-2">
                            <Link
                              to="/$teamSlugOrId/task/$taskId/run/$runId"
                              params={{
                                teamSlugOrId,
                                taskId: entry.taskId as never,
                                runId: entry.taskRunId as never,
                              }}
                              className="inline-flex items-center gap-1 text-blue-700 transition-colors hover:text-blue-800 hover:underline dark:text-blue-300 dark:hover:text-blue-200"
                            >
                              Open shared run page
                            </Link>
                            <Link
                              to="/$teamSlugOrId/task/$taskId/run/$runId/activity"
                              params={{
                                teamSlugOrId,
                                taskId: entry.taskId as never,
                                runId: entry.taskRunId as never,
                              }}
                              className="inline-flex items-center gap-1 text-blue-700 transition-colors hover:text-blue-800 hover:underline dark:text-blue-300 dark:hover:text-blue-200"
                            >
                              Open shared activity page
                            </Link>
                            <Link
                              to="/$teamSlugOrId/task/$taskId/run/$runId/logs"
                              params={{
                                teamSlugOrId,
                                taskId: entry.taskId as never,
                                runId: entry.taskRunId as never,
                              }}
                              className="inline-flex items-center gap-1 text-blue-700 transition-colors hover:text-blue-800 hover:underline dark:text-blue-300 dark:hover:text-blue-200"
                            >
                              Open shared logs page
                            </Link>
                          </div>
                        ) : null}
                        {entry.sessionId ? (
                          <p className="truncate text-blue-800/70 dark:text-blue-200/70">
                            Local session: {entry.sessionId}
                            {entry.injectionMode ? ` · ${entry.injectionMode}` : ""}
                            {typeof entry.injectionCount === "number"
                              ? ` · ${entry.injectionCount} injections`
                              : ""}
                          </p>
                        ) : null}
                        {entry.lastInjectionAt ? (
                          <p className="truncate text-blue-800/70 dark:text-blue-200/70">
                            Last local injection: {new Date(entry.lastInjectionAt).toLocaleString()}
                          </p>
                        ) : null}
                        {entry.runDir ? (
                          <p className="truncate text-blue-800/70 dark:text-blue-200/70">
                            Artifacts: {entry.runDir}
                          </p>
                        ) : null}
                        {entry.scriptPath ? (
                          <p className="truncate text-blue-800/70 dark:text-blue-200/70">
                            Script: {entry.scriptPath}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard
                            .writeText(entry.command)
                            .then(() =>
                              toast.success("Copied previous local Claude command"),
                            )
                            .catch(() =>
                              toast.error("Failed to copy previous local Claude command"),
                            );
                        }}
                        className="rounded-full border border-blue-200/80 bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-800/80 dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-900/70"
                      >
                        Copy again
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});
