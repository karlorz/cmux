import { SettingSection } from "@/components/settings/SettingSection";
import { SettingSwitch } from "@/components/settings/SettingSwitch";
import {
  ScopeBadge,
  ScopeFilterTabs,
  ContextBadges,
  CONTEXT_LABELS,
  type ScopeValue,
} from "@/components/settings/scope-utils";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { api } from "@cmux/convex/api";
import type { Doc } from "@cmux/convex/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useConvex } from "convex/react";
import { Loader2, Pencil, Plus, Power, PowerOff, Trash2, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

type PermissionRule = Doc<"permissionDenyRules">;
type PermissionScope = "system" | "team" | "workspace";
export const PERMISSION_RULE_CONTEXTS = [
  "task_sandbox",
  "cloud_workspace",
  "local_dev",
] as const;
type PermissionContext = (typeof PERMISSION_RULE_CONTEXTS)[number];

interface PermissionRulesSectionProps {
  teamSlugOrId: string;
  enableShellWrappers?: boolean;
  onEnableShellWrappersChange?: (value: boolean) => void;
}

interface FormState {
  pattern: string;
  description: string;
  scope: PermissionScope;
  contexts: PermissionContext[];
  priority: number;
  enabled: boolean;
}

function buildEmptyForm(): FormState {
  return {
    pattern: "",
    description: "",
    scope: "team",
    contexts: ["task_sandbox"],
    priority: 50,
    enabled: true,
  };
}

function buildFormFromRule(rule: PermissionRule): FormState {
  return {
    pattern: rule.pattern,
    description: rule.description,
    scope: rule.scope,
    contexts: rule.contexts ?? ["task_sandbox"],
    priority: rule.priority,
    enabled: rule.enabled,
  };
}

export function PermissionRulesSection({ teamSlugOrId, enableShellWrappers, onEnableShellWrappersChange }: PermissionRulesSectionProps) {
  const convex = useConvex();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PermissionRule | null>(null);
  const [form, setForm] = useState<FormState>(buildEmptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PermissionRule | null>(null);
  const [activeScope, setActiveScope] = useState<PermissionScope | "all">("all");

  const { data: rules, refetch, isLoading } = useQuery(
    convexQuery(api.permissionDenyRules.list, { teamSlugOrId })
  );

  const upsertMutation = useMutation({
    mutationFn: async (
      payload: Parameters<typeof convex.mutation<typeof api.permissionDenyRules.upsert>>[1]
    ) => {
      return await convex.mutation(api.permissionDenyRules.upsert, payload);
    },
    onSuccess: async () => {
      await refetch();
      setDialogOpen(false);
      setEditingRule(null);
      setForm(buildEmptyForm());
      toast.success(editingRule ? "Permission rule updated" : "Permission rule created");
    },
    onError: (error) => {
      toast.error(`Failed to save: ${error.message}`);
    },
  });

  const toggleEnabledMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: PermissionRule["_id"]; enabled: boolean }) => {
      return await convex.mutation(api.permissionDenyRules.updateEnabled, { id, enabled });
    },
    onSuccess: async () => {
      await refetch();
      toast.success("Rule status updated");
    },
    onError: (error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: PermissionRule["_id"]) => {
      return await convex.mutation(api.permissionDenyRules.remove, { id });
    },
    onSuccess: async () => {
      await refetch();
      setDeleteTarget(null);
      toast.success("Permission rule deleted");
    },
    onError: (error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });

  const visibleRules = useMemo(() => {
    if (!rules) return [];
    if (activeScope === "all") return rules;
    return rules.filter((rule) => rule.scope === activeScope);
  }, [rules, activeScope]);

  const scopeCounts = useMemo(() => {
    const counts: Record<PermissionScope | "all", number> = {
      all: 0,
      system: 0,
      team: 0,
      workspace: 0,
    };
    for (const rule of rules ?? []) {
      counts[rule.scope]++;
      counts.all++;
    }
    return counts;
  }, [rules]);

  const openCreateDialog = useCallback(() => {
    setEditingRule(null);
    setForm(buildEmptyForm());
    setFormError(null);
    setDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((rule: PermissionRule) => {
    setEditingRule(rule);
    setForm(buildFormFromRule(rule));
    setFormError(null);
    setDialogOpen(true);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!form.pattern.trim()) {
      setFormError("Pattern is required");
      return;
    }
    if (!form.description.trim()) {
      setFormError("Description is required");
      return;
    }
    if (form.contexts.length === 0) {
      setFormError("At least one context is required");
      return;
    }

    setFormError(null);
    upsertMutation.mutate({
      id: editingRule?._id,
      pattern: form.pattern.trim(),
      description: form.description.trim(),
      scope: form.scope,
      teamSlugOrId: form.scope !== "system" ? teamSlugOrId : undefined,
      contexts: form.contexts,
      enabled: form.enabled,
      priority: form.priority,
    });
  }, [form, editingRule, teamSlugOrId, upsertMutation]);

  const toggleContext = useCallback((context: PermissionContext) => {
    setForm((prev) => ({
      ...prev,
      contexts: prev.contexts.includes(context)
        ? prev.contexts.filter((c) => c !== context)
        : [...prev.contexts, context],
    }));
  }, []);

  return (
    <div className="space-y-4">
      {/* Shell Wrappers Toggle - shown if props provided */}
      {onEnableShellWrappersChange && (
        <SettingSection
          title="Shell Wrappers"
          description="Defense-in-depth for agents without native permission systems (Gemini, Amp, Grok, etc.)."
        >
          <SettingSwitch
            label="Enable gh/git shell wrappers"
            description="Inject wrapper scripts to block dangerous commands (gh pr create, git push --force). Disabled by default - use permission deny rules or policy rules instead."
            isSelected={enableShellWrappers ?? false}
            onValueChange={onEnableShellWrappersChange}
            ariaLabel="Enable shell wrappers for task sandboxes"
            noBorder
          />
        </SettingSection>
      )}

      <SettingSection
        title="Permission Deny Rules"
        description="Claude Code permissions.deny patterns that restrict tool access in sandboxes. System rules cannot be modified but can be toggled."
        headerAction={
          <Button size="sm" onClick={openCreateDialog}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Rule
          </Button>
        }
      >
        {/* Scope filter tabs */}
        <ScopeFilterTabs
        scopes={["system", "team", "workspace"] as const}
        activeScope={activeScope}
        onScopeChange={setActiveScope}
        scopeCounts={scopeCounts}
      />

      {/* Rules list */}
      <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
          </div>
        ) : visibleRules.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-neutral-500">
            No permission rules found. System defaults will apply.
          </div>
        ) : (
          visibleRules.map((rule) => (
            <div
              key={rule._id}
              className={`flex items-start justify-between gap-4 px-4 py-3 ${
                !rule.enabled ? "opacity-50" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono text-neutral-900 dark:text-neutral-100 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
                    {rule.pattern}
                  </code>
                  <ScopeBadge scope={rule.scope as ScopeValue} />
                  {!rule.enabled && (
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Disabled
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2">
                  {rule.description}
                </p>
                <ContextBadges contexts={rule.contexts ?? []} />
              </div>
              <div className="flex items-center gap-1">
                {/* Toggle button - available for all rules including system */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() =>
                    toggleEnabledMutation.mutate({ id: rule._id, enabled: !rule.enabled })
                  }
                  title={rule.enabled ? "Disable rule" : "Enable rule"}
                >
                  {rule.enabled ? (
                    <Power className="h-4 w-4 text-green-600" />
                  ) : (
                    <PowerOff className="h-4 w-4 text-neutral-400" />
                  )}
                </Button>
                {/* Edit and delete only for non-system rules */}
                {rule.scope !== "system" && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEditDialog(rule)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-600 hover:text-red-700"
                      onClick={() => setDeleteTarget(rule)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-white p-6 shadow-xl dark:bg-neutral-900">
            <Dialog.Title className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {editingRule ? "Edit Permission Rule" : "Create Permission Rule"}
            </Dialog.Title>
            <Dialog.Close className="absolute right-4 top-4 text-neutral-400 hover:text-neutral-600">
              <X className="h-5 w-5" />
            </Dialog.Close>

            <div className="mt-4 space-y-4">
              {formError && (
                <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Pattern
                </label>
                <input
                  type="text"
                  value={form.pattern}
                  onChange={(e) => setForm((f) => ({ ...f, pattern: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm font-mono dark:border-neutral-700 dark:bg-neutral-800"
                  placeholder="e.g., Bash(gh pr create:*)"
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Format: Tool(command-prefix:*) - e.g., Bash(git push --force:*)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                  rows={2}
                  placeholder="Explain why this command is blocked..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Scope
                  </label>
                  <select
                    value={form.scope}
                    onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as PermissionScope }))}
                    className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                  >
                    <option value="team">Team</option>
                    <option value="workspace" disabled title="Workspace scope coming soon">
                      Workspace (coming soon)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Priority
                  </label>
                  <input
                    type="number"
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: parseInt(e.target.value) || 50 }))}
                    className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                    min={1}
                    max={100}
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    Lower = higher priority
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Applies to Contexts
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PERMISSION_RULE_CONTEXTS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => toggleContext(value)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        form.contexts.includes(value)
                          ? "bg-blue-600 text-white"
                          : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                      }`}
                    >
                      {CONTEXT_LABELS[value]}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  Task Sandbox = regular tasks, Cloud Workspace = head agents, Local Dev = local runs
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={form.enabled}
                  onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                  className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="enabled" className="text-sm text-neutral-700 dark:text-neutral-300">
                  Enabled
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={upsertMutation.isPending}>
                  {upsertMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingRule ? "Save Changes" : "Create Rule"}
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

        {/* Delete Confirmation */}
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title="Delete Permission Rule"
          description={`Are you sure you want to delete the rule "${deleteTarget?.pattern}"? This action cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => {
            if (deleteTarget) {
              deleteMutation.mutate(deleteTarget._id);
            }
          }}
        />
      </SettingSection>
    </div>
  );
}
