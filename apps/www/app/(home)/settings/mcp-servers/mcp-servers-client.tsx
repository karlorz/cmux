"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@stackframe/stack";
import {
  Check,
  Loader2,
  Pencil,
  Plus,
  Server,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

type Scope = "global" | "workspace";
type AgentKey = "claude" | "codex" | "gemini" | "opencode";

type McpServerConfig = {
  _id: string;
  name: string;
  displayName: string;
  command: string;
  args: string[];
  // envVars are redacted from API - only hasEnvVars/envVarKeys returned
  hasEnvVars?: boolean;
  envVarKeys?: string[];
  description?: string;
  tags?: string[];
  enabledClaude: boolean;
  enabledCodex: boolean;
  enabledGemini: boolean;
  enabledOpencode: boolean;
  scope: Scope;
  projectFullName?: string;
  createdAt: number;
  updatedAt: number;
};

type McpServerPreset = {
  name: string;
  displayName: string;
  description: string;
  command: string;
  args: string[];
  tags: string[];
  supportedAgents: Record<AgentKey, boolean>;
};

type McpServersResponse = {
  configs: McpServerConfig[];
  presets: McpServerPreset[];
};

type UpsertPayload = {
  name: string;
  displayName: string;
  command: string;
  args: string[];
  envVars?: Record<string, string>;
  description?: string;
  tags?: string[];
  enabledClaude: boolean;
  enabledCodex: boolean;
  enabledGemini: boolean;
  enabledOpencode: boolean;
  scope: Scope;
  projectFullName?: string;
};

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

const SCOPE_OPTIONS: Array<{ key: Scope; label: string }> = [
  { key: "global", label: "Global" },
  { key: "workspace", label: "Workspace" },
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
  // Show existing env var keys with placeholder values (secrets are redacted from API)
  let envVarsText = "";
  if (config.envVarKeys && config.envVarKeys.length > 0) {
    envVarsText = config.envVarKeys
      .map((key) => `${key}=<existing-secret>`)
      .join("\n");
  }

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
    const valuePart = line.slice(separatorIndex + 1);
    if (!key) {
      return {
        hasChanges: false,
        error: "Environment variables must include a non-empty key before '='.",
      };
    }

    // Skip placeholder values - these indicate existing secrets that weren't changed
    if (valuePart === "<existing-secret>") {
      continue;
    }

    hasChanges = true;
    entries.push([key, valuePart]);
  }

  // Only return envVars if user actually provided new values
  if (!hasChanges || entries.length === 0) {
    return { hasChanges: false };
  }

  return { envVars: Object.fromEntries(entries), hasChanges: true };
}

function readErrorMessage(
  value: unknown,
  fallback: string,
): string {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    "message" in value &&
    typeof value.message === "string" &&
    value.message.trim()
  ) {
    return value.message;
  }

  if (
    value &&
    typeof value === "object" &&
    "error" in value &&
    typeof value.error === "string" &&
    value.error.trim()
  ) {
    return value.error;
  }

  return fallback;
}

async function getResponseError(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const data = await response.json();
    return readErrorMessage(data, fallback);
  } catch {
    return fallback;
  }
}

function isValidProjectFullName(value: string): boolean {
  return /^[^/\s]+\/[^/\s]+$/.test(value.trim());
}

