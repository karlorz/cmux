import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SettingSection } from "@/components/settings/SettingSection";
import { SettingSegmented } from "@/components/settings/SettingSegmented";
import { api } from "@cmux/convex/api";
import type { Doc } from "@cmux/convex/dataModel";
import { MCP_SERVER_PRESETS, type McpServerPreset } from "@cmux/shared";
import { convexQuery } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { useConvex } from "convex/react";
import {
  Check,
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

const AGENT_OPTIONS: Array<{
  key: AgentKey;
  label: string;
  field: keyof Pick<
    McpServerConfig,
    "enabledClaude" | "enabledCodex" | "enabledGemini" | "enabledOpencode"
  >;
}> = [
  { key: "claude", label: "Claude", field: "enabledClaude" },
  { key: "codex", label: "Codex", field: "enabledCodex" },
  { key: "gemini", label: "Gemini", field: "enabledGemini" },
  { key: "opencode", label: "OpenCode", field: "enabledOpencode" },
];

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
  return {
    name: config.name,
    displayName: config.displayName,
    command: config.command,
    argsText: config.args.join("\n"),
    envVarsText: formatEnvVars(config.envVars),
    description: config.description ?? "",
    enabledClaude: config.enabledClaude,
    enabledCodex: config.enabledCodex,
    enabledGemini: config.enabledGemini,
    enabledOpencode: config.enabledOpencode,
    scope: config.scope,
    projectFullName: config.projectFullName ?? "",
  };
}

function formatEnvVars(envVars?: Record<string, string>): string {
  if (!envVars) {
    return "";
  }

  return Object.entries(envVars)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function parseArgsText(value: string): string[] {
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseEnvVarsText(value: string): {
  envVars?: Record<string, string>;
  error?: string;
} {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return {};
  }

  const entries: Array<[string, string]> = [];
  for (const line of lines) {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      return {
        error: "Environment variables must use KEY=value format, one per line.",
      };
    }

    const key = line.slice(0, separatorIndex).trim();
    const envValue = line.slice(separatorIndex + 1);
    if (!key) {
      return {
        error: "Environment variables must include a key before '='.",
      };
    }

    entries.push([key, envValue]);
  }

  return { envVars: Object.fromEntries(entries) };
}

