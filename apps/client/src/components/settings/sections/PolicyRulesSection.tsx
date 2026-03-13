import { SettingSection } from "@/components/settings/SettingSection";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { api } from "@cmux/convex/api";
import type { Doc } from "@cmux/convex/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useConvex } from "convex/react";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

type PolicyRule = Doc<"agentPolicyRules">;
type PolicyScope = "system" | "team" | "workspace" | "user";
type PolicyCategory = "git_policy" | "security" | "workflow" | "tool_restriction" | "custom";
type PolicyContext = "task_sandbox" | "cloud_workspace" | "local_dev";
type PolicyStatus = "active" | "disabled" | "deprecated";

interface PolicyRulesSectionProps {
  teamSlugOrId: string;
}

interface FormState {
  name: string;
  description: string;
  scope: PolicyScope;
  category: PolicyCategory;
  contexts: PolicyContext[];
  ruleText: string;
  priority: number;
  status: PolicyStatus;
}

const SCOPE_LABELS: Record<PolicyScope, string> = {
  system: "System",
  team: "Team",
  workspace: "Workspace",
  user: "User",
};

const CATEGORY_LABELS: Record<PolicyCategory, string> = {
  git_policy: "Git Policy",
  security: "Security",
  workflow: "Workflow",
  tool_restriction: "Tool Restrictions",
  custom: "Custom",
};

const CONTEXT_LABELS: Record<PolicyContext, string> = {
  task_sandbox: "Task Sandbox",
  cloud_workspace: "Cloud Workspace",
  local_dev: "Local Dev",
};

const STATUS_LABELS: Record<PolicyStatus, string> = {
  active: "Active",
  disabled: "Disabled",
  deprecated: "Deprecated",
};

const SCOPE_BADGE_STYLES: Record<PolicyScope, string> = {
  system: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  team: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  workspace: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  user: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
};

function buildEmptyForm(): FormState {
  return {
    name: "",
    description: "",
    scope: "team",
    category: "workflow",
    contexts: ["task_sandbox", "cloud_workspace"],
    ruleText: "",
    priority: 50,
    status: "active",
  };
}

function buildFormFromRule(rule: PolicyRule): FormState {
  return {
    name: rule.name,
    description: rule.description ?? "",
    scope: rule.scope,
    category: rule.category,
    contexts: (rule.contexts as PolicyContext[]) ?? [],
    ruleText: rule.ruleText,
    priority: rule.priority,
    status: rule.status,
  };
}

