import { AgentLogo } from "@/components/icons/agent-logos";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@cmux/convex/api";
import type { Doc } from "@cmux/convex/dataModel";
import { MCP_SERVER_PRESETS, parseGithubRepoUrl, type McpServerPreset } from "@cmux/shared";
import { convexQuery } from "@convex-dev/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useConvex } from "convex/react";
import {
  Loader2,
  Pencil,
  Plug,
  Plus,
  Server,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

type Scope = "global" | "workspace";
type AgentKey = "claude" | "codex" | "gemini" | "opencode";
type McpServerConfig = Doc<"mcpServerConfigs">;

interface McpServersSectionProps {
  teamSlugOrId: string;
}

type FormState = {
  name: string;
  displayName: string;
  command: string;
  argsText: string;
  envVarsText: string;
  description: string;
  enabledClaude: boolean;
  enabledCodex: boolean;
  enabledGemini: boolean;
  enabledOpencode: boolean;
  scope: Scope;
  projectFullName: string;
};

type AgentField = keyof Pick<
  McpServerConfig,
  "enabledClaude" | "enabledCodex" | "enabledGemini" | "enabledOpencode"
>;

type AgentOption = {
  key: AgentKey;
  label: string;
  field: AgentField;
};

const VALID_MCP_NAME_REGEX = /^[A-Za-z0-9_-]+$/;
const EXISTING_SECRET_PLACEHOLDER = "<existing-secret>";

const AGENT_OPTIONS: AgentOption[] = [
  { key: "claude", label: "Claude", field: "enabledClaude" },
  { key: "codex", label: "Codex", field: "enabledCodex" },
  { key: "gemini", label: "Gemini", field: "enabledGemini" },
  { key: "opencode", label: "OpenCode", field: "enabledOpencode" },
];

const EMPTY_AGENT_COUNTS: Record<AgentKey, number> = {
  claude: 0,
  codex: 0,
  gemini: 0,
  opencode: 0,
};

function getScopeOptions(counts?: Record<Scope, number>) {
  return [
    {
      value: "global",
      label: counts ? `Global (${counts.global})` : "Global",
    },
    {
      value: "workspace",
      label: counts ? `Workspace (${counts.workspace})` : "Workspace",
    },
  ] satisfies Array<{ value: Scope; label: string }>;
}

function buildEmptyForm(scope: Scope): FormState {
  return {
    name: "",
    displayName: "",
    command: "",
    argsText: "",
    envVarsText: "",
    description: "",
    enabledClaude: true,
    enabledCodex: true,
    enabledGemini: true,
    enabledOpencode: true,
    scope,
    projectFullName: "",
  };
}

function buildFormFromConfig(config: McpServerConfig): FormState {
  const envVarsText = config.envVars
    ? Object.keys(config.envVars)
        .map((key) => `${key}=${EXISTING_SECRET_PLACEHOLDER}`)
        .join("\n")
    : "";

  return {
    name: config.name,
    displayName: config.displayName,
    command: config.command,
    argsText: config.args.join("\n"),
    envVarsText,
    description: config.description ?? "",
    enabledClaude: config.enabledClaude,
    enabledCodex: config.enabledCodex,
    enabledGemini: config.enabledGemini,
    enabledOpencode: config.enabledOpencode,
    scope: config.scope,
    projectFullName: config.projectFullName ?? "",
  };
}

function parseArgsText(value: string): string[] {
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseEnvVarsText(value: string): {
  envVars?: Record<string, string>;
  hasChanges: boolean;
  error?: string;
} {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { hasChanges: false };
  }

  const entries: Array<[string, string]> = [];
  let hasChanges = false;

  for (const line of lines) {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      return {
        hasChanges: false,
        error: "Environment variables must use KEY=value format, one per line.",
      };
    }

    const key = line.slice(0, separatorIndex).trim();
    const envValue = line.slice(separatorIndex + 1);
    if (!key) {
      return {
        hasChanges: false,
        error: "Environment variables must include a key before '='.",
      };
    }

    if (envValue === EXISTING_SECRET_PLACEHOLDER) {
      continue;
    }

    hasChanges = true;
    entries.push([key, envValue]);
  }

  if (!hasChanges || entries.length === 0) {
    return { hasChanges: false };
  }

  return { envVars: Object.fromEntries(entries), hasChanges: true };
}