function isValidProjectFullName(value: string): boolean {
  return /^[^/\s]+\/[^/\s]+$/.test(value.trim());
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
  if (!/^[A-Za-z0-9_-]+$/.test(form.name.trim())) {
    return "Name can only contain letters, numbers, hyphens, and underscores.";
  }
  if (!form.displayName.trim()) {
    return "Display name is required.";
  }
  if (!form.command.trim()) {
    return "Command is required.";
  }
  if (
    !form.enabledClaude &&
    !form.enabledCodex &&
    !form.enabledGemini &&
    !form.enabledOpencode
  ) {
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
    convexQuery(api.mcpServerConfigs.list, { teamSlugOrId })
  );

  const upsertMutation = useMutation({
    mutationFn: async (
      payload: Parameters<typeof convex.mutation<typeof api.mcpServerConfigs.upsert>>[1]
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
    [activeScope, configs]
  );

  const counts = useMemo(
    () => ({
      global: (configs ?? []).filter((config) => config.scope === "global").length,
      workspace: (configs ?? []).filter((config) => config.scope === "workspace").length,
    }),
    [configs]
  );

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
    [convex, resetDialog, teamSlugOrId, upsertMutation]
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
        envVars: parsedEnvVars.envVars,
        description: form.description.trim() || undefined,
        enabledClaude: form.enabledClaude,
        enabledCodex: form.enabledCodex,
        enabledGemini: form.enabledGemini,
        enabledOpencode: form.enabledOpencode,
        scope: form.scope,
        projectFullName:
          form.scope === "workspace" ? form.projectFullName.trim() : undefined,
      },
      dialogMode === "create"
        ? "MCP server added"
        : "MCP server updated"
    );
  };

  const handleAddPreset = async (preset: McpServerPreset) => {
    try {
      await savePayload(
        getPresetPayload(preset, form.scope, form.projectFullName),
        `${preset.displayName} added`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add preset.";
      setFormError(message);
      toast.error(message);
    }
  };

  const handleToggleAgent = async (
    config: McpServerConfig,
    field: (typeof AGENT_OPTIONS)[number]["field"],
    nextValue: boolean,
  ) => {
    try {
      await upsertMutation.mutateAsync({
        teamSlugOrId,
        name: config.name,
        displayName: config.displayName,
        command: config.command,
        args: config.args,
        envVars: config.envVars,
        description: config.description,
        tags: config.tags,
        enabledClaude:
          field === "enabledClaude" ? nextValue : config.enabledClaude,
        enabledCodex:
          field === "enabledCodex" ? nextValue : config.enabledCodex,
        enabledGemini:
          field === "enabledGemini" ? nextValue : config.enabledGemini,
        enabledOpencode:
          field === "enabledOpencode" ? nextValue : config.enabledOpencode,
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
    <>
      <div className="space-y-4">
        <SettingSection
          title="MCP Servers"
          description="Configure Model Context Protocol servers for your sandboxes."
          headerAction={
            <Button size="sm" onClick={openCreateDialog}>
              <Plus className="size-4" />
              Add MCP Server
            </Button>
          }
        >
          <div className="p-4 space-y-4">
            <SettingSegmented
              label="Scope"
              description="Global configs apply everywhere. Workspace configs override global configs for a specific repository."
              value={activeScope}
              options={[
                { value: "global", label: `Global (${counts.global})` },
                { value: "workspace", label: `Workspace (${counts.workspace})` },
              ]}
              onValueChange={(value) => setActiveScope(value as Scope)}
              noBorder
            />

            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-neutral-500 dark:text-neutral-400">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : visibleConfigs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 p-8 text-center dark:border-neutral-800 dark:bg-neutral-900">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-white text-neutral-500 dark:bg-neutral-950 dark:text-neutral-300">
                  <Plug className="size-5" />
                </div>
                <h3 className="mt-4 text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  No {activeScope} MCP servers yet
                </h3>
                <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                  Add a preset or define a custom MCP server for this scope.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleConfigs.map((config) => (
                  <div
                    key={config._id}
                    className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                            {config.displayName}
                          </h3>
                          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                            {config.scope === "global" ? "Global" : "Workspace"}
                          </span>
                          {config.projectFullName ? (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                              {config.projectFullName}
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                          {config.description || "No description provided."}
                        </p>

                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                          <span className="rounded-md bg-neutral-100 px-2 py-1 font-mono dark:bg-neutral-800">
                            {config.command}
                            {config.args.length > 0 ? ` ${config.args.join(" ")}` : ""}
                          </span>
                          <span>Name: {config.name}</span>
                        </div>

                        {config.tags && config.tags.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {config.tags.map((tag) => (
                              <span
                                key={`${config._id}:${tag}`}
                                className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2 self-start">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditDialog(config)}
                        >
                          <Pencil className="size-4" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDeleteTarget(config)}
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      {AGENT_OPTIONS.map((agent) => {
                        const enabled = config[agent.field];
                        const isPending =
                          upsertMutation.isPending &&
                          upsertMutation.variables?.name === config.name &&
                          upsertMutation.variables?.scope === config.scope;

                        return (
                          <div
                            key={`${config._id}:${agent.key}`}
                            className="flex items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
                          >
                            <span className="text-sm text-neutral-700 dark:text-neutral-300">
                              {agent.label}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                void handleToggleAgent(config, agent.field, !enabled)
                              }
                              disabled={isPending}
                              className={`relative h-6 w-11 rounded-full transition-colors ${
                                enabled
                                  ? "bg-blue-600"
                                  : "bg-neutral-300 dark:bg-neutral-600"
                              } ${isPending ? "opacity-70" : ""}`}
                            >
                              <span
                                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                                  enabled ? "left-[22px]" : "left-0.5"
                                }`}
                              />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SettingSection>
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
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[var(--z-global-blocking)] w-[min(920px,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
            <Dialog.Close asChild>
              <button
                type="button"
                className="absolute right-4 top-4 rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-white"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </Dialog.Close>

            <div className="max-h-[calc(100vh-2rem)] overflow-y-auto p-6">
              <div className="flex items-start gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                  <Server className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <Dialog.Title className="text-lg font-semibold text-neutral-900 dark:text-white">
                    {dialogMode === "create"
                      ? "Add MCP Server"
                      : `Edit ${editingConfig?.displayName ?? "MCP Server"}`}
                  </Dialog.Title>
                  <Dialog.Description className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                    {dialogMode === "create"
                      ? "Use a curated preset or define a custom local MCP server."
                      : "Update command details, scope, and enabled agents."}
                  </Dialog.Description>
                </div>
              </div>

              {dialogMode === "create" ? (
                <div className="mt-5 inline-flex rounded-lg border border-neutral-200 bg-white p-1 dark:border-neutral-700 dark:bg-neutral-950">
                  <button
                    type="button"
                    onClick={() => setDialogTab("preset")}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      dialogTab === "preset"
                        ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                        : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    }`}
                  >
                    From Preset
                  </button>
                  <button
                    type="button"
                    onClick={() => setDialogTab("custom")}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      dialogTab === "custom"
                        ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                        : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    }`}
                  >
                    Custom
                  </button>
                </div>
              ) : null}

              {formError ? (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                  {formError}
                </div>
              ) : null}

              {dialogMode === "create" && dialogTab === "preset" ? (
                <div className="mt-5 space-y-4">
                  <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                          Scope
                        </p>
                        <div className="mt-3 inline-flex rounded-lg border border-neutral-200 bg-white p-1 dark:border-neutral-700 dark:bg-neutral-950">
                          <button
                            type="button"
                            onClick={() =>
                              setForm((current) => ({
                                ...current,
                                scope: "global",
                              }))
                            }
                            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                              form.scope === "global"
                                ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                                : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                            }`}
                          >
                            Global
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setForm((current) => ({
                                ...current,
                                scope: "workspace",
                              }))
                            }
                            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                              form.scope === "workspace"
                                ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                                : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                            }`}
                          >
                            Workspace
                          </button>
                        </div>
                      </div>

                      {form.scope === "workspace" ? (
                        <div>
                          <label
                            htmlFor="preset-project-full-name"
                            className="text-sm font-medium text-neutral-900 dark:text-neutral-100"
                          >
                            Workspace repository
                          </label>
                          <input
                            id="preset-project-full-name"
                            value={form.projectFullName}
                            onChange={(event) => {
                              setForm((current) => ({
                                ...current,
                                projectFullName: event.target.value,
                              }));
                              setFormError(null);
                            }}
                            placeholder="owner/repo"
                            className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {MCP_SERVER_PRESETS.map((preset) => {
                      const alreadyConfigured = (configs ?? []).some((config) =>
                        config.name === preset.name &&
                        matchesTarget(config, form.scope, form.projectFullName)
                      );
                      const workspaceMissing =
                        form.scope === "workspace" &&
                        !isValidProjectFullName(form.projectFullName);

                      return (
                        <div
                          key={preset.name}
                          className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
                        >
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                                  {preset.displayName}
                                </h3>
                                {preset.tags.map((tag) => (
                                  <span
                                    key={`${preset.name}:${tag}`}
                                    className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                                {preset.description}
                              </p>
                              <p className="mt-3 rounded-md bg-neutral-50 px-3 py-2 font-mono text-xs text-neutral-700 dark:bg-neutral-950 dark:text-neutral-300">
                                {preset.command} {preset.args.join(" ")}
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
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
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
                      onChange={(event) => {
                        setForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }));
                        setFormError(null);
                      }}
                      disabled={dialogMode === "edit"}
                      placeholder="my-mcp-server"
                      className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="mcp-display-name"
                      className="text-sm font-medium text-neutral-900 dark:text-neutral-100"
                    >
                      Display Name
                    </label>
                    <input
                      id="mcp-display-name"
                      value={form.displayName}
                      onChange={(event) => {
                        setForm((current) => ({
                          ...current,
                          displayName: event.target.value,
                        }));
                        setFormError(null);
                      }}
                      placeholder="My MCP Server"
                      className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
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
                      onChange={(event) => {
                        setForm((current) => ({
                          ...current,
                          command: event.target.value,
                        }));
                        setFormError(null);
                      }}
                      placeholder="npx"
                      className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="mcp-args"
                      className="text-sm font-medium text-neutral-900 dark:text-neutral-100"
                    >
                      Arguments
                    </label>
                    <textarea
                      id="mcp-args"
                      rows={5}
                      value={form.argsText}
                      onChange={(event) => {
                        setForm((current) => ({
                          ...current,
                          argsText: event.target.value,
                        }));
                        setFormError(null);
                      }}
                      placeholder={"-y\n@my/mcp-server@latest"}
                      className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
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
                      Environment Variables
                    </label>
                    <textarea
                      id="mcp-env-vars"
                      rows={5}
                      value={form.envVarsText}
                      onChange={(event) => {
                        setForm((current) => ({
                          ...current,
                          envVarsText: event.target.value,
                        }));
                        setFormError(null);
                      }}
                      placeholder="API_KEY=secret-value"
                      className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                    />
                    <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                      Use KEY=value format, one per line.
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
                      onChange={(event) => {
                        setForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }));
                        setFormError(null);
                      }}
                      placeholder="Describe what this MCP server is for."
                      className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                    />
                  </div>

                  <div className="sm:col-span-2 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      Enabled Agents
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {AGENT_OPTIONS.map((agent) => {
                        const enabled = form[agent.field];

                        return (
                          <button
                            key={agent.key}
                            type="button"
                            onClick={() => {
                              setForm((current) => ({
                                ...current,
                                [agent.field]: !current[agent.field],
                              }));
                              setFormError(null);
                            }}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                              enabled
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
                                : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800"
                            }`}
                          >
                            {enabled ? <Check className="size-4" /> : null}
                            {agent.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="sm:col-span-2 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      Scope
                    </p>
                    <div className="mt-3 inline-flex rounded-lg border border-neutral-200 bg-white p-1 dark:border-neutral-700 dark:bg-neutral-950">
                      <button
                        type="button"
                        disabled={dialogMode === "edit"}
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            scope: "global",
                          }))
                        }
                        className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                          form.scope === "global"
                            ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                            : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                        } ${dialogMode === "edit" ? "opacity-60" : ""}`}
                      >
                        Global
                      </button>
                      <button
                        type="button"
                        disabled={dialogMode === "edit"}
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            scope: "workspace",
                          }))
                        }
                        className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                          form.scope === "workspace"
                            ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                            : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                        } ${dialogMode === "edit" ? "opacity-60" : ""}`}
                      >
                        Workspace
                      </button>
                    </div>

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
                          onChange={(event) => {
                            setForm((current) => ({
                              ...current,
                              projectFullName: event.target.value,
                            }));
                            setFormError(null);
                          }}
                          disabled={dialogMode === "edit"}
                          placeholder="owner/repo"
                          className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3">
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
  );
}
