import { SettingSection } from "@/components/settings/SettingSection";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormDialog } from "@/components/ui/form-dialog";
import { Check, ChevronDown, Loader2, Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { RulesList } from "./RulesList";
import { SkillsList } from "./SkillsList";
import {
  useOrchestrationRules,
  type OrchestrationRule,
  type RuleLane,
  type TabView,
} from "./useOrchestrationRules";

interface OrchestrationRulesSectionProps {
  teamSlugOrId: string;
}

// Default tabs shown to all users
const DEFAULT_TABS: { key: TabView; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "candidates", label: "Candidates" },
];

// Advanced tab for skill candidates (hidden by default)
const ADVANCED_TABS: { key: TabView; label: string }[] = [
  { key: "skills", label: "Skill Candidates" },
];

export function OrchestrationRulesSection({ teamSlugOrId }: OrchestrationRulesSectionProps) {
  const [activeTab, setActiveTab] = useState<TabView>("active");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [suppressTarget, setSuppressTarget] = useState<OrchestrationRule | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState({ text: "", lane: "hot" as RuleLane });
  const [promoteTarget, setPromoteTarget] = useState<OrchestrationRule | null>(null);
  const [promoteForm, setPromoteForm] = useState({ text: "", lane: "hot" as RuleLane });

  // Combine tabs based on advanced mode
  const visibleTabs = showAdvanced
    ? [...DEFAULT_TABS, ...ADVANCED_TABS]
    : DEFAULT_TABS;

  const {
    filteredActiveRules,
    filteredCandidateRules,
    skillCandidates,
    tabCounts,
    loadingActive,
    loadingCandidates,
    loadingSkills,
    promoteMutation,
    bulkPromoteMutation,
    suppressMutation,
    createMutation,
    updateSkillStatusMutation,
    selectedRuleIds,
    toggleSelect,
    laneFilter,
    setLaneFilter,
  } = useOrchestrationRules(teamSlugOrId);

  const isLoading = activeTab === "active" ? loadingActive
    : activeTab === "candidates" ? loadingCandidates
    : loadingSkills;

  const handleAddRule = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.text.trim()) return;
    createMutation.mutate(
      { text: addForm.text.trim(), lane: addForm.lane },
      {
        onSuccess: () => {
          setAddDialogOpen(false);
          setAddForm({ text: "", lane: "hot" });
        },
      }
    );
  }, [addForm, createMutation]);

  const handleOpenPromote = useCallback((rule: OrchestrationRule) => {
    setPromoteTarget(rule);
    setPromoteForm({ text: rule.text, lane: rule.lane });
  }, []);

  const handlePromote = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!promoteTarget || !promoteForm.text.trim()) return;
    promoteMutation.mutate(
      {
        ruleId: promoteTarget._id,
        lane: promoteForm.lane,
        text: promoteForm.text.trim(),
      },
      { onSuccess: () => setPromoteTarget(null) }
    );
  }, [promoteTarget, promoteForm, promoteMutation]);

  return (
    <SettingSection
      title="Orchestration Rules"
      description="Team-learned rules from previous orchestration runs. Active rules are injected into agent instructions at spawn time."
      headerAction={
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAddDialogOpen(true)}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Rule
        </Button>
      }
    >
      {/* Tab bar */}
      <div className="border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {visibleTabs.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeTab === key
                      ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                      : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  }`}
                >
                  {label} ({tabCounts[key]})
                </button>
              ))}
            </div>
            {/* Advanced toggle */}
            <button
              onClick={() => {
                setShowAdvanced(!showAdvanced);
                // Reset to default tab if hiding advanced and currently on skills
                if (showAdvanced && activeTab === "skills") {
                  setActiveTab("active");
                }
              }}
              className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-xs transition-colors ${
                showAdvanced
                  ? "text-neutral-900 dark:text-neutral-100"
                  : "text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
              }`}
              title={showAdvanced ? "Hide advanced options" : "Show advanced options"}
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
              />
              {!showAdvanced && tabCounts.skills > 0 && (
                <span className="text-neutral-400">+{tabCounts.skills}</span>
              )}
            </button>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === "candidates" && selectedRuleIds.size > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => bulkPromoteMutation.mutate({ ruleIds: Array.from(selectedRuleIds) })}
                disabled={bulkPromoteMutation.isPending}
                className="text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:border-emerald-700 dark:hover:bg-emerald-900/20"
              >
                {bulkPromoteMutation.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                )}
                Promote {selectedRuleIds.size}
              </Button>
            )}
            {activeTab !== "skills" && (
              <select
                value={laneFilter}
                onChange={(e) => setLaneFilter(e.target.value as RuleLane | "all")}
                className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800"
              >
                <option value="all">All lanes</option>
                <option value="hot">Hot</option>
                <option value="orchestration">Orchestration</option>
                <option value="project">Project</option>
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
          </div>
        ) : activeTab === "active" ? (
          <RulesList
            rules={filteredActiveRules}
            onSuppress={setSuppressTarget}
            emptyMessage="No active rules. Rules learned from orchestration runs will appear here."
          />
        ) : activeTab === "candidates" ? (
          <RulesList
            rules={filteredCandidateRules}
            variant="candidate"
            onPromote={handleOpenPromote}
            onSuppress={setSuppressTarget}
            selectedIds={selectedRuleIds}
            onToggleSelect={toggleSelect}
            emptyMessage="No candidate rules. Candidates are auto-detected from orchestration runs."
          />
        ) : (
          <SkillsList
            candidates={skillCandidates}
            emptyMessage="No skill candidates detected yet."
            onUpdateStatus={(skillId, status) => updateSkillStatusMutation.mutate({ skillId, status })}
            isUpdating={updateSkillStatusMutation.isPending}
          />
        )}
      </div>

      {/* Suppress confirmation */}
      <ConfirmDialog
        open={!!suppressTarget}
        onOpenChange={(open) => !open && setSuppressTarget(null)}
        title="Suppress Rule"
        description={`This will suppress the rule: "${suppressTarget?.text.slice(0, 100)}...". It will no longer be injected into agent instructions.`}
        confirmLabel="Suppress"
        onConfirm={() => {
          if (suppressTarget) suppressMutation.mutate(suppressTarget._id);
          setSuppressTarget(null);
        }}
      />

      {/* Add rule dialog */}
      <FormDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        title="Add Orchestration Rule"
        submitLabel="Create"
        onSubmit={handleAddRule}
        isLoading={createMutation.isPending}
        isSubmitDisabled={!addForm.text.trim()}
        maxWidth="max-w-md"
      >
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Rule Text
          </label>
          <textarea
            value={addForm.text}
            onChange={(e) => setAddForm((f) => ({ ...f, text: e.target.value }))}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
            rows={3}
            placeholder="e.g. Always run bun check before committing"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Lane
          </label>
          <select
            value={addForm.lane}
            onChange={(e) => setAddForm((f) => ({ ...f, lane: e.target.value as RuleLane }))}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          >
            <option value="hot">Hot (Always Apply)</option>
            <option value="orchestration">Orchestration</option>
            <option value="project">Project</option>
          </select>
        </div>
      </FormDialog>

      {/* Promote rule dialog */}
      <FormDialog
        open={!!promoteTarget}
        onOpenChange={(open) => !open && setPromoteTarget(null)}
        title="Promote Rule"
        submitLabel="Promote to Active"
        onSubmit={handlePromote}
        isLoading={promoteMutation.isPending}
        isSubmitDisabled={!promoteForm.text.trim()}
        maxWidth="max-w-md"
      >
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Rule Text
          </label>
          <textarea
            value={promoteForm.text}
            onChange={(e) => setPromoteForm((f) => ({ ...f, text: e.target.value }))}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
            rows={4}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Lane
          </label>
          <select
            value={promoteForm.lane}
            onChange={(e) => setPromoteForm((f) => ({ ...f, lane: e.target.value as RuleLane }))}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          >
            <option value="hot">Hot (Always Apply)</option>
            <option value="orchestration">Orchestration</option>
            <option value="project">Project</option>
          </select>
        </div>
      </FormDialog>
    </SettingSection>
  );
}
