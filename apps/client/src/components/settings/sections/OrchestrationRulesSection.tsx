import { SettingSection } from "@/components/settings/SettingSection";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { api } from "@cmux/convex/api";
import type { Doc } from "@cmux/convex/dataModel";
import * as Dialog from "@radix-ui/react-dialog";
import { convexQuery } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useConvex } from "convex/react";
import { Ban, Check, Loader2, Pencil, Plus, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

type OrchestrationRule = Doc<"agentOrchestrationRules">;
type SkillCandidate = Doc<"agentOrchestrationSkillCandidates">;
type RuleLane = "hot" | "orchestration" | "project";
type RuleStatus = "candidate" | "active" | "suppressed" | "archived";

interface OrchestrationRulesSectionProps {
  teamSlugOrId: string;
}

const LANE_LABELS: Record<RuleLane, string> = {
  hot: "Hot",
  orchestration: "Orchestration",
  project: "Project",
};

const LANE_BADGE_STYLES: Record<RuleLane, string> = {
  hot: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  orchestration: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  project: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

const STATUS_BADGE_STYLES: Record<RuleStatus, string> = {
  candidate: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  suppressed: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
  archived: "bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500",
};

type SkillStatus = "candidate" | "approved" | "extracted" | "rejected";

const SKILL_STATUS_BADGE_STYLES: Record<SkillStatus, string> = {
  candidate: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  approved: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  extracted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const TAB_DEFINITIONS: { key: TabView; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "candidates", label: "Candidates" },
  { key: "skills", label: "Skill Candidates" },
];

type TabView = "active" | "candidates" | "skills";

export function OrchestrationRulesSection({ teamSlugOrId }: OrchestrationRulesSectionProps) {
  const convex = useConvex();
  const [activeTab, setActiveTab] = useState<TabView>("active");
  const [suppressTarget, setSuppressTarget] = useState<OrchestrationRule | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState({ text: "", lane: "hot" as RuleLane });
  const [laneFilter, setLaneFilter] = useState<RuleLane | "all">("all");
  const [promoteTarget, setPromoteTarget] = useState<OrchestrationRule | null>(null);
  const [promoteForm, setPromoteForm] = useState({ text: "", lane: "hot" as RuleLane });
  const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(new Set());

  // All queries run unconditionally to maintain accurate tab counts
  const { data: activeRules, refetch: refetchActive, isLoading: loadingActive } = useQuery({
    ...convexQuery(api.agentOrchestrationLearning.getActiveRules, { teamSlugOrId }),
  });

  const { data: candidateRules, refetch: refetchCandidates, isLoading: loadingCandidates } = useQuery({
    ...convexQuery(api.agentOrchestrationLearning.getCandidateRules, { teamSlugOrId }),
  });

  const { data: skillCandidates, isLoading: loadingSkills } = useQuery({
    ...convexQuery(api.agentOrchestrationLearning.getSkillCandidates, { teamSlugOrId }),
  });

  const promoteMutation = useMutation({
    mutationFn: async ({ ruleId, lane, text }: { ruleId: string; lane?: RuleLane; text?: string }) => {
      return await convex.mutation(api.agentOrchestrationLearning.promoteRule, {
        teamSlugOrId,
        ruleId: ruleId as OrchestrationRule["_id"],
        lane,
        text,
      });
    },
    onSuccess: () => {
      void refetchActive();
      void refetchCandidates();
      setPromoteTarget(null);
      toast.success("Rule promoted to active");
    },
    onError: (error) => {
      toast.error(`Failed to promote: ${error.message}`);
    },
  });

  const bulkPromoteMutation = useMutation({
    mutationFn: async ({ ruleIds, lane }: { ruleIds: string[]; lane?: RuleLane }) => {
      return await convex.mutation(api.agentOrchestrationLearning.bulkPromoteRules, {
        teamSlugOrId,
        ruleIds: ruleIds as OrchestrationRule["_id"][],
        lane,
      });
    },
    onSuccess: (result) => {
      void refetchActive();
      void refetchCandidates();
      setSelectedRuleIds(new Set());
      toast.success(`Promoted ${result.promoted} rule(s) to active`);
    },
    onError: (error) => {
      toast.error(`Failed to bulk promote: ${error.message}`);
    },
  });

  const suppressMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      return await convex.mutation(api.agentOrchestrationLearning.suppressRule, {
        teamSlugOrId,
        ruleId: ruleId as OrchestrationRule["_id"],
      });
    },
    onSuccess: () => {
      void refetchActive();
      void refetchCandidates();
      setSuppressTarget(null);
      toast.success("Rule suppressed");
    },
    onError: (error) => {
      toast.error(`Failed to suppress: ${error.message}`);
    },
  });

  const createMutation = useMutation({
    mutationFn: async ({ text, lane }: { text: string; lane: RuleLane }) => {
      return await convex.mutation(api.agentOrchestrationLearning.createRule, {
        teamSlugOrId,
        text,
        lane,
        status: "active",
        sourceType: "manual_import",
      });
    },
    onSuccess: () => {
      void refetchActive();
      setAddDialogOpen(false);
      setAddForm({ text: "", lane: "hot" });
      toast.success("Rule created");
    },
    onError: (error) => {
      toast.error(`Failed to create: ${error.message}`);
    },
  });

  const handleAddRule = useCallback(() => {
    if (!addForm.text.trim()) return;
    createMutation.mutate({ text: addForm.text.trim(), lane: addForm.lane });
  }, [addForm, createMutation]);

  const handleOpenPromote = useCallback((rule: OrchestrationRule) => {
    setPromoteTarget(rule);
    setPromoteForm({ text: rule.text, lane: rule.lane });
  }, []);

  const handlePromote = useCallback(() => {
    if (!promoteTarget || !promoteForm.text.trim()) return;
    promoteMutation.mutate({
      ruleId: promoteTarget._id,
      lane: promoteForm.lane,
      text: promoteForm.text.trim(),
    });
  }, [promoteTarget, promoteForm, promoteMutation]);

  const filteredActiveRules = useMemo(() => {
    if (!activeRules || laneFilter === "all") return activeRules ?? [];
    return activeRules.filter((r) => r.lane === laneFilter);
  }, [activeRules, laneFilter]);

  const filteredCandidateRules = useMemo(() => {
    if (!candidateRules || laneFilter === "all") return candidateRules ?? [];
    return candidateRules.filter((r) => r.lane === laneFilter);
  }, [candidateRules, laneFilter]);

  const tabCounts = useMemo(() => ({
    active: filteredActiveRules.length,
    candidates: filteredCandidateRules.length,
    skills: skillCandidates?.length ?? 0,
  }), [filteredActiveRules, filteredCandidateRules, skillCandidates]);

  const isLoading = activeTab === "active" ? loadingActive
    : activeTab === "candidates" ? loadingCandidates
    : loadingSkills;

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
          <div className="flex gap-1">
            {TAB_DEFINITIONS.map(({ key, label }) => (
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
          <div className="flex items-center gap-2">
            {/* Bulk promote button - only show for candidates with selections */}
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
            {/* Lane filter - only show for rules tabs */}
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
            onToggleSelect={(id) => {
              setSelectedRuleIds((prev) => {
                const next = new Set(prev);
                if (next.has(id)) {
                  next.delete(id);
                } else {
                  next.add(id);
                }
                return next;
              });
            }}
            emptyMessage="No candidate rules. Candidates are auto-detected from orchestration runs."
          />
        ) : (
          <SkillsList
            candidates={skillCandidates ?? []}
            emptyMessage="No skill candidates detected yet."
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
        }}
      />

      {/* Add rule dialog */}
      <Dialog.Root open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl dark:bg-neutral-900">
            <Dialog.Title className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Add Orchestration Rule
            </Dialog.Title>
            <Dialog.Close className="absolute right-4 top-4 text-neutral-400 hover:text-neutral-600">
              <X className="h-5 w-5" />
            </Dialog.Close>

            <div className="mt-4 space-y-4">
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
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleAddRule}
                  disabled={!addForm.text.trim() || createMutation.isPending}
                >
                  {createMutation.isPending && (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
                  Create
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Promote rule dialog (edit before promoting) */}
      <Dialog.Root open={!!promoteTarget} onOpenChange={(open) => !open && setPromoteTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl dark:bg-neutral-900">
            <Dialog.Title className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Promote Rule
            </Dialog.Title>
            <Dialog.Close className="absolute right-4 top-4 text-neutral-400 hover:text-neutral-600">
              <X className="h-5 w-5" />
            </Dialog.Close>

            <div className="mt-4 space-y-4">
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
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setPromoteTarget(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handlePromote}
                  disabled={!promoteForm.text.trim() || promoteMutation.isPending}
                >
                  {promoteMutation.isPending && (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
                  Promote to Active
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </SettingSection>
  );
}

function RulesList({
  rules,
  variant,
  onPromote,
  onSuppress,
  selectedIds,
  onToggleSelect,
  emptyMessage,
}: {
  rules: OrchestrationRule[];
  variant?: "candidate";
  onPromote?: (rule: OrchestrationRule) => void;
  onSuppress: (rule: OrchestrationRule) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  emptyMessage: string;
}) {
  if (rules.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-neutral-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
      {rules.map((rule) => (
        <div key={rule._id} className="flex items-start justify-between gap-4 px-4 py-3">
          {/* Checkbox for bulk selection (candidates only) */}
          {variant === "candidate" && onToggleSelect && (
            <input
              type="checkbox"
              checked={selectedIds?.has(rule._id) ?? false}
              onChange={() => onToggleSelect(rule._id)}
              className="mt-1 h-4 w-4 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
            />
          )}
          <div className="min-w-0 flex-1">
            <span className="text-sm text-neutral-900 dark:text-neutral-100">
              {rule.text}
            </span>
            <div className="mt-1 flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${LANE_BADGE_STYLES[rule.lane]}`}>
                {LANE_LABELS[rule.lane]}
              </span>
              {variant === "candidate" && (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE_STYLES.candidate}`}>
                  Candidate
                </span>
              )}
              <span className="text-[11px] text-neutral-400">
                {variant === "candidate"
                  ? `seen ${rule.timesSeen ?? 1}x`
                  : `used ${rule.timesUsed ?? 0}x`}
              </span>
              {rule.confidence != null && (
                <span className="text-[11px] text-neutral-400" title="Confidence score">
                  {Math.round(rule.confidence * 100)}%
                </span>
              )}
              {rule.projectFullName && (
                <span className="text-[11px] text-neutral-400">
                  {rule.projectFullName}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {onPromote && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-emerald-600 hover:text-emerald-700"
                onClick={() => onPromote(rule)}
                title="Edit and promote to active"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-neutral-400 hover:text-red-600"
              onClick={() => onSuppress(rule)}
              title="Suppress rule"
            >
              <Ban className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </>
  );
}

function SkillsList({
  candidates,
  emptyMessage,
}: {
  candidates: SkillCandidate[];
  emptyMessage: string;
}) {
  if (candidates.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-neutral-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
      {candidates.map((skill) => (
        <div key={skill._id} className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {skill.title}
            </span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${SKILL_STATUS_BADGE_STYLES[skill.status as SkillStatus] ?? SKILL_STATUS_BADGE_STYLES.candidate}`}>
              {skill.status}
            </span>
            <span className="text-[11px] text-neutral-400">
              {skill.recurrenceCount}x recurrence
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2">
            {skill.summary}
          </p>
          {skill.patternKey && (
            <span className="mt-1 inline-block text-[10px] font-mono text-neutral-400">
              {skill.patternKey}
            </span>
          )}
        </div>
      ))}
    </>
  );
}