export function PolicyRulesSection({ teamSlugOrId }: PolicyRulesSectionProps) {
  const convex = useConvex();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PolicyRule | null>(null);
  const [form, setForm] = useState<FormState>(buildEmptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PolicyRule | null>(null);
  const [activeScope, setActiveScope] = useState<PolicyScope | "all">("all");

  const { data: rules, refetch, isLoading } = useQuery(
    convexQuery(api.agentPolicyRules.list, { teamSlugOrId })
  );

  const upsertMutation = useMutation({
    mutationFn: async (
      payload: Parameters<typeof convex.mutation<typeof api.agentPolicyRules.upsert>>[1]
    ) => {
      return await convex.mutation(api.agentPolicyRules.upsert, payload);
    },
    onSuccess: async () => {
      await refetch();
      setDialogOpen(false);
      setEditingRule(null);
      setForm(buildEmptyForm());
      toast.success(editingRule ? "Policy rule updated" : "Policy rule created");
    },
    onError: (error) => {
      toast.error(`Failed to save: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: PolicyRule["_id"]) => {
      return await convex.mutation(api.agentPolicyRules.remove, { id });
    },
    onSuccess: async () => {
      await refetch();
      setDeleteTarget(null);
      toast.success("Policy rule deleted");
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
    const counts: Record<PolicyScope | "all", number> = {
      all: 0,
      system: 0,
      team: 0,
      workspace: 0,
      user: 0,
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

  const openEditDialog = useCallback((rule: PolicyRule) => {
    setEditingRule(rule);
    setForm(buildFormFromRule(rule));
    setFormError(null);
    setDialogOpen(true);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!form.name.trim()) {
      setFormError("Name is required");
      return;
    }
    if (!form.ruleText.trim()) {
      setFormError("Rule text is required");
      return;
    }

    setFormError(null);
    upsertMutation.mutate({
      id: editingRule?._id, // Use document ID for updates (preferred over ruleId)
      ruleId: editingRule ? undefined : undefined, // Let backend generate for new rules
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      scope: form.scope,
      teamSlugOrId: form.scope !== "system" ? teamSlugOrId : undefined,
      category: form.category,
      contexts: form.contexts.length > 0 ? form.contexts : undefined,
      ruleText: form.ruleText.trim(),
      priority: form.priority,
      status: form.status,
    });
  }, [form, editingRule, teamSlugOrId, upsertMutation]);

  const toggleContext = useCallback((context: PolicyContext) => {
    setForm((prev) => ({
      ...prev,
      contexts: prev.contexts.includes(context)
        ? prev.contexts.filter((c) => c !== context)
        : [...prev.contexts, context],
    }));
  }, []);

  return (
    <SettingSection
      title="Agent Policy Rules"
      description="Centralized rules that apply to all spawned agents. System rules cannot be modified."
      headerAction={
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Rule
        </Button>
      }
    >
      {/* Scope filter tabs */}
      <div className="border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
        <div className="flex gap-1">
          {(["all", "system", "team", "workspace", "user"] as const).map((scope) => (
            <button
              key={scope}
              onClick={() => setActiveScope(scope)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeScope === scope
                  ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              }`}
            >
              {scope === "all" ? "All" : SCOPE_LABELS[scope]} ({scopeCounts[scope]})
            </button>
          ))}
        </div>
      </div>

      {/* Rules list */}
      <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
          </div>
        ) : visibleRules.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-neutral-500">
            No policy rules found. Click "Add Rule" to create one.
          </div>
        ) : (
          visibleRules.map((rule) => (
            <div
              key={rule._id}
              className="flex items-start justify-between gap-4 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {rule.name}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${SCOPE_BADGE_STYLES[rule.scope]}`}
                  >
                    {SCOPE_LABELS[rule.scope]}
                  </span>
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                    {CATEGORY_LABELS[rule.category]}
                  </span>
                  {rule.status !== "active" && (
                    <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
                      {STATUS_LABELS[rule.status]}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2">
                  {rule.ruleText}
                </p>
                {rule.contexts && rule.contexts.length > 0 && (
                  <div className="mt-1.5 flex gap-1">
                    {rule.contexts.map((ctx) => (
                      <span
                        key={ctx}
                        className="rounded bg-neutral-50 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-neutral-900 dark:text-neutral-500"
                      >
                        {CONTEXT_LABELS[ctx as PolicyContext]}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
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
              {editingRule ? "Edit Policy Rule" : "Create Policy Rule"}
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
                  Name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                  placeholder="e.g., No Force Push"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                  placeholder="Brief description"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Scope
                  </label>
                  <select
                    value={form.scope}
                    onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as PolicyScope }))}
                    className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                    disabled={editingRule?.scope === "system"}
                  >
                    <option value="team">Team</option>
                    <option value="workspace" disabled title="Workspace scope requires project context (coming soon)">
                      Workspace (coming soon)
                    </option>
                    <option value="user">User</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Category
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as PolicyCategory }))}
                    className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                  >
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Applies to Contexts
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(Object.entries(CONTEXT_LABELS) as [PolicyContext, string][]).map(
                    ([value, label]) => (
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
                        {label}
                      </button>
                    )
                  )}
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  Leave empty to apply to all contexts
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Priority (lower = higher priority)
                </label>
                <input
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: parseInt(e.target.value) || 50 }))}
                  className="mt-1 w-24 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                  min={1}
                  max={100}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Rule Text (Markdown)
                </label>
                <textarea
                  value={form.ruleText}
                  onChange={(e) => setForm((f) => ({ ...f, ruleText: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm font-mono dark:border-neutral-700 dark:bg-neutral-800"
                  rows={5}
                  placeholder="**Rule**: Description of what agents should or should not do..."
                />
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
        title="Delete Policy Rule"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget._id);
          }
        }}
      />
    </SettingSection>
  );
}