function buildPayloadFromForm(form: FormState): {
  payload?: UpsertPayload;
  error?: string;
} {
  const name = form.name.trim();
  const displayName = form.displayName.trim();
  const command = form.command.trim();
  const description = form.description.trim();
  const enabledCount = [
    form.enabledClaude,
    form.enabledCodex,
    form.enabledGemini,
    form.enabledOpencode,
  ].filter(Boolean).length;

  if (!name) {
    return { error: "Name is required." };
  }
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    return {
      error: "Name can only contain letters, numbers, hyphens, and underscores.",
    };
  }
  if (!displayName) {
    return { error: "Display name is required." };
  }
  if (!command) {
    return { error: "Command is required." };
  }
  if (enabledCount === 0) {
    return { error: "Enable at least one agent." };
  }

  const projectFullName = form.projectFullName.trim();
  if (form.scope === "workspace" && !isValidProjectFullName(projectFullName)) {
    return { error: "Workspace scope requires a repository in owner/repo format." };
  }

  const parsedEnvVars = parseEnvVarsText(form.envVarsText);
  if (parsedEnvVars.error) {
    return { error: parsedEnvVars.error };
  }

  return {
    payload: {
      name,
      displayName,
      command,
      args: parseArgsText(form.argsText),
      // Only include envVars if user provided new values (not placeholders)
      ...(parsedEnvVars.hasChanges ? { envVars: parsedEnvVars.envVars } : {}),
      description: description || undefined,
      enabledClaude: form.enabledClaude,
      enabledCodex: form.enabledCodex,
      enabledGemini: form.enabledGemini,
      enabledOpencode: form.enabledOpencode,
      scope: form.scope,
      projectFullName: form.scope === "workspace" ? projectFullName : undefined,
    },
  };
}

function buildPayloadFromPreset(
  preset: McpServerPreset,
  scope: Scope,
  projectFullName: string,
): {
  payload?: UpsertPayload;
  error?: string;
} {
  const trimmedProject = projectFullName.trim();
  if (scope === "workspace" && !isValidProjectFullName(trimmedProject)) {
    return { error: "Workspace scope requires a repository in owner/repo format." };
  }

  return {
    payload: {
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
      projectFullName: scope === "workspace" ? trimmedProject : undefined,
    },
  };
}