function isValidProjectFullName(value: string): boolean {
  return parseGithubRepoUrl(value)?.fullName === value.trim();
}

function matchesTarget(
  config: McpServerConfig,
  scope: Scope,
  projectFullName: string,
): boolean {
  if (config.scope !== scope) {
    return false;
  }

  if (scope === "global") {
    return true;
  }

  return (config.projectFullName ?? "") === projectFullName.trim();
}

function validateForm(form: FormState): string | null {
  if (!form.name.trim()) {
    return "Name is required.";
  }
  if (!VALID_MCP_NAME_REGEX.test(form.name.trim())) {
    return "Name can only contain letters, numbers, hyphens, and underscores.";
  }
  if (!form.displayName.trim()) {
    return "Display name is required.";
  }
  if (!form.command.trim()) {
    return "Command is required.";
  }
  if (!AGENT_OPTIONS.some((agent) => form[agent.field])) {
    return "Enable at least one agent.";
  }
  if (
    form.scope === "workspace" &&
    !isValidProjectFullName(form.projectFullName)
  ) {
    return "Workspace scope requires a repository in owner/repo format.";
  }

  const parsedEnvVars = parseEnvVarsText(form.envVarsText);
  if (parsedEnvVars.error) {
    return parsedEnvVars.error;
  }

  return null;
}

function getPresetPayload(
  preset: McpServerPreset,
  scope: Scope,
  projectFullName: string,
) {
  if (scope === "workspace" && !isValidProjectFullName(projectFullName)) {
    throw new Error("Workspace scope requires a repository in owner/repo format.");
  }

  return {
    name: preset.name,
    displayName: preset.displayName,
    command: preset.command,
    args: preset.args,
    description: preset.description,
    tags: preset.tags,
    enabledClaude: preset.supportedAgents.claude,
    enabledCodex: preset.supportedAgents.codex,
    enabledGemini: preset.supportedAgents.gemini,
    enabledOpencode: preset.supportedAgents.opencode,
    scope,
    projectFullName: scope === "workspace" ? projectFullName.trim() : undefined,
  };
}

