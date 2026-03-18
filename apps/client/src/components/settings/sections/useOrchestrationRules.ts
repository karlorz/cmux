import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cmux/convex/api";
import { useConvex } from "convex/react";
import { toast } from "sonner";
import type { Doc } from "@cmux/convex/dataModel";

export type OrchestrationRule = Doc<"agentOrchestrationRules">;
export type SkillCandidate = Doc<"agentOrchestrationSkillCandidates">;
export type RuleLane = "hot" | "orchestration" | "project";
export type RuleStatus = "candidate" | "active" | "suppressed" | "archived";
export type SkillStatus = "candidate" | "approved" | "extracted" | "rejected";
export type TabView = "active" | "candidates" | "skills";

export function useOrchestrationRules(teamSlugOrId: string) {
  const convex = useConvex();
  const [laneFilter, setLaneFilter] = useState<RuleLane | "all">("all");
  const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(new Set());

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
      toast.success("Rule created");
    },
    onError: (error) => {
      toast.error(`Failed to create: ${error.message}`);
    },
  });

  const filteredActiveRules = useMemo(() => {
    if (!activeRules || laneFilter === "all") return activeRules ?? [];
    return activeRules.filter((r: OrchestrationRule) => r.lane === laneFilter);
  }, [activeRules, laneFilter]);

  const filteredCandidateRules = useMemo(() => {
    if (!candidateRules || laneFilter === "all") return candidateRules ?? [];
    return candidateRules.filter((r: OrchestrationRule) => r.lane === laneFilter);
  }, [candidateRules, laneFilter]);

  const tabCounts = useMemo(() => ({
    active: filteredActiveRules.length,
    candidates: filteredCandidateRules.length,
    skills: skillCandidates?.length ?? 0,
  }), [filteredActiveRules, filteredCandidateRules, skillCandidates]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedRuleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return {
    // Data
    filteredActiveRules,
    filteredCandidateRules,
    skillCandidates: skillCandidates ?? [],
    tabCounts,
    // Loading states
    loadingActive,
    loadingCandidates,
    loadingSkills,
    // Mutations
    promoteMutation,
    bulkPromoteMutation,
    suppressMutation,
    createMutation,
    // Selection
    selectedRuleIds,
    setSelectedRuleIds,
    toggleSelect,
    // Filter
    laneFilter,
    setLaneFilter,
  };
}