function matchesConfigTarget(
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

export function McpServersClient() {
  const user = useUser();
  const [teamSlugOrId, setTeamSlugOrId] = useState<string | null>(null);
  const [configs, setConfigs] = useState<McpServerConfig[]>([]);
  const [presets, setPresets] = useState<McpServerPreset[]>([]);
  const [activeScope, setActiveScope] = useState<Scope>("global");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTab, setEditorTab] = useState<"preset" | "custom">("preset");
  const [editingConfig, setEditingConfig] = useState<McpServerConfig | null>(null);
  const [form, setForm] = useState<FormState>(buildEmptyForm("global"));
  const [editorError, setEditorError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<McpServerConfig | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  useEffect(() => {
    const loadTeam = async () => {
      if (!user) {
        return;
      }

      try {
        const teams = await user.listTeams();
        if (teams.length === 0) {
          setError("No team found for this account.");
          setIsLoading(false);
          return;
        }

        setTeamSlugOrId(teams[0].id);
      } catch (teamError) {
        console.error("Failed to fetch teams:", teamError);
        setError("Failed to load team context.");
        setIsLoading(false);
      }
    };

    void loadTeam();
  }, [user]);

  const fetchConfigs = useCallback(async () => {
    if (!teamSlugOrId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/mcp-servers?teamSlugOrId=${encodeURIComponent(teamSlugOrId)}`
      );

      if (!response.ok) {
        throw new Error(
          await getResponseError(response, "Failed to load MCP servers.")
        );
      }

      const data = (await response.json()) as McpServersResponse;
      setConfigs(data.configs);
      setPresets(data.presets);
    } catch (fetchError) {
      console.error("Failed to fetch MCP servers:", fetchError);
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to load MCP servers."
      );
    } finally {
      setIsLoading(false);
    }
  }, [teamSlugOrId]);

  useEffect(() => {
    void fetchConfigs();
  }, [fetchConfigs]);

  const visibleConfigs = useMemo(
    () => configs.filter((config) => config.scope === activeScope),
    [activeScope, configs]
  );

  const counts = useMemo(
    () =>
      configs.reduce(
        (acc, config) => {
          acc[config.scope]++;
          return acc;
        },
        { global: 0, workspace: 0 }
      ),
    [configs]
  );

  // editorMode is derived from editingConfig - no separate state needed
  const editorMode = editingConfig !== null ? "edit" : "create";

  const resetEditor = useCallback(() => {
    setEditorOpen(false);
    setEditorTab("preset");
    setEditingConfig(null);
    setForm(buildEmptyForm(activeScope));
    setEditorError(null);
  }, [activeScope]);

  const openCreateModal = useCallback(() => {
    setEditorTab("preset");
    setEditingConfig(null);
    setForm(buildEmptyForm(activeScope));
    setEditorError(null);
    setEditorOpen(true);
  }, [activeScope]);

  const openEditModal = useCallback((config: McpServerConfig) => {
    setEditorTab("custom");
    setEditingConfig(config);
    setForm(buildFormFromConfig(config));
    setEditorError(null);
    setEditorOpen(true);
  }, []);

  const savePayload = useCallback(
    async (payload: UpsertPayload) => {
      if (!teamSlugOrId) {
        return false;
      }

      setIsSaving(true);
      setEditorError(null);

      try {
        const response = await fetch(
          `/api/mcp-servers?teamSlugOrId=${encodeURIComponent(teamSlugOrId)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          }
        );

        if (!response.ok) {
          throw new Error(
            await getResponseError(response, "Failed to save MCP server.")
          );
        }

        await fetchConfigs();
        return true;
      } catch (saveError) {
        console.error("Failed to save MCP server:", saveError);
        setEditorError(
          saveError instanceof Error
            ? saveError.message
            : "Failed to save MCP server."
        );
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [fetchConfigs, teamSlugOrId]
  );

  const handleSaveForm = async () => {
    const parsed = buildPayloadFromForm(form);
    if (parsed.error || !parsed.payload) {
      setEditorError(parsed.error ?? "Invalid MCP server configuration.");
      return;
    }

    const didSave = await savePayload(parsed.payload);
    if (didSave) {
      resetEditor();
    }
  };

  const handleAddPreset = async (preset: McpServerPreset) => {
    const parsed = buildPayloadFromPreset(
      preset,
      form.scope,
      form.projectFullName,
    );
    if (parsed.error || !parsed.payload) {
      setEditorError(parsed.error ?? "Invalid preset configuration.");
      return;
    }

    const didSave = await savePayload(parsed.payload);
    if (didSave) {
      resetEditor();
    }
  };

  const handleToggleAgent = async (
    config: McpServerConfig,
    field: (typeof AGENT_OPTIONS)[number]["field"],
    nextValue: boolean,
  ) => {
    if (!teamSlugOrId) {
      return;
    }

    const payload: UpsertPayload = {
      name: config.name,
      displayName: config.displayName,
      command: config.command,
      args: config.args,
      // Don't send envVars on toggle - server preserves existing secrets
      description: config.description,
      tags: config.tags,
      enabledClaude:
        field === "enabledClaude" ? nextValue : config.enabledClaude,
      enabledCodex: field === "enabledCodex" ? nextValue : config.enabledCodex,
      enabledGemini:
        field === "enabledGemini" ? nextValue : config.enabledGemini,
      enabledOpencode:
        field === "enabledOpencode" ? nextValue : config.enabledOpencode,
      scope: config.scope,
      projectFullName: config.projectFullName,
    };

    setTogglingKey(`${config._id}:${field}`);
    setError(null);

    try {
      const response = await fetch(
        `/api/mcp-servers?teamSlugOrId=${encodeURIComponent(teamSlugOrId)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        throw new Error(
          await getResponseError(response, "Failed to update agent toggle.")
        );
      }

      await fetchConfigs();
    } catch (toggleError) {
      console.error("Failed to toggle MCP server agent:", toggleError);
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "Failed to update agent toggle."
      );
    } finally {
      setTogglingKey(null);
    }
  };

  const handleDelete = async () => {
    if (!teamSlugOrId || !deleteTarget) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/mcp-servers/${encodeURIComponent(deleteTarget._id)}?teamSlugOrId=${encodeURIComponent(teamSlugOrId)}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error(
          await getResponseError(response, "Failed to delete MCP server.")
        );
      }

      await fetchConfigs();
      setDeleteTarget(null);
    } catch (deleteError) {
      console.error("Failed to delete MCP server:", deleteError);
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete MCP server."
      );
    } finally {
      setIsDeleting(false);
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-neutral-500 dark:text-neutral-400">
          Please sign in to manage MCP servers.
        </p>
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
            MCP Servers
          </h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Configure Model Context Protocol servers for your sandboxes.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          <Plus className="h-4 w-4" />
          Add MCP Server
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {SCOPE_OPTIONS.map((scopeOption) => {
          const isActive = activeScope === scopeOption.key;
          const count = counts[scopeOption.key];

          return (
            <button
              key={scopeOption.key}
              type="button"
              onClick={() => setActiveScope(scopeOption.key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition",
                isActive
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                  : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:border-neutral-700 dark:hover:text-white"
              )}
            >
              {scopeOption.label}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs",
                  isActive
                    ? "bg-white/15 text-white dark:bg-neutral-200 dark:text-neutral-900"
                    : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-4">
        {visibleConfigs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-10 text-center dark:border-neutral-800 dark:bg-neutral-900">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">
              <Server className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-base font-medium text-neutral-900 dark:text-white">
              No {activeScope} MCP servers yet
            </h3>
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              Add a preset or create a custom server configuration for this scope.
            </p>
          </div>
        ) : (
          visibleConfigs.map((config) => (
            <div
              key={config._id}
              className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
                      {config.displayName}
                    </h3>
                    <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                      {config.scope === "global" ? "Global" : "Workspace"}
                    </span>
                    {config.projectFullName && (
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                        {config.projectFullName}
                      </span>
                    )}
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
                    <span>
                      Updated {new Date(config.updatedAt).toLocaleDateString()}
                    </span>
                  </div>

                  {config.tags && config.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {config.tags.map((tag) => (
                        <span
                          key={`${config._id}:${tag}`}
                          className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 self-start">
                  <button
                    type="button"
                    onClick={() => openEditModal(config)}
                    className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-300 hover:text-neutral-900 dark:border-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-700 dark:hover:text-white"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(config)}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:border-red-300 dark:border-red-500/20 dark:text-red-400 dark:hover:border-red-500/40"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                {AGENT_OPTIONS.map((agent) => {
                  const enabled = config[agent.field];
                  const isToggling = togglingKey === `${config._id}:${agent.field}`;

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
                        disabled={isToggling}
                        className={cn(
                          "relative h-6 w-11 rounded-full transition-colors",
                          enabled
                            ? "bg-blue-600"
                            : "bg-neutral-300 dark:bg-neutral-600",
                          isToggling && "cursor-wait opacity-70"
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                            enabled ? "left-[22px]" : "left-0.5"
                          )}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <AlertDialog
        open={editorOpen}
        onOpenChange={(open) => {
          if (!open && !isSaving) {
            resetEditor();
          }
        }}
      >
        <AlertDialogContent className="max-h-[90vh] max-w-3xl overflow-hidden p-0">
          <div className="max-h-[90vh] overflow-y-auto px-6 py-5">
            <AlertDialogHeader>
              <div className="rounded-full bg-blue-500/10 p-2 text-blue-400">
                <Server className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <AlertDialogTitle>
                  {editorMode === "create"
                    ? "Add MCP Server"
                    : `Edit ${editingConfig?.displayName ?? "MCP Server"}`}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {editorMode === "create"
                    ? "Use a curated preset or define a custom local MCP server."
                    : "Update command details, agent enables, and metadata for this server."}
                </AlertDialogDescription>
              </div>
            </AlertDialogHeader>

            {editorMode === "create" && (
              <div className="mt-5 flex gap-2 rounded-lg bg-neutral-800/60 p-1">
                <button
                  type="button"
                  onClick={() => setEditorTab("preset")}
                  className={cn(
                    "flex-1 rounded-md px-3 py-2 text-sm font-medium transition",
                    editorTab === "preset"
                      ? "bg-white text-neutral-900"
                      : "text-neutral-400 hover:text-white"
                  )}
                >
                  From Preset
                </button>
                <button
                  type="button"
                  onClick={() => setEditorTab("custom")}
                  className={cn(
                    "flex-1 rounded-md px-3 py-2 text-sm font-medium transition",
                    editorTab === "custom"
                      ? "bg-white text-neutral-900"
                      : "text-neutral-400 hover:text-white"
                  )}
                >
                  Custom
                </button>
              </div>
            )}

            {editorError && (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {editorError}
              </div>
            )}

            {editorMode === "create" && editorTab === "preset" ? (
              <div className="mt-5 space-y-5">
                <div className="rounded-xl border border-white/10 bg-neutral-950/40 p-4">
                  <p className="text-sm font-medium text-white">Scope</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {SCOPE_OPTIONS.map((scopeOption) => {
                      const isActive = form.scope === scopeOption.key;
                      return (
                        <button
                          key={scopeOption.key}
                          type="button"
                          onClick={() => {
                            setForm((current) => ({
                              ...current,
                              scope: scopeOption.key,
                            }));
                            setEditorError(null);
                          }}
                          className={cn(
                            "rounded-full border px-4 py-2 text-sm font-medium transition",
                            isActive
                              ? "border-white bg-white text-neutral-900"
                              : "border-white/15 text-neutral-300 hover:border-white/30 hover:text-white"
                          )}
                        >
                          {scopeOption.label}
                        </button>
                      );
                    })}
                  </div>

                  {form.scope === "workspace" && (
                    <div className="mt-4">
                      <label
                        htmlFor="preset-project-full-name"
                        className="text-sm font-medium text-white"
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
                          setEditorError(null);
                        }}
                        placeholder="owner/repo"
                        className="mt-2 w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-neutral-500 focus:border-blue-400"
                      />
                      <p className="mt-2 text-xs text-neutral-400">
                        Workspace-scoped presets override global configs with the same
                        name for that repository.
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {presets.map((preset) => {
                    const alreadyConfigured = configs.some(
                      (config) =>
                        config.name === preset.name &&
                        matchesConfigTarget(
                          config,
                          form.scope,
                          form.projectFullName,
                        )
                    );
                    const requiresWorkspace =
                      form.scope === "workspace" &&
                      !isValidProjectFullName(form.projectFullName);

                    return (
                      <div
                        key={preset.name}
                        className="rounded-xl border border-white/10 bg-neutral-950/40 p-4"
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold text-white">
                                {preset.displayName}
                              </h3>
                              {preset.tags.map((tag) => (
                                <span
                                  key={`${preset.name}:${tag}`}
                                  className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-neutral-300"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                            <p className="mt-2 text-sm text-neutral-400">
                              {preset.description}
                            </p>
                            <p className="mt-3 rounded-md bg-black/30 px-3 py-2 font-mono text-xs text-neutral-300">
                              {preset.command} {preset.args.join(" ")}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => void handleAddPreset(preset)}
                            disabled={isSaving || alreadyConfigured || requiresWorkspace}
                            className={cn(
                              "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition",
                              alreadyConfigured
                                ? "cursor-not-allowed bg-neutral-700 text-neutral-400"
                                : requiresWorkspace || isSaving
                                  ? "cursor-not-allowed bg-blue-500/50 text-white/70"
                                  : "bg-blue-500 text-white hover:bg-blue-400"
                            )}
                          >
                            {isSaving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : alreadyConfigured ? (
                              "Configured"
                            ) : (
                              "Add"
                            )}
                          </button>
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
                    className="text-sm font-medium text-white"
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
                      setEditorError(null);
                    }}
                    disabled={editorMode === "edit"}
                    placeholder="my-mcp-server"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-neutral-500 focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>

                <div>
                  <label
                    htmlFor="mcp-display-name"
                    className="text-sm font-medium text-white"
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
                      setEditorError(null);
                    }}
                    placeholder="My MCP Server"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-neutral-500 focus:border-blue-400"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="mcp-command"
                    className="text-sm font-medium text-white"
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
                      setEditorError(null);
                    }}
                    placeholder="npx"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-neutral-500 focus:border-blue-400"
                  />
                </div>

                <div>
                  <label
                    htmlFor="mcp-args"
                    className="text-sm font-medium text-white"
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
                      setEditorError(null);
                    }}
                    placeholder={"-y\n@my/mcp-server@latest"}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-neutral-500 focus:border-blue-400"
                  />
                  <p className="mt-2 text-xs text-neutral-400">
                    One argument per line.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="mcp-env-vars"
                    className="text-sm font-medium text-white"
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
                      setEditorError(null);
                    }}
                    placeholder="API_KEY=secret-value"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-neutral-500 focus:border-blue-400"
                  />
                  <p className="mt-2 text-xs text-neutral-400">
                    Use KEY=value format, one per line.
                  </p>
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="mcp-description"
                    className="text-sm font-medium text-white"
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
                      setEditorError(null);
                    }}
                    placeholder="Describe what this MCP server is for."
                    className="mt-2 w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-neutral-500 focus:border-blue-400"
                  />
                </div>

                <div className="sm:col-span-2 rounded-xl border border-white/10 bg-neutral-950/40 p-4">
                  <p className="text-sm font-medium text-white">Enabled Agents</p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {AGENT_OPTIONS.map((agent) => {
                      const enabledField = agent.field;
                      const enabled = form[enabledField];

                      return (
                        <button
                          key={agent.key}
                          type="button"
                          onClick={() => {
                            setForm((current) => ({
                              ...current,
                              [enabledField]: !current[enabledField],
                            }));
                            setEditorError(null);
                          }}
                          className={cn(
                            "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition",
                            enabled
                              ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-300"
                              : "border-white/10 text-neutral-400 hover:text-white"
                          )}
                        >
                          {enabled && <Check className="h-4 w-4" />}
                          {agent.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="sm:col-span-2 rounded-xl border border-white/10 bg-neutral-950/40 p-4">
                  <p className="text-sm font-medium text-white">Scope</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {SCOPE_OPTIONS.map((scopeOption) => {
                      const isActive = form.scope === scopeOption.key;
                      return (
                        <button
                          key={scopeOption.key}
                          type="button"
                          onClick={() => {
                            if (editorMode === "edit") {
                              return;
                            }
                            setForm((current) => ({
                              ...current,
                              scope: scopeOption.key,
                            }));
                            setEditorError(null);
                          }}
                          disabled={editorMode === "edit"}
                          className={cn(
                            "rounded-full border px-4 py-2 text-sm font-medium transition",
                            isActive
                              ? "border-white bg-white text-neutral-900"
                              : "border-white/15 text-neutral-300 hover:border-white/30 hover:text-white",
                            editorMode === "edit" && "cursor-not-allowed opacity-60"
                          )}
                        >
                          {scopeOption.label}
                        </button>
                      );
                    })}
                  </div>

                  {form.scope === "workspace" && (
                    <div className="mt-4">
                      <label
                        htmlFor="mcp-project-full-name"
                        className="text-sm font-medium text-white"
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
                          setEditorError(null);
                        }}
                        disabled={editorMode === "edit"}
                        placeholder="owner/repo"
                        className="mt-2 w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-neutral-500 focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            <AlertDialogFooter className="mt-6">
              <AlertDialogCancel asChild>
                <button
                  type="button"
                  disabled={isSaving}
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-neutral-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
              </AlertDialogCancel>

              {(editorMode === "edit" || editorTab === "custom") && (
                <button
                  type="button"
                  onClick={() => void handleSaveForm()}
                  disabled={isSaving}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-blue-500/50"
                >
                  {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save
                </button>
              )}
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="rounded-full bg-red-500/10 p-2 text-red-400">
              <Trash2 className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <AlertDialogTitle>Delete MCP server?</AlertDialogTitle>
              <AlertDialogDescription>
                Remove{" "}
                <span className="text-white">
                  {deleteTarget?.displayName ?? deleteTarget?.name}
                </span>
                {deleteTarget?.scope === "workspace" && deleteTarget?.projectFullName
                  ? ` for ${deleteTarget.projectFullName}`
                  : ""}{" "}
                from settings.
              </AlertDialogDescription>
            </div>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <button
                type="button"
                disabled={isDeleting}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-neutral-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={isDeleting}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-red-500/50"
              >
                {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete
              </button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