function SegmentedTabs<TValue extends string>({
  value,
  onChange,
  disabled = false,
  options,
}: {
  value: TValue;
  onChange: (value: TValue) => void;
  disabled?: boolean;
  options: Array<{ value: TValue; label: string }>;
}) {
  const containerClassName =
    "inline-flex items-center rounded-lg border border-neutral-200 bg-neutral-100 p-1 dark:border-neutral-800 dark:bg-neutral-950";
  const inactiveTabClassName =
    "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100";
  const activeTabClassName =
    "bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-100";

  return (
    <div className={containerClassName}>
      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active ? activeTabClassName : inactiveTabClassName
            } ${disabled ? "opacity-60" : ""}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function AgentToggleButton({
  agent,
  enabled,
  onToggle,
  disabled = false,
  pending = false,
  size = "sm",
}: {
  agent: AgentOption;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
  pending?: boolean;
  size?: "sm" | "md";
}) {
  const buttonSize = size === "md" ? "size-9 rounded-lg" : "size-8 rounded-lg";
  const logoSize = size === "md" ? "size-4.5" : "size-4";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={agent.label}
          aria-pressed={enabled}
          title={agent.label}
          onClick={onToggle}
          disabled={disabled}
          className={`inline-flex items-center justify-center border transition-all ${buttonSize} ${
            enabled
              ? "border-neutral-300 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
              : "border-transparent bg-transparent opacity-40 hover:opacity-75 dark:opacity-45"
          } ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin text-neutral-500 dark:text-neutral-300" />
          ) : (
            <AgentLogo agentName={`${agent.key}/ui`} className={logoSize} />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {agent.label}
        {enabled ? " enabled" : " disabled"}
      </TooltipContent>
    </Tooltip>
  );
}

export function McpServersSection({
  teamSlugOrId,
}: McpServersSectionProps) {
  const convex = useConvex();
  const [activeScope, setActiveScope] = useState<Scope>("global");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [dialogTab, setDialogTab] = useState<"preset" | "custom">("preset");
  const [editingConfig, setEditingConfig] = useState<McpServerConfig | null>(null);
  const [form, setForm] = useState<FormState>(buildEmptyForm("global"));
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<McpServerConfig | null>(null);

  const { data: configs, refetch, isLoading } = useQuery(
    convexQuery(api.mcpServerConfigs.list, { teamSlugOrId }),
  );

  const upsertMutation = useMutation({
    mutationFn: async (
      payload: Parameters<typeof convex.mutation<typeof api.mcpServerConfigs.upsert>>[1],
    ) => {
      return await convex.mutation(api.mcpServerConfigs.upsert, payload);
    },
    onSuccess: async () => {
      await refetch();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: McpServerConfig["_id"]) => {
      return await convex.mutation(api.mcpServerConfigs.remove, {
        teamSlugOrId,
        id,
      });
    },
    onSuccess: async () => {
      await refetch();
    },
  });

  const visibleConfigs = useMemo(
    () => (configs ?? []).filter((config) => config.scope === activeScope),
    [activeScope, configs],
  );

  const counts = useMemo(() => {
    const nextCounts = { global: 0, workspace: 0 } satisfies Record<Scope, number>;

    for (const config of configs ?? []) {
      nextCounts[config.scope] += 1;
    }

    return nextCounts;
  }, [configs]);

  const scopeOptions = useMemo(() => getScopeOptions(counts), [counts]);
  const formScopeOptions = useMemo(() => getScopeOptions(), []);

  const enabledCounts = useMemo(() => {
    const nextCounts = { ...EMPTY_AGENT_COUNTS };

    for (const config of visibleConfigs) {
      for (const agent of AGENT_OPTIONS) {
        if (config[agent.field]) {
          nextCounts[agent.key] += 1;
        }
      }
    }

    return nextCounts;
  }, [visibleConfigs]);

  const configuredPresetNames = useMemo(
    () =>
      new Set(
        (configs ?? [])
          .filter((config) => matchesTarget(config, form.scope, form.projectFullName))
          .map((config) => config.name),
      ),
    [configs, form.projectFullName, form.scope],
  );

  const workspaceRepoValid = useMemo(
    () => isValidProjectFullName(form.projectFullName),
    [form.projectFullName],
  );

  const pendingMutationKey = useMemo(() => {
    if (!upsertMutation.isPending || !upsertMutation.variables) {
      return null;
    }

    return `${upsertMutation.variables.name}:${upsertMutation.variables.scope}`;
  }, [upsertMutation.isPending, upsertMutation.variables]);

  const updateForm = <K extends keyof FormState,>(field: K, value: FormState[K]) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
    setFormError(null);
  };

  const resetDialog = useCallback(() => {
    setDialogOpen(false);
    setDialogMode("create");
    setDialogTab("preset");
    setEditingConfig(null);
    setForm(buildEmptyForm(activeScope));
    setFormError(null);
  }, [activeScope]);

  const openCreateDialog = useCallback(() => {
    setDialogMode("create");
    setDialogTab("preset");
    setEditingConfig(null);
    setForm(buildEmptyForm(activeScope));
    setFormError(null);
    setDialogOpen(true);
  }, [activeScope]);

  const openEditDialog = useCallback((config: McpServerConfig) => {
    setDialogMode("edit");
    setDialogTab("custom");
    setEditingConfig(config);
    setForm(buildFormFromConfig(config));
    setFormError(null);
    setDialogOpen(true);
  }, []);

  const savePayload = useCallback(
    async (
      payload: Omit<
        Parameters<typeof convex.mutation<typeof api.mcpServerConfigs.upsert>>[1],
        "teamSlugOrId"
      >,
      successMessage: string,
    ) => {
      try {
        await upsertMutation.mutateAsync({
          teamSlugOrId,
          ...payload,
        });
        toast.success(successMessage);
        resetDialog();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to save MCP server.";
        setFormError(message);
        toast.error(message);
      }
    },
    [convex, resetDialog, teamSlugOrId, upsertMutation],
  );

  const handleSaveCustom = async () => {
    const validationError = validateForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const parsedEnvVars = parseEnvVarsText(form.envVarsText);
    if (parsedEnvVars.error) {
      setFormError(parsedEnvVars.error);
      return;
    }

    await savePayload(
      {
        name: form.name.trim(),
        displayName: form.displayName.trim(),
        command: form.command.trim(),
        args: parseArgsText(form.argsText),
        ...(parsedEnvVars.hasChanges ? { envVars: parsedEnvVars.envVars } : {}),
        description: form.description.trim() || undefined,
        enabledClaude: form.enabledClaude,
        enabledCodex: form.enabledCodex,
        enabledGemini: form.enabledGemini,
        enabledOpencode: form.enabledOpencode,
        scope: form.scope,
        projectFullName:
          form.scope === "workspace" ? form.projectFullName.trim() : undefined,
      },
      dialogMode === "create" ? "MCP server added" : "MCP server updated",
    );
  };

  const handleAddPreset = async (preset: McpServerPreset) => {
    try {
      await savePayload(
        getPresetPayload(preset, form.scope, form.projectFullName),
        `${preset.displayName} added`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add preset.";
      setFormError(message);
      toast.error(message);
    }
  };

  const handleToggleAgent = async (
    config: McpServerConfig,
    field: AgentField,
    nextValue: boolean,
  ) => {
    const nextAgentState: Record<AgentField, boolean> = {
      enabledClaude: config.enabledClaude,
      enabledCodex: config.enabledCodex,
      enabledGemini: config.enabledGemini,
      enabledOpencode: config.enabledOpencode,
    };
    nextAgentState[field] = nextValue;

    try {
      await upsertMutation.mutateAsync({
        teamSlugOrId,
        name: config.name,
        displayName: config.displayName,
        command: config.command,
        args: config.args,
        description: config.description,
        tags: config.tags,
        ...nextAgentState,
        scope: config.scope,
        projectFullName: config.projectFullName,
      });
      toast.success(`${config.displayName} updated`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update MCP server.";
      toast.error(message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(deleteTarget._id);
      toast.success(`${deleteTarget.displayName} deleted`);
      setDeleteTarget(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete MCP server.";
      toast.error(message);
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <>
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-medium text-neutral-900 dark:text-neutral-100">
                MCP Servers
              </h2>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                Manage shared and workspace-specific MCP servers for your team.
              </p>
            </div>
            <Button size="sm" onClick={openCreateDialog}>
              <Plus className="size-4" />
              Add MCP
            </Button>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white px-3 py-3 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="inline-flex h-7 items-center rounded-full border border-neutral-200 bg-neutral-50 px-3 text-sm font-medium text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300">
                  {visibleConfigs.length} total
                </span>
                {AGENT_OPTIONS.map((agent) => (
                  <span
                    key={agent.key}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
                  >
                    <AgentLogo agentName={`${agent.key}/ui`} className="size-3.5" />
                    <span>{agent.label}</span>
                    <span className="text-neutral-900 dark:text-neutral-100">
                      {enabledCounts[agent.key]}
                    </span>
                  </span>
                ))}
              </div>

              <SegmentedTabs
                value={activeScope}
                onChange={setActiveScope}
                options={scopeOptions}
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-neutral-500 dark:text-neutral-400">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : visibleConfigs.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-white px-6 py-12 text-center dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex size-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">
                <Plug className="size-5" />
              </div>
              <h3 className="mt-4 text-base font-medium text-neutral-900 dark:text-neutral-100">
                No {activeScope} MCP servers
              </h3>
              <p className="mt-2 max-w-md text-sm text-neutral-500 dark:text-neutral-400">
                Add a preset or configure a custom server for this scope.
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={openCreateDialog}>
                <Plus className="size-4" />
                Add MCP
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
              {visibleConfigs.map((config, index) => {
                const isPending =
                  pendingMutationKey === `${config.name}:${config.scope}`;
                const commandLabel =
                  config.args.length > 0
                    ? `${config.command} ${config.args.join(" ")}`
                    : config.command;

                return (
                  <div
                    key={config._id}
                    className={`group flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-neutral-50/80 dark:hover:bg-neutral-950/60 sm:flex-row sm:items-start sm:justify-between ${
                      index < visibleConfigs.length - 1
                        ? "border-b border-neutral-200 dark:border-neutral-800"
                        : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">
                          <Plug className="size-4" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <h3 className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                              {config.displayName}
                            </h3>
                            <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                              {config.scope === "global" ? "Global" : "Workspace"}
                            </span>
                            {config.projectFullName ? (
                              <span className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                                {config.projectFullName}
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                            <span className="font-mono text-[11px]">{config.name}</span>
                            {config.tags?.map((tag) => (
                              <span
                                key={`${config._id}:${tag}`}
                                className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>

                          {config.description ? (
                            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                              {config.description}
                            </p>
                          ) : null}

                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-neutral-500 dark:text-neutral-400">
                            <span className="max-w-full truncate rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1 font-mono text-[11px] text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300">
                              {commandLabel}
                            </span>
                            <span>
                              Updated {new Date(config._creationTime).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                      <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1 dark:border-neutral-800 dark:bg-neutral-950">
                        {AGENT_OPTIONS.map((agent) => (
                          <AgentToggleButton
                            key={`${config._id}:${agent.key}`}
                            agent={agent}
                            enabled={config[agent.field]}
                            pending={isPending}
                            disabled={isPending}
                            onToggle={() => {
                              void handleToggleAgent(config, agent.field, !config[agent.field]);
                            }}
                          />
                        ))}
                      </div>

                      <div className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-lg text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-100"
                          onClick={() => openEditDialog(config)}
                          aria-label={`Edit ${config.displayName}`}
                          title="Edit"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-lg text-neutral-500 hover:bg-red-50 hover:text-red-600 dark:text-neutral-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                          onClick={() => setDeleteTarget(config)}
                          aria-label={`Delete ${config.displayName}`}
                          title="Delete"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Dialog.Root
          open={dialogOpen}
          onOpenChange={(open) => {
            if (!open && !upsertMutation.isPending) {
              resetDialog();
            }
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-[var(--z-global-blocking)] bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-[var(--z-global-blocking)] w-[min(1040px,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="absolute right-4 top-4 rounded-lg border border-neutral-200 bg-white p-2 text-neutral-400 transition hover:text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:text-white"
                  aria-label="Close"
                >
                  <X className="size-4" />
                </button>
              </Dialog.Close>

              <div className="max-h-[calc(100vh-2rem)] overflow-y-auto p-5 sm:p-6">
                <div className="flex items-start gap-4 pr-10">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                    <Server className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Dialog.Title className="text-lg font-medium text-neutral-900 dark:text-white">
                      {dialogMode === "create"
                        ? "Add MCP Server"
                        : `Edit ${editingConfig?.displayName ?? "MCP Server"}`}
                    </Dialog.Title>
                    <Dialog.Description className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                      {dialogMode === "create"
                        ? "Choose a preset or configure a custom local MCP server."
                        : "Update command details, scope, secrets, and enabled agents."}
                    </Dialog.Description>
                  </div>
                </div>

                {dialogMode === "create" ? (
                  <div className="mt-5 inline-flex items-center rounded-lg border border-neutral-200 bg-neutral-100 p-1 dark:border-neutral-800 dark:bg-neutral-950">
                    <button
                      type="button"
                      onClick={() => setDialogTab("preset")}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        dialogTab === "preset"
                          ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-100"
                          : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                      }`}
                    >
                      Presets
                    </button>
                    <button
                      type="button"
                      onClick={() => setDialogTab("custom")}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        dialogTab === "custom"
                          ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-100"
                          : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                      }`}
                    >
                      Custom
                    </button>
                  </div>
                ) : null}

                {formError ? (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                    {formError}
                  </div>
                ) : null}

                {dialogMode === "create" && dialogTab === "preset" ? (
                  <div className="mt-5 space-y-4">
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-950/60">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                            Installation target
                          </p>
                          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                            Choose whether this preset is available globally or for one workspace.
                          </p>
                        </div>
                        <SegmentedTabs
                          value={form.scope}
                          onChange={(scope) => updateForm("scope", scope)}
                          options={formScopeOptions}
                        />
                      </div>

                      {form.scope === "workspace" ? (
                        <div className="mt-4">
                          <label
                            htmlFor="preset-project-full-name"
                            className="text-sm font-medium text-neutral-900 dark:text-neutral-100"
                          >
                            Workspace repository
                          </label>
                          <input
                            id="preset-project-full-name"
                            value={form.projectFullName}
                            onChange={(event) =>
                              updateForm("projectFullName", event.target.value)
                            }
                            placeholder="owner/repo"
                            className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                          />
                          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                            Required for workspace-scoped presets.
                          </p>
                        </div>
                      ) : null}
                    </div>

                    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
                      {MCP_SERVER_PRESETS.map((preset, index) => {
                        const alreadyConfigured = configuredPresetNames.has(preset.name);
                        const workspaceMissing =
                          form.scope === "workspace" && !workspaceRepoValid;
                        const commandLabel = `${preset.command} ${preset.args.join(" ")}`.trim();

                        return (
                          <div
                            key={preset.name}
                            className={`flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-neutral-50/80 dark:hover:bg-neutral-950/60 sm:flex-row sm:items-start sm:justify-between ${
                              index < MCP_SERVER_PRESETS.length - 1
                                ? "border-b border-neutral-200 dark:border-neutral-800"
                                : ""
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                                  {preset.displayName}
                                </h3>
                                {preset.tags.map((tag) => (
                                  <span
                                    key={`${preset.name}:${tag}`}
                                    className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                                {preset.description}
                              </p>
                              <p className="mt-2 inline-flex max-w-full truncate rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1 font-mono text-[11px] text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300">
                                {commandLabel}
                              </p>
                            </div>

                            <Button
                              size="sm"
                              onClick={() => {
                                void handleAddPreset(preset);
                              }}
                              disabled={
                                upsertMutation.isPending ||
                                alreadyConfigured ||
                                workspaceMissing
                              }
                            >
                              {upsertMutation.isPending ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : alreadyConfigured ? (
                                "Configured"
                              ) : (
                                "Add"
                              )}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_280px]">
                    <div className="space-y-4">
                      <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-950/60">
                        <div className="mb-4">
                          <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                            Basic details
                          </h3>
                          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                            Define the MCP name, label, and executable command.
                          </p>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <label
                              htmlFor="mcp-name"
                              className="text-sm font-medium text-neutral-900 dark:text-neutral-100"
                            >
                              Name
                            </label>
                            <input
                              id="mcp-name"
                              value={form.name}
                              onChange={(event) => updateForm("name", event.target.value)}
                              disabled={dialogMode === "edit"}
                              placeholder="my-mcp-server"
                              className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                            />
                          </div>

                          <div>
                            <label
                              htmlFor="mcp-display-name"
                              className="text-sm font-medium text-neutral-900 dark:text-neutral-100"
                            >
                              Display name
                            </label>
                            <input
                              id="mcp-display-name"
                              value={form.displayName}
                              onChange={(event) =>
                                updateForm("displayName", event.target.value)
                              }
                              placeholder="My MCP Server"
                              className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <label
                              htmlFor="mcp-command"
                              className="text-sm font-medium text-neutral-900 dark:text-neutral-100"
                            >
                              Command
                            </label>
                            <input
                              id="mcp-command"
                              value={form.command}
                              onChange={(event) => updateForm("command", event.target.value)}
                              placeholder="npx"
                              className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-950/60">
                        <div className="mb-4">
                          <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                            Runtime configuration
                          </h3>
                          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                            Provide arguments, secrets, and optional context for the server.
                          </p>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <label
                              htmlFor="mcp-args"
                              className="text-sm font-medium text-neutral-900 dark:text-neutral-100"
                            >
                              Arguments
                            </label>
                            <textarea
                              id="mcp-args"
                              rows={6}
                              value={form.argsText}
                              onChange={(event) => updateForm("argsText", event.target.value)}
                              placeholder={'-y\n@my/mcp-server@latest'}
                              className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                            />
                            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                              One argument per line.
                            </p>
                          </div>

                          <div>
                            <label
                              htmlFor="mcp-env-vars"
                              className="text-sm font-medium text-neutral-900 dark:text-neutral-100"
                            >
                              Environment variables
                            </label>
                            <textarea
                              id="mcp-env-vars"
                              rows={6}
                              value={form.envVarsText}
                              onChange={(event) => updateForm("envVarsText", event.target.value)}
                              placeholder="API_KEY=secret-value"
                              className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 font-mono text-sm text-neutral-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                            />
                            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                              Use KEY=value format, one per line. Existing secrets stay redacted until replaced.
                            </p>
                          </div>

                          <div className="sm:col-span-2">
                            <label
                              htmlFor="mcp-description"
                              className="text-sm font-medium text-neutral-900 dark:text-neutral-100"
                            >
                              Description
                            </label>
                            <textarea
                              id="mcp-description"
                              rows={4}
                              value={form.description}
                              onChange={(event) => updateForm("description", event.target.value)}
                              placeholder="Describe what this MCP server is for."
                              className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-950/60">
                        <div className="mb-4">
                          <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                            Enabled agents
                          </h3>
                          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                            Choose which coding agents can use this MCP server.
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-900">
                          {AGENT_OPTIONS.map((agent) => (
                            <AgentToggleButton
                              key={agent.key}
                              agent={agent}
                              enabled={form[agent.field]}
                              size="md"
                              onToggle={() => updateForm(agent.field, !form[agent.field])}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-950/60">
                        <div className="mb-4">
                          <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                            Scope
                          </h3>
                          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                            {dialogMode === "edit"
                              ? "The scope and target repo are fixed after creation."
                              : "Choose whether this server is shared globally or attached to one workspace."}
                          </p>
                        </div>

                        <SegmentedTabs
                          value={form.scope}
                          onChange={(scope) => updateForm("scope", scope)}
                          disabled={dialogMode === "edit"}
                          options={formScopeOptions}
                        />

                        {form.scope === "workspace" ? (
                          <div className="mt-4">
                            <label
                              htmlFor="mcp-project-full-name"
                              className="text-sm font-medium text-neutral-900 dark:text-neutral-100"
                            >
                              Workspace repository
                            </label>
                            <input
                              id="mcp-project-full-name"
                              value={form.projectFullName}
                              onChange={(event) =>
                                updateForm("projectFullName", event.target.value)
                              }
                              disabled={dialogMode === "edit"}
                              placeholder="owner/repo"
                              className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-6 flex justify-end gap-3 border-t border-neutral-200 pt-5 dark:border-neutral-800">
                  <Dialog.Close asChild>
                    <Button variant="outline" disabled={upsertMutation.isPending}>
                      Cancel
                    </Button>
                  </Dialog.Close>
                  {dialogMode === "edit" || dialogTab === "custom" ? (
                    <Button
                      onClick={() => {
                        void handleSaveCustom();
                      }}
                      disabled={upsertMutation.isPending}
                    >
                      {upsertMutation.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : null}
                      Save
                    </Button>
                  ) : null}
                </div>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => {
            if (!open && !deleteMutation.isPending) {
              setDeleteTarget(null);
            }
          }}
          title="Delete MCP server?"
          description={
            deleteTarget
              ? `Remove ${deleteTarget.displayName}${deleteTarget.projectFullName ? ` for ${deleteTarget.projectFullName}` : ""} from settings.`
              : "Remove this MCP server from settings."
          }
          confirmLabel={deleteMutation.isPending ? "Deleting..." : "Delete"}
          onConfirm={handleDelete}
        />
      </>
    </TooltipProvider>
  );
}
