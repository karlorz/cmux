import { SettingSection } from "@/components/settings/SettingSection";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { api } from "@cmux/convex/api";
import type { Doc } from "@cmux/convex/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useConvex } from "convex/react";
import { ArrowUp, Ban, Loader2, Plus, X } from "lucide-react";
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

type TabView = "active" | "candidates" | "skills";

export function OrchestrationRulesSection({ teamSlugOrId }: OrchestrationRulesSectionProps) {
  const convex = useConvex();
  const [activeTab, setActiveTab] = useState<TabView>("active");
  const [suppressTarget, setSuppressTarget] = useState<OrchestrationRule | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState({ text: "", lane: "hot" as RuleLane });

  const { data: activeRules, refetch: refetchActive, isLoading: loadingActive } = useQuery(
    convexQuery(api.agentOrchestrationLearning.getActiveRules, { teamSlugOrId })
  );

  const { data: candidateRules, refetch: refetchCandidates, isLoading: loadingCandidates } = useQuery(
    convexQuery(api.agentOrchestrationLearning.getCandidateRules, { teamSlugOrId })
  );

  const { data: skillCandidates, isLoading: loadingSkills } = useQuery(
    convexQuery(api.agentOrchestrationLearning.getSkillCandidates, { teamSlugOrId })
  );

  const promoteMutation = useMutation({
    mutationFn: async ({ ruleId, lane }: { ruleId: string; lane?: RuleLane }) => {
      return await convex.mutation(api.agentOrchestrationLearning.promoteRule, {
        teamSlugOrId,
        ruleId: ruleId as OrchestrationRule["_id"],
        lane,
      });
    },
    onSuccess: () => {
      void refetchActive();
      void refetchCandidates();
      toast.success("Rule promoted to active");
    },
    onError: (error) => {
      toast.error(`Failed to promote: ${error.message}`);
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

  const tabCounts = useMemo(() => ({
    active: activeRules?.length ?? 0,
    candidates: candidateRules?.length ?? 0,
    skills: skillCandidates?.length ?? 0,
  }), [activeRules, candidateRules, skillCandidates]);

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
        <div className="flex gap-1">
          {([
            { key: "active" as const, label: "Active" },
            { key: "candidates" as const, label: "Candidates" },
            { key: "skills" as const, label: "Skill Candidates" },
          ]).map(({ key, label }) => (
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
      </div>

      {/* Content */}
      <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
          </div>
        ) : activeTab === "active" ? (
          <RulesList
            rules={activeRules ?? []}
            onSuppress={setSuppressTarget}
            emptyMessage="No active rules. Rules learned from orchestration runs will appear here."
          />
        ) : activeTab === "candidates" ? (
          <CandidatesList
            rules={candidateRules ?? []}
            onPromote={(ruleId) => promoteMutation.mutate({ ruleId })}
            onSuppress={setSuppressTarget}
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
      {addDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-neutral-900">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                Add Orchestration Rule
              </h3>
              <button onClick={() => setAddDialogOpen(false)}>
                <X className="h-5 w-5 text-neutral-400" />
              </button>
            </div>
            <div className="space-y-4">
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
                  {createMutation.isPending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Create
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </SettingSection>
  );
}

function RulesList({
  rules,
  onSuppress,
  emptyMessage,
}: {
  rules: OrchestrationRule[];
  onSuppress: (rule: OrchestrationRule) => void;
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
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-900 dark:text-neutral-100">
                {rule.text}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${LANE_BADGE_STYLES[rule.lane]}`}>
                {LANE_LABELS[rule.lane]}
              </span>
              <span className="text-[11px] text-neutral-400">
                used {rule.timesUsed ?? 0}x
              </span>
              {rule.projectFullName && (
                <span className="text-[11px] text-neutral-400">
                  {rule.projectFullName}
                </span>
              )}
            </div>
          </div>
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
      ))}
    </>
  );
}

function CandidatesList({
  rules,
  onPromote,
  onSuppress,
  emptyMessage,
}: {
  rules: OrchestrationRule[];
  onPromote: (ruleId: string) => void;
  onSuppress: (rule: OrchestrationRule) => void;
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
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-900 dark:text-neutral-100">
                {rule.text}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${LANE_BADGE_STYLES[rule.lane]}`}>
                {LANE_LABELS[rule.lane]}
              </span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE_STYLES.candidate}`}>
                Candidate
              </span>
              <span className="text-[11px] text-neutral-400">
                seen {rule.timesSeen ?? 1}x
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-emerald-600 hover:text-emerald-700"
              onClick={() => onPromote(rule._id)}
              title="Promote to active"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-neutral-400 hover:text-red-600"
              onClick={() => onSuppress(rule)}
              title="Suppress"
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
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE_STYLES[skill.status as RuleStatus] ?? STATUS_BADGE_STYLES.candidate}`}>
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
