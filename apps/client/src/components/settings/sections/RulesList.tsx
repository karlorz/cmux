import { Button } from "@/components/ui/button";
import { Ban, Pencil } from "lucide-react";
import type { OrchestrationRule, RuleLane } from "./useOrchestrationRules";
import { LANE_BADGE_STYLES, LANE_LABELS, STATUS_BADGE_STYLES } from "./orchestration-rules-styles";

interface RulesListProps {
  rules: OrchestrationRule[];
  variant?: "candidate";
  onPromote?: (rule: OrchestrationRule) => void;
  onSuppress: (rule: OrchestrationRule) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  emptyMessage: string;
}

export function RulesList({
  rules,
  variant,
  onPromote,
  onSuppress,
  selectedIds,
  onToggleSelect,
  emptyMessage,
}: RulesListProps) {
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
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${LANE_BADGE_STYLES[rule.lane as RuleLane]}`}>
                {LANE_LABELS[rule.lane as RuleLane]}
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
